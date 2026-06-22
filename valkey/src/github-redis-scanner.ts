import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Repository, PackageJson, RedisUsage, ScanResult } from './types';

export class GitHubRedisScanner {
  private organization: string;

  constructor(organization: string) {
    this.organization = organization;
  }

  /**
   * Execute gh command and return parsed JSON result
   */
  private executeGhCommand(command: string): any {
    try {
      const result = execSync(command, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return JSON.parse(result);
    } catch (error: any) {
      if (error.stdout) {
        try {
          return JSON.parse(error.stdout);
        } catch {
          // If parsing fails, throw the original error
        }
      }
      throw error;
    }
  }

  /**
   * Get all repositories in the organization
   */
  async getRepositories(): Promise<Repository[]> {
    console.log(`\n📦 Fetching repositories from organization: ${this.organization}...`);
    
    const repos: Repository[] = [];

    const command = `gh repo list ${this.organization} --json name,nameWithOwner,url,isArchived,defaultBranchRef --limit 500`;
    const pageRepos = this.executeGhCommand(command);

    repos.push(
        ...pageRepos.map(
            (repo: any) => ({
                name: repo.name,
                fullName: repo.nameWithOwner,
                url: repo.url,
                isArchived: repo.isArchived,
                defaultBranch: repo.defaultBranchRef?.name || 'main'
            })
        )
    ); 

    console.log(`✅ Found ${repos.length} repositories\n`);
    return repos;
  }

  /**
   * Fetch package.json content from a repository
   */
  async getPackageJson(repo: Repository): Promise<PackageJson | null> {
    try {
      const command = `gh api repos/${repo.fullName}/contents/package.json --jq .content`;
      const base64Content = execSync(command, { encoding: 'utf-8' }).trim();
      
      // Decode base64
      const content = Buffer.from(base64Content, 'base64').toString('utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      // package.json doesn't exist or isn't accessible
      return null;
    }
  }

  /**
   * Analyze package.json for Redis usage
   */
  analyzeRedisUsage(packageJson: PackageJson): { packages: string[], usesVertoRedis: boolean, usesNonVertoRedis: boolean } {
    const redisPackages: string[] = [];
    let usesVertoRedis = false;
    let usesNonVertoRedis = false;

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    for (const [pkgName, version] of Object.entries(allDeps || {})) {
      const pkgLower = pkgName.toLowerCase();
      
      // Check if it's a redis-related package
      if (
        pkgName === 'redis' ||
        pkgName === 'ioredis' ||
        pkgName === 'valkey' ||
        pkgLower.includes('redis') ||
        pkgName.startsWith('@redis/')
      ) {
        redisPackages.push(`${pkgName}@${version}`);
        
        if (pkgName === '@verto-fx/verto-redis') {
          usesVertoRedis = true;
        } else {
          usesNonVertoRedis = true;
        }
      }
    }

    return { packages: redisPackages, usesVertoRedis, usesNonVertoRedis };
  }

  /**
   * Scan all repositories for Redis usage
   */
  async scan(): Promise<ScanResult> {
    const repos = await this.getRepositories();
    const results: RedisUsage[] = [];

    let processed = 0;
    console.log('🔍 Scanning repositories for Redis usage...\n');

    for (const repo of repos) {
      processed++;
      process.stdout.write(`\rProgress: ${processed}/${repos.length} - ${repo.name}`);
      
      const packageJson = await this.getPackageJson(repo);
      
      if (!packageJson) {
        results.push({
          repoName: repo.name,
          repoUrl: repo.url,
          isArchived: repo.isArchived,
          hasPackageJson: false,
          redisPackages: [],
          usesVertoRedis: false,
          usesNonVertoRedis: false
        });
        continue;
      }

      const analysis = this.analyzeRedisUsage(packageJson);
      
      results.push({
        repoName: repo.name,
        repoUrl: repo.url,
        isArchived: repo.isArchived,
        hasPackageJson: true,
        redisPackages: analysis.packages,
        usesVertoRedis: analysis.usesVertoRedis,
        usesNonVertoRedis: analysis.usesNonVertoRedis
      });
    }

    console.log('\n\n✅ Scan complete!\n');

    return this.generateSummary(results);
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(details: RedisUsage[]): ScanResult {
    return {
      totalRepos: details.length,
      reposWithPackageJson: details.filter(d => d.hasPackageJson).length,
      reposUsingRedis: details.filter(d => d.redisPackages.length > 0).length,
      reposUsingVertoRedis: details.filter(d => d.usesVertoRedis).length,
      reposUsingNonVertoRedis: details.filter(d => d.usesNonVertoRedis).length,
      details
    };
  }

  /**
   * Print formatted report to console
   */
  printReport(result: ScanResult): void {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('                    REDIS USAGE REPORT');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('📊 Summary Statistics:');
    console.log(`   Total Repositories: ${result.totalRepos}`);
    console.log(`   Repositories with package.json: ${result.reposWithPackageJson}`);
    console.log(`   Repositories using Redis: ${result.reposUsingRedis}`);
    console.log(`   ├─ Using @verto-fx/verto-redis: ${result.reposUsingVertoRedis}`);
    console.log(`   └─ Using non-Verto Redis packages: ${result.reposUsingNonVertoRedis}\n`);

    // Repos using non-verto Redis packages (CRITICAL)
    const nonVertoRedis = result.details.filter(d => d.usesNonVertoRedis);
    if (nonVertoRedis.length > 0) {
      console.log('🚨 REPOSITORIES USING NON-VERTO REDIS PACKAGES:');
      console.log('───────────────────────────────────────────────────────────');
      nonVertoRedis.forEach(repo => {
        const status = repo.isArchived ? '[ARCHIVED]' : '[ACTIVE]';
        console.log(`\n${status} ${repo.repoName}`);
        console.log(`   URL: ${repo.repoUrl}`);
        console.log(`   Packages:`);
        repo.redisPackages.forEach(pkg => {
          if (!pkg.includes('@verto-fx/verto-redis')) {
            console.log(`      ⚠️  ${pkg}`);
          }
        });
      });
      console.log('\n');
    }

    // Repos using verto-redis (GOOD)
    const vertoRedis = result.details.filter(d => d.usesVertoRedis && !d.usesNonVertoRedis);
    if (vertoRedis.length > 0) {
      console.log('✅ REPOSITORIES USING ONLY @verto-fx/verto-redis:');
      console.log('───────────────────────────────────────────────────────────');
      vertoRedis.forEach(repo => {
        const status = repo.isArchived ? '[ARCHIVED]' : '[ACTIVE]';
        console.log(`   ${status} ${repo.repoName}`);
      });
      console.log('\n');
    }

    // Repos using both
    const bothTypes = result.details.filter(d => d.usesVertoRedis && d.usesNonVertoRedis);
    if (bothTypes.length > 0) {
      console.log('⚠️  REPOSITORIES USING BOTH VERTO-REDIS AND OTHER REDIS PACKAGES:');
      console.log('───────────────────────────────────────────────────────────');
      bothTypes.forEach(repo => {
        const status = repo.isArchived ? '[ARCHIVED]' : '[ACTIVE]';
        console.log(`\n${status} ${repo.repoName}`);
        console.log(`   URL: ${repo.repoUrl}`);
        console.log(`   Packages: ${repo.redisPackages.join(', ')}`);
      });
      console.log('\n');
    }

    console.log('═══════════════════════════════════════════════════════════\n');
  }

  /**
   * Save report to JSON file
   */
  saveReport(result: ScanResult, filename: string = 'redis-usage-report.json'): void {
    const outputPath = path.join(process.cwd(), filename);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`💾 Report saved to: ${outputPath}\n`);
  }
}


async function main() {
  // Get organization name from command line or environment
  const organization = "Verto-FX";

  console.log(`\n🚀 Starting GitHub Redis Scanner for organization: ${organization}\n`);
  
  // Check if user is authenticated with gh CLI
  try {
    const { execSync } = require('child_process');
    execSync('gh auth status', { stdio: 'ignore' });
  } catch (error) {
    console.error('❌ Error: Not authenticated with GitHub CLI');
    console.error('\nPlease run: gh auth login\n');
    process.exit(1);
  }

  console.log("User is authenticated")

  const scanner = new GitHubRedisScanner(organization);

  try {
    const result = await scanner.scan();
    scanner.printReport(result);
    
    // Save to JSON file
    const saveReport = process.argv.includes('--save') || process.argv.includes('-s');
    if (saveReport) {
      scanner.saveReport(result);
    } else {
      console.log('💡 Tip: Use --save or -s flag to save report to JSON file\n');
    }

    // Exit with error code if non-verto redis packages found
    if (result.reposUsingNonVertoRedis > 0) {
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Error during scan:', error.message);
    process.exit(1);
  }
}

// main()

import data from "../redis-usage-report.json"

const versions: Map<string, string[]> = new Map()

data.details.filter(repo => {
    if(!repo.usesVertoRedis) return;

    const version = repo.redisPackages[0]?.split("@")?.[2]

    if(versions.has(version)) {
        versions[version].push(repo.repoName)
    }else {
        versions[version] = [repo.repoName]
    }

    
})

console.log(versions)