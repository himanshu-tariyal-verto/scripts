import * as fs from 'fs';

export class ConfigReader {
  static default_config_path = './utilities/env.json';
  static other_config_loc = './src/utilities/env.json';
  static mounted_config_path = '/etc/config/env.json';

  static default_override_config_path = './utilities/override-env.json';
  static other_override_config_loc = './src/utilities/override-env.json';
  static mounted_override_config_path = '/etc/config/override-env.json';

  static default_credentials_config_path = './utilities/bot-admin-api-credentials.json';
  static other_credentials_config_loc = './src/utilities/bot-admin-api-credentials.json';
  static mounted_credentials_config_path = '/etc/config/bot-admin-api-credentials.json';

  static default_pem_path = './utilities/X509-cert-8865610180285014745.pem';
  static other_pem_loc = './src/utilities/X509-cert-8865610180285014745.pem';
  static mounted_pem_path = '/etc/config/X509-cert-8865610180285014745.pem';

  static default_rds_credentials_config_path = './utilities/rds-credentials.json';
  static other_rds_credentials_config_loc = './src/utilities/rds-credentials.json';
  static mounted_rds_credentials_config_path = '/etc/config/rds-credentials.json';

  static default_mongo_credentials_config_path = './utilities/mongo-credentials.json';
  static other_mongo_credentials_config_loc = './src/utilities/mongo-credentials.json';
  static mounted_mongo_credentials_config_path = '/etc/config/mongo-credentials.json';

  static default_redis_credentials_config_path = './utilities/redis-credentials.json';
  static other_redis_credentials_config_loc = './src/utilities/redis-credentials.json';
  static mounted_redis_credentials_config_path = '/etc/config/redis-credentials.json';

  static default_jwt_credentials_config_path = './utilities/jwt-credentials.json';
  static other_jwt_credentials_config_loc = './src/utilities/jwt-credentials.json';
  static mounted_jwt_credentials_config_path = '/etc/config/jwt-credentials.json';

  public static init() {
    // const configProvider = new ConfigReader();
    // ConfigurationManager.init(configProvider.getConfig());
  }

  public getConfig(): JSON {
    const configPath = this.getConfigPath();
    let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    try {
      const overrideConfigPath = this.getOverrideConfigPath();
      const overrideConfig = JSON.parse(fs.readFileSync(overrideConfigPath, 'utf8'));

      config = {
        ...config,
        ...overrideConfig,
      };
    } catch (_) {
      // Ignore missing override config file
    }

    try {
      const rdsCredentialsConfigPath = this.getRDSCredentialsConfigPath();
      const rdsCredentialConfig = JSON.parse(fs.readFileSync(rdsCredentialsConfigPath, 'utf8'));

      config = {
        ...config,
        RDS: rdsCredentialConfig,
      };

      config = this.updateRDSCredentials(config);
    } catch (_) {
      // Ignore missing RDS credentials config file
    }

    try {
      const mongoCredentialsConfigPath = this.getMongoCredentialsConfigPath();
      const mongoCredentialConfig = JSON.parse(fs.readFileSync(mongoCredentialsConfigPath, 'utf8'));

      config = {
        ...config,
        MONGO_DB: mongoCredentialConfig,
      };

      if (config.MONGO_DB.useSSL) {
        const pemPath = this.getPemPath();

        config.MONGO_DB.pathToX509Cert = pemPath;
      }
    } catch (_) {
      // Ignore missing mongo credentials config file
    }

    try {
      const redisCredentialsConfigPath = this.getRedisCredentialsConfigPath();
      const redisCredentialConfig = JSON.parse(fs.readFileSync(redisCredentialsConfigPath, 'utf8'));

      config = {
        ...config,
        ...redisCredentialConfig,
      };
    } catch (_) {
      // Ignore missing Redis credentials config file
    }

    try {
      const jwtCredentialsConfigPath = this.getJwtCredentialsConfigPath();
      const jwtCredentialConfig = JSON.parse(fs.readFileSync(jwtCredentialsConfigPath, 'utf8'));

      config = {
        ...config,
        ...jwtCredentialConfig,
      };
    } catch (_) {
      // Ignore missing JWT credentials config file
    }

    config = this.updateBotAdminAPICredentials(config);
    config = this.updateServiceUrls(config);

    return config;
  }

  private updateBotAdminAPICredentials(config: Record<string, unknown>): Record<string, unknown> {
    try {
      const path = this.getBotAdminAPICredentialsConfigPath();
      const credentialsConfig = JSON.parse(fs.readFileSync(path, 'utf8'));

      config = {
        ...config,
        ...credentialsConfig,
      };
    } catch (error: any) {
      console.log(error)
    }
    return config;
  }

