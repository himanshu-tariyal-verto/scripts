import axios, { AxiosResponse } from "axios";
import fs from "fs";
import path from "path";
import winston from "winston";
import { v4 as uuidv4 } from "uuid";
import { EnvironmentConfig } from "../config.js";
import { getEnvironment, getEnvironmentConfig } from "../helper.js";

interface SimpleApiEndpoint {
  name: string;
  method: "get" | "post" | "put";
  url: string;
  data: any;
  simple: true;
}

interface StepEndpoint {
  name: string;
  method: "get" | "post" | "put";
  url: string;
  data: any;
  extractResponesProp?: string[];
  additionalDataProperties?: Array<{
    key: string;
    value: string;
    commonKey?: string;
  }>;
}

interface ComplexApiEndpoint {
  name: string;
  simple: false;
  steps: StepEndpoint[];
}

type ApiEndpoint = SimpleApiEndpoint | ComplexApiEndpoint;

interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}


let logger: winston.Logger | null = null;

function createLogger(environment: string): winston.Logger {
  const logsDir = path.join(process.cwd(), "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFilePath = path.join(logsDir, `en-service-${environment}-${timestamp}.log`);

  const loggerInstance = winston.createLogger({
    level: "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
      })
    ),
    transports: [
      new winston.transports.File({ filename: logFilePath })
    ],
  });

  // Write initial log header
  loggerInstance.info(`=== EN Service API Tests - ${environment.toUpperCase()} Environment ===`);
  loggerInstance.info(`Test started at: ${new Date().toISOString()}`);
  loggerInstance.info(`${"=".repeat(60)}`);

  return loggerInstance;
}

function writeToLog(message: string, level: "info" | "error" = "info") {
  if (logger) {
    logger.log({ level, message });
  }
}

function generateApiEndpoints(baseUrl: string): ApiEndpoint[] {
  const companyId = "6197";
  const reference = "EN-30092025-D24857";
  const gbpWalletId = 41352; 
  const usdWalletId = 42221; 
  const jpyWalletId = 53356;
  const targetRate = 50;
  const gbpCurrencyId = 4;
  const usdCurrencyId = 1;
  const jpyCurrencyId = 2;

  return [
    {
      name: "Health check",
      method: "get",
      url: `${baseUrl}/fx/health`,
      data: null,
      simple: true,
    },
    // {
    //   name: "Get Order By Reference",
    //   method: "get",
    //   url: `${baseUrl}/fx/${reference}`,
    //   data: null,
    //   simple: true,
    // {
    //   name: "Get Pending Orders",
    //   method: "get",
    //   url: `${baseUrl}/fx/${companyId}/pending-orders`,
    //   data: null,
    //   simple: true,
    // },
    // {
    //   name: "List Auto Fx Orders",
    //   method: "post",
    //   data: {},
    //   simple: true,
    // },
    // {
    //   name: "Generate Download Link",
    //   method: "post",
    //   url: `${baseUrl}/fx/${reference}/generateDownloadLink`,
    //   data: { documentType: "receipt" },
    //   simple: true,
    // },
    // {
    //   name: "Place Auto Exchange Order",
    //   method: "post",
    //   url: `${baseUrl}/autoFx/create`,
    //   data: {
    //     toCurrency: "GBP",
    //     fromAmount: 100,
    //     toAmount: 190,
    //     rate: 1.8923999999999999,
    //     targetRate,
    //     sourceWallets: [
    //       {
    //         id: jpyWalletId,
    //         type: "standard",
    //         currencyId: jpyCurrencyId,
    //         currencyName: "JPY",
    //       },
    //     ],
    //     targetWallet: {
    //       id: gbpWalletId,
    //       type: "standard",
    //       name: "Default GBP Wallet",
    //       flag: "https://assets.vertofx.com/images/flags/uk.svg",
    //     },
    //     validityType: "valid_for_max_allowed_days",
    //     validUntil: null,
    //   },
    //   simple: true,
    // },
    // {
    //   name: "Place EN Order with Convert within wallet flow",
    //   steps: [
    //     {
    //       method: "post",
    //       url: `${baseUrl}/fx/v2/rate`,
    //       data: {
    //         paymentMode: "immediate",
    //         currencyFrom: {
    //           id: gbpCurrencyId,
    //         },
    //         currencyTo: {
    //           id: usdCurrencyId,
    //         },
    //       },
    //       extractResponesProp: ["vfx_token"],
    //     },
    //     {
    //       name: "Step 2: Place Order api",
    //       method: "post",
    //       url: `${baseUrl}/fx/v2/order`,
    //       data: {
    //         currencyFrom: gbpCurrencyId,
    //         currencyTo: usdCurrencyId,
    //         preselectPayment: null,
    //         description: null,
    //         amountFrom: "100",
    //       },
    //       additionalDataProperties: [
    //         { key: "vfx_token", value: "common-data" },
    //       ],
    //     },
    //     {
    //       name: "Step 3: Convert within wallet api",
    //       method: "post",
    //       url: `${baseUrl}/fx/payments/convertWithinWallets`,
    //       data: {
    //         sources: [
    //           {
    //             walletId: gbpWalletId,
    //             amount: 100,
    //           },
    //         ],
    //         sourceAmount: 100,
    //         customPaymentReference: "S2",
    //         targetWalletId: usdWalletId,
    //         purposeId: 12,
    //         paymentType: "convertWithinWallets",
    //       },
    //       additionalDataProperties: [
    //         { commonKey: "vfx_token", key: "vfxToken", value: "common-data" },
    //         { key: "paymentId", value: "uuid" },
    //       ],
    //       extractResponesProp: ["reference"],
    //     },
    //     {
    //       name: "Step 4: Get Order Details api",
    //       method: "get",
    //       url: `${baseUrl}/fx/{reference}`,
    //       data: null,
    //     },
    //   ],
    // },
  ];
}

