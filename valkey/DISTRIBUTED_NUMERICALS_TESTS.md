# Distributed Numericals Valkey Compatibility Tests

## Overview

Comprehensive test suite for verifying that all three distributed numericals packages work correctly with Valkey:

- `@verto-fx/mongo-distributed-numericals`
- `@verto-fx/mysql-distributed-numericals`
- `@verto-fx/verto-distributed-numericals`

These packages use Redis internally for atomic counter operations, so Valkey compatibility is critical.

## Why These Tests Matter

### Business Impact
Distributed numericals are used for:
- **Invoice numbering** - Sequential, unique invoice IDs
- **Payment references** - Transaction reference generation
- **Order numbers** - E-commerce order tracking
- **Sequence management** - Any monotonically increasing ID system

### Redis Dependency
All three packages rely on Redis INCR commands and Lua scripts for:
- Atomic increment operations
- Lock-free concurrent number generation
- Sequence state persistence
- Race condition prevention

## Test Coverage

### 1. Mongo Distributed Numericals Tests
- **Basic number generation** - Sequential increment validation
- **Multiple sequences independence** - Isolated sequence counters
- **Custom start value** - Initialize with specific number
- **Sequence reset** - Reset counter to start or custom value
- **Parallel requests** - 10 concurrent generations (collision detection)
- **High concurrency** - 50 parallel requests

### 2. MySQL Distributed Numericals Tests
- Same test coverage as Mongo package
- Validates MySQL-specific implementation
- Tests adapter pattern compatibility

### 3. Verto Distributed Numericals Tests
- Same test coverage as other packages
- Generic distributed numericals implementation
- Common interface validation

### 4. Concurrent Number Generation
- **10 parallel requests** - Basic concurrency test
- **50 parallel requests** - High-load simulation
- **Mixed sequences** - Multiple sequences under load
- **Uniqueness validation** - Zero collision tolerance

### 5. Sequence Reset & Management
- **Multiple sequence resets** - Batch reset operations
- **Custom restart values** - Reset to specific number
- **Sequence isolation** - Operations don't affect other sequences

## Usage

### Run Standalone Tests
```bash
npm run test-numericals
```

### Run as Part of Full Suite
The distributed numericals tests are now integrated into the main compatibility test:
```bash
npm run start-comp
```

### With Custom Environment
```bash
# Windows PowerShell
$env:REDIS_HOST="master.valkey-poc-non-prod.pcfhkv.euc1.cache.amazonaws.com"
$env:REDIS_PORT="6379"
npm run test-numericals

# Linux/Mac
export REDIS_HOST="master.valkey-poc-non-prod.pcfhkv.euc1.cache.amazonaws.com"
export REDIS_PORT="6379"
npm run test-numericals
```

## Test Results

### Result Files
Location: `./comp-results/numericals-valkey-{timestamp}.json`

Example output:
```json
{
  "timestamp": "2026-01-29T...",
  "packageVersions": {
    "vertoRedis": "^5.0.0",
    "mongoNumericals": "^4.0.1",
    "mysqlNumericals": "^8.0.1",
    "vertoNumericals": "^8.0.1"
  },
  "host": "master.valkey-poc-non-prod...",
  "port": "6379",
  "summary": {
    "total": 18,
    "passed": 18,
    "failed": 0,
    "byCategory": {
      "Mongo Distributed Numericals": { "passed": 4, "failed": 0 },
      "MySQL Distributed Numericals": { "passed": 4, "failed": 0 },
      "Verto Distributed Numericals": { "passed": 4, "failed": 0 },
      "Concurrent Number Generation": { "passed": 3, "failed": 0 },
      "Sequence Reset & Management": { "passed": 3, "failed": 0 }
    }
  },
  "results": [...]
}
```

### Console Output
```
=== Distributed Numericals Valkey Test Suite ===

Package Versions:
  @verto-fx/verto-redis: ^5.0.0
  @verto-fx/mongo-distributed-numericals: ^4.0.1
  @verto-fx/mysql-distributed-numericals: ^8.0.1
  @verto-fx/verto-distributed-numericals: ^8.0.1

--- 1. Mongo Distributed Numericals ---
  ✓ Mongo Distributed Numericals - Basic number generation (45ms)
  ✓ Mongo Distributed Numericals - Multiple sequences independence (38ms)
  ✓ Mongo Distributed Numericals - Custom start value (22ms)
  ✓ Mongo Distributed Numericals - Sequence reset (29ms)

--- 2. MySQL Distributed Numericals ---
  ✓ MySQL Distributed Numericals - Basic number generation (41ms)
  ...

--- 4. Concurrent Number Generation ---
  ✓ Concurrent Number Generation - Parallel requests (10 concurrent) (156ms)
  ✓ Concurrent Number Generation - High concurrency (50 parallel) (423ms)
  ...

=== Test Summary ===
Total Tests: 18
Passed: 18 ✓
Failed: 0 ✗

Overall Success Rate: 100.00%

✓✓✓ All distributed numericals tests passed! Valkey compatible! ✓✓✓
```