  private updateServiceUrls(config: Record<string, unknown>): Record<string, unknown> {
    try {
      if (process.env.NOTIFICATION_SERVICE_URL) {
        config.serviceUrls = Object.assign({}, config.serviceUrls, {
          notification: process.env.NOTIFICATION_SERVICE_URL,
        });
      }

      if (process.env.USER_API_URL) {
        config.serviceUrls = Object.assign({}, config.serviceUrls, {
          user: process.env.USER_API_URL,
        });
      }

      if (process.env.WALLET_API_URL) {
        config.serviceUrls = Object.assign({}, config.serviceUrls, {
          wallet: process.env.WALLET_API_URL,
        });
      }

      if (process.env.LEDGER_SERVICE_URL) {
        config.serviceUrls = Object.assign({}, config.serviceUrls, {
          ledger: process.env.LEDGER_SERVICE_URL,
        });
      }

      if (process.env.COMPANY_SERVICE_URL) {
        config.serviceUrls = Object.assign({}, config.serviceUrls, {
          company: process.env.COMPANY_SERVICE_URL,
        });
      }

      if (process.env.COMPANY_API_URL) {
        config.serviceUrls = Object.assign({}, config.serviceUrls, {
          companyapi: process.env.COMPANY_API_URL,
        });
      }

      if (process.env.INVOICE_SERVICE_URL) {
        config.serviceUrls = Object.assign({}, config.serviceUrls, {
          invoice: process.env.INVOICE_SERVICE_URL,
        });
      }

      if (process.env.ONBOARDING_API_URL) {
        config.serviceUrls = Object.assign({}, config.serviceUrls, {
          onboarding: process.env.ONBOARDING_API_URL,
        });
      }

      if (process.env.CURRENCY_API_URL) {
        config.serviceUrls = Object.assign({}, config.serviceUrls, {
          currency: process.env.CURRENCY_API_URL,
        });
      }
    } catch (error: any) {
      console.log(error)
    }

    return config;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public updateRDSCredentials(config: any) {
    try {
      if (config.RDS.USERNAME) {
        config.DB_USERNAME = config.RDS.USERNAME;
      }

      if (config.RDS.PASSWORD) {
        config.DB_PASSWORD = config.RDS.PASSWORD;
      }

      if (config.RDS.HOST) {
        config.DB_HOST = config.RDS.HOST;
      }

      if (config.RDS.PORT) {
        config.DB_PORT = config.RDS.PORT;
      }

      if (config.RDS.DATABASE_NAME) {
        config.DB_NAME = config.RDS.DATABASE_NAME;
      }
    } catch (error: any) {
      console.log(error)
    }

    return config;
  }

  public getConfigPath(): string {
    if (fs.existsSync(ConfigReader.mounted_config_path)) {
      return ConfigReader.mounted_config_path;
    }
    if (fs.existsSync(ConfigReader.other_config_loc)) {
      return ConfigReader.other_config_loc;
    }
    return ConfigReader.default_config_path;
  }

  public getOverrideConfigPath(): string {
    if (fs.existsSync(ConfigReader.mounted_override_config_path)) {
      return ConfigReader.mounted_override_config_path;
    }
    if (fs.existsSync(ConfigReader.other_override_config_loc)) {
      return ConfigReader.other_override_config_loc;
    }
    return ConfigReader.default_override_config_path;
  }

  public getBotAdminAPICredentialsConfigPath(): string {
    if (fs.existsSync(ConfigReader.mounted_credentials_config_path)) {
      return ConfigReader.mounted_credentials_config_path;
    }
    if (fs.existsSync(ConfigReader.other_credentials_config_loc)) {
      return ConfigReader.other_credentials_config_loc;
    }
    return ConfigReader.default_credentials_config_path;
  }

  public getPemPath(): string {
    if (fs.existsSync(ConfigReader.mounted_pem_path)) {
      return ConfigReader.mounted_pem_path;
    }
    if (fs.existsSync(ConfigReader.other_pem_loc)) {
      return ConfigReader.other_pem_loc;
    }
    return ConfigReader.default_pem_path;
  }

  public getRDSCredentialsConfigPath(): string {
    if (fs.existsSync(ConfigReader.mounted_rds_credentials_config_path)) {
      return ConfigReader.mounted_rds_credentials_config_path;
    }
    if (fs.existsSync(ConfigReader.other_rds_credentials_config_loc)) {
      return ConfigReader.other_rds_credentials_config_loc;
    }
    return ConfigReader.default_rds_credentials_config_path;
  }

  public getMongoCredentialsConfigPath(): string {
    if (fs.existsSync(ConfigReader.mounted_mongo_credentials_config_path)) {
      return ConfigReader.mounted_mongo_credentials_config_path;
    }
    if (fs.existsSync(ConfigReader.other_mongo_credentials_config_loc)) {
      return ConfigReader.other_mongo_credentials_config_loc;
    }
    return ConfigReader.default_mongo_credentials_config_path;
  }

  public getRedisCredentialsConfigPath(): string {
    if (fs.existsSync(ConfigReader.mounted_redis_credentials_config_path)) {
      return ConfigReader.mounted_redis_credentials_config_path;
    }
    if (fs.existsSync(ConfigReader.other_redis_credentials_config_loc)) {
      return ConfigReader.other_redis_credentials_config_loc;
    }
    return ConfigReader.default_redis_credentials_config_path;
  }

  public getJwtCredentialsConfigPath(): string {
    if (fs.existsSync(ConfigReader.mounted_jwt_credentials_config_path)) {
      return ConfigReader.mounted_jwt_credentials_config_path;
    }
    if (fs.existsSync(ConfigReader.other_jwt_credentials_config_loc)) {
      return ConfigReader.other_jwt_credentials_config_loc;
    }
    return ConfigReader.default_jwt_credentials_config_path;
  }
}
