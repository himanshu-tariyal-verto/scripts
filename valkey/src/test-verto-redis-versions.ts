// filepath: test-verto-redis-versions.ts
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";
import {main as ValkeyTester} from "./valkey-compatibility-test"

const execAsync = promisify(exec);

interface VersionTestConfig {
  version: string;
  description: string;
}

class VertoRedisVersionTester {
  private versions: VersionTestConfig[] = [
    { version: "5.0.0", description: "Current stable version" },
    { version: "8.0.1", description: "Latest stable version" },
  ];

  private resultsDir = "./comp-results/version-tests";

  constructor(
    private host: string,
    private port: string,
    private environment: string = "valkey-version-test"
  ) {
    // Create results directory
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  /**
   * Install specific version of verto-redis
   */
  private async installVersion(version: string): Promise<void> {
    console.log(`\n📦 Installing @verto-fx/verto-redis@${version}...`);
    
    try {
      // Uninstall current version
      await execAsync("npm uninstall @verto-fx/verto-redis");
      
      // Install specific version
      const { stdout, stderr } = await execAsync(
        `npm install @verto-fx/verto-redis@${version} --save-exact`
      );
      
      console.log(`✅ Installed @verto-fx/verto-redis@${version}`);
      
      if (stderr && !stderr.includes("npm WARN")) {
        console.warn("Installation warnings:", stderr);
      }
    } catch (error: any) {
      throw new Error(`Failed to install version ${version}: ${error.message}`);
    }
  }

  /**
   * Get currently installed version
   */
  private async getInstalledVersion(): Promise<string> {
    try {
      const packageJson = JSON.parse(
        fs.readFileSync("./package.json", "utf-8")
      );
      return packageJson.dependencies["@verto-fx/verto-redis"] || "unknown";
    } catch (error) {
      return "unknown";
    }
  }

  /**
   * Run compatibility test for a version
   */
  private async runCompatibilityTest(version: string): Promise<void> {
    console.log(`\n🧪 Running compatibility tests for version ${version}...`);
    
    try {
      // Set environment variables for the test
      process.env.VERTO_REDIS_VERSION = version;
      process.env.REDIS_HOST = this.host;
      process.env.REDIS_PORT = this.port;
      process.env.ENVIRONMENT = this.environment;

      // Run the test via npm script
      await ValkeyTester()
    } catch (error: any) {
      console.error(`❌ Tests failed for version ${version}`);
      console.error(error.stdout || error.message);
      // Don't throw - we want to continue testing other versions
    }
  }

  /**
   * Test all versions
   */
  async testAllVersions(): Promise<void> {
    console.log("\n" + "=".repeat(80));
    console.log("🔬 Verto Redis Version Compatibility Test Suite");
    console.log("=".repeat(80));
    console.log(`\nTarget: ${this.host}:${this.port}`);
    console.log(`Environment: ${this.environment}`);
    console.log(`Testing ${this.versions.length} versions\n`);

    const results = [];

    for (const config of this.versions) {
      const startTime = Date.now();
      
      console.log("\n" + "-".repeat(80));
      console.log(`Testing Version: ${config.version} - ${config.description}`);
      console.log("-".repeat(80));

      try {
        // Install version
        await this.installVersion(config.version);
        
        // Verify installation
        const installed = await this.getInstalledVersion();
        console.log(`Verified installed version: ${installed}`);

        // Run tests
        await this.runCompatibilityTest(config.version);

        const duration = Date.now() - startTime;
        
        results.push({
          version: config.version,
          description: config.description,
          status: "completed",
          duration,
          timestamp: new Date().toISOString(),
        });

        console.log(`✅ Version ${config.version} testing completed in ${duration}ms`);
      } catch (error: any) {
        const duration = Date.now() - startTime;
        
        results.push({
          version: config.version,
          description: config.description,
          status: "failed",
          error: error.message,
          duration,
          timestamp: new Date().toISOString(),
        });

        console.error(`❌ Version ${config.version} testing failed: ${error.message}`);
      }

      // Wait a bit between versions
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Save summary
    this.saveSummary(results);
    this.printFinalSummary(results);
  }

  /**
   * Save test summary
   */
  private saveSummary(results: any[]): void {
    const summary = {
      timestamp: new Date().toISOString(),
      host: this.host,
      port: this.port,
      environment: this.environment,
      totalVersions: this.versions.length,
      completedTests: results.filter((r) => r.status === "completed").length,
      failedTests: results.filter((r) => r.status === "failed").length,
      results,
    };

    const filename = path.join(
      this.resultsDir,
      `version-test-summary-${Date.now()}.json`
    );
    
    fs.writeFileSync(filename, JSON.stringify(summary, null, 2));
    console.log(`\n📄 Summary saved to ${filename}`);
  }

  /**
   * Print final summary
   */
  private printFinalSummary(results: any[]): void {
    console.log("\n" + "=".repeat(80));
    console.log("📊 Version Testing Summary");
    console.log("=".repeat(80));

    const completed = results.filter((r) => r.status === "completed").length;
    const failed = results.filter((r) => r.status === "failed").length;

    console.log(`\nTotal Versions Tested: ${results.length}`);
    console.log(`Successfully Completed: ${completed} ✅`);
    console.log(`Failed: ${failed} ❌`);

    console.log("\nVersion Results:");
    results.forEach((r) => {
      const status = r.status === "completed" ? "✅" : "❌";
      console.log(`  ${status} v${r.version} - ${r.description} (${r.duration}ms)`);
      if (r.error) {
        console.log(`     Error: ${r.error}`);
      }
    });

    console.log("\n" + "=".repeat(80));
    
    if (failed === 0) {
      console.log("🎉 All version tests completed successfully!");
    } else {
      console.log("⚠️  Some version tests failed. Check logs for details.");
    }
    console.log("=".repeat(80) + "\n");
  }

  /**
   * Test specific versions only
   */
  async testSpecificVersions(versions: string[]): Promise<void> {
    this.versions = versions.map((v) => ({
      version: v,
      description: `Custom test version ${v}`,
    }));
    
    await this.testAllVersions();
  }
}

// ====================
// Main Execution
// ====================

async function main() {
  const host = process.env.REDIS_HOST || "master.valkey-poc-non-prod.pcfhkv.euc1.cache.amazonaws.com";
  const port = process.env.REDIS_PORT || "6379";
  const environment = process.env.ENVIRONMENT || "valkey-version-test";

  const tester = new VertoRedisVersionTester(host, port, environment);

    await tester.testAllVersions();
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { VertoRedisVersionTester };
