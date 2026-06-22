import axios, { AxiosResponse } from "axios";
import { EnvironmentConfig } from "../config.js";
import { getEnvironment, getEnvironmentConfig } from "../helper.js";
import { v4 as uuidv4 } from "uuid";


// Define types for better type safety
interface ApiEndpoint {
  name: string;
  method: 'get' | 'post';
  url: string;
  data?: any; // Allow any object structure for flexibility
  isAdmin: boolean;
  description: string;
}

interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}


function generateApiEndpoints(baseUrl: string): ApiEndpoint[] {
  return [
    {
      name: "List Payments",
      method: "post",
      url: `${baseUrl}/payments/lists?limit=1&skip=0&include=none`,
      data: {
        state: ["completed"],
        transactionType: ["wallet_to_account", "wallet_to_wallet"],
      },
      isAdmin: false,
      description: "Covers Mongo, business logic, OpenAPI validation, DTOs.",
    },
    {
      name: "List Bulk Payments",
      method: "get",
      url: `${baseUrl}/listBulkPaymentsBP?limit=1&skip=0`,
      isAdmin: false,
      description: "Covers Mongo, Redis, queuing, business logic.",
    },
    {
      name: "Get Bill Payment Document Download Links",
      method: "post",
      url: `${baseUrl}/bill-payments/documents/download-links`,
      data: {
        "documentKey": "26faaba8-50ef-a29d-a3f8-3beb3e004d24-Screenshot 2025-09-30 125520.png"
      },
      isAdmin: false,
      description: "Covers external API, config, DTOs.",
    },
    {
      name: "Create Bulk Payment",
      method: "post",
      url: `${baseUrl}/bulkPayments`,
      isAdmin: false,
      data: {
        sourceWalletId: 16357,
        bulkPayments: [
          {
            beneficiaryReference: "RP-09102025-B1346",
            amount: 100,
            reference: "nothing",
            currency: "GBP",
            amountFrom: 100,
          },
        ],
        purposeId: 12,
      },
      description: "Covers Monolith API, user context, OpenAPI.",
    },
  ];
}

async function callApi(api: ApiEndpoint, config: EnvironmentConfig): Promise<ApiResponse> {
  const headers = {
    Authorization: api.isAdmin ? config.adminToken : config.token,
    "Content-Type": "application/json",    
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-IN,en;q=0.9,de-DE;q=0.8,de;q=0.7,en-GB;q=0.6,en-US;q=0.5",
    "cache-control": "no-cache",
    "content-type": "application/json",
    "pragma": "no-cache",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Chromium\";v=\"140\", \"Not=A?Brand\";v=\"24\", \"Google Chrome\";v=\"140\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "vfx-correlation-id": uuidv4(),
    "x-browser-version": "v4.2025.08.04",
    "x-role-name": "Super Admin",
    "Referer": "https://uat.vertofx.com/",
    "Origin": "https://uat.vertofx.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
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
      api.description
    );
    return { success: true, data: response.data };
  } catch (error: any) {
    if (error.response) {
      console.error(
        `\x1b[31m[ERROR]\x1b[0m ${api.name}:`,
        error.response.status,
        error.response.statusText,
        JSON.stringify(error.response.data, null, 2)
      );
      console.error('Response headers:', error.response.headers);
    } else {
      console.error(`\x1b[31m[ERROR]\x1b[0m ${api.name}:`, error.message);
      console.error('Full error:', error);
    }
    return { success: false, error: error.message };
  }
}

async function runPaymentTests(environment: string): Promise<void> {
  console.log(`Running payment API tests in ${environment} environment`);
    
  const config = getEnvironmentConfig(environment);
  const apis = generateApiEndpoints(config.paymentServiceBaseUrl);
  
  for (const api of apis) {
    await callApi(api, config);
    // Add delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
  }
}

async function main(): Promise<void> {
  const environment = getEnvironment();
  await runPaymentTests(environment);
}

main();



