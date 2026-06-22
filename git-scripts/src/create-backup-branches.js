#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CSV_FILE = path.join('./files/services.csv');
const ORG_NAME = 'Verto-FX';

/**
 * Get current date in dd-mm-yyyy format
 * @returns {string}
 */
function getCurrentDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}-${month}-${year}`;
}

/**
 * Read and parse the services CSV file
 * @returns {Array<{repo: string, branch: string}>}
 */
function loadServices() {
    try {
        const csvContent = fs.readFileSync(CSV_FILE, 'utf-8');
        const lines = csvContent.trim().split('\n');
        
        // Skip header and parse CSV
        const services = lines.slice(1)
            .filter(line => line.trim())
            .map(line => {
                const [repo, branch] = line.split(',').map(s => s.trim());
                return { repo, branch };
            });
        
        console.log(`Loaded ${services.length} services from services.csv\n`);
        return services;
    } catch (error) {
        console.error(`Error reading ${CSV_FILE}:`, error.message);
        process.exit(1);
    }
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
 * Create a backup branch
 * @param {string} repo - Repository name
 * @param {string} sourceBranch - Source branch name
 * @param {string} backupBranch - Backup branch name
 * @param {string} sha - SHA to create branch from
 * @returns {boolean} - Success status
 */
function createBackupBranch(repo, sourceBranch, backupBranch, sha) {
    const command = `gh api repos/${ORG_NAME}/${repo}/git/refs -f ref="refs/heads/${backupBranch}" -f sha="${sha}"`;
    
    console.log(`Creating backup: ${repo}/${sourceBranch} → ${backupBranch}`);
    
    try {
        execSync(command, { stdio: 'pipe' });
        console.log(`  ✓ Successfully created backup branch: ${backupBranch}`);
        return true;
    } catch (error) {
        console.error(`  ✗ Failed to create backup branch: ${error.message}`);
        return false;
    }
}

/**
 * Main execution
 */
function main() {
    const dateStr = getCurrentDate();
    
    console.log('='.repeat(60));
    console.log('   BACKUP BRANCH CREATOR');
    console.log('='.repeat(60));
    console.log(`Date: ${dateStr}`);
    console.log(`Organization: ${ORG_NAME}`);
    console.log(`Backup format: {branch}-backup-${dateStr}\n`);
    
    const services = loadServices();
    
    let successCount = 0;
    let failCount = 0;
    
    console.log('Starting backup branch creation...\n');
    
    services.forEach(({ repo, branch }, index) => {
        const backupBranch = `${branch}-backup-${dateStr}`;
        
        console.log(`[${index + 1}/${services.length}] Processing ${repo}...`);
        
        // Get SHA of source branch
        const sha = getBranchSHA(repo, branch);
        
        if (!sha) {
            console.log(`  ✗ Skipping - failed to get branch SHA`);
            failCount++;
            console.log('');
            return;
        }
        
        console.log(`  SHA: ${sha}`);
        
        // Create backup branch
        const success = createBackupBranch(repo, branch, backupBranch, sha);
        
        if (success) {
            successCount++;
        } else {
            failCount++;
        }
        
        console.log('');
    });
    
    // Summary
    console.log('='.repeat(60));
    console.log('   BACKUP SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total services: ${services.length}`);
    console.log(`✓ Successful: ${successCount}`);
    console.log(`✗ Failed: ${failCount}`);
    console.log('='.repeat(60));
    
    console.log('\nBackup branch creation completed!');
}

// Run the script
main();
