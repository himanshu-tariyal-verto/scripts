import axios from "axios";
import fs from "fs";
import path from "path";

const packageJsonPath = path.resolve(process.cwd(), "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const dependencies = packageJson.dependencies
  ? Object.keys(packageJson.dependencies)
  : [];
console.log(`Total runtime packages used: ${dependencies.length}`);
// console.log("Packages:", dependencies);

const domain = "https://api-ledger-preview.vertofx.dev"; // Updated to ledger service domain
const token =
  "Bearer token";
const adminToken =
  "Bearer adminToken";

// Sample data for testing
const testGroupTxnId = "8111dc7d-9236-4a6d-82e0-3f94a87cd17f";
const testRegister = "wlt";
const testAccountCode = "21403fd8-64e4-4398-8db3-b00a3089a03f";
const testSourceAccountId = "c7890ce0-044e-408f-bf3e-af41a7b227c0";

const apis = [
  {
    name: "Get Entries Status",
    method: "get",
    url: `${domain}/entries?chainCode={chainCode}`,
    data: null,
    simple: false, // Will be processed after post entries to use the chainCode
    isAdmin: false,
  },
  {
    name: "Search Entries",
    method: "get",
    url: `${domain}/entries/search?limit=10&skip=0&register=${testRegister}&accountCode=${testAccountCode}`,
    data: null,
    simple: true,
    isAdmin: false,
  },
  {
    name: "Get Group Entries",
    method: "get",
    url: `${domain}/entries/${testGroupTxnId}`,
    data: null,
    simple: true,
    isAdmin: false,
  },
  {
    name: "Search Account Entries",
    method: "post",
    url: `${domain}/entries/${testRegister}/${testAccountCode}/search`,
    data: {
      limit: 10,
      skip: 0,
      since: "2024-01-01T00:00:00.000Z",
      till: "2024-12-31T23:59:59.999Z"
    },
    simple: true,
    isAdmin: false,
  },
  {
    name: "Get Account Balance",
    method: "get",
    url: `${domain}/entries/${testRegister}/${testAccountCode}/balance?sourceAccountId=${testSourceAccountId}`,
    data: null,
    simple: true,
    isAdmin: false,
  },
  {
    name: "Get Latest Account Entries",
    method: "get",
    url: `${domain}/entries/${testRegister}/${testAccountCode}?sourceAccountId=${testSourceAccountId}`,
    data: null,
    simple: true,
    isAdmin: false,
  },
  // {
  //   name: "Get Metrics",
  //   method: "get",
  //   url: `${domain}/metrics?facets=opAcBalances,walletBalancesByCurrency`,
  //   data: null,
  //   simple: true,
  //   isAdmin: false, // Assuming metrics might be admin-only
  // },
];

async function CallApi(api) {
  const authToken = api.isAdmin ? adminToken : token;
  const headers = {
    Authorization: authToken,
    "Content-Type": "application/json",
    "tenantId": "verto-fx" // Adding tenant header as seen in router middleware
  };

  let url = api.url;
  if (url.includes("{chainCode}") && commonData.chainCode) {
    url = url.replace("{chainCode}", commonData.chainCode);
  }

  try {
    let response;

    if (api.method === "get") {
      response = await axios.get(url, { headers });
    } else if (api.method === "post") {
      response = await axios.post(url, api.data, { headers });
    } else if (api.method === "put") {
      response = await axios.put(url, api.data, { headers });
    } else if (api.method === "delete") {
      response = await axios.delete(url, { headers });
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
      console.error(`[ERROR] ${api.name}:`, error.message);
    }

    return { success: false, error: error.message };
  }
}

let commonData = {};

async function main() {
  // Run simple apis first
  for (const api of apis) {
    if (!api.simple) continue;
    const response = await CallApi(api);

    // Extract specified properties from response
    if (response?.data && api.extractResponesProp?.length) {
      for (const prop of api.extractResponesProp) {
        if (response.data[prop]) {
          commonData[prop] = response.data[prop];
        }
      }
    }
  }

  // Run non-simple APIs that depend on data from previous calls
  for (const api of apis) {
    if (api.simple) continue;

    console.log(`\nRunning dependent API: ${api.name}`);
    const response = await CallApi(api);

    if (!response.success) {
      console.log(`Failed to execute: ${api.name}`);
    }
  }
}

main();