#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const ENVIRONMENT = 'preview';
const CSV_FILE = path.join('./files/services.csv');

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
 * Deploy a service to the specified environment
 * @param {string} repo - Repository name
 * @param {string} branch - Branch name
 */
function deployService(repo, branch) {
    const command = `gh workflow run manual-non-prod.yml --ref "${branch}" --field environment="${ENVIRONMENT}" --repo Verto-FX/${repo}`;
    
    console.log(`Branch : ${branch}  |  Repo : ${repo}`);
    
    try {
        // execSync(command, { stdio: 'inherit' });
    } catch (error) {
        console.error(`Failed to deploy ${repo}:`, error.message);
    }
}

/**
 * Main execution
 */
function main() {
    console.log(`Starting ${ENVIRONMENT} environment redeploy...`);
    console.log(`Deploying configured branches to ${ENVIRONMENT} environment for all services\n`);
    
    const services = loadServices();
    
    services.forEach(({ repo, branch }) => {
        deployService(repo, branch);
    });
    
    console.log(`\n${ENVIRONMENT} environment redeploy initiated!`);
}

// Run the script
main();
