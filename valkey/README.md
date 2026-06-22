# GitHub Redis Scanner

## Setup

This script requires GitHub CLI (`gh`) to be installed and authenticated.

### 1. Install GitHub CLI (if not already installed)
- Windows: `winget install GitHub.cli`
- Or download from: https://cli.github.com/

### 2. Authenticate with GitHub
```bash
gh auth login
```

## Usage

### Scan an organization:
```bash
npm start <organization-name>
```

Example:
```bash
npm start verto-fx
```

### Save report to JSON file:
```bash
npm start <organization-name> --save
# or
npm start <organization-name> -s
```

### Using environment variable:
```bash
set GITHUB_ORG=verto-fx
npm start
```

## What it does

1. Fetches all repositories from the specified GitHub organization
2. Downloads package.json from each repository (if available)
3. Analyzes dependencies for Redis-related packages:
   - `redis`
   - `ioredis`
   - `valkey`
   - `@redis/*` packages
   - Any package containing "redis"
4. Identifies which repos use `@verto-fx/verto-redis` vs other Redis packages
5. Generates a detailed report

## Output

The script will show:
- 🚨 Repositories using non-Verto Redis packages (requires attention)
- ✅ Repositories correctly using @verto-fx/verto-redis
- ⚠️ Repositories using both (mixed usage)
- Summary statistics

## Exit Codes

- `0` - Success, all repos using Redis are using @verto-fx/verto-redis
- `1` - Some repos are using non-Verto Redis packages

## Permissions Required

The GitHub token (via `gh` CLI) needs:
- `repo` - Read repository contents
- `read:org` - List organization repositories
