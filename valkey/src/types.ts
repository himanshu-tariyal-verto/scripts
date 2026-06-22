export interface Repository {
  name: string;
  fullName: string;
  url: string;
  isArchived: boolean;
  defaultBranch: string;
}

export interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface RedisUsage {
  repoName: string;
  repoUrl: string;
  isArchived: boolean;
  hasPackageJson: boolean;
  redisPackages: string[];
  usesVertoRedis: boolean;
  usesNonVertoRedis: boolean;
}

export interface ScanResult {
  totalRepos: number;
  reposWithPackageJson: number;
  reposUsingRedis: number;
  reposUsingVertoRedis: number;
  reposUsingNonVertoRedis: number;
  details: RedisUsage[];
}