async function callApi(
  api: { name: string; method: string; url: string; data: any },
  config: EnvironmentConfig
): Promise<ApiResponse> {
  const headers = {
    Authorization: config.token,
    "Content-Type": "application/json",
  };

  const uniqueApiCallId = uuidv4();

  const startTimestamp = new Date().toISOString();
  writeToLog(`[${uniqueApiCallId}] [START] ${startTimestamp} Calling API: ${api.name} - ${api.method.toUpperCase()} ${api.url}`);

  try {
    let response: AxiosResponse;
    if (api.method === "get") {
      response = await axios.get(api.url, { headers });
    } else if (api.method === "post") {
      response = await axios.post(api.url, api.data, { headers });
    } else if (api.method === "put") {
      response = await axios.put(api.url, api.data, { headers });
    } else {
      throw new Error(`Unsupported HTTP method: ${api.method}`);
    }

    const endTimestamp = new Date().toISOString();
    const successMessage = `[${uniqueApiCallId}] [END] ${endTimestamp} [SUCCESS] ${api.name}: ${response.status}`;
    console.log(`\x1b[32m${successMessage}\x1b[0m`);
    writeToLog(successMessage);
    
    return {
      success: true,
      data: response.data,
    };
  } catch (error: any) {
    if (error.response) {
  const endTimestamp = new Date().toISOString();
  const errorMessage = `[${uniqueApiCallId}] [END] ${endTimestamp} [ERROR] ${api.name}: ${error.response.status} ${JSON.stringify(error.response.data, null, 2)}`;
      console.error(`\x1b[31m[ERROR]\x1b[0m ${api.name}:`, error.response.status, error.response.data);
      
      // Log detailed error information
  writeToLog(errorMessage, "error");
  writeToLog(`[${uniqueApiCallId}] Full error object: ${JSON.stringify(error, null, 2)}`, "error");
    } else {
  const endTimestamp = new Date().toISOString();
  const errorMessage = `[${uniqueApiCallId}] [END] ${endTimestamp} [ERROR] ${api.name}: ${error.message}`;
      console.error(`\x1b[31m[ERROR]\x1b[0m ${api.name}:`, error.message);
      
      // Log error message and full error
  writeToLog(errorMessage, "error");
  writeToLog(`[${uniqueApiCallId}] Full error object: ${JSON.stringify(error, null, 2)}`, "error");
    }
    return { success: false, error: error.message };
  }
}

async function runSimpleApis(
  apis: ApiEndpoint[],
  config: EnvironmentConfig
): Promise<void> {
  while(true){

    for (const api of apis) {
      if (!api.simple) continue;
      await new Promise(resolve => setTimeout(resolve, 100)); 
  callApi(api, config);
    }
  }
}

async function runComplexApis(
  apis: ApiEndpoint[],
  config: EnvironmentConfig
): Promise<void> {
  for (const api of apis) {
    if (api.simple) continue;

    let commonData: Record<string, any> = {};
    console.log(`\nStarting complex API: ${api.name}`);
  writeToLog(`Starting complex API: ${api.name}`);

    for (const step of api.steps) {
      let url = step.url;
      if (url.includes("{reference}") && commonData["reference"]) {
        url = url.replace("{reference}", commonData["reference"]);
      }

      let requestData = { ...step.data };
      if (step.additionalDataProperties) {
        for (const prop of step.additionalDataProperties) {
          if (prop.value === "uuid") {
            requestData[prop.key] = uuidv4();
          }

          if (prop.value === "common-data") {
            requestData[prop.key] = commonData[prop.commonKey || prop.key];
          }
        }
      }

      const stepApi = {
        name: step.name,
        method: step.method,
        url,
        data: requestData,
      };

  const response = await callApi(stepApi, config);

      if (!response.success) {
        const abortMessage = `Aborting further steps due to failure in: ${step.name}`;
        console.log(abortMessage);
  writeToLog(abortMessage, "error");
        break;
      }

      if (response?.data && step.extractResponesProp?.length) {
        for (const prop of step.extractResponesProp) {
          if (response.data[prop]) {
            commonData[prop] = response.data[prop];
          }
        }
      }
    }

    const completedMessage = `Completed complex API: ${api.name}`;
    console.log(completedMessage);
  writeToLog(completedMessage);
  }
}

async function runEnTests(environment: string): Promise<void> {
  console.log(`Running EN API tests in ${environment} environment`);

  const config = getEnvironmentConfig(environment);
  const apis = generateApiEndpoints(config.enServiceBaseUrl);
  logger = createLogger(environment);
  writeToLog(`Running EN API tests in ${environment} environment`);

  await runSimpleApis(apis, config);
  // await runComplexApis(apis, config);
}

async function main(): Promise<void> {
  const environment = getEnvironment();
  await runEnTests(environment);
}

main();
