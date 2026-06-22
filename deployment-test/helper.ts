import { Config, EnvironmentConfig } from "./config";

/**
 * Gets the first command line argument
 * @returns {string} The first argument, or empty string if none provided
 */
function getFirstArgument(): string {
    const args: string[] = process.argv.slice(2);
    return args[0] || '';
}

export function getEnvironment(): string {
  const environment = getFirstArgument() || 'preview';
  
  if (!Config[environment as keyof typeof Config]) {
    console.error(`Invalid environment: ${environment}. Available environments: ${Object.keys(Config).join(', ')}`);
    process.exit(1);
  }
  
  return environment;
}

export function getEnvironmentConfig(environment: string): EnvironmentConfig {
  return Config[environment as keyof typeof Config];
}