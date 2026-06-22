# Verto Redis Version Compatibility Tester

## Overview
Automated testing suite that tests multiple versions of `@verto-fx/verto-redis` against Valkey to ensure compatibility across version upgrades.

## What It Does

1. **Installs** a specific version of `@verto-fx/verto-redis`
2. **Runs** the complete compatibility test suite
3. **Saves** results with version information
4. **Repeats** for all configured versions
5. **Generates** a comprehensive summary report

## Usage

### Test All Configured Versions
```bash
npm run test-versions
```

### Test Specific Versions
```bash
npm run test-versions 5.0.0 4.0.0 3.0.2
```

Or with node directly:
```bash
node dist/test-verto-redis-versions.js 5.0.0 4.0.0 3.0.2
```

### Configure Environment
```bash
# Windows PowerShell
$env:REDIS_HOST="your-redis-host.amazonaws.com"
$env:REDIS_PORT="6379"
$env:ENVIRONMENT="valkey-test"

# Linux/Mac
export REDIS_HOST="your-redis-host.amazonaws.com"
export REDIS_PORT="6379"
export ENVIRONMENT="valkey-test"
```

## Default Versions Tested

Based on the redis-usage-report.json analysis:

- **5.0.0** - Current stable version (used by 92% of repos)
- **5.0.1** - Latest patch
- **4.0.0** - Previous major version
- **3.0.2** - Legacy exact version (mongo-distributed-numericals)
- **1.5.0** - Legacy version (verto-socket-service)

## Results

### Individual Test Results
Location: `./comp-results/valkey-compatibility-{timestamp}.json`

Each version test generates a separate result file with:
```json
{
  "timestamp": "2026-01-29T...",
  "vertoRedisVersion": "5.0.0",
  "host": "master.valkey-poc-non-prod...",
  "port": "6379",
  "environment": "valkey-version-test",
  "summary": {
    "total": 28,
    "passed": 28,
    "failed": 0
  },
  "results": [...]
}
```

### Version Test Summary
Location: `./comp-results/version-tests/version-test-summary-{timestamp}.json`

Aggregated results across all version tests:
```json
{
  "timestamp": "2026-01-29T...",
  "totalVersions": 5,
  "completedTests": 5,
  "failedTests": 0,
  "results": [
    {
      "version": "5.0.0",
      "description": "Current stable version",
      "status": "completed",
      "duration": 45230,
      "timestamp": "2026-01-29T..."
    }
  ]
}
```

## How It Works

1. **Version Installation**
   - Uninstalls current `@verto-fx/verto-redis`
   - Installs exact version specified
   - Verifies installation

2. **Test Execution**
   - Sets `VERTO_REDIS_VERSION` environment variable
   - Runs `npm run start-comp`
   - Captures stdout/stderr

3. **Result Collection**
   - Modified compatibility test includes version in output
   - Results saved with version metadata
   - Summary report aggregates all version tests

## Modified Files

### `src/valkey-compatibility-test.ts`
- Added `vertoRedisVersion` property
- Reads version from env var or package.json
- Includes version in exported JSON results
- Displays version in console output

### `src/test-verto-redis-versions.ts` (NEW)
- Main version testing orchestrator
- Handles npm install/uninstall
- Runs tests sequentially for each version
- Generates summary reports

### `package.json`
- Added `test-versions` script

## Migration Strategy

Use this tool to validate migration path:

1. **Test Current Version** (5.0.0)
   ```bash
   npm run test-versions 5.0.0
   ```

2. **Test Target Versions**
   ```bash
   npm run test-versions 5.0.1 6.0.0
   ```

3. **Compare Results**
   - Review individual test files
   - Check version-test-summary
   - Identify breaking changes

4. **Plan Upgrades**
   - Legacy versions (1.5.0, 3.0.2) → 5.0.0
   - All 5.0.0 services → Latest stable

## Example Output

```
================================================================================
🔬 Verto Redis Version Compatibility Test Suite
================================================================================

Target: master.valkey-poc-non-prod.pcfhkv.euc1.cache.amazonaws.com:6379
Environment: valkey-version-test
Testing 5 versions

--------------------------------------------------------------------------------
Testing Version: 5.0.0 - Current stable version
--------------------------------------------------------------------------------

📦 Installing @verto-fx/verto-redis@5.0.0...
✅ Installed @verto-fx/verto-redis@5.0.0
Verified installed version: 5.0.0

🧪 Running compatibility tests for version 5.0.0...

=== Valkey Migration Test Suite ===

@verto-fx/verto-redis version: 5.0.0

--- 1. Basic Cache Operations ---
  ✓ Basic Cache Operations - setValue() and getValue() operation (201ms)
  ✓ Basic Cache Operations - Key expiration (TTL) (5004ms)
  ...

=== Test Summary ===
Total Tests: 28
Passed: 28 ✓
Failed: 0 ✗

✅ Version 5.0.0 testing completed in 45230ms

--------------------------------------------------------------------------------
Testing Version: 4.0.0 - Previous major
--------------------------------------------------------------------------------
...

================================================================================
📊 Version Testing Summary
================================================================================

Total Versions Tested: 5
Successfully Completed: 5 ✅
Failed: 0 ❌

Version Results:
  ✅ v5.0.0 - Current stable version (45230ms)
  ✅ v5.0.1 - Latest patch (44890ms)
  ✅ v4.0.0 - Previous major (46120ms)
  ❌ v3.0.2 - Legacy exact version (12340ms)
     Error: Failed to install version 3.0.2: npm ERR! 404 Not Found
  ❌ v1.5.0 - Legacy version (socket-service) (8920ms)
     Error: Tests failed with exit code 1

================================================================================
⚠️  Some version tests failed. Check logs for details.
================================================================================
```

## Troubleshooting

### Version Not Found
```
Error: Failed to install version X.X.X: npm ERR! 404 Not Found
```
- Version doesn't exist in npm registry
- Remove from test list or check correct version number

### Tests Fail for Specific Version
```
❌ Tests failed for version 5.0.0
```
- Check individual result file for details
- May indicate breaking changes or incompatibility
- Review test output logs

### Installation Issues
```
npm WARN deprecated ...
```
- Normal deprecation warnings are ignored
- Real errors will cause test to skip that version

## Next Steps

1. **Run Initial Test**
   ```bash
   npm run test-versions
   ```

2. **Review Results**
   - Check `./comp-results/version-tests/`
   - Identify compatible versions

3. **Plan Migration**
   - Upgrade legacy services (1.5.0, 3.0.2)
   - Test new versions before production

4. **Document Findings**
   - Share results with team
   - Update migration plan based on test outcomes
