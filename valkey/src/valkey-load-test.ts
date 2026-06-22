// filepath: valkey-load-test.ts
import { LockSettings, RedisFactory, ReferenceGenerator } from "@verto-fx/verto-redis";
import { IRedisData } from "@verto-fx/verto-redis/dist/src/interfaces/IRedisData";
import { RequestState } from "@verto-fx/verto-redis/dist/src/interfaces/IRedisSetResponse";
import { ConfigurationManager } from "@verto-fx/verto-utilities";
import * as fs from "fs";

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

interface PerformanceMetrics {
  operations: number;
  totalDuration: number;
  avgLatency: number;
  p50: number;
  p95: number;
  p99: number;
  throughput: number;
}

class ValkeyLoadTester {
  private results: TestResult[] = [];
  private testPrefix = `valkey-load-${Date.now()}`;

  constructor(
    private host: string,
    private port: string,
    private environment: string = "valkey-test",
  ) {
    this.initialize();
  }

  /**
   * Initialize connection
   */
  async initialize(): Promise<void> {
    ConfigurationManager.init({
      REDIS_HOST: this.host,
      REDIS_PORT: this.port,
      IS_REDIS_CONNECTED: true,
      ENVIRONMENT: this.environment,
    });
    RedisFactory.resetInstance();
    console.log(`✓ Initialized connection to ${this.host}:${this.port}`);
  }

  /**
   * Run all load tests
   */
  async runAllTests(): Promise<void> {
    console.log("\n=== Valkey Load Test Suite ===\n");

    const testCategories = [
      {
        name: "1. Performance Benchmarks",
        fn: () => this.testPerformanceBenchmarks(),
      },
      {
        name: "2. Concurrent Operations",
        fn: () => this.testConcurrentOperations(),
      },
      {
        name: "3. High Volume Operations",
        fn: () => this.testHighVolumeOperations(),
      },
      {
        name: "4. Connection Resilience",
        fn: () => this.testConnectionResilience(),
      },
      {
        name: "5. Memory Pressure",
        fn: () => this.testMemoryPressure(),
      },
      {
        name: "6. Sustained Load",
        fn: () => this.testSustainedLoad(),
      },
    ];

    for (const category of testCategories) {
      console.log(`\n--- ${category.name} ---`);
      await category.fn();
    }

    await this.cleanup();
    this.printSummary();
    this.saveResults();
  }

