// filepath: distributed-numericals-test.ts
import { ConfigurationManager } from "@verto-fx/verto-utilities";
import { RedisFactory } from "@verto-fx/verto-redis";
import { RedisMongoReferenceGeneratorFactory } from "@verto-fx/mongo-distributed-numericals"
import { RedisMysqlReferenceGeneratorFactory } from "@verto-fx/mysql-distributed-numericals";
import { RedisMongoReferenceGeneratorFactory as VertoMongoReferenceGeneratorFactory } from "@verto-fx/verto-distributed-numericals"
import { ConfigReader } from "./utilities";
import { DataBase } from "./utilities/database";
import path from "node:path";
import fs from "fs";


interface TestResult {
  testName: string;
  category: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  byCategory: Record<string, { passed: number; failed: number }>;
}

interface PackageVersions {
  vertoRedis: string;
  mongoNumericals: string;
  mysqlNumericals: string;
  vertoNumericals: string;
}

class DistributedNumericalsValkeyTester {
  private results: TestResult[] = [];
  private testPrefix = `valkey-numericals-${Date.now()}`;
  private packageVersions: PackageVersions = {
    vertoRedis: "unknown",
    mongoNumericals: "unknown",
    mysqlNumericals: "unknown",
    vertoNumericals: "unknown",
  };

  /**
   * Parse reference to extract sequential number
   * Format: TYPE-DDMMYYYY-LETTER+NUMBER (e.g., FEE-29012026-E5 → 5)
   */
  private parseRefNumber(ref: string): number {
    const lastPart = ref.split('-').pop() || '0';
    // Remove all letters to get just the number
    return parseInt(lastPart.replace(/[A-Za-z]/g, '')) || 0;
  }

  constructor(
    private host: string,
    private port: string,
    private environment: string = "valkey-numericals-test",
  ) {
    this.getPackageVersions();
    this.initialize();
  }