## Integration with Main Test Suite

The distributed numericals tests are now **Category 12** in the main compatibility test suite:

```typescript
{
  name: "12. Distributed Numericals",
  fn: () => this.testDistributedNumericals(),
}
```

This ensures distributed numericals are tested during:
- Full compatibility runs (`npm run start-comp`)
- Version testing (`npm run test-versions`)
- CI/CD validation

## Critical Test Cases

### 🔴 Zero Tolerance Tests
These tests MUST pass - failures indicate data corruption risk:

1. **Uniqueness under concurrency**
   - Test: 50 parallel requests
   - Expected: 50 unique numbers
   - Failure Impact: Duplicate invoice/order numbers

2. **Sequence isolation**
   - Test: Reset seq1, verify seq2 unaffected
   - Failure Impact: Cross-sequence corruption

3. **Sequential increment**
   - Test: Numbers increase by 1
   - Failure Impact: Gaps or overlaps in numbering

### ⚠️ High Priority Tests
Important for data integrity:

4. **Custom start values**
   - Ensures migration/initialization works
   
5. **Sequence reset**
   - Required for counter management

6. **Multiple sequence independence**
   - Different counters don't interfere

## Redis Commands Used

The packages internally use these Redis commands (all Valkey-compatible):

- `INCR` - Atomic increment
- `GET` - Read current value
- `SET` - Initialize sequence
- `DEL` - Reset sequence
- `EVAL` - Lua scripts for atomic operations

## Known Issues & Limitations

### Package Availability
If a package is not installed, tests for that package are skipped with warning:
```
⚠ mongo-distributed-numericals not available, skipping
```

### Version Compatibility
- All packages tested with `verto-redis@^5.0.0`
- Legacy versions (1.5.0, 3.0.2) may have different behavior
- Test with specific versions using version tester

## Migration Checklist

Before migrating to Valkey in production:

- [ ] Run `npm run test-numericals` against Valkey
- [ ] Verify 100% pass rate
- [ ] Test with production-like load (increase concurrency)
- [ ] Validate all three packages if used
- [ ] Check sequence continuity during cutover
- [ ] Monitor for duplicate numbers post-migration
- [ ] Have rollback plan ready

## Troubleshooting

### Test Failures

**Collision Detected**
```
❌ Concurrent Number Generation - High concurrency (50 parallel)
Error: Expected 50 unique numbers, got 48. Collision detected!
```
- **Cause**: Race condition in number generation
- **Action**: DO NOT migrate to Valkey - critical bug
- **Next Steps**: Report issue, investigate locking

**Non-Sequential Numbers**
```
❌ Basic number generation
Error: Numbers not sequential: 101, 103, 104
```
- **Cause**: Missing increment or concurrent interference
- **Action**: Review test logs, check for errors
- **Next Steps**: Verify Redis connection stability

**Sequence Not Reset**
```
❌ Sequence reset
Error: After reset, number 105 not less than before (103)
```
- **Cause**: Reset operation failed
- **Action**: Check Redis DEL/SET commands work
- **Next Steps**: Verify Lua script support

### Package Import Errors
```
Error: Cannot find module '@verto-fx/mongo-distributed-numericals'
```
- **Solution**: Install package: `npm install @verto-fx/mongo-distributed-numericals`
- **Note**: Tests skip unavailable packages automatically

## Performance Benchmarks

Expected performance (based on Redis baseline):

| Operation | Expected Latency | Concurrent (50) |
|-----------|-----------------|-----------------|
| Single getNextNumber | < 10ms | < 500ms total |
| Sequence reset | < 5ms | N/A |
| 10 parallel requests | < 100ms | N/A |

If Valkey shows significantly different performance, investigate before migration.

## Next Steps

1. **Run Initial Test**
   ```bash
   npm run test-numericals
   ```

2. **Review Results**
   - Check `comp-results/numericals-valkey-*.json`
   - Verify 100% pass rate
   - Compare performance to Redis

3. **Load Testing**
   - Increase concurrent requests
   - Simulate production load
   - Monitor for collisions

4. **Integration Testing**
   - Test in staging environment
   - Verify with actual application code
   - Check invoice/order generation

5. **Production Migration**
   - Only proceed if all tests pass
   - Monitor sequence continuity
   - Have Redis fallback ready

## Files

- **[src/distributed-numericals-test.ts](src/distributed-numericals-test.ts)** - Standalone test suite
- **[src/valkey-compatibility-test.ts](src/valkey-compatibility-test.ts)** - Integrated tests (Category 12)
- **[comp-results/](comp-results/)** - Test result files

## Support

For issues or questions:
1. Review test output in `comp-results/`
2. Check console logs for warnings
3. Verify package versions in test output
4. Compare results against Redis baseline