  /**
   * Category 1: Performance Benchmarks
   */
  private async testPerformanceBenchmarks(): Promise<void> {
    await this.runTest(
      "Performance Benchmarks",
      "SET operation latency",
      async () => {
        const operations = 100;
        const latencies: number[] = [];

        for (let i = 0; i < operations; i++) {
          const start = process.hrtime.bigint();
          await RedisFactory.setValue(
            `${this.testPrefix}:perf:set:${i}`,
            `value${i}`,
            { expireInSeconds: 300 },
          );
          const end = process.hrtime.bigint();
          latencies.push(Number(end - start) / 1_000_000); // Convert to ms
        }

        const metrics = this.calculateMetrics(latencies, operations);

        if (metrics.avgLatency > 10) {
          console.warn(
            `⚠️  High average latency: ${metrics.avgLatency.toFixed(2)}ms`,
          );
        }

        if (metrics.p99 > 50) {
          console.warn(`⚠️  High P99 latency: ${metrics.p99.toFixed(2)}ms`);
        }

        return metrics;
      },
    );

    await this.runTest(
      "Performance Benchmarks",
      "GET operation latency",
      async () => {
        const operations = 100;
        const latencies: number[] = [];

        // Pre-populate keys
        const promises = [];
        for (let i = 0; i < operations; i++) {
          promises.push(
            RedisFactory.setValue(
              `${this.testPrefix}:perf:get:${i}`,
              `value${i}`,
              { expireInSeconds: 300 },
            ),
          );
        }
        await Promise.all(promises);

        // Measure GET latency
        for (let i = 0; i < operations; i++) {
          const start = process.hrtime.bigint();
          await RedisFactory.getValue(`${this.testPrefix}:perf:get:${i}`);
          const end = process.hrtime.bigint();
          latencies.push(Number(end - start) / 1_000_000);
        }

        const metrics = this.calculateMetrics(latencies, operations);

        if (metrics.avgLatency > 10) {
          console.warn(
            `⚠️  High average latency: ${metrics.avgLatency.toFixed(2)}ms`,
          );
        }

        return metrics;
      },
    );

    await this.runTest(
      "Performance Benchmarks",
      "MSET operation throughput",
      async () => {
        const batches = 100;
        const batchSize = 10;
        const totalOps = batches * batchSize;
        const latencies: number[] = [];

        for (let i = 0; i < batches; i++) {
          const cacheData: IRedisData[] = [];
          for (let j = 0; j < batchSize; j++) {
            cacheData.push({
              key: `${this.testPrefix}:perf:mset:${i * batchSize + j}`,
              value: `value${i * batchSize + j}`,
              expireInSeconds: 300,
            });
          }

          const start = process.hrtime.bigint();
          await RedisFactory.mSetValues(cacheData);
          const end = process.hrtime.bigint();
          latencies.push(Number(end - start) / 1_000_000);
        }

        const metrics = this.calculateMetrics(latencies, batches);
        metrics.operations = totalOps;

        return metrics;
      },
    );

    await this.runTest(
      "Performance Benchmarks",
      "Lua script execution latency",
      async () => {
        const operations = 100;
        const latencies: number[] = [];

        const script = `
          local key = KEYS[1]
          local value = ARGV[1]
          redis.call('SET', key, value)
          return redis.call('GET', key)
        `;

        for (let i = 0; i < operations; i++) {
          const key = `${this.environment}:${this.testPrefix}:perf:lua:${i}`;

          const start = process.hrtime.bigint();
          await RedisFactory.eval(script, [key], [`value${i}`]);
          const end = process.hrtime.bigint();
          latencies.push(Number(end - start) / 1_000_000);
        }

        const metrics = this.calculateMetrics(latencies, operations);

        if (metrics.avgLatency > 15) {
          console.warn(
            `⚠️  High Lua script latency: ${metrics.avgLatency.toFixed(2)}ms`,
          );
        }

        return metrics;
      },
    );
  }

