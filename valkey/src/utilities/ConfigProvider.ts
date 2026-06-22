import { ConfigurationManager, MissingConfigurationError } from '@verto-fx/verto-utilities';
import { ConfigReader } from './ConfigReader';

const ALTERNAME_STAGE_NAMES = {
  beta: 'prod',
  dev: 'staging',
};

export class ConfigProvider {
  public static init() {
    const configProvider = new ConfigReader();
    ConfigurationManager.init(configProvider.getConfig());
  }

}

export interface IPlanConfig {
  OVERAGE_LOCAL_FEES: number;
  OVERAGE_INT_FEES: number;
  OVERAGE_IBAN_FEES: number;
  OVERAGE_FEES_CURR: string;
}
