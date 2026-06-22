export interface EnvironmentConfig {
    currencyServiceBaseUrl: string;
    enServiceBaseUrl: string;
    subscriptionServiceBaseUrl: string;
    paymentServiceBaseUrl: string;
    ledgerServiceBaseUrl: string;
    walletServiceBaseUrl: string;
    token: string;
    adminToken: string;
}

interface ConfigType {
    preview: EnvironmentConfig;
    uat: EnvironmentConfig;
}

export const Config: ConfigType = {
    preview: {
        currencyServiceBaseUrl: "https://api-currency-preview.vertofx.dev",
        enServiceBaseUrl: "https://api-exchange-now-preview.vertofx.dev",
        subscriptionServiceBaseUrl: "https://api-subscription-preview.vertofx.dev",
        paymentServiceBaseUrl: "https://api-payment-preview.vertofx.dev",
        ledgerServiceBaseUrl: "https://api-ledger-preview.vertofx.dev",
        walletServiceBaseUrl: "https://api-wallet-preview.vertofx.dev",
        token: "Bearer token",
        adminToken: "Bearer adminToken",
    },
    uat: {
        currencyServiceBaseUrl: "https://api-currency-uat.vertofx.com",
        enServiceBaseUrl: "https://api-exchange-now-uat.vertofx.com",
        subscriptionServiceBaseUrl: "https://api-subscription-uat.vertofx.com",
        paymentServiceBaseUrl: "https://api-payment-uat.vertofx.com",
        ledgerServiceBaseUrl: "https://api-ledger-uat.vertofx.com",
        walletServiceBaseUrl: "https://api-wallet-uat.vertofx.com",
        token: "Bearer token",
        adminToken: "Bearer adminToken",
    }
};