  /**
   * Category 2: Concurrent Operations
   */
  private async testConcurrentOperations(): Promise<void> {
    await this.runTest(
      "Concurrent Operations",
      "Concurrent SET operations (25 parallel)",
      async () => {
        const keyPrefix = `${this.testPrefix}:concurrent:set`;
        const count = 25;

        const start = Date.now();
        const promises = [];
        for (let i = 0; i < count; i++) {
          promises.push(
            RedisFactory.setValue(`${keyPrefix}:${i}`, `value-${i}`, { expireInSeconds: 300 }),
          );
        }

        await Promise.all(promises);
        const duration = Date.now() - start;

        const verifyPromises = [];
        for (let i = 0; i < count; i++) {
          verifyPromises.push(RedisFactory.getValue(`${keyPrefix}:${i}`));
        }

        const values = await Promise.all(verifyPromises);
        const successCount = values.filter((v, i) => v === `value-${i}`).length;

        if (successCount !== count) {
          throw new Error(`Only ${successCount}/${count} operations succeeded`);
        }

        return {
          count,
          successCount,
          duration,
          throughput: (count / duration) * 1000,
        };
      },
    );

    await this.runTest(
      "Concurrent Operations",
      "Concurrent lock attempts",
      async () => {
        const key = `${this.testPrefix}:concurrent:lock`;
        const attempts = 10;

        const start = Date.now();
        const promises = Array(attempts)
          .fill(0)
          .map(() =>
            RedisFactory.acquire([key], 3000, new LockSettings(1, 100, 50))
              .then((value) => ({ status: "fulfilled" as const, value }))
              .catch((error) => ({ status: "rejected" as const, error })),
          );

        const results = await Promise.all(promises);
        const duration = Date.now() - start;

        const succeeded = results.filter(
          (r) => r.status === "fulfilled",
        ).length;
        const failed = results.filter((r) => r.status === "rejected").length;

        if (succeeded !== 1) {
          throw new Error(`Expected 1 success, got ${succeeded}`);
        }

        const successfulLock = results.find((r) => r.status === "fulfilled");
        if (successfulLock && "value" in successfulLock) {
          await successfulLock.value.release();
        }

        return { attempts, succeeded, failed, duration };
      },
    );

    await this.runTest(
      "Concurrent Operations",
      "Concurrent reference generation (10 parallel)",
      async () => {
        const refKey = `${this.testPrefix}-concurrent-ref`;
        const numberKey = `unique-reference-${refKey}-number`;
        const alphabetKey = `unique-reference-${refKey}-alphabet`;

        await RedisFactory.removeKeys([numberKey, alphabetKey]);

        const promises: Promise<string>[] = [];
        const concurrentCount = 10;
        let lastRef = `${refKey}-01012024-100`;

        const start = Date.now();
        for (let i = 0; i < concurrentCount; i++) {
          promises.push(
            ReferenceGenerator.generateAsync({
              refKey: refKey,
              lastRefCallback: () => Promise.resolve(lastRef),
              persistRefCallback: (key, ref) => {
                lastRef = ref;
                return Promise.resolve(ref);
              },
            }),
          );
        }

        const references = await Promise.all(promises);
        const duration = Date.now() - start;

        const uniqueRefs = new Set(references);

        if (uniqueRefs.size !== concurrentCount) {
          throw new Error(
            `Expected ${concurrentCount} unique references, got ${uniqueRefs.size}`,
          );
        }

        await RedisFactory.removeKeys([numberKey, alphabetKey]);

        return {
          refKey,
          concurrentCount,
          uniqueCount: uniqueRefs.size,
          duration,
        };
      },
    );

    await this.runTest(
      "Concurrent Operations",
      "Mixed operations under load (50 parallel)",
      async () => {
        const operations = 50;
        const promises = [];

        const start = Date.now();
        for (let i = 0; i < operations; i++) {
          const op = i % 4;
          if (op === 0) {
            // SET
            promises.push(
              RedisFactory.setValue(
                `${this.testPrefix}:mixed:${i}`,
                `value${i}`,
                { expireInSeconds: 300 },
              ),
            );
          } else if (op === 1) {
            // GET
            promises.push(
              RedisFactory.getValue(`${this.testPrefix}:mixed:${i - 1}`),
            );
          } else if (op === 2) {
            // MSET
            promises.push(
              RedisFactory.mSetValues([
                { key: `${this.testPrefix}:mixed:mset:${i}`, value: `v${i}`, expireInSeconds: 300 },
              ]),
            );
          } else {
            // DEL
            promises.push(
              RedisFactory.removeKey(`${this.testPrefix}:mixed:${i - 3}`),
            );
          }
        }

        const results = await Promise.allSettled(promises);
        const duration = Date.now() - start;

        const succeeded = results.filter(
          (r) => r.status === "fulfilled",
        ).length;
        const failed = results.filter((r) => r.status === "rejected").length;

        return {
          operations,
          succeeded,
          failed,
          duration,
          throughput: (succeeded / duration) * 1000,
        };
      },
    );
  }

