import axios from "axios";
import fs from "fs";
import path from "path";
import { Config } from "./config.mjs";

const packageJsonPath = path.resolve(process.cwd(), "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const dependencies = packageJson.dependencies
  ? Object.keys(packageJson.dependencies)
  : [];
console.log(`Total runtime packages used: ${dependencies.length}`);
console.log("Packages:", dependencies);

const domain = "https://api-wallet-preview.vertofx.dev";
const walletId = "16357";
const companyId = "3046";


const apis = [
  {
    name: "Get Wallets Virtual Accounts",
    method: "get",
    url: `${domain}/wallets/virtualAccounts?limit=10&skip=0&isDefault=true`,
    data: null,
    simple: true,
    isAdmin: true,
  },
  // {
  //   name: "Get Wallet-limits",
  //   method: "post",
  //   url: `${domain}/${companyId}/wallets-limit/en?limit=10&skip=0&isDefault=true`,
  //   data: null,
  //   simple: true,
  // },
  {
    name: "Get Wallets",
    method: "get",
    url: `${domain}/${companyId}/wallets?limit=10&skip=0&isDefault=true`,
    data: null,
    simple: true,
  },
  {
    name: "Get Wallet Statements",
    method: "get",
    url: `${domain}/${companyId}/wallets/${walletId}/statement?limit=10&skip=0`,
    data: null,
    simple: true,
  },
  {
    name: "Get Wallet Freeze Statements",
    method: "get",
    url: `${domain}/admin/${companyId}/freeze/${walletId}?limit=10&skip=0`,
    data: null,
    simple: true,
    isAdmin: true
  },
  {
    name: "Get Wallet Virtual accounts",
    method: "get",
    url: `${domain}/admin/companyId/${companyId}/virtual-accounts?limit=10&skip=0`,
    data: null,
    simple: true,
    isAdmin: true
  },
  {
    name: "Get Wallet funding methods",
    method: "get",
    url: `${domain}/${companyId}/wallets/${walletId}/fundingMethods`,
    data: null,
    simple: true,
  },
];

async function CallApi(api) {
  try {
    let response;

    const headers = {
      Authorization: api.isAdmin ? Config.adminToken : Config.token,
      "Content-Type": "application/json",
    };

    if (api.method === "get") {
      response = await axios.get(api.url, { headers });
    } else if (api.method === "post") {
      response = await axios.post(api.url, api.data, { headers });
    } else if (api.method === "put") {
      response = await axios.put(api.url, api.data, { headers });
    }
    console.log(`[SUCCESS] ${api.name}:`, response.status);

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    if (error.response) {
      console.error(
        `[ERROR] ${api.name}:`,
        error.response.status,
        error.response.data
      );
    } else {
      console.error(`[ERROR] ${api.name}:`, error.response);
    }

    return { success: false, error: error.message };
  }
}

async function main() {
  // Run simple apis
  for (const api of apis) {
    if (!api.simple) continue;
    await CallApi(api);
  }

  // Run complex apis with multiple steps
  for (const api of apis) {
    if (api.simple) continue;

    let commonData = {};

    console.log(`\nStarting complex API: ${api.name}`);

    for (const step of api.steps) {
      // Replace placeholders in URL
      let url = step.url;
      if (url.includes("{reference}") && commonData["reference"]) {
        url = url.replace("{reference}", commonData["reference"]);
      }

      // Add additional data properties
      let requestData = { ...step.data };
      if (step.additionalDataProperties) {
        for (const prop of step.additionalDataProperties) {
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

      const response = await CallApi(stepApi);

      if (!response.success) {
        console.log(`Aborting further steps due to failure in: ${step.name}`);
        break;
      }

      // Extract specified properties from response
      if (response?.data && step.extractResponesProp?.length) {
        for (const prop of step.extractResponesProp) {
          if (response.data[prop]) {
            commonData[prop] = response.data[prop];
          }
        }
      }
    }

    console.log(`Completed complex API: ${api.name}\n`);
  }
}

main();
