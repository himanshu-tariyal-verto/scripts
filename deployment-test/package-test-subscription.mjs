import axios from "axios";
import fs from "fs";
import path from "path";
import { Config } from "./config.mjs";

// Load runtime dependencies for info
const packageJsonPath = path.resolve(process.cwd(), "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const dependencies = packageJson.dependencies
  ? Object.keys(packageJson.dependencies)
  : [];
console.log(`Total runtime packages used: ${dependencies.length}`);
console.log("Packages:", dependencies);

// API base domain and auth
const domain = "https://api-subscriptions-preview.vertofx.dev";
const companyId = "4981";


const headers = {
  Authorization: Config.token,
  "Content-Type": "application/json",
};


const apis = [
  {
    name: "List Plans",
    method: "get",
    url: `${domain}/plans`,
    data: null,
    simple: true,
    packages: [
      "@codegenie/serverless-express",
      "express",
      "aws-xray-sdk",
      "@verto-fx/verto-openapi-validation",
      "@verto-fx/verto-utilities",
      "@verto-fx/verto-logging",
      "@verto-fx/verto-redis",
      "@verto-fx/mongo-adapter"
    ]
  },
  {
    name: "List Plan by id",
    method: "get",
    url: `${domain}/plans/66f684bbe75c9ccdbecc8cc1`,
    data: null,
    simple: true,
    packages: [
      "@verto-fx/verto-redis",
      "@verto-fx/mongo-adapter"
    ]
  },
  {
    name: "Get Subscriptions",
    method: "get",
    url: `${domain}/subscriptions`,
    data: null,
    simple: true,
    packages: [
      "axios",
      "@verto-fx/verto-bot-admin",
      "@verto-fx/verto-cached-utilities"
    ]
  },
  {
    name: "Get Allowances",
    method: "get",
    url: `${domain}/subscriptions/68d534256e877c50d94db484/usages/allowances`,
    data: null,
    simple: true,
    packages: []
  },
  {
    name: "Get Subscription Rate Limit",
    method: "get",
    url: `${domain}/subscriptions/${companyId}/ratelimit`,
    data: null,
    simple: true,
    packages: []
  },
  {
    name: "Get Subscription Usages",
    method: "get",
    url: `${domain}/subscriptions/68d534256e877c50d94db484/usages`,
    data: null,
    simple: true,
    packages: []
  },
  {
    name: "CORS Preflight (OPTIONS /plans)",
    method: "options",
    url: `${domain}/plans`,
    data: null,
    simple: true,
    packages: []
  },
  {
    name: "Change Plan",
    method: "post",
    url: `${domain}/subscriptions/4981/changeplan`,
    data: {
      "newPlanId": "68cbc0f033643679c8765327",
      "changeOn": "immediate"
  },
    simple: true,
    packages: [],
    extractResponesProp: ["newSubscription"],
  },
  {
    name: "Move Plan",
    method: "post",
    url: `${domain}/plans/68cbc0f033643679c8765327/move`,
    data: {
      "newPlanId": "68cbc3155ad5daf458c8cd48",
      "changeOn": "immediate"
  },
    simple: true,
    packages: [],
    isAdmin: true
  },
  {
    name: "Subscription Cancel",
    method: "post",
    url: `${domain}/subscriptions/{subscriptionId}/cancel`,
    simple: true,
    packages: []
  },
];

async function CallApi(api, context = {}) {
  try {
    let url = api.url;
    if (api.urlParam && context[api.urlParam]) {
      url = url.replace(`{${api.urlParam}}`, context[api.urlParam]);
    }

    if (url.includes("{subscriptionId}") && context["newSubscription"]) {
        url = url.replace("{subscriptionId}", context["newSubscription"].id);
      }

    // Use admin token if isAdmin is true
    const apiHeaders = {
      ...headers,
      Authorization: api.isAdmin ? adminToken : headers.Authorization
    };

    let response;
    if (api.method === "get" || api.method === "options") {
      response = await axios({ method: api.method, url, headers: apiHeaders });
    } else {
      response = await axios({
        method: api.method,
        url,
        data: api.data,
        headers: apiHeaders,
      });
    }
    console.log(`[SUCCESS] ${api.name}:`, response.status);

    // Save extracted properties if needed
    if (api.extractResponesProp && api.extractResponesProp.length) {
      for (const prop of api.extractResponesProp) {
        if (response.data[prop]) {
          context[prop] = response.data[prop];
        }
      }
    }
    if (api.saveAs && response.data && response.data.id) {
      context[api.saveAs] = response.data.id;
    }
    return { success: true, data: response.data, context };
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
    return { success: false, error: error.message, context };
  }
}


async function main() {
  let context = {};
  // Run simple APIs
  for (const api of apis) {
    if (!api.simple) continue;
    await CallApi(api, context);
  }

  // Run dependent APIs (Create Subscription, Add Usage)
  for (const api of apis) {
    if (api.simple) continue;
    // If dependency, ensure required context is present
    if (api.dependsOn && !context[api.urlParam || "planId"]) {
      console.log(`[SKIP] ${api.name}: missing dependency`);
      continue;
    }
    await CallApi(api, context);
  }
}

main();