  /**
   * Category 3: High Volume Operations
   */
  private async testHighVolumeOperations(): Promise<void> {
    await this.runTest(
      "High Volume Operations",
      "Bulk insert 100 keys",
      async () => {
        const count = 100;
        const batchSize = 100;
        const batches = Math.ceil(count / batchSize);

        const start = Date.now();
        for (let i = 0; i < batches; i++) {
          const cacheData: IRedisData[] = [];
          for (let j = 0; j < batchSize && i * batchSize + j < count; j++) {
            cacheData.push({
              key: `${this.testPrefix}:bulk:${i * batchSize + j}`,
              value: `value${i * batchSize + j}`,
              expireInSeconds: 300,
            });
          }
          await RedisFactory.mSetValues(cacheData);
        }
        const duration = Date.now() - start;

        // Verify sample
        const sampleSize = 100;
        const samplePromises = [];
        for (let i = 0; i < sampleSize; i++) {
          const idx = Math.floor(Math.random() * count);
          samplePromises.push(
            RedisFactory.getValue(`${this.testPrefix}:bulk:${idx}`),
          );
        }

        const samples = await Promise.all(samplePromises);
        const successCount = samples.filter((v) => v !== null).length;

        if (successCount < sampleSize * 0.95) {
          throw new Error(
            `Too many missing keys: ${sampleSize - successCount}/${sampleSize}`,
          );
        }

        return {
          count,
          duration,
          throughput: (count / duration) * 1000,
          sampleSize,
          sampleSuccess: successCount,
        };
      },
    );

    await this.runTest(
      "High Volume Operations",
      "Bulk read 100 keys",
      async () => {
        const count = 100;
        const batchSize = 100;

        const start = Date.now();
        const promises = [];
        for (let i = 0; i < count; i += batchSize) {
          const keys = [];
          for (let j = 0; j < batchSize && i + j < count; j++) {
            keys.push(`${this.testPrefix}:bulk:${i + j}`);
          }
          promises.push(RedisFactory.mGetValues(...keys));
        }

        const results = await Promise.all(promises);
        const duration = Date.now() - start;

        let totalRetrieved = 0;
        results.forEach((result) => {
          if (result.status === RequestState.Success) {
            totalRetrieved += result.items.length;
          }
        });

        return {
          count,
          retrieved: totalRetrieved,
          duration,
          throughput: (totalRetrieved / duration) * 1000,
        };
      },
    );

    await this.runTest(
      "High Volume Operations",
      "Pattern-based key scan",
      async () => {
        const pattern = `${this.testPrefix}:bulk:*`;

        const start = Date.now();
        const keys = await RedisFactory.getKeys(pattern);
        const duration = Date.now() - start;

        if (keys.length < 4500) {
          console.warn(`⚠️  Only found ${keys.length} keys, expected ~5000`);
        }

        return {
          pattern,
          keysFound: keys.length,
          duration,
        };
      },
    );
  }

  /**
   * Category 4: Connection Resilience
   */
  private async testConnectionResilience(): Promise<void> {
    await this.runTest(
      "Connection Resilience",
      "Connection pool stress (100 parallel ops)",
      async () => {
        const operations = 100;
        const promises = [];

        const start = Date.now();
        for (let i = 0; i < operations; i++) {
          promises.push(
            RedisFactory.setValue(`${this.testPrefix}:pool:${i}`, `value${i}`, { expireInSeconds: 300 }),
          );
        }

        const results = await Promise.allSettled(promises);
        const duration = Date.now() - start;

        const succeeded = results.filter(
          (r) => r.status === "fulfilled",
        ).length;
        const failed = results.filter((r) => r.status === "rejected").length;

        if (failed > 0) {
          console.warn(`⚠️  ${failed} operations failed due to pool issues`);
        }

        // Verify
        const verifyPromises = [];
        for (let i = 0; i < operations; i++) {
          verifyPromises.push(
            RedisFactory.getValue(`${this.testPrefix}:pool:${i}`),
          );
        }

        const values = await Promise.all(verifyPromises);
        const verifySuccess = values.filter((v, i) => v === `value${i}`).length;

        return {
          operations,
          succeeded,
          failed,
          verifySuccess,
          duration,
          throughput: (succeeded / duration) * 1000,
        };
      },
    );

    await this.runTest(
      "Connection Resilience",
      "Rapid sequential operations (100 ops)",
      async () => {
        const operations = 100;
        const key = `${this.testPrefix}:rapid:counter`;

        const start = Date.now();
        for (let i = 0; i < operations; i++) {
          await RedisFactory.setValue(key, i.toString(), { expireInSeconds: 300 });
        }
        const duration = Date.now() - start;

        const finalValue = await RedisFactory.getValue(key);

        if (parseInt(finalValue!) !== operations - 1) {
          throw new Error(`Expected ${operations - 1}, got ${finalValue}`);
        }

        return {
          operations,
          duration,
          opsPerSecond: (operations / duration) * 1000,
        };
      },
    );
  }

