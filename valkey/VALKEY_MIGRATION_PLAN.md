# Redis to Valkey Migration Plan for Verto

**Version:** 1.0  
**Date:** January 24, 2026  
**Owner:** Platform Engineering Team  
**Status:** Planning Phase

---

## Executive Summary

This document outlines a comprehensive plan to migrate the `@verto-fx/verto-redis` library and all dependent services from Redis to Valkey. The migration strategy focuses on safety, zero-downtime deployment, and gradual rollout with instant rollback capabilities.

### Key Findings

Your `@verto-fx/verto-redis` library is a critical piece of infrastructure providing:

- Distributed caching
- Distributed locking (Redlock algorithm)
- Rate limiting
- Reference number generation
- Multiple cache key providers for different domains

**Good news**: Valkey is 100% protocol-compatible with Redis, and your `ioredis` client already supports Valkey with minimal changes.

---

## Table of Contents

1. [Why Migrate to Valkey?](#1-why-migrate-to-valkey)
2. [Suitability Assessment](#2-suitability-assessment)
3. [Proof of Concept Plan](#3-proof-of-concept-plan)
4. [Full Migration Strategy](#4-full-migration-strategy)
5. [Common Issues & Solutions](#5-common-issues-and-solutions)
6. [POC Implementation Guide](#6-poc-implementation-guide)
7. [Success Criteria](#7-success-criteria)
8. [Timeline & Resources](#8-timeline-and-resources)
9. [Risk Matrix](#9-risk-matrix)

---

## 1. Why Migrate to Valkey?

### 1.1 Business & Technical Drivers

#### Licensing & Legal

- **Redis License Change**: Redis transitioned to dual SSPL/RSALv2 licenses (non-OSI approved)
- **Valkey is True Open Source**: Maintains BSD 3-Clause license
- **No Vendor Lock-in**: Community-driven, no single vendor control
- **No Future Licensing Risks**: Eliminate potential future costs

#### Community & Governance

- **Linux Foundation Backing**: Provides stability and long-term support
- **Major Contributors**: AWS, Google, Oracle, Alibaba Cloud actively developing
- **Transparent Roadmap**: Public decision-making process
- **Active Development**: Regular security patches and improvements

#### Technical Benefits

- **100% Redis OSS 7.2 Protocol Compatibility**: Drop-in replacement
- **Performance Improvements**: Active optimization work
- **Multi-Cloud Strategy**: Better cloud-agnostic positioning
- **Future Features**: Community-driven innovation

#### Cost Optimization

- **No Licensing Fees**: Free for all use cases
- **Managed Service Options**: AWS MemoryDB, Google Cloud alternatives
- **Self-Hosting Flexibility**: No restrictions on deployment

#### Risk Mitigation

- **Avoid Future License Changes**: Protect against Redis policy shifts
- **Reduce Vendor Dependency**: Multiple cloud provider support
- **Future-Proof Infrastructure**: Align with industry trends

---

## 2. Suitability Assessment

### 2.1 Current Architecture Analysis

Based on your codebase (`@verto-fx/verto-redis`), you use:

| Feature                  | Usage in Your Code                | Valkey Support  | Risk Level |
| ------------------------ | --------------------------------- | --------------- | ---------- |
| **Basic Redis Commands** | SET, GET, MGET, MSET, DEL, TTL    | ✅ Full support | Low        |
| **Distributed Locking**  | Redlock via `redlock` npm package | ✅ Full support | Low        |
| **Lua Scripts**          | Used in rate limiter              | ✅ Full support | Low        |
| **Pipelines**            | Pipeline operations               | ✅ Full support | Low        |
| **Key Expiration**       | SETEX, TTL, EXPIRE                | ✅ Full support | Low        |
| **Pattern Matching**     | KEYS command for pattern search   | ✅ Full support | Low        |
| **Connection Handling**  | IORedis reconnection logic        | ✅ Full support | Low        |

### 2.2 Compatibility Score: 100% ✅

**All features you use are fully supported by Valkey.**

### 2.3 Dependencies Analysis

```json
{
  "ioredis": "^5.0.4", // ✅ Supports Valkey
  "redlock": "^5.0.0-beta.2" // ✅ Works with Valkey
}
```

---

## 3. Proof of Concept Plan

### Phase 1: Local Development POC (Week 1-2)

#### Step 1: Set Up Local Valkey Instance

**Using Docker:**

```bash
# Quick start
docker run -d --name valkey-poc \
  -p 6380:6379 \
  valkey/valkey:latest
```

**Using Docker Compose (Recommended):**

Create `docker-compose.valkey-poc.yml`:

```yaml
version: "3.8"
services:
  valkey-poc:
    image: valkey/valkey:latest
    container_name: valkey-poc
    ports:
      - "6380:6379"
    command: valkey-server --appendonly yes --loglevel verbose
    volumes:
      - valkey-poc-data:/data
    environment:
      - VALKEY_MAXMEMORY=256mb
      - VALKEY_MAXMEMORY_POLICY=allkeys-lru
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  redis-baseline:
    image: redis:7.2
    container_name: redis-baseline
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis-baseline-data:/data

volumes:
  valkey-poc-data:
  redis-baseline-data:
```

**Start the environment:**

```bash
docker-compose -f docker-compose.valkey-poc.yml up -d
```

#### Step 2: Create POC Branch

```bash
git checkout -b poc/valkey-migration
git push -u origin poc/valkey-migration
```

#### Step 3: Add Valkey Configuration

**Create `src/valkeyConfig.ts`:**

```typescript
import { IRedisConfig } from "./iRedisConfig";

export class ValkeyConfig {
  static getConfig(): IRedisConfig {
    return {
      isConnected: process.env.VALKEY_CONNECTED === "true",
      port: parseInt(process.env.VALKEY_PORT || "6379"),
      host: process.env.VALKEY_HOST || "localhost",
      env: process.env.VALKEY_ENV || process.env.NODE_ENV || "development",
    };
  }
}
```

**Update `src/iRedisConfig.ts`:**

```typescript
export interface IRedisConfig {
  isConnected: boolean;
  port: number;
  host: string;
  env: string;
  mode?: "redis" | "valkey"; // Add this field
}
```

#### Step 4: Update Factory for Dual-Mode Support

**Modify `src/redisFactory.ts`:**

```typescript
import { ValkeyConfig } from "./valkeyConfig";

export class RedisFactory {
  private static CACHE_PROVIDER = process.env.CACHE_PROVIDER || "redis"; // 'redis' | 'valkey'

  private static getInstance(): ICacheProvider {
    if (!this.config) {
      this.config =
        this.CACHE_PROVIDER === "valkey"
          ? ValkeyConfig.getConfig()
          : RedisConfig.getConfig();
    }
    if (!this.provider) {
      this.provider =
        this.config.isConnected == false
          ? new LocalCacheClient()
          : new RedisClient();
    }
    return this.provider;
  }

  /**
   * Test connection and identify server type
   */
  public static async testConnection(): Promise<{
    success: boolean;
    serverType: "redis" | "valkey" | "unknown";
    version: string;
    latency: number;
  }> {
    const start = Date.now();
    const instance = this.getInstance()._getInternalInstance();

    try {
      const info = await instance.info("server");
      const latency = Date.now() - start;

      // Parse server info
      const versionMatch = info.match(/redis_version:([^\r\n]+)/);
      const version = versionMatch ? versionMatch[1] : "unknown";

      // Valkey identifies itself in server info
      const isValkey =
        info.toLowerCase().includes("valkey") ||
        version.toLowerCase().includes("valkey");

      return {
        success: true,
        serverType: isValkey ? "valkey" : "redis",
        version,
        latency,
      };
    } catch (error) {
      return {
        success: false,
        serverType: "unknown",
        version: "unknown",
        latency: Date.now() - start,
      };
    }
  }
}
```

#### Step 5: Create POC Test Suite

**Create `test/valkey/valkey-compatibility.tests.ts`:**

```typescript
import { expect } from "chai";
import { RedisFactory } from "../../src/redisFactory";
import { RedisConfig } from "../../src/redisConfig";

describe("Valkey Compatibility Tests", () => {
  before(() => {
    // Point to Valkey instance
    process.env.CACHE_PROVIDER = "valkey";
    process.env.VALKEY_CONNECTED = "true";
    process.env.VALKEY_HOST = "localhost";
    process.env.VALKEY_PORT = "6380";
  });

  after(async () => {
    await RedisFactory.resetInstance();
  });

  it("should connect to Valkey", async () => {
    const result = await RedisFactory.testConnection();
    expect(result.success).to.be.true;
    expect(result.serverType).to.equal("valkey");
    console.log(`Connected to ${result.serverType} ${result.version}`);
  });

  it("should perform basic SET/GET operations", async () => {
    const testKey = "valkey-poc-test-key";
    const testValue = "test-value-" + Date.now();

    await RedisFactory.setValue(testKey, testValue);
    const retrieved = await RedisFactory.getValue(testKey);

    expect(retrieved).to.equal(testValue);
    await RedisFactory.removeKey(testKey);
  });

  it("should handle key expiration", async () => {
    const testKey = "valkey-expire-test";
    const testValue = "expires-soon";

    await RedisFactory.setValue(testKey, testValue, { expireInSeconds: 2 });

    const immediate = await RedisFactory.getValue(testKey);
    expect(immediate).to.equal(testValue);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const afterExpire = await RedisFactory.getValue(testKey);
    expect(afterExpire).to.be.null;
  });

  it("should handle distributed locking", async () => {
    const lock = await RedisFactory.acquireLock(
      ["valkey-poc-lock-test"],
      5000,
      { retryCount: 3 },
    );

    expect(lock).to.not.be.null;
    expect(lock.hasExpired()).to.be.false;

    // Test that lock prevents double acquisition
    try {
      await RedisFactory.acquireLock(["valkey-poc-lock-test"], 5000, {
        retryCount: 1,
        retryDelay: 100,
      });
      expect.fail("Should not acquire lock twice");
    } catch (error) {
      // Expected behavior
    }

    await lock.release();
  });

  it("should handle rate limiting", async () => {
    const rateLimiter = RedisFactory.createRateLimiter({
      interval: 1000,
      maxInInterval: 5,
    });

    const testId = "valkey-rate-limit-test-" + Date.now();

    // Should allow first 5 requests
    for (let i = 0; i < 5; i++) {
      const blocked = await rateLimiter.limit(testId);
      expect(blocked).to.be.false;
    }

    // Should block 6th request
    const blocked = await rateLimiter.limit(testId);
    expect(blocked).to.be.true;

    await rateLimiter.clear(testId);
  });

  it("should handle MGET/MSET operations", async () => {
    const data = [
      { key: "valkey-multi-1", value: "value1", expireInSeconds: 60 },
      { key: "valkey-multi-2", value: "value2", expireInSeconds: 60 },
      { key: "valkey-multi-3", value: "value3", expireInSeconds: 60 },
    ];

    const setResult = await RedisFactory.mSetValues(data);
    expect(setResult.failedRequests).to.equal(0);

    const values = await RedisFactory.mGetValues(
      "valkey-multi-1",
      "valkey-multi-2",
      "valkey-multi-3",
    );

    expect(values.values).to.have.lengthOf(3);
    expect(values.values[0]).to.equal("value1");
    expect(values.values[1]).to.equal("value2");
    expect(values.values[2]).to.equal("value3");

    await RedisFactory.removeKeys([
      "valkey-multi-1",
      "valkey-multi-2",
      "valkey-multi-3",
    ]);
  });

  it("should handle Lua scripts (rate limiter)", async () => {
    // Your rate limiter uses Lua scripts internally
    const rateLimiter = RedisFactory.createRateLimiter({
      interval: 5000,
      maxInInterval: 10,
      minDifference: 100,
    });

    const testId = "valkey-lua-test-" + Date.now();
    const info = await rateLimiter.limitWithInfo(testId);

    expect(info).to.have.property("blocked");
    expect(info).to.have.property("actionsRemaining");
    expect(info).to.have.property("blockedDueToCount");
    expect(info).to.have.property("blockedDueToMinDifference");
    expect(info.blocked).to.be.false;
    expect(info.actionsRemaining).to.equal(9);
  });

  it("should handle pipeline operations", async () => {
    const instance = RedisFactory["getInstance"]()._getInternalInstance();
    const pipeline = instance.pipeline();

    pipeline.set("valkey-pipeline-1", "value1");
    pipeline.set("valkey-pipeline-2", "value2");
    pipeline.get("valkey-pipeline-1");
    pipeline.get("valkey-pipeline-2");

    const results = await pipeline.exec();

    expect(results).to.have.lengthOf(4);
    expect(results[0][0]).to.be.null; // No error for SET
    expect(results[1][0]).to.be.null; // No error for SET
    expect(results[2][1]).to.equal("value1"); // GET result
    expect(results[3][1]).to.equal("value2"); // GET result

    // Cleanup
    await instance.del("valkey-pipeline-1", "valkey-pipeline-2");
  });

  it("should handle TTL operations", async () => {
    const testKey = "valkey-ttl-test";
    await RedisFactory.setValue(testKey, "test-value", {
      expireInSeconds: 300,
    });

    const ttl = await RedisFactory.getTtl(testKey);

    expect(ttl).to.be.greaterThan(290);
    expect(ttl).to.be.lessThanOrEqual(300);

    await RedisFactory.removeKey(testKey);
  });

  it("should handle key pattern search", async () => {
    // Create test keys
    await RedisFactory.setValue("valkey-pattern-test-1", "value1");
    await RedisFactory.setValue("valkey-pattern-test-2", "value2");
    await RedisFactory.setValue("valkey-pattern-test-3", "value3");

    const keys = await RedisFactory.getKeys("valkey-pattern-test-*");

    expect(keys.length).to.be.at.least(3);
    expect(keys).to.include("valkey-pattern-test-1");

    // Cleanup
    await RedisFactory.removeKeys([
      "valkey-pattern-test-1",
      "valkey-pattern-test-2",
      "valkey-pattern-test-3",
    ]);
  });

  it("should handle lock extension", async () => {
    const lock = await RedisFactory.acquireLock(["valkey-extend-test"], 2000, {
      retryCount: 3,
    });

    const initialExpiration = lock.getExpirationEpochTimeMs();

    // Wait 500ms then extend
    await new Promise((resolve) => setTimeout(resolve, 500));
    await lock.extend(3000);

    const newExpiration = lock.getExpirationEpochTimeMs();

    expect(newExpiration).to.be.greaterThan(initialExpiration);
    expect(lock.hasExpired()).to.be.false;

    await lock.release();
  });
});
```

**Create `test/valkey/performance-benchmark.tests.ts`:**

```typescript
import { expect } from "chai";
import { RedisFactory } from "../../src/redisFactory";

interface BenchmarkResult {
  operation: string;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

describe("Redis vs Valkey Performance Benchmark", () => {
  const runBenchmark = async (
    operation: string,
    fn: () => Promise<any>,
    iterations: number = 1000,
  ): Promise<BenchmarkResult> => {
    const times: number[] = [];

    // Warmup
    for (let i = 0; i < 10; i++) {
      await fn();
    }

    // Actual benchmark
    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await fn();
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1000000); // Convert to ms
    }

    times.sort((a, b) => a - b);

    return {
      operation,
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      p50: times[Math.floor(times.length * 0.5)],
      p95: times[Math.floor(times.length * 0.95)],
      p99: times[Math.floor(times.length * 0.99)],
      min: times[0],
      max: times[times.length - 1],
    };
  };

  const printBenchmark = (result: BenchmarkResult) => {
    console.log(`\n${result.operation} Benchmark:`);
    console.log(`  Avg: ${result.avg.toFixed(3)}ms`);
    console.log(`  P50: ${result.p50.toFixed(3)}ms`);
    console.log(`  P95: ${result.p95.toFixed(3)}ms`);
    console.log(`  P99: ${result.p99.toFixed(3)}ms`);
    console.log(`  Min: ${result.min.toFixed(3)}ms`);
    console.log(`  Max: ${result.max.toFixed(3)}ms`);
  };

  it("should benchmark SET operations", async () => {
    const result = await runBenchmark("SET", async () => {
      await RedisFactory.setValue("bench-set-test", "value-" + Date.now());
    });

    printBenchmark(result);
    expect(result.avg).to.be.lessThan(10); // Should be sub-10ms
  });

  it("should benchmark GET operations", async () => {
    await RedisFactory.setValue("bench-get-test", "benchmark-value");

    const result = await runBenchmark("GET", async () => {
      await RedisFactory.getValue("bench-get-test");
    });

    printBenchmark(result);
    expect(result.avg).to.be.lessThan(10);
  });

  it("should benchmark MSET operations", async () => {
    const result = await runBenchmark(
      "MSET",
      async () => {
        await RedisFactory.mSetValues([
          { key: "bench-mset-1", value: "value1", expireInSeconds: 60 },
          { key: "bench-mset-2", value: "value2", expireInSeconds: 60 },
          { key: "bench-mset-3", value: "value3", expireInSeconds: 60 },
        ]);
      },
      500,
    );

    printBenchmark(result);
    expect(result.avg).to.be.lessThan(15);
  });

  it("should benchmark distributed lock acquire/release", async () => {
    const result = await runBenchmark(
      "LOCK",
      async () => {
        const lock = await RedisFactory.acquireLock(["bench-lock"], 5000, {
          retryCount: 3,
        });
        await lock.release();
      },
      100,
    ); // Fewer iterations for locks

    printBenchmark(result);
    expect(result.avg).to.be.lessThan(50);
  });

  it("should benchmark rate limiter", async () => {
    const rateLimiter = RedisFactory.createRateLimiter({
      interval: 60000,
      maxInInterval: 1000,
    });

    const result = await runBenchmark(
      "RATE_LIMIT",
      async () => {
        await rateLimiter.limit("bench-rate-test");
      },
      500,
    );

    printBenchmark(result);
    expect(result.avg).to.be.lessThan(20);
  });
});
```

**Create `test/valkey/stress-test.tests.ts`:**

```typescript
import { expect } from "chai";
import { RedisFactory } from "../../src/redisFactory";

describe("Valkey Stress Tests", () => {
  it("should handle concurrent lock acquisitions", async () => {
    const concurrentRequests = 50;
    const lockKey = "stress-lock-test";

    const promises = Array.from(
      { length: concurrentRequests },
      async (_, i) => {
        try {
          const lock = await RedisFactory.acquireLock([lockKey], 1000, {
            retryCount: 10,
            retryDelay: 50,
          });

          // Simulate work
          await new Promise((resolve) => setTimeout(resolve, 10));

          await lock.release();
          return { success: true, index: i };
        } catch (error) {
          return { success: false, index: i, error: error.message };
        }
      },
    );

    const results = await Promise.all(promises);
    const successes = results.filter((r) => r.success).length;

    console.log(
      `Concurrent lock test: ${successes}/${concurrentRequests} succeeded`,
    );

    // Most should succeed with retries
    expect(successes).to.be.greaterThan(concurrentRequests * 0.8);
  });

  it("should handle high-throughput SET/GET operations", async () => {
    const operations = 1000;
    const start = Date.now();

    const promises = Array.from({ length: operations }, async (_, i) => {
      const key = `stress-throughput-${i}`;
      await RedisFactory.setValue(key, `value-${i}`, { expireInSeconds: 30 });
      const value = await RedisFactory.getValue(key);
      return value === `value-${i}`;
    });

    const results = await Promise.all(promises);
    const duration = Date.now() - start;

    const successRate = results.filter((r) => r).length / operations;
    const opsPerSecond = (operations / duration) * 1000;

    console.log(
      `High-throughput test: ${successRate * 100}% success, ${opsPerSecond.toFixed(0)} ops/sec`,
    );

    expect(successRate).to.equal(1); // 100% success
    expect(opsPerSecond).to.be.greaterThan(100); // At least 100 ops/sec
  });

  it("should maintain data consistency under load", async () => {
    const key = "stress-consistency-test";
    const iterations = 100;

    // Concurrent writes and reads
    const writePromises = Array.from({ length: iterations }, async (_, i) => {
      await RedisFactory.setValue(key, `value-${i}`);
    });

    const readPromises = Array.from({ length: iterations }, async () => {
      return await RedisFactory.getValue(key);
    });

    await Promise.all([...writePromises, ...readPromises]);

    // Final value should be one of the written values
    const finalValue = await RedisFactory.getValue(key);
    expect(finalValue).to.match(/^value-\d+$/);

    await RedisFactory.removeKey(key);
  });
});
```

#### Step 6: Create Environment Configuration

**Create `.env.valkey`:**

```bash
# Valkey POC Configuration
CACHE_PROVIDER=valkey
VALKEY_CONNECTED=true
VALKEY_HOST=localhost
VALKEY_PORT=6380
VALKEY_ENV=poc

# Keep Redis for baseline comparison
REDIS_CONNECTED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_ENV=production
```

**Create `.env.redis`:**

```bash
# Redis Baseline Configuration
CACHE_PROVIDER=redis
REDIS_CONNECTED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_ENV=production
```

#### Step 7: Run POC Tests

**PowerShell commands:**

```powershell
# Start both Redis and Valkey
docker-compose -f docker-compose.valkey-poc.yml up -d

# Wait for services to be ready
Start-Sleep -Seconds 5

# Run tests against Valkey
$env:CACHE_PROVIDER="valkey"
$env:VALKEY_CONNECTED="true"
$env:VALKEY_HOST="localhost"
$env:VALKEY_PORT="6380"

npm test -- test/valkey/*.tests.ts

# Run tests against Redis for comparison
$env:CACHE_PROVIDER="redis"
$env:REDIS_CONNECTED="true"
$env:REDIS_HOST="localhost"
$env:REDIS_PORT="6379"

npm test -- test/valkey/*.tests.ts

# Compare results
Write-Host "`nComparison complete. Review test output above."
```

### Phase 2: Integration POC with One Service (Week 3-4)

#### Step 1: Select a Low-Risk Service

**Recommended order:**

1. `verto-cached-utilities` (lowest risk)
2. `verto-notification` (low risk)
3. `verto-reports` (low risk)

#### Step 2: Create Feature Flag Infrastructure

**Add to your service's configuration:**

```typescript
// config/cache.config.ts
export const CacheConfig = {
  provider: process.env.CACHE_PROVIDER || "redis", // 'redis' | 'valkey'
  trafficPercentage: parseFloat(process.env.VALKEY_TRAFFIC_PERCENT || "0"),

  shouldUseValkey(): boolean {
    if (this.provider === "valkey") return true;
    if (this.provider === "redis") return false;

    // Gradual rollout based on percentage
    return Math.random() * 100 < this.trafficPercentage;
  },
};
```

#### Step 3: Deploy Parallel Infrastructure

**Infrastructure as Code (Terraform/CloudFormation example):**

```hcl
# terraform/valkey-poc.tf
resource "aws_elasticache_replication_group" "valkey_poc" {
  replication_group_id       = "valkey-poc-cluster"
  replication_group_description = "Valkey POC Cluster"
  engine                     = "valkey"
  engine_version            = "7.2"
  node_type                 = "cache.t3.medium"
  number_cache_clusters     = 2
  port                      = 6379
  parameter_group_name      = "default.valkey7"
  subnet_group_name         = aws_elasticache_subnet_group.poc.name
  security_group_ids        = [aws_security_group.valkey_poc.id]

  automatic_failover_enabled = true
  multi_az_enabled          = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  tags = {
    Name        = "valkey-poc"
    Environment = "poc"
    ManagedBy   = "terraform"
  }
}
```

#### Step 4: Monitor Metrics

**Key metrics to track:**

- Latency (P50, P95, P99)
- Error rate
- Connection pool utilization
- Memory usage
- Lock acquisition success rate
- Rate limiter accuracy

**CloudWatch/Datadog Dashboard:**

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          [
            "AWS/ElastiCache",
            "CacheHitRate",
            { "stat": "Average", "label": "Valkey" }
          ],
          ["...", { "stat": "Average", "label": "Redis" }]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "Cache Hit Rate Comparison"
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ElastiCache", "EngineCPUUtilization", { "stat": "Average" }],
          [".", "DatabaseMemoryUsagePercentage", { "stat": "Average" }],
          [".", "NetworkBytesIn", { "stat": "Sum" }],
          [".", "NetworkBytesOut", { "stat": "Sum" }]
        ],
        "period": 60,
        "stat": "Average",
        "region": "us-east-1",
        "title": "Valkey Resource Utilization"
      }
    }
  ]
}
```

---

## 4. Full Migration Strategy

### 4.1 Pre-Migration Checklist

- [ ] POC completed successfully
- [ ] Performance benchmarks meet/exceed Redis
- [ ] All tests passing on Valkey
- [ ] Rollback plan documented and tested
- [ ] Monitoring dashboards configured
- [ ] Alert thresholds set
- [ ] Team trained on Valkey operations
- [ ] Emergency procedures documented
- [ ] Stakeholder communication plan ready
- [ ] Maintenance window scheduled (if needed)

### 4.2 Migration Approach: Blue-Green with Gradual Traffic Shift

#### Phase 1: Infrastructure Setup (Week 1)

**1. Provision Valkey Clusters**

- Mirror current Redis topology exactly
- Same number of nodes
- Same memory allocation
- Enable persistence (AOF + RDB)
- Configure replication
- Set up monitoring

**2. Network Configuration**

- Ensure security groups allow access
- Configure VPC peering if needed
- Set up DNS entries
- Test connectivity from all services

**3. Update Monitoring**

```yaml
# monitoring/valkey-alerts.yaml
alerts:
  - name: ValkeyHighLatency
    condition: p95_latency > 10ms
    severity: warning

  - name: ValkeyConnectionFailures
    condition: connection_errors > 5 per minute
    severity: critical

  - name: ValkeyMemoryPressure
    condition: memory_usage > 80%
    severity: warning

  - name: ValkeyReplicationLag
    condition: replication_lag > 1000ms
    severity: critical
```

#### Phase 2: Data Synchronization Strategy (Week 2)

**Option A: Cold Migration (Recommended)**

- No data migration needed
- Cache data is ephemeral
- Simply switch connections
- Accept temporary cache miss spike
- Caches will rebuild naturally

**Pros:**

- ✅ Simplest approach
- ✅ No data consistency concerns
- ✅ Fast migration

**Cons:**

- ⚠️ Temporary cache miss spike
- ⚠️ Increased backend load during warmup

**Option B: Warm Migration (If data continuity is critical)**

Use RIOT (Redis Input/Output Tool):

```bash
# Install RIOT
brew install redis/tap/riot-redis

# Live replication from Redis to Valkey
riot-redis replicate redis://redis-source:6379 redis://valkey-target:6379 \
  --mode live \
  --batch 1000 \
  --threads 4 \
  --scan-count 1000
```

**Pros:**

- ✅ No cache miss spike
- ✅ Data continuity maintained

**Cons:**

- ⚠️ More complex
- ⚠️ Requires additional tooling
- ⚠️ Potential sync lag

#### Phase 3: Service-by-Service Migration (Week 3-8)

**Migration Order (Risk-Based):**

| Week | Services                   | Risk Level | Rollback Window |
| ---- | -------------------------- | ---------- | --------------- |
| 3    | verto-cached-utilities     | 🟢 Low     | 1 hour          |
| 3    | verto-notification         | 🟢 Low     | 1 hour          |
| 4    | verto-reports              | 🟢 Low     | 1 hour          |
| 5    | verto-referrals-service    | 🟡 Medium  | 4 hours         |
| 5    | verto-marketplace-service  | 🟡 Medium  | 4 hours         |
| 6    | verto-invoice-service      | 🟡 Medium  | 4 hours         |
| 6    | verto-currency-service     | 🟡 Medium  | 4 hours         |
| 6    | verto-ledger-service       | 🟡 Medium  | 4 hours         |
| 7    | verto-payment-service      | 🔴 High    | 24 hours        |
| 7    | verto-wallet-service       | 🔴 High    | 24 hours        |
| 7    | verto-beneficiary-service  | 🔴 High    | 24 hours        |
| 8    | verto-subscription-service | 🔴 High    | 24 hours        |
| 8    | verto-company-service      | 🔴 High    | 24 hours        |
| 8    | verto-backend (monolith)   | 🔴 High    | 24 hours        |

**Per-Service Migration Steps:**

**Step 1: Deploy Updated Service**

```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: service-name
spec:
  template:
    spec:
      containers:
        - name: service
          env:
            - name: CACHE_PROVIDER
              value: "redis" # Start with Redis
            - name: VALKEY_HOST
              valueFrom:
                secretKeyRef:
                  name: valkey-connection
                  key: host
            - name: VALKEY_PORT
              value: "6379"
            - name: VALKEY_TRAFFIC_PERCENT
              value: "0" # Start at 0%
```

**Step 2: Gradual Traffic Shift**

```bash
# Day 1: 5% traffic
kubectl set env deployment/service-name VALKEY_TRAFFIC_PERCENT=5

# Monitor for 4 hours, if stable:

# Day 1 (4 hours later): 10% traffic
kubectl set env deployment/service-name VALKEY_TRAFFIC_PERCENT=10

# Day 2: 25% traffic
kubectl set env deployment/service-name VALKEY_TRAFFIC_PERCENT=25

# Day 3: 50% traffic
kubectl set env deployment/service-name VALKEY_TRAFFIC_PERCENT=50

# Day 4: 75% traffic
kubectl set env deployment/service-name VALKEY_TRAFFIC_PERCENT=75

# Day 5: 100% traffic
kubectl set env deployment/service-name CACHE_PROVIDER=valkey
```

**Step 3: Monitor KPIs**

Success criteria for each stage:

- ✅ Error rate < 0.1%
- ✅ P95 latency increase < 10%
- ✅ No data loss incidents
- ✅ Connection pool stable
- ✅ Lock acquisition success > 99%
- ✅ Rate limiter accuracy within 1%

**Step 4: Rollback Procedure (if needed)**

```bash
# Immediate rollback to Redis
kubectl set env deployment/service-name CACHE_PROVIDER=redis
kubectl set env deployment/service-name VALKEY_TRAFFIC_PERCENT=0

# Restart pods for immediate effect
kubectl rollout restart deployment/service-name

# Verify rollback
kubectl rollout status deployment/service-name
```

#### Phase 4: Frontend Migration (Week 9)

**1. Update verto-frontend configuration**

```typescript
// environment.valkey.ts
export const environment = {
  production: false,
  cacheProvider: "valkey",
  apiUrls: {
    // ... existing URLs
  },
};
```

**2. Test Critical Flows**

- [ ] User authentication
- [ ] Onboarding workflows
- [ ] Admin panel operations
- [ ] Payment processing UI
- [ ] Wallet operations
- [ ] Document uploads

**3. Deploy to environments**

- Preview → QA → Beta → Production
- Monitor each environment for 24 hours

#### Phase 5: Decommission Redis (Week 10)

**1. Final Verification Period (3 days)**

- All services running on Valkey
- No errors or anomalies
- Performance meets SLAs
- Stakeholder sign-off

**2. Backup Redis Data**

```bash
# Create final backup
redis-cli --rdb /backup/redis-final-backup-$(date +%Y%m%d).rdb

# Export configuration
redis-cli CONFIG GET '*' > /backup/redis-config-$(date +%Y%m%d).txt

# Document cluster state
redis-cli INFO > /backup/redis-info-$(date +%Y%m%d).txt
```

**3. Shutdown Redis Clusters**

```bash
# Stop accepting new connections
redis-cli CONFIG SET protected-mode yes

# Wait for existing connections to drain (monitor)
redis-cli CLIENT LIST

# Graceful shutdown
redis-cli SHUTDOWN SAVE

# Archive configuration
tar -czf redis-archive-$(date +%Y%m%d).tar.gz /etc/redis/ /backup/
```

**4. Update Documentation**

- [ ] Architecture diagrams
- [ ] Connection string references
- [ ] Runbooks and playbooks
- [ ] Disaster recovery procedures
- [ ] Team knowledge base
- [ ] External API documentation

**5. Resource Cleanup**

```bash
# Terraform/CloudFormation
terraform destroy -target=aws_elasticache_replication_group.redis

# Or manual cleanup
aws elasticache delete-replication-group --replication-group-id redis-production

# Update DNS
aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch file://remove-redis-dns.json
```

---

## 5. Common Issues and Solutions

### Issue 1: Connection String Confusion

**Problem:** Services still trying to connect to Redis after migration

**Root Cause:** Hardcoded connection strings or incorrect environment variables

**Solution:**

```typescript
// Add validation in redisClient.ts constructor
constructor() {
    this.config = RedisConfig.getConfig();

    if (this.config.isConnected) {
        // Validate we're connecting to the expected server
        const expectedProvider = process.env.CACHE_PROVIDER || 'redis';
        const expectedHost = process.env[`${expectedProvider.toUpperCase()}_HOST`];

        if (expectedHost && this.config.host !== expectedHost) {
            console.warn(`⚠️  Cache host mismatch: connecting to ${this.config.host}, expected ${expectedHost}`);
            console.warn(`   Current provider: ${expectedProvider}`);
        }

        this.instance = new Redis(this.config.port || 6379, this.config.host, {
            reconnectOnError: this.reconnectOnError,
            lazyConnect: false, // Fail fast on connection issues
            showFriendlyErrorStack: true,
            connectionName: `${process.env.SERVICE_NAME || 'unknown'}-${process.pid}`
        });

        // Log successful connection
        this.instance.on('connect', () => {
            console.log(`✅ Connected to cache: ${this.config.host}:${this.config.port}`);
        });
    }
}
```

**Prevention:**

- Use environment-specific configuration
- Add connection validation on startup
- Implement health checks that verify provider type

### Issue 2: Authentication Differences

**Problem:** Authentication failures when switching from Redis password to Valkey ACL

**Root Cause:** Different auth mechanisms between Redis and Valkey

**Solution:**

```typescript
// Update redisClient.ts to support both auth methods
constructor() {
    this.config = RedisConfig.getConfig();

    if (this.config.isConnected) {
        const redisOptions: Redis.RedisOptions = {
            host: this.config.host,
            port: this.config.port,
            reconnectOnError: this.reconnectOnError,
        };

        // Support legacy Redis password auth
        if (process.env.REDIS_PASSWORD) {
            redisOptions.password = process.env.REDIS_PASSWORD;
        }

        // Support Valkey ACL (username + password)
        if (process.env.VALKEY_USERNAME && process.env.VALKEY_PASSWORD) {
            redisOptions.username = process.env.VALKEY_USERNAME;
            redisOptions.password = process.env.VALKEY_PASSWORD;
        }

        // Support generic cache credentials
        if (process.env.CACHE_USERNAME && process.env.CACHE_PASSWORD) {
            redisOptions.username = process.env.CACHE_USERNAME;
            redisOptions.password = process.env.CACHE_PASSWORD;
        }

        this.instance = new Redis(redisOptions);
    }
}
```

### Issue 3: Redlock Timing Issues

**Problem:** Lock acquisition failures during migration due to network latency differences

**Root Cause:** Different network characteristics between Redis and Valkey clusters

**Solution:**

```typescript
// Update redisDistributedLockProvider.ts
constructor(private redisClients: Array<Redis>) {
    const migrationMode = process.env.CACHE_MIGRATION_MODE === 'true';
    const isValkey = process.env.CACHE_PROVIDER === 'valkey';

    // Adjust Redlock settings during migration
    const retryConfig = {
        standard: { retryCount: 10, retryDelay: 200, retryJitter: 200 },
        migration: { retryCount: 20, retryDelay: 300, retryJitter: 300 },
        valkey: { retryCount: 15, retryDelay: 250, retryJitter: 250 }
    };

    const config = migrationMode
        ? retryConfig.migration
        : (isValkey ? retryConfig.valkey : retryConfig.standard);

    this.redlock = new Redlock(this.redisClients, {
        driftFactor: 0.01,
        retryCount: config.retryCount,
        retryDelay: config.retryDelay,
        retryJitter: config.retryJitter,
        automaticExtensionThreshold: 500,
    });

    this.redlock.on("error", (error) => {
        console.error('redisLock error', {
            provider: process.env.CACHE_PROVIDER,
            host: process.env.VALKEY_HOST || process.env.REDIS_HOST,
            error: error.message
        });
        Log.error('redisLock', error);
    });
}
```

### Issue 4: Lua Script Compatibility

**Problem:** Subtle differences in Lua script execution

**Root Cause:** Minor differences in Lua implementation between Redis and Valkey

**Solution:**

```typescript
// Add debug logging for Lua script execution
// In rateLimiter.ts or custom script execution

protected async executeLuaScript(
    script: string,
    keys: string[],
    args: any[]
): Promise<any> {
    const startTime = Date.now();

    try {
        const redis = this.getRedisInstance();
        const result = await redis.eval(script, keys.length, ...keys, ...args);

        const duration = Date.now() - startTime;

        // Log slow scripts
        if (duration > 100) {
            console.warn(`Slow Lua script execution: ${duration}ms`, {
                provider: process.env.CACHE_PROVIDER,
                keyCount: keys.length,
                argCount: args.length
            });
        }

        return result;
    } catch (error) {
        console.error('Lua script execution failed:', {
            provider: process.env.CACHE_PROVIDER,
            script: script.substring(0, 100) + '...',
            keys,
            args,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}
```

**Testing:**

- Create comprehensive Lua script tests
- Compare results between Redis and Valkey
- Test edge cases (empty arrays, nil values, etc.)

### Issue 5: Memory Management Differences

**Problem:** Different memory eviction behavior causing unexpected cache misses

**Root Cause:** Default eviction policies may differ

**Solution:**

```bash
# Configure Valkey with same policy as Redis
valkey-cli CONFIG SET maxmemory-policy allkeys-lru
valkey-cli CONFIG SET maxmemory 4gb
valkey-cli CONFIG SET maxmemory-samples 5

# Persist configuration
valkey-cli CONFIG REWRITE

# Verify configuration
valkey-cli CONFIG GET maxmemory*
```

**Monitoring:**

```typescript
// Add memory monitoring
export class CacheHealthCheck {
  static async checkMemoryUsage(): Promise<{
    used: number;
    max: number;
    percentage: number;
    evictions: number;
  }> {
    const instance = RedisFactory["getInstance"]()._getInternalInstance();
    const info = await instance.info("memory");

    const usedMemory = parseInt(info.match(/used_memory:(\d+)/)?.[1] || "0");
    const maxMemory = parseInt(info.match(/maxmemory:(\d+)/)?.[1] || "0");
    const evictions = parseInt(info.match(/evicted_keys:(\d+)/)?.[1] || "0");

    return {
      used: usedMemory,
      max: maxMemory,
      percentage: maxMemory > 0 ? (usedMemory / maxMemory) * 100 : 0,
      evictions,
    };
  }
}
```

### Issue 6: Monitoring Metrics Changes

**Problem:** Existing dashboards break because metric names differ

**Root Cause:** CloudWatch/Datadog metrics have different names for Valkey

**Solution:**

```typescript
// Create abstraction layer for metrics
export class CacheMetrics {
  static async getServerInfo(): Promise<{
    version: string;
    memory: number;
    connections: number;
    opsPerSec: number;
    hitRate: number;
  }> {
    const instance = RedisFactory["getInstance"]()._getInternalInstance();
    const info = await instance.info();

    return {
      version: this.parseVersion(info),
      memory: this.parseMemoryUsage(info),
      connections: this.parseConnections(info),
      opsPerSec: this.parseOperationsPerSecond(info),
      hitRate: this.parseHitRate(info),
    };
  }

  private static parseVersion(info: string): string {
    const match = info.match(/redis_version:([^\r\n]+)/);
    return match ? match[1] : "unknown";
  }

  private static parseMemoryUsage(info: string): number {
    const match = info.match(/used_memory:(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  private static parseConnections(info: string): number {
    const match = info.match(/connected_clients:(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  private static parseOperationsPerSecond(info: string): number {
    const match = info.match(/instantaneous_ops_per_sec:(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  private static parseHitRate(info: string): number {
    const hitsMatch = info.match(/keyspace_hits:(\d+)/);
    const missesMatch = info.match(/keyspace_misses:(\d+)/);

    if (!hitsMatch || !missesMatch) return 0;

    const hits = parseInt(hitsMatch[1]);
    const misses = parseInt(missesMatch[1]);
    const total = hits + misses;

    return total > 0 ? (hits / total) * 100 : 0;
  }
}
```

### Issue 7: Connection Pool Exhaustion

**Problem:** Connection pool depletes quickly under load

**Root Cause:** Different default connection pool settings

**Solution:**

```typescript
// Update redisClient.ts with explicit pool configuration
constructor() {
    this.config = RedisConfig.getConfig();

    if (this.config.isConnected) {
        this.instance = new Redis({
            host: this.config.host,
            port: this.config.port,

            // Connection pool settings
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            enableOfflineQueue: true,
            lazyConnect: false,

            // Connection naming for debugging
            connectionName: `${process.env.SERVICE_NAME || 'verto'}-${process.pid}`,

            // Keep-alive settings
            keepAlive: 30000,
            noDelay: true,

            // Reconnection strategy
            reconnectOnError: this.reconnectOnError,
            retryStrategy: (times: number) => {
                if (times > 10) {
                    console.error('Max reconnection attempts reached');
                    return null; // Stop retrying
                }
                const delay = Math.min(times * 50, 2000);
                console.log(`Reconnecting to cache (attempt ${times}), delay: ${delay}ms`);
                return delay;
            },

            // Timeouts
            connectTimeout: 10000,
            commandTimeout: 5000,
        });

        // Monitor connection pool
        this.instance.on('connect', () => {
            console.log(`✅ Cache connection established`);
        });

        this.instance.on('error', (error) => {
            console.error('Cache connection error:', error.message);
        });

        this.internalLockProvider = new RedisDistributedLockProvider([this.instance]);
    }
}
```

### Issue 8: Replication Lag

**Problem:** Read replicas showing stale data

**Root Cause:** Replication lag between primary and replicas

**Solution:**

```typescript
// Add replication health check
export class CacheHealthCheck {
  static async checkReplicationHealth(): Promise<{
    healthy: boolean;
    role: "master" | "slave";
    lag: number;
    connectedSlaves: number;
  }> {
    const instance = RedisFactory["getInstance"]()._getInternalInstance();
    const info = await instance.info("replication");

    const roleMatch = info.match(/role:([^\r\n]+)/);
    const role = roleMatch ? (roleMatch[1] as "master" | "slave") : "master";

    let lag = 0;
    if (role === "slave") {
      const lagMatch = info.match(/master_last_io_seconds_ago:(\d+)/);
      lag = lagMatch ? parseInt(lagMatch[1]) * 1000 : 0; // Convert to ms
    }

    const slavesMatch = info.match(/connected_slaves:(\d+)/);
    const connectedSlaves = slavesMatch ? parseInt(slavesMatch[1]) : 0;

    return {
      healthy: lag < 1000, // Less than 1 second lag
      role,
      lag,
      connectedSlaves,
    };
  }
}
```

### Issue 9: Persistence Configuration

**Problem:** Data loss after Valkey restart

**Root Cause:** Persistence not configured properly

**Solution:**

```bash
# Configure persistence (same as Redis)
valkey-cli CONFIG SET save "900 1 300 10 60 10000"
valkey-cli CONFIG SET appendonly yes
valkey-cli CONFIG SET appendfsync everysec
valkey-cli CONFIG SET auto-aof-rewrite-percentage 100
valkey-cli CONFIG SET auto-aof-rewrite-min-size 64mb

# Persist configuration
valkey-cli CONFIG REWRITE

# Verify persistence settings
valkey-cli CONFIG GET save
valkey-cli CONFIG GET append*
```

**Monitoring:**

```bash
# Check last save time
valkey-cli LASTSAVE

# Check AOF status
valkey-cli INFO persistence

# Manual save (if needed)
valkey-cli BGSAVE
```

### Issue 10: Client Library Version Conflicts

**Problem:** ioredis version incompatibility with Valkey

**Root Cause:** Older ioredis versions may not fully support Valkey

**Solution:**

```json
// package.json
{
  "dependencies": {
    "ioredis": "^5.4.1", // Latest version with full Valkey support
    "redlock": "^5.0.0-beta.2"
  }
}
```

**Verify compatibility:**

```bash
npm update ioredis
npm audit
npm test
```

---

## 6. POC Implementation Guide

### Quick Start Commands

**PowerShell commands for Windows:**

```powershell
# 1. Clone and setup
cd c:\Users\himanshutariyal\Javascript\office\verto-redis
git checkout -b poc/valkey-migration

# 2. Start Valkey and Redis
docker-compose -f docker-compose.valkey-poc.yml up -d

# 3. Verify containers are running
docker ps

# 4. Install dependencies
npm install

# 5. Run tests against Valkey
$env:CACHE_PROVIDER="valkey"
$env:VALKEY_CONNECTED="true"
$env:VALKEY_HOST="localhost"
$env:VALKEY_PORT="6380"

npm test

# 6. Run tests against Redis (baseline)
$env:CACHE_PROVIDER="redis"
$env:REDIS_CONNECTED="true"
$env:REDIS_HOST="localhost"
$env:REDIS_PORT="6379"

npm test

# 7. Run performance benchmarks
npm test -- test/valkey/performance-benchmark.tests.ts

# 8. Run stress tests
npm test -- test/valkey/stress-test.tests.ts

# 9. Compare results
Write-Host "`n=== POC Results ==="
Write-Host "Review the test output above to compare Redis vs Valkey performance"

# 10. Cleanup
docker-compose -f docker-compose.valkey-poc.yml down
```

### Files to Create

1. **`src/valkeyConfig.ts`** - Valkey-specific configuration
2. **`docker-compose.valkey-poc.yml`** - Docker setup for POC
3. **`test/valkey/valkey-compatibility.tests.ts`** - Compatibility tests
4. **`test/valkey/performance-benchmark.tests.ts`** - Performance benchmarks
5. **`test/valkey/stress-test.tests.ts`** - Stress tests
6. **`.env.valkey`** - Valkey environment variables
7. **`.env.redis`** - Redis baseline environment variables

### Expected POC Results

**Success Criteria:**

- [ ] All tests pass on both Redis and Valkey
- [ ] Performance within ±5% of Redis
- [ ] Zero data corruption or loss
- [ ] Distributed locks work reliably (>99% success)
- [ ] Rate limiting accuracy within 1%
- [ ] Connection stability under load

**Red Flags:**

- ❌ Test failures on Valkey
- ❌ Performance degradation >10%
- ❌ Lock acquisition failures
- ❌ Data inconsistencies
- ❌ Memory leaks or excessive memory usage

---

## 7. Success Criteria

### POC Phase

| Metric               | Target | Measurement                          |
| -------------------- | ------ | ------------------------------------ |
| Test Pass Rate       | 100%   | All existing tests pass on Valkey    |
| Performance Variance | ±5%    | Benchmark tests show <5% difference  |
| Data Integrity       | 100%   | Zero data corruption incidents       |
| Lock Success Rate    | >99%   | Distributed lock acquisition success |
| Rate Limit Accuracy  | ±1%    | Rate limiter behaves identically     |
| Connection Stability | >99.9% | Uptime during stress tests           |

### Migration Phase

| Metric               | Target        | Measurement                     |
| -------------------- | ------------- | ------------------------------- |
| Downtime             | 0 seconds     | Zero-downtime migration         |
| Error Rate           | <0.01%        | Application error rate increase |
| P95 Latency          | <10% increase | Cache operation latency         |
| Data Loss            | 0 incidents   | No data loss events             |
| Rollback Time        | <5 minutes    | Time to rollback if needed      |
| Service Availability | >99.99%       | Service uptime during migration |

### Post-Migration Phase

| Metric          | Target                    | Measurement Period   |
| --------------- | ------------------------- | -------------------- |
| Stability       | 0 cache-related incidents | 30 days              |
| Performance     | Within SLA                | 30 days              |
| Cost            | Within budget             | Monthly              |
| Team Confidence | >80%                      | Survey after 30 days |

---

## 8. Timeline and Resources

### Overall Timeline: 12-14 Weeks

| Phase                    | Duration  | Team Size     | Key Activities                          |
| ------------------------ | --------- | ------------- | --------------------------------------- |
| **POC - Local**          | 1-2 weeks | 1-2 engineers | Docker setup, testing, benchmarks       |
| **POC - Integration**    | 2 weeks   | 2-3 engineers | One service integration, monitoring     |
| **Planning & Approval**  | 1 week    | Full team     | Stakeholder review, resource allocation |
| **Infrastructure**       | 1 week    | DevOps team   | Provision Valkey clusters               |
| **Low-Risk Services**    | 2 weeks   | 2-3 engineers | Migrate 3-4 services                    |
| **Medium-Risk Services** | 2 weeks   | 3-4 engineers | Migrate 5-6 services                    |
| **High-Risk Services**   | 2 weeks   | Full team     | Migrate critical services               |
| **Frontend**             | 1 week    | Frontend team | Migrate frontend apps                   |
| **Validation**           | 1 week    | Full team     | Soak period, final checks               |
| **Decommission**         | 1 week    | DevOps team   | Shutdown Redis                          |

### Resource Requirements

**Engineering Team:**

- 1 Lead Engineer (full-time, 12 weeks)
- 2-3 Backend Engineers (full-time, 8 weeks)
- 1 DevOps Engineer (full-time, 12 weeks)
- 1 Frontend Engineer (part-time, 2 weeks)
- 1 QA Engineer (part-time, 6 weeks)

**Infrastructure:**

- Valkey clusters (same size as current Redis)
- Monitoring tools (CloudWatch, Datadog, etc.)
- CI/CD pipeline updates

**Budget Considerations:**

- Infrastructure costs (parallel running)
- Engineering time
- Monitoring and tooling
- Training and documentation

---

## 9. Risk Matrix

| Risk                                     | Probability | Impact   | Severity    | Mitigation Strategy                                            |
| ---------------------------------------- | ----------- | -------- | ----------- | -------------------------------------------------------------- |
| **Connection failures during migration** | Low         | High     | 🔴 Critical | Feature flags for instant rollback                             |
| **Performance degradation**              | Low         | Medium   | 🟡 Medium   | Pre-migration benchmarking, gradual rollout                    |
| **Data loss during switch**              | Very Low    | Critical | 🔴 Critical | Cold migration (ephemeral cache), dual-write for critical data |
| **Lock contention issues**               | Medium      | Medium   | 🟡 Medium   | Increased retry logic during migration                         |
| **Team knowledge gap**                   | Medium      | Low      | 🟢 Low      | Training sessions, comprehensive documentation                 |
| **Monitoring blind spots**               | Medium      | High     | 🟠 High     | Update dashboards before migration                             |
| **Rollback complications**               | Low         | High     | 🔴 Critical | Test rollback procedures in POC                                |
| **Third-party library incompatibility**  | Very Low    | High     | 🔴 Critical | Verify ioredis and redlock versions                            |
| **Replication lag issues**               | Low         | Medium   | 🟡 Medium   | Monitor replication health continuously                        |
| **Budget overrun**                       | Medium      | Medium   | 🟡 Medium   | Detailed cost analysis upfront                                 |

### Risk Mitigation Plan

**Pre-Migration:**

- [ ] Comprehensive POC with all edge cases
- [ ] Performance baseline established
- [ ] Rollback procedures documented and tested
- [ ] Team training completed

**During Migration:**

- [ ] Gradual traffic shift (5% → 100%)
- [ ] Real-time monitoring dashboards
- [ ] On-call team available 24/7
- [ ] Communication plan with stakeholders

**Post-Migration:**

- [ ] 30-day observation period
- [ ] Keep Redis backups for 90 days
- [ ] Document lessons learned
- [ ] Update runbooks and procedures

---

## 10. Communication Plan

### Stakeholders

| Stakeholder            | Role                   | Communication Frequency | Method                     |
| ---------------------- | ---------------------- | ----------------------- | -------------------------- |
| **Engineering Team**   | Executors              | Daily during migration  | Slack, standup meetings    |
| **DevOps Team**        | Infrastructure         | Daily                   | Slack, incident management |
| **Product Managers**   | Business impact        | Weekly                  | Email updates, meetings    |
| **CTO/VP Engineering** | Executive sponsor      | Weekly                  | Status reports             |
| **Customer Support**   | External communication | As needed               | Email, documentation       |

### Communication Templates

**Weekly Status Update:**

```
Subject: Valkey Migration - Week X Update

Status: [On Track / At Risk / Delayed]

This Week:
- Completed: [list]
- In Progress: [list]
- Blocked: [list]

Next Week:
- Planned: [list]

Metrics:
- Services migrated: X/Y
- Performance: [summary]
- Issues: [count and severity]

Risks:
- [Any new risks identified]

Ask:
- [Any help needed from stakeholders]
```

**Migration Alert Template:**

```
Subject: [SCHEDULED] Valkey Migration - [Service Name]

Migration Window: [Date/Time]
Expected Duration: [X hours]
Risk Level: [Low/Medium/High]

What's Changing:
- [Service name] will switch from Redis to Valkey

Expected Impact:
- [None/Temporary cache misses/etc.]

Rollback Plan:
- [Summary of rollback procedure]

Contact:
- Primary: [Engineer name]
- Backup: [Engineer name]
```

---

## 11. Rollback Procedures

### Immediate Rollback (< 5 minutes)

**Scenario:** Critical issue detected during migration

**Steps:**

```bash
# 1. Set traffic back to Redis
kubectl set env deployment/[service-name] CACHE_PROVIDER=redis
kubectl set env deployment/[service-name] VALKEY_TRAFFIC_PERCENT=0

# 2. Force pod restart for immediate effect
kubectl rollout restart deployment/[service-name]

# 3. Verify rollback
kubectl rollout status deployment/[service-name]

# 4. Check application health
curl https://[service-url]/health

# 5. Notify team
echo "ROLLBACK EXECUTED: [service-name] at $(date)" | slack-cli send
```

### Partial Rollback (specific service)

**Scenario:** One service experiencing issues, others stable

**Steps:**

1. Identify problematic service
2. Execute immediate rollback for that service only
3. Continue monitoring other services
4. Investigate root cause
5. Retry migration after fix

### Full Rollback (all services)

**Scenario:** Systemic issue affecting multiple services

**Steps:**

```bash
# Script: rollback-all-services.sh
#!/bin/bash

SERVICES=(
  "verto-payment-service"
  "verto-wallet-service"
  "verto-company-service"
  # ... add all services
)

for service in "${SERVICES[@]}"; do
  echo "Rolling back $service..."
  kubectl set env deployment/$service CACHE_PROVIDER=redis
  kubectl set env deployment/$service VALKEY_TRAFFIC_PERCENT=0
  kubectl rollout restart deployment/$service
done

echo "All services rolled back to Redis"
```

---

## 12. Post-Migration Tasks

### Immediate (Day 1-7)

- [ ] Monitor all services for anomalies
- [ ] Verify performance meets SLAs
- [ ] Check for memory leaks
- [ ] Validate lock behavior
- [ ] Review error logs

### Short-term (Week 2-4)

- [ ] Conduct retrospective meeting
- [ ] Document lessons learned
- [ ] Update runbooks
- [ ] Archive Redis backups
- [ ] Optimize Valkey configuration

### Long-term (Month 2-3)

- [ ] Decommission Redis infrastructure
- [ ] Update all documentation
- [ ] Train support team
- [ ] Review cost savings
- [ ] Plan for next infrastructure upgrade

---

## 13. Contacts and Resources

### Team Contacts

| Role             | Name       | Contact       | Availability          |
| ---------------- | ---------- | ------------- | --------------------- |
| Migration Lead   | [TBD]      | [email/slack] | 24/7 during migration |
| DevOps Lead      | [TBD]      | [email/slack] | 24/7 during migration |
| Backend Lead     | [TBD]      | [email/slack] | Business hours        |
| On-Call Engineer | [Rotation] | [pagerduty]   | 24/7                  |

### Useful Links

- **Valkey Documentation:** https://valkey.io/docs/
- **Valkey GitHub:** https://github.com/valkey-io/valkey
- **IORedis Documentation:** https://github.com/redis/ioredis
- **Redlock Algorithm:** https://redis.io/docs/manual/patterns/distributed-locks/
- **Internal Runbooks:** [Link to your runbooks]
- **Monitoring Dashboards:** [Link to dashboards]

### Emergency Procedures

**Critical Issue Hotline:**

1. Slack: #cache-migration-emergency
2. PagerDuty: [escalation policy]
3. Phone: [on-call number]

**Escalation Path:**

1. Migration Lead → DevOps Lead → VP Engineering → CTO

---

## 14. Appendix

### A. Docker Compose Full Example

See `docker-compose.valkey-poc.yml` (created separately)

### B. Performance Baseline Template

```markdown
## Redis Performance Baseline

**Date:** [Date]
**Environment:** [Production/Staging]
**Redis Version:** [Version]

### Latency Metrics

- P50: [X]ms
- P95: [Y]ms
- P99: [Z]ms

### Throughput

- Ops/sec: [N]
- Read/Write ratio: [X:Y]

### Resource Usage

- CPU: [X]%
- Memory: [Y]GB
- Network: [Z]Mbps

### Lock Performance

- Acquisition success rate: [X]%
- Average lock duration: [Y]ms
- Lock contention rate: [Z]%

### Rate Limiter

- Accuracy: [X]%
- False positive rate: [Y]%
- Latency overhead: [Z]ms
```

### C. Monitoring Checklist

**Pre-Migration:**

- [ ] Baseline metrics captured
- [ ] Dashboards configured for Valkey
- [ ] Alerts configured and tested
- [ ] Log aggregation working
- [ ] Tracing enabled

**During Migration:**

- [ ] Real-time latency monitoring
- [ ] Error rate tracking
- [ ] Connection pool monitoring
- [ ] Memory usage tracking
- [ ] Lock acquisition metrics

**Post-Migration:**

- [ ] Comparative analysis complete
- [ ] Performance within SLA
- [ ] No memory leaks detected
- [ ] Error rates normal
- [ ] Cost analysis updated

---

## 15. Conclusion

This migration plan provides a comprehensive, risk-mitigated approach to transitioning from Redis to Valkey. The key principles are:

1. **Safety First:** Gradual rollout with instant rollback capability
2. **Thorough Testing:** Comprehensive POC before production migration
3. **Monitoring:** Extensive metrics and alerting at every stage
4. **Communication:** Regular updates to all stakeholders
5. **Documentation:** Detailed runbooks and procedures

**Estimated Timeline:** 12-14 weeks
**Risk Level:** Low (due to 100% compatibility)
**Business Impact:** Minimal (zero-downtime approach)
**Cost Impact:** Neutral to positive (long-term savings)

**Recommendation:** Proceed with POC phase to validate compatibility and performance in your specific environment.

---

**Document Version:** 1.0  
**Last Updated:** January 24, 2026  
**Next Review:** After POC completion  
**Owner:** Platform Engineering Team
