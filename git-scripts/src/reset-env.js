#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const TARGET_ENV = 'preview'; // The environment branch to reset
const MASTER_CSV = path.join('./files/services.master.csv');
const ENV_CSV = path.join('./files/services.csv');
const ORG_NAME = 'Verto-FX';
const COUNTDOWN_SECONDS = 5;

/**
 * Read and parse a CSV file
 * @param {string} filePath - Path to CSV file
 * @returns {Array<{repo: string, branch: string}>}
 */
function loadCSV(filePath) {
    try {
        const csvContent = fs.readFileSync(filePath, 'utf-8');
        const lines = csvContent.trim().split('\n');
        
        // Skip header and parse CSV
        const services = lines.slice(1)
            .filter(line => line.trim())
            .map(line => {
                const [repo, branch] = line.split(',').map(s => s.trim());
                return { repo, branch };
            });
        
        return services;
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error.message);
        process.exit(1);
    }
}

/**
 * Validate that both CSVs have matching repositories
 * @param {Array} masterServices - Services from master CSV
 * @param {Array} envServices - Services from env CSV
 * @returns {boolean}
 */
function validateServices(masterServices, envServices) {
    const masterRepos = new Set(masterServices.map(s => s.repo));
    const envRepos = new Set(envServices.map(s => s.repo));
    
    // Check for repos in master but not in env
    const missingInEnv = masterServices.filter(s => !envRepos.has(s.repo));
    if (missingInEnv.length > 0) {
        console.error('\n❌ Validation Error: Repos in master CSV but not in env CSV:');
        missingInEnv.forEach(s => console.error(`   - ${s.repo}`));
    }
    
    // Check for repos in env but not in master
    const missingInMaster = envServices.filter(s => !masterRepos.has(s.repo));
    if (missingInMaster.length > 0) {
        console.error('\n❌ Validation Error: Repos in env CSV but not in master CSV:');
        missingInMaster.forEach(s => console.error(`   - ${s.repo}`));
    }
    
    if (missingInEnv.length > 0 || missingInMaster.length > 0) {
        console.error('\n❌ CSV validation failed. Please ensure both files have matching repositories.\n');
        return false;
    }
    
    console.log('✓ CSV validation passed - all repositories match\n');
    return true;
}

/**
 * Sleep for specified seconds
 * @param {number} seconds - Number of seconds to sleep
 */
function sleep(seconds) {
    const ms = seconds * 1000;
    execSync(`powershell -command "Start-Sleep -Milliseconds ${ms}"`, { stdio: 'pipe' });
}

/**
 * Get the SHA of a branch
 * @param {string} repo - Repository name
 * @param {string} branch - Branch name
 * @returns {string|null} - SHA of the branch or null if failed
 */
function getBranchSHA(repo, branch) {
    try {
        const command = `gh api repos/${ORG_NAME}/${repo}/git/refs/heads/${branch} --jq .object.sha`;
        const sha = execSync(command, { encoding: 'utf-8' }).trim();
        return sha;
    } catch (error) {
        console.error(`  ✗ Failed to get SHA for ${repo}/${branch}`);
        return null;
    }
}

/**
 * Force update a branch to point to a specific SHA
 * @param {string} repo - Repository name
 * @param {string} targetBranch - Branch to update
 * @param {string} sha - SHA to point the branch to
 * @returns {boolean} - Success status
 */
function forceUpdateBranch(repo, targetBranch, sha) {
    const command = `gh api repos/${ORG_NAME}/${repo}/git/refs/heads/${targetBranch} -X PATCH -f sha="${sha}" -F force=true`;
    
    try {
        execSync(command, { stdio: 'pipe' });
        return true;
    } catch (error) {
        console.error(`  ✗ Failed to update branch: ${error.message}`);
        return false;
    }
}

/**
 * Main execution
 */
function main() {
    console.log('='.repeat(60));
    console.log('   ENVIRONMENT RESET SCRIPT');
    console.log('='.repeat(60));
    console.log(`Organization: ${ORG_NAME}`);
    console.log(`Target Environment: ${TARGET_ENV}\n`);
    
    // Load CSV files
    console.log('Loading CSV files...');
    const masterServices = loadCSV(MASTER_CSV);
    const envServices = loadCSV(ENV_CSV);
    
    console.log(`Loaded ${masterServices.length} services from master CSV`);
    console.log(`Loaded ${envServices.length} services from env CSV\n`);
    
    // Validate CSVs
    if (!validateServices(masterServices, envServices)) {
        process.exit(1);
    }
    
    // Create a map of master branches by repo
    const masterBranchMap = new Map(
        masterServices.map(s => [s.repo, s.branch])
    );
    
    // Countdown warning
    console.log('⚠️  WARNING: This will force update all branches!');
    console.log(`⚠️  Resetting environment "${TARGET_ENV}" in ${COUNTDOWN_SECONDS} seconds...`);
    console.log('⚠️  Press Ctrl+C to cancel\n');
    
    for (let i = COUNTDOWN_SECONDS; i > 0; i--) {
        process.stdout.write(`   ${i}... `);
        sleep(1);
    }
    console.log('\n\nStarting environment reset...\n');
    
    let successCount = 0;
    let failCount = 0;
    
    // Process each service
    envServices.forEach(({ repo, branch: envBranch }, index) => {
        const masterBranch = masterBranchMap.get(repo);
        
        console.log(`[${index + 1}/${envServices.length}] Processing ${repo}...`);
        console.log(`  Master branch: ${masterBranch}`);
        console.log(`  Target branch: ${envBranch}`);
        
        // Get SHA of master branch
        const sha = getBranchSHA(repo, masterBranch);
        
        if (!sha) {
            failCount++;
            console.log('');
            return;
        }
        
        console.log(`  SHA: ${sha}`);
        console.log(`  Force updating ${envBranch} → ${masterBranch}`);
        
        // Force update the env branch
        const success = forceUpdateBranch(repo, envBranch, sha);
        
        if (success) {
            console.log(`  ✓ Successfully reset ${envBranch} to ${masterBranch}`);
            successCount++;
        } else {
            failCount++;
        }
        
        console.log('');
    });
    
    // Summary
    console.log('='.repeat(60));
    console.log('   RESET SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total services: ${envServices.length}`);
    console.log(`✓ Successful: ${successCount}`);
    console.log(`✗ Failed: ${failCount}`);
    console.log('='.repeat(60));
    
    console.log(`\nEnvironment "${TARGET_ENV}" reset completed!`);
}

// Run the script
main();