  /**
   * Category 5: Memory Pressure
   */
  private async testMemoryPressure(): Promise<void> {
    await this.runTest(
      "Memory Pressure",
      "Large value storage (1MB values)",
      async () => {
        const largeValue = "x".repeat(1024 * 1024); // 1MB
        const count = 5;

        const start = Date.now();
        const promises = [];
        for (let i = 0; i < count; i++) {
          promises.push(
            RedisFactory.setValue(`${this.testPrefix}:large:${i}`, largeValue, {
              expireInSeconds: 300,
            }),
          );
        }

        await Promise.all(promises);
        const duration = Date.now() - start;

        // Verify retrieval
        const verifyPromises = [];
        for (let i = 0; i < count; i++) {
          verifyPromises.push(
            RedisFactory.getValue(`${this.testPrefix}:large:${i}`),
          );
        }

        const results = await Promise.all(verifyPromises);
        const successCount = results.filter((v) => v !== null).length;
        const evictedCount = count - successCount;

        if (evictedCount > 0) {
          console.warn(
            `⚠️  ${evictedCount}/${count} large values were evicted`,
          );
        }

        return {
          valueSize: "1MB",
          count,
          successCount,
          evictedCount,
          duration,
          totalMemory: `${count}MB`,
        };
      },
    );

    await this.runTest(
      "Memory Pressure",
      "Key count scalability (100 keys)",
      async () => {
        const count = 100;
        const batchSize = 100;

        const start = Date.now();
        for (let i = 0; i < count; i += batchSize) {
          const cacheData: IRedisData[] = [];
          for (let j = 0; j < batchSize && i + j < count; j++) {
            cacheData.push({
              key: `${this.testPrefix}:scale:${i + j}`,
              value: `v${i + j}`,
              expireInSeconds: 300,
            });
          }
          await RedisFactory.mSetValues(cacheData);
        }
        const insertDuration = Date.now() - start;

        // Test pattern scan performance
        const scanStart = Date.now();
        const keys = await RedisFactory.getKeys(`${this.testPrefix}:scale:*`);
        const scanDuration = Date.now() - scanStart;

        return {
          count,
          insertDuration,
          scanDuration,
          keysFound: keys.length,
          insertThroughput: (count / insertDuration) * 1000,
        };
      },
    );
  }