  /**
   * Get package versions
   */
  private getPackageVersions(): void {
    try {
      const fs = require("fs");
      const path = require("path");
      const packageJsonPath = path.join(process.cwd(), "package.json");
      
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        const deps = packageJson.dependencies || {};
        
        this.packageVersions.vertoRedis = deps["@verto-fx/verto-redis"] || "unknown";
        this.packageVersions.mongoNumericals = deps["@verto-fx/mongo-distributed-numericals"] || "unknown";
        this.packageVersions.mysqlNumericals = deps["@verto-fx/mysql-distributed-numericals"] || "unknown";
        this.packageVersions.vertoNumericals = deps["@verto-fx/verto-distributed-numericals"] || "unknown";
      }
    } catch (error) {
      console.warn("Could not determine package versions:", error);
    }
  }

  /**
   * Initialize connection
   */
  async initialize(): Promise<void> {

    const configReader = new ConfigReader()

    const config:any = configReader.getConfig()

    const certificatePath = path.join(process.cwd(), "certificates", "rds-ca.pem");
    const certificate = fs.readFileSync(certificatePath, "utf8").trim();

     // Initialize database connection for MySQL tests
    await DataBase.connect({
        host: config.RDS.HOST,
        port: config.RDS.PORT,
        username: config.RDS.USERNAME,
        password: config.RDS.PASSWORD,
        dialect: config.RDS.DIALECT,
        database: config.RDS.DATABASE_NAME,
        poolTimeout: config.RDS.DB_POOL_IDLE_TIMEOUT,
        certificate
    })

    ConfigurationManager.init({
        ...config,
      REDIS_HOST: this.host,
      REDIS_PORT: this.port,
      IS_REDIS_CONNECTED: true,
      ENVIRONMENT: this.environment,
    });
    RedisFactory.resetInstance();
    console.log(`✓ Initialized connection to ${this.host}:${this.port}`);
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log("\n=== Distributed Numericals Valkey Test Suite ===\n");
    console.log("Package Versions:");
    console.log(`  @verto-fx/verto-redis: ${this.packageVersions.vertoRedis}`);
    console.log(`  @verto-fx/mongo-distributed-numericals: ${this.packageVersions.mongoNumericals}`);
    console.log(`  @verto-fx/mysql-distributed-numericals: ${this.packageVersions.mysqlNumericals}`);
    console.log(`  @verto-fx/verto-distributed-numericals: ${this.packageVersions.vertoNumericals}\n`);

    const testCategories = [
      {
        name: "1. Mongo Distributed Numericals",
        fn: () => this.testMongoNumericals(),
      },
      {
        name: "2. MySQL Distributed Numericals",
        fn: () => this.testMySQLNumericals(),
      },
      {
        name: "3. Verto Distributed Numericals",
        fn: () => this.testVertoNumericals(),
      },
      {
        name: "4. Concurrent Number Generation",
        fn: () => this.testConcurrentGeneration(),
      },
      {
        name: "5. Sequence Reset & Management",
        fn: () => this.testSequenceManagement(),
      },
    ];

    for (const category of testCategories) {
      console.log(`\n--- ${category.name} ---`);
      await category.fn();
    }

    await this.cleanup();
    this.printSummary();
  }

  /**
   * Helper to run individual test
   */
  private async runTest(
    category: string,
    testName: string,
    testFn: () => Promise<any>,
  ): Promise<void> {
    const start = Date.now();
    try {
      const details = await testFn();
      const duration = Date.now() - start;

      this.results.push({
        testName,
        category,
        passed: true,
        duration,
        details,
      });

      console.log(`  ✓ ${category} - ${testName} (${duration}ms)`);
    } catch (error: any) {
      const duration = Date.now() - start;

      this.results.push({
        testName,
        category,
        passed: false,
        duration,
        error: error.message,
      });

      console.log(`  ✗ ${category} - ${testName} (${duration}ms)`);
      console.log(`    Error: ${error.message}`);
    }
  }

  /**
   * Category 1: Mongo Distributed Numericals
   */
  private async testMongoNumericals(): Promise<void> {
    // Re-initialize ConfigurationManager for Mongo package's internal dependencies
    const configReader = new ConfigReader();
    const config: any = configReader.getConfig();
    ConfigurationManager.init({
      ...config,
      REDIS_HOST: this.host,
      REDIS_PORT: this.port,
      IS_REDIS_CONNECTED: true,
      ENVIRONMENT: this.environment,
    });
    
    const generator = RedisMongoReferenceGeneratorFactory.create();

    await this.runTest(
      "Mongo Distributed Numericals",
      "Basic number generation",
      async () => {
        const refType = "TC";
        
        const ref1 = await generator.generateAsync(refType);
        const ref2 = await generator.generateAsync(refType);
        const ref3 = await generator.generateAsync(refType);
        
        // Extract numbers from references (format: TYPE-DDMMYYYY-LETTER+NUMBER, e.g., FEE-29012026-E5)
        const num1 = this.parseRefNumber(ref1);
        const num2 = this.parseRefNumber(ref2);
        const num3 = this.parseRefNumber(ref3);

        if (num2 !== num1 + 1 || num3 !== num2 + 1) {
          throw new Error(
            `Numbers not sequential: ${num1}, ${num2}, ${num3}`,
          );
        }

        return { num1, num2, num3, sequential: true };
      },
    );

    await this.runTest(
      "Mongo Distributed Numericals",
      "Multiple sequences independence",
      async () => {
        const generator = RedisMongoReferenceGeneratorFactory.create();
        const type1 = "SU";
        const type2 = "FEE";

        const ref1a = await generator.generateAsync(type1);
        const ref1b = await generator.generateAsync(type2);
        const ref2a = await generator.generateAsync(type1);
        const ref2b = await generator.generateAsync(type2);
        
        const num1a = this.parseRefNumber(ref1a);
        const num1b = this.parseRefNumber(ref1b);
        const num2a = this.parseRefNumber(ref2a);
        const num2b = this.parseRefNumber(ref2b);

        return {
          sequence1: [num1a, num2a],
          sequence2: [num1b, num2b],
          independent: num1a !== num1b,
        };
      },
    );

    await this.runTest(
      "Mongo Distributed Numericals",
      "Reference format validation",
      async () => {
        const generator = RedisMongoReferenceGeneratorFactory.create();
        const refType = "FEE";

        const ref1 = await generator.generateAsync(refType);
        const ref2 = await generator.generateAsync(refType);
        
        const num1 = this.parseRefNumber(ref1);
        const num2 = this.parseRefNumber(ref2);

        if (num2 !== num1 + 1) {
          throw new Error(`References not sequential: ${num1}, ${num2}`);
        }

        return { ref1, ref2, num1, num2, sequential: true };
      },
    );

    await this.runTest(
      "Mongo Distributed Numericals",
      "Sequential increment validation",
      async () => {
        const generator = RedisMongoReferenceGeneratorFactory.create();
        const refType = "BP";

        const ref1 = await generator.generateAsync(refType);
        const ref2 = await generator.generateAsync(refType);
        const ref3 = await generator.generateAsync(refType);
        
        const num1 = this.parseRefNumber(ref1);
        const num2 = this.parseRefNumber(ref2);
        const num3 = this.parseRefNumber(ref3);

        if (num2 !== num1 + 1 || num3 !== num2 + 1) {
          throw new Error(`Numbers not sequential: ${num1}, ${num2}, ${num3}`);
        }
        
        return { num1, num2, num3, sequential: true };
      },
    );
  }

  /**
   * Category 2: MySQL Distributed Numericals
   */
  private async testMySQLNumericals(): Promise<void> {
    // Re-initialize ConfigurationManager for MySQL package's internal dependencies
    const configReader = new ConfigReader();
    const config: any = configReader.getConfig();
    ConfigurationManager.init({
      ...config,
      REDIS_HOST: this.host,
      REDIS_PORT: this.port,
      IS_REDIS_CONNECTED: true,
      ENVIRONMENT: this.environment,
    });
    
    const generator = RedisMysqlReferenceGeneratorFactory.create();
    
    await this.runTest(
      "MySQL Distributed Numericals",
      "Basic number generation",
      async () => {
        const refType = "IN";
        
        const ref1 = await generator.generateAsync(refType);
        const ref2 = await generator.generateAsync(refType);
        const ref3 = await generator.generateAsync(refType);
        
        console.error(`\n=== MySQL Generator Debug ===`);
        console.error(`ref1: value="${ref1}", type="${typeof ref1}", JSON=${JSON.stringify(ref1)}`);
        console.error(`ref2: value="${ref2}", type="${typeof ref2}", JSON=${JSON.stringify(ref2)}`);
        console.error(`ref3: value="${ref3}", type="${typeof ref3}", JSON=${JSON.stringify(ref3)}`);
        
        // Check if references are null/undefined
        if (ref1 === null || ref1 === undefined || ref2 === null || ref2 === undefined || ref3 === null || ref3 === undefined) {
          throw new Error(`Generated references are null/undefined: ref1=${JSON.stringify(ref1)}, ref2=${JSON.stringify(ref2)}, ref3=${JSON.stringify(ref3)}`);
        }
        
        // MySQL generator returns formatted strings like: IN-29012026-E47
        const num1 = typeof ref1 === 'number' ? ref1 : this.parseRefNumber(String(ref1));
        const num2 = typeof ref2 === 'number' ? ref2 : this.parseRefNumber(String(ref2));
        const num3 = typeof ref3 === 'number' ? ref3 : this.parseRefNumber(String(ref3));
        
        console.error(`Parsed numbers: num1=${num1}, num2=${num2}, num3=${num3}`);
        
        if (isNaN(num1) || isNaN(num2) || isNaN(num3)) {
          throw new Error(`Parsed values are NaN: num1=${num1}, num2=${num2}, num3=${num3}, refs=[${JSON.stringify(ref1)}, ${JSON.stringify(ref2)}, ${JSON.stringify(ref3)}]`);
        }
        
        console.error(`=== End Debug ===\n`);
            
        if (num2 !== num1 + 1 || num3 !== num2 + 1) {
          throw new Error(
            `Numbers not sequential: ${num1}, ${num2}, ${num3}`,
          );
        }

        return { num1, num2, num3, sequential: true };
      },
    );

    await this.runTest(
      "MySQL Distributed Numericals",
      "Multiple sequences independence",
      async () => {
        const generator = RedisMysqlReferenceGeneratorFactory.create();
        const type1 = "IN";
        const type2 = "TO";

        const ref1a = await generator.generateAsync(type1);
        const ref1b = await generator.generateAsync(type2);
        const ref2a = await generator.generateAsync(type1);
        const ref2b = await generator.generateAsync(type2);
        
        const num1a = typeof ref1a === 'number' ? ref1a : this.parseRefNumber(String(ref1a));
        const num1b = typeof ref1b === 'number' ? ref1b : this.parseRefNumber(String(ref1b));
        const num2a = typeof ref2a === 'number' ? ref2a : this.parseRefNumber(String(ref2a));
        const num2b = typeof ref2b === 'number' ? ref2b : this.parseRefNumber(String(ref2b));

        return {
          sequence1: [num1a, num2a],
          sequence2: [num1b, num2b],
          independent: num2a === num1a + 1 && num2b === num1b + 1,
        };
      },
    );

    await this.runTest(
      "MySQL Distributed Numericals",
      "Reference format validation",
      async () => {
        const generator = RedisMysqlReferenceGeneratorFactory.create();
        const refType = "LP";

        const ref1 = await generator.generateAsync(refType);
        const ref2 = await generator.generateAsync(refType);
        
        console.log(`DEBUG: ref1=${JSON.stringify(ref1)} (type: ${typeof ref1}), ref2=${JSON.stringify(ref2)} (type: ${typeof ref2})`);
        
        // Check if references are null/undefined
        if (!ref1 || !ref2) {
          throw new Error(`Generated references are null/undefined: ref1=${ref1}, ref2=${ref2}`);
        }
        
        // MySQL generator returns formatted strings like: IN-29012026-E47
        const num1 = typeof ref1 === 'number' ? ref1 : this.parseRefNumber(String(ref1));
        const num2 = typeof ref2 === 'number' ? ref2 : this.parseRefNumber(String(ref2));

        if (num2 !== num1 + 1) {
          throw new Error(`References not sequential: ${num1}, ${num2}`);
        }

        return { ref1, ref2, num1, num2, valid: true };
      },
    );

    await this.runTest(
      "MySQL Distributed Numericals",
      "Sequential increment validation",
      async () => {
        const generator = RedisMysqlReferenceGeneratorFactory.create();
        const refType = "IN";

        const ref1 = await generator.generateAsync(refType);
        const ref2 = await generator.generateAsync(refType);
        const ref3 = await generator.generateAsync(refType);
        
        console.log(`DEBUG: ref1=${JSON.stringify(ref1)} (type: ${typeof ref1}), ref2=${JSON.stringify(ref2)} (type: ${typeof ref2}), ref3=${JSON.stringify(ref3)} (type: ${typeof ref3})`);
        
        // Check if references are null/undefined
        if (!ref1 || !ref2 || !ref3) {
          throw new Error(`Generated references are null/undefined: ref1=${ref1}, ref2=${ref2}, ref3=${ref3}`);
        }
        
        // MySQL generator returns formatted strings like: IN-29012026-E47
        const num1 = typeof ref1 === 'number' ? ref1 : this.parseRefNumber(String(ref1));
        const num2 = typeof ref2 === 'number' ? ref2 : this.parseRefNumber(String(ref2));
        const num3 = typeof ref3 === 'number' ? ref3 : this.parseRefNumber(String(ref3));

        if (num2 !== num1 + 1 || num3 !== num2 + 1) {
          throw new Error(`Numbers not sequential: ${num1}, ${num2}, ${num3}`);
        }

        return { num1, num2, num3, sequential: true };
      },
    );
  }

  /**
   * Category 3: Verto Distributed Numericals
   */
  private async testVertoNumericals(): Promise<void> {
    // Re-initialize ConfigurationManager for Verto package's internal dependencies
    const configReader = new ConfigReader();
    const config: any = configReader.getConfig();
    ConfigurationManager.init({
      ...config,
      REDIS_HOST: this.host,
      REDIS_PORT: this.port,
      IS_REDIS_CONNECTED: true,
      ENVIRONMENT: this.environment,
    });
    
    const generator = VertoMongoReferenceGeneratorFactory.create();
    
    await this.runTest(
      "Verto Distributed Numericals",
      "Basic number generation",
      async () => {
        const refType = "TC";
        
        const ref1 = await generator.generateAsync(refType);
        const ref2 = await generator.generateAsync(refType);
        const ref3 = await generator.generateAsync(refType);
        
        const num1 = this.parseRefNumber(ref1);
        const num2 = this.parseRefNumber(ref2);
        const num3 = this.parseRefNumber(ref3);

        if (num2 !== num1 + 1 || num3 !== num2 + 1) {
          throw new Error(
            `Numbers not sequential: ${num1}, ${num2}, ${num3}`,
          );
        }

        return { num1, num2, num3, sequential: true };
      },
    );

    await this.runTest(
      "Verto Distributed Numericals",
      "Multiple sequences independence",
      async () => {
        const generator = VertoMongoReferenceGeneratorFactory.create();
        const type1 = "SU";
        const type2 = "FEE";

        const ref1a = await generator.generateAsync(type1);
        const ref1b = await generator.generateAsync(type2);
        const ref2a = await generator.generateAsync(type1);
        const ref2b = await generator.generateAsync(type2);
        
        const num1a = this.parseRefNumber(ref1a);
        const num1b = this.parseRefNumber(ref1b);
        const num2a = this.parseRefNumber(ref2a);
        const num2b = this.parseRefNumber(ref2b);

        return {
          sequence1: [num1a, num2a],
          sequence2: [num1b, num2b],
          independent: num2a === num1a + 1 && num2b === num1b + 1,
        };
      },
    );

    await this.runTest(
      "Verto Distributed Numericals",
      "Reference format validation",
      async () => {
        const generator = VertoMongoReferenceGeneratorFactory.create();
        const refType = "BP";

        const ref1 = await generator.generateAsync(refType);
        const ref2 = await generator.generateAsync(refType);
        
        const num1 = this.parseRefNumber(ref1);
        const num2 = this.parseRefNumber(ref2);

        if (num2 !== num1 + 1) {
          throw new Error(`References not sequential: ${num1}, ${num2}`);
        }

        return { ref1, ref2, num1, num2, valid: true };
      },
    );

    await this.runTest(
      "Verto Distributed Numericals",
      "Sequential increment validation",
      async () => {
        const generator = VertoMongoReferenceGeneratorFactory.create();
        const refType = "FEE";

        const ref1 = await generator.generateAsync(refType);
        const ref2 = await generator.generateAsync(refType);
        const ref3 = await generator.generateAsync(refType);
        
        const num1 = this.parseRefNumber(ref1);
        const num2 = this.parseRefNumber(ref2);
        const num3 = this.parseRefNumber(ref3);

        if (num2 !== num1 + 1 || num3 !== num2 + 1) {
          throw new Error(`Numbers not sequential: ${num1}, ${num2}, ${num3}`);
        }

        return { num1, num2, num3, sequential: true };
      },
    );
  }

  /**
   * Category 4: Concurrent Number Generation
   */
  private async testConcurrentGeneration(): Promise<void> {
    // Re-initialize ConfigurationManager
    const configReader = new ConfigReader();
    const config: any = configReader.getConfig();
    ConfigurationManager.init({
      ...config,
      REDIS_HOST: this.host,
      REDIS_PORT: this.port,
      IS_REDIS_CONNECTED: true,
      ENVIRONMENT: this.environment,
    });
    
    const generator = RedisMongoReferenceGeneratorFactory.create();

    await this.runTest(
      "Concurrent Number Generation",
      "Parallel requests (10 concurrent)",
      async () => {
        const refType = "TC";
        const concurrentCount = 10;

        const promises = [];
        for (let i = 0; i < concurrentCount; i++) {
          promises.push(generator.generateAsync(refType));
        }

        const references = await Promise.all(promises);
        const numbers = references.map(ref => this.parseRefNumber(ref));
        const uniqueNumbers = new Set(numbers);

        if (uniqueNumbers.size !== concurrentCount) {
          throw new Error(
            `Expected ${concurrentCount} unique numbers, got ${uniqueNumbers.size}. Collision detected!`,
          );
        }

        // Check if sequential (allowing for any order due to concurrency)
        const sorted = [...numbers].sort((a, b) => a - b);
        const isSequential = sorted.every(
          (num, idx) => idx === 0 || num === sorted[idx - 1] + 1,
        );

        return {
          count: concurrentCount,
          unique: uniqueNumbers.size,
          numbers: sorted,
          sequential: isSequential,
        };
      },
    );

    await this.runTest(
      "Concurrent Number Generation",
      "High concurrency (50 parallel)",
      async () => {
        const generator = RedisMongoReferenceGeneratorFactory.create();
        const refType = "SU";
        const concurrentCount = 50;

        const promises = [];
        for (let i = 0; i < concurrentCount; i++) {
          promises.push(generator.generateAsync(refType));
        }

        const references = await Promise.all(promises);
        const numbers = references.map(ref => this.parseRefNumber(ref));
        const uniqueNumbers = new Set(numbers);

        if (uniqueNumbers.size !== concurrentCount) {
          throw new Error(
            `Collision detected! Expected ${concurrentCount} unique, got ${uniqueNumbers.size}`,
          );
        }

        return {
          count: concurrentCount,
          unique: uniqueNumbers.size,
          allUnique: true,
        };
      },
    );

    await this.runTest(
      "Concurrent Number Generation",
      "Mixed sequences concurrent",
      async () => {
        const generator = RedisMongoReferenceGeneratorFactory.create();
        const type1 = "TC";
        const type2 = "SU";
        const type3 = "FEE";

        const promises = [];
        for (let i = 0; i < 5; i++) {
          promises.push(generator.generateAsync(type1));
          promises.push(generator.generateAsync(type2));
          promises.push(generator.generateAsync(type3));
        }

        await Promise.all(promises);

        return {
          sequences: 3,
          requestsPerSequence: 5,
          totalRequests: 15,
        };
      },
    );
  }

  /**
   * Category 5: Sequence Reset & Management
   */
  private async testSequenceManagement(): Promise<void> {
    // Re-initialize ConfigurationManager
    const configReader = new ConfigReader();
    const config: any = configReader.getConfig();
    ConfigurationManager.init({
      ...config,
      REDIS_HOST: this.host,
      REDIS_PORT: this.port,
      IS_REDIS_CONNECTED: true,
      ENVIRONMENT: this.environment,
    });
    
    const generator = RedisMongoReferenceGeneratorFactory.create();

    await this.runTest(
      "Sequence Reset & Management",
      "Multiple sequence independence",
      async () => {
        const type1 = "TC";
        const type2 = "SU";
        const type3 = "FEE";

        // Generate references for each type
        const ref1a = await generator.generateAsync(type1);
        const ref1b = await generator.generateAsync(type1);
        const ref2a = await generator.generateAsync(type2);
        const ref2b = await generator.generateAsync(type2);
        const ref3a = await generator.generateAsync(type3);
        const ref3b = await generator.generateAsync(type3);
        
        const nums1 = [ref1a, ref1b].map(r => this.parseRefNumber(r));
        const nums2 = [ref2a, ref2b].map(r => this.parseRefNumber(r));
        const nums3 = [ref3a, ref3b].map(r => this.parseRefNumber(r));

        return {
          sequenceCount: 3,
          sequence1: nums1,
          sequence2: nums2,
          sequence3: nums3,
          allSequential: nums1[1] === nums1[0] + 1 && nums2[1] === nums2[0] + 1 && nums3[1] === nums3[0] + 1,
        };
      },
    );

    await this.runTest(
      "Sequence Reset & Management",
      "Sequential generation across types",
      async () => {
        const refType = "BP";

        // Generate multiple references
        const refs = [];
        for (let i = 0; i < 5; i++) {
          refs.push(await generator.generateAsync(refType));
        }
        
        const numbers = refs.map(r => this.parseRefNumber(r));
        const isSequential = numbers.every((num, idx) => idx === 0 || num === numbers[idx - 1] + 1);
        
        if (!isSequential) {
          throw new Error(`Numbers not sequential: ${numbers.join(', ')}`);
        }

        return {
          count: 5,
          numbers,
          sequential: isSequential,
        };
      },
    );

    await this.runTest(
      "Sequence Reset & Management",
      "Reference format consistency",
      async () => {
        const refType = "FEE";

        // Generate multiple references to check format
        const refs = [];
        for (let i = 0; i < 3; i++) {
          refs.push(await generator.generateAsync(refType));
        }
        
        // Check format: TYPE-DDMMYYYY-###
        const formatValid = refs.every(ref => {
          const parts = ref.split('-');
          return parts.length === 3 && parts[0] === refType && parts[1].length === 8;
        });
        
        if (!formatValid) {
          throw new Error(`Invalid reference format: ${refs[0]}`);
        }

        return {
          references: refs,
          formatValid,
        };
      },
    );
  }

  /**
   * Cleanup test data
   */
  private async cleanup(): Promise<void> {
    try {
      console.log("\n🧹 Cleaning up test data...");
      const keys = await RedisFactory.getKeys(`${this.testPrefix}*`);
      if (keys.length > 0) {
        await RedisFactory.removeKeys(keys);
        console.log(`✓ Removed ${keys.length} test keys`);
      }
    } catch (error: any) {
      console.warn(`⚠ Cleanup warning: ${error.message}`);
    }
  }

  /**
   * Print test summary
   */
  private printSummary(): void {
    console.log("\n\n=== Test Summary ===\n");

    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const total = this.results.length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} ✓`);
    console.log(`Failed: ${failed} ✗`);
    console.log(`Total Duration: ${totalDuration}ms\n`);

    // Summary by category
    const byCategory: Record<string, { passed: number; failed: number }> = {};
    this.results.forEach((r) => {
      if (!byCategory[r.category]) {
        byCategory[r.category] = { passed: 0, failed: 0 };
      }
      if (r.passed) {
        byCategory[r.category].passed++;
      } else {
        byCategory[r.category].failed++;
      }
    });

    console.log("Results by Category:");
    Object.entries(byCategory).forEach(([category, stats]) => {
      const total = stats.passed + stats.failed;
      const passRate = ((stats.passed / total) * 100).toFixed(1);
      console.log(
        `  ${category}: ${stats.passed}/${total} passed (${passRate}%)`,
      );
    });

    if (failed > 0) {
      console.log("\nFailed Tests:");
      this.results
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`  • [${r.category}] ${r.testName}`);
          console.log(`    ${r.error}`);
        });
      console.log("");
    }

    const passRate = ((passed / total) * 100).toFixed(2);
    console.log(`\nOverall Success Rate: ${passRate}%`);

    if (failed === 0) {
      console.log(
        "\n✓✓✓ All distributed numericals tests passed! Valkey compatible! ✓✓✓\n",
      );
    } else {
      console.log(
        "\n✗✗✗ Some tests failed. Review compatibility issues. ✗✗✗\n",
      );
    }
  }

  /**
   * Export results to JSON
   */
  exportResults(filename: string = "numericals-valkey-results.json"): void {
    const fs = require("fs");
    const summary: TestSummary = {
      total: this.results.length,
      passed: this.results.filter((r) => r.passed).length,
      failed: this.results.filter((r) => !r.passed).length,
      byCategory: {},
    };

    this.results.forEach((r) => {
      if (!summary.byCategory[r.category]) {
        summary.byCategory[r.category] = { passed: 0, failed: 0 };
      }
      if (r.passed) {
        summary.byCategory[r.category].passed++;
      } else {
        summary.byCategory[r.category].failed++;
      }
    });

    const results = {
      timestamp: new Date().toISOString(),
      packageVersions: this.packageVersions,
      host: this.host,
      port: this.port,
      environment: this.environment,
      summary,
      results: this.results,
    };

    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(`\nResults exported to ${filename}`);
  }
}

// ====================
// Main Execution
// ====================

async function main() {
  const host =
    process.env.REDIS_HOST ||
    "master.valkey-poc-non-prod.pcfhkv.euc1.cache.amazonaws.com";
  const port = process.env.REDIS_PORT || "6379";
  const environment = process.env.ENVIRONMENT || "valkey-numericals-test";

  console.log(`\n🔬 Distributed Numericals Valkey Test Suite\n`);
  console.log(`Target: ${host}:${port}`);
  console.log(`Environment: ${environment}\n`);

  const tester = new DistributedNumericalsValkeyTester(host, port, environment);

  try {
    await tester.runAllTests();
    tester.exportResults(
      `./comp-results/numericals-valkey-${Date.now()}.json`,
    );
  } catch (error: any) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { DistributedNumericalsValkeyTester };
