import axios, { AxiosResponse } from "axios";
import {getEnvironment, getEnvironmentConfig} from "../helper"
import { EnvironmentConfig } from "../config";
 
// Define types for better type safety
interface ApiEndpoint {
  name: string;
  method: 'get' | 'post';
  url: string;
  data: any; // Allow any object structure for flexibility
  isAdmin: boolean;
}

interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}


function generateApiEndpoints(baseUrl: string): ApiEndpoint[] {
  return [
    {
      name: "List Public Currencies",
      method: "get",
      url: `${baseUrl}/p/currencies/list`,   
      data: null,
      isAdmin: false,
    },
    {
      name: "List Public Exchange Rate",
      method: "post",
      url: `${baseUrl}/p/currencies/exchange-rate`,
      data: {
        currencyFrom: {
          label: "GBP",
        },
        currencyTo: {
          label: "USD",
        },
      },
      isAdmin: false,
    },
    {
      name: "List Currencies",
      method: "post",
      url: `${baseUrl}/currencies/list`,   
      data: {},
      isAdmin: false,
    },
    {
      name: "Get Client Currency Limits",
      method: "get",
      url: `${baseUrl}/currencies/client-currency-limits/1`,   
      data: null,
      isAdmin: false,
    },
    {
      name: "Get FX Exchange Rate",
      method: "post",
      url: `${baseUrl}/fx/exchange-rate`,   
      data: {
        "bypassSubscriptionProcessing": false,
        "currencyFrom": {
          "id": 4
        },
        "currencyTo": {
          "id": 1
        }
      },
      isAdmin: false,
    },
    {
      name: "Get Bulk FX Exchange Rate",
      method: "post",
      url: `${baseUrl}/fx/bulk-exchange-rates`,   
      data: [
        {
          currencyFrom: "GBP",
          currencyTo: "USD",
        },
        {
          currencyFrom: "EUR",
          currencyTo: "USD",
        }
      ],
      isAdmin: false,
    },
    {
      name: "List Currency Rates",
      method: "get",
      url: `${baseUrl}/fx/currency-rates?listAll=false&customPageSize=10&page=1`,
      data: null,
      isAdmin: true,
    },
    {
      name: "Add Currency Rates",
      method: "post",
      url: `${baseUrl}/fx/currency-rates`,
      data: {
        currencyFromId: 4,
        currencyToId: 1,
        overriddenRate: 100
      },
      isAdmin: true,
    },
  ];
}

async function callApi(api: ApiEndpoint, config: EnvironmentConfig): Promise<ApiResponse> {
  const headers = {
    Authorization: api.isAdmin ? config.adminToken : config.token,
    "Content-Type": "application/json",
    tenantId: "verto-fx",
  };

  try {
    let response: AxiosResponse;
    if (api.method === "get") {
      response = await axios.get(api.url, { headers });
    } else if (api.method === "post") {
      response = await axios.post(api.url, api.data, { headers });     
    } else {
      throw new Error(`Unsupported HTTP method: ${api.method}`);
    }
    
    console.log(
      `\x1b[32m[SUCCESS]\x1b[0m ${api.name}:`,
      response.status,
      "-",
    );
    return { success: true, data: response.data };
  } catch (error: any) {
    if (error.response) {
      console.error(
        `\x1b[31m[ERROR]\x1b[0m ${api.name}:`,
        error.response.status,
        error.response.data
      );
    } else {
      console.error(`\x1b[31m[ERROR]\x1b[0m ${api.name}:`, error.message);
    }
    return { success: false, error: error.message };
  }
}

async function runCurrencyTests(environment: string): Promise<void> {
  console.log(`Running currency API tests in ${environment} environment`);
  
  const config = getEnvironmentConfig(environment);
  const apis = generateApiEndpoints(config.currencyServiceBaseUrl);
  
  // while(true){ 
    for (const api of apis) {
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for 500 milliseconds
      await callApi(api, config);
    }
  // }
}

async function main(): Promise<void> {
  const environment = getEnvironment();
  await runCurrencyTests(environment);
}

main();