  /**
   * Category 6: Sustained Load
   */
  private async testSustainedLoad(): Promise<void> {
    await this.runTest(
      "Sustained Load",
      "Sustained write load (30 seconds)",
      async () => {
        const durationMs = 30000; // 30 seconds
        const batchSize = 10;
        let totalOps = 0;
        let batchCount = 0;

        const start = Date.now();
        while (Date.now() - start < durationMs) {
          const cacheData: IRedisData[] = [];
          for (let i = 0; i < batchSize; i++) {
            cacheData.push({
              key: `${this.testPrefix}:sustained:${totalOps + i}`,
              value: `value${totalOps + i}`,
              expireInSeconds: 300,
            });
          }

          await RedisFactory.mSetValues(cacheData);
          totalOps += batchSize;
          batchCount++;
        }
        const actualDuration = Date.now() - start;

        return {
          durationSeconds: actualDuration / 1000,
          totalOperations: totalOps,
          batches: batchCount,
          opsPerSecond: (totalOps / actualDuration) * 1000,
        };
      },
    );

    await this.runTest(
      "Sustained Load",
      "Mixed read/write load (20 seconds)",
      async () => {
        const durationMs = 20000; // 20 seconds
        let reads = 0;
        let writes = 0;
        let readSuccesses = 0;
        let writeSuccesses = 0;

        // Pre-populate some keys
        const prepData: IRedisData[] = [];
        for (let i = 0; i < 100; i++) {
          prepData.push({
            key: `${this.testPrefix}:mixed:${i}`,
            value: `initial${i}`,
            expireInSeconds: 300,
          });
        }
        await RedisFactory.mSetValues(prepData);

        const start = Date.now();
        while (Date.now() - start < durationMs) {
          const op = Math.random();
          if (op < 0.7) {
            // 70% reads
            const idx = Math.floor(Math.random() * 100);
            try {
              const value = await RedisFactory.getValue(
                `${this.testPrefix}:mixed:${idx}`,
              );
              if (value !== null) readSuccesses++;
              reads++;
            } catch (e) {
              reads++;
            }
          } else {
            // 30% writes
            const idx = Math.floor(Math.random() * 100);
            try {
              await RedisFactory.setValue(
                `${this.testPrefix}:mixed:${idx}`,
                `updated${Date.now()}`,
                { expireInSeconds: 300 },
              );
              writeSuccesses++;
              writes++;
            } catch (e) {
              writes++;
            }
          }
        }
        const actualDuration = Date.now() - start;

        const totalOps = reads + writes;

        return {
          durationSeconds: actualDuration / 1000,
          totalOperations: totalOps,
          reads,
          writes,
          readSuccesses,
          writeSuccesses,
          opsPerSecond: (totalOps / actualDuration) * 1000,
          readWriteRatio: `${((reads / totalOps) * 100).toFixed(0)}/${((writes / totalOps) * 100).toFixed(0)}`,
        };
      },
    );
  }

  /**
   * Helper: Calculate performance metrics
   */
  private calculateMetrics(
    latencies: number[],
    operations: number,
  ): PerformanceMetrics {
    const sorted = latencies.sort((a, b) => a - b);
    const totalDuration = latencies.reduce((sum, l) => sum + l, 0);
    const avgLatency = totalDuration / operations;

    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    const throughput = (operations / totalDuration) * 1000; // ops/sec

    return {
      operations,
      totalDuration,
      avgLatency,
      p50,
      p95,
      p99,
      throughput,
    };
  }

  /**
   * Helper: Run individual test
   */
  private async runTest(
    category: string,
    testName: string,
    testFn: () => Promise<any>,
  ): Promise<void> {
    const startTime = Date.now();
    try {
      const details = await testFn();
      const duration = Date.now() - startTime;
      this.results.push({
        testName,
        category,
        passed: true,
        duration,
        details,
      });
      console.log(`  ✓ ${testName} (${duration}ms)`);
      if (details) {
        this.logDetails(details);
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.results.push({
        testName,
        category,
        passed: false,
        duration,
        error: error.message,
      });
      console.log(`  ✗ ${testName}`);
      console.log(`    ${error.message}`);
    }
  }

  /**
   * Helper: Log test details
   */
  private logDetails(details: any): void {
    const importantKeys = [
      "avgLatency",
      "p50",
      "p95",
      "p99",
      "throughput",
      "opsPerSecond",
      "duration",
    ];

    for (const key of importantKeys) {
      if (key in details) {
        const value = details[key];
        if (typeof value === "number") {
          console.log(`    ${key}: ${value.toFixed(2)}`);
        } else {
          console.log(`    ${key}: ${value}`);
        }
      }
    }
  }

  /**
   * Helper: Cleanup test data
   */
  private async cleanup(): Promise<void> {
    console.log("\n--- Cleaning up test data ---");
    try {
      const patterns = [
        `${this.testPrefix}:*`,
        `valkey-load-*`,
        `unique-reference-*`,
      ];

      for (const pattern of patterns) {
        const keys = await RedisFactory.getKeys(pattern);
        if (keys.length > 0) {
          console.log(`Removing ${keys.length} keys matching ${pattern}`);
          // Remove in batches to avoid overwhelming Redis
          const batchSize = 1000;
          for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            await RedisFactory.removeKeys(batch);
          }
        }
      }
      console.log("✓ Cleanup completed");
    } catch (error: any) {
      console.error(`⚠️  Cleanup error: ${error.message}`);
    }
  }

  /**
   * Helper: Print summary
   */
  private printSummary(): void {
    const summary: TestSummary = {
      total: this.results.length,
      passed: 0,
      failed: 0,
      byCategory: {},
    };

    this.results.forEach((result) => {
      if (result.passed) {
        summary.passed++;
      } else {
        summary.failed++;
      }

      if (!summary.byCategory[result.category]) {
        summary.byCategory[result.category] = { passed: 0, failed: 0 };
      }

      if (result.passed) {
        summary.byCategory[result.category].passed++;
      } else {
        summary.byCategory[result.category].failed++;
      }
    });

    console.log("\n\n=== Test Summary ===\n");
    console.log(`Total Tests: ${summary.total}`);
    console.log(`Passed: ${summary.passed} ✓`);
    console.log(`Failed: ${summary.failed} ✗`);
    console.log(
      `Total Duration: ${this.results.reduce((sum, r) => sum + r.duration, 0)}ms`,
    );

    console.log("\nResults by Category:");
    Object.entries(summary.byCategory).forEach(([category, stats]) => {
      const total = stats.passed + stats.failed;
      const percentage = ((stats.passed / total) * 100).toFixed(1);
      console.log(
        `  ${category}: ${stats.passed}/${total} passed (${percentage}%)`,
      );
    });

    if (summary.failed > 0) {
      console.log("\nFailed Tests:");
      this.results
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`  • [${r.category}] ${r.testName}`);
          console.log(`    ${r.error}`);
        });
    }

    const successRate = ((summary.passed / summary.total) * 100).toFixed(2);
    console.log(`\nOverall Success Rate: ${successRate}%`);

    if (summary.failed === 0) {
      console.log("\n✓✓✓ All load tests passed! ✓✓✓\n");
    } else {
      console.log(
        `\n⚠️⚠️⚠️ ${summary.failed} test(s) failed - review results ⚠️⚠️⚠️\n`,
      );
    }
  }

  /**
   * Helper: Save results to file
   */
  private saveResults(): void {
    const summary = {
      timestamp: new Date().toISOString(),
      host: this.host,
      port: this.port,
      environment: this.environment,
      summary: {
        total: this.results.length,
        passed: this.results.filter((r) => r.passed).length,
        failed: this.results.filter((r) => !r.passed).length,
        byCategory: this.results.reduce(
          (acc, r) => {
            if (!acc[r.category]) {
              acc[r.category] = { passed: 0, failed: 0 };
            }
            if (r.passed) {
              acc[r.category].passed++;
            } else {
              acc[r.category].failed++;
            }
            return acc;
          },
          {} as Record<string, { passed: number; failed: number }>,
        ),
      },
      results: this.results,
    };

    const filename = `./load-result/valkey-load-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(summary, null, 2));
    console.log(`\n✓ Results saved to ${filename}\n`);
  }
}

// Main execution
const host =
  process.env.REDIS_HOST ||
  "master.valkey-poc-non-prod.pcfhkv.euc1.cache.amazonaws.com";
const port = process.env.REDIS_PORT || "6379";
const environment = process.env.ENVIRONMENT || "valkey-test";

// const host =
//   process.env.REDIS_HOST ||
// "verto-redis-cache-non-prod.pcfhkv.ng.0001.euc1.cache.amazonaws.com";
// const port = process.env.REDIS_PORT || "6379";
// const environment = process.env.ENVIRONMENT || "redis-test";

console.log(`Starting Valkey load tests...`);
console.log(`Host: ${host}`);
console.log(`Port: ${port}`);
console.log(`Environment: ${environment}`);

const tester = new ValkeyLoadTester(host, port, environment);

tester.runAllTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
