// // Use this code snippet in your app.
// // If you need more information about configurations or implementing the sample code, visit the AWS docs:
// // https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/getting-started.html

// import {
//   SecretsManagerClient,
//   GetSecretValueCommand,
// } from "@aws-sdk/client-secrets-manager";

// const secret_name = "verto-system-downtime-preview";

// async function main() {
    
//     const client = new SecretsManagerClient({
//     region: "eu-central-1",
//     });

//     let response;

//     try {
//     response = await client.send(
//         new GetSecretValueCommand({
//         SecretId: secret_name,
//         VersionStage: "AWSCURRENT", // VersionStage defaults to AWSCURRENT if unspecified
//         })
//     );

//     console.log(response)
//     } catch (error) {
//     // For a list of exceptions thrown, see
//     // https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
//     throw error;
//     }

//    const secret = response.SecretString;
// }

// main()



import { SQSClient, ListQueuesCommand } from "@aws-sdk/client-sqs";

async function getTop50SQSQueues() {
  // Initialize SQS client
  const client = new SQSClient({ region: "eu-central-1" }); 
  
  const queueUrls: string[] = [];
  let nextToken: string | undefined = undefined;
  
  try {
    // Paginate through results until we have 50 queues
      const command = new ListQueuesCommand({
        NextToken: nextToken,
        MaxResults: 50
      });
      
      const response = await client.send(command);
      
      // Extract queue URLs
      if (response.QueueUrls) {
        queueUrls.push(...response.QueueUrls);
      }
      
    
    // Return only top 50 URLs
    const top50Urls = queueUrls.slice(0, 50);
    
    // Extract queue names from URLs
    const queueNames = top50Urls.map(url => {
      const parts = url.split('/');
      return parts[parts.length - 1];
    });
    
    return {
      urls: top50Urls,
      names: queueNames
    };
    
  } catch (error) {
    console.error("Error fetching SQS queues:", error);
    throw error;
  }
}

// Usage
getTop50SQSQueues()
  .then(result => {
    console.log("Top 50 SQS queues:");
    result.names.forEach((name, index) => {
      console.log(`${index + 1}. ${name}`);
      console.log(`   URL: ${result.urls[index]}`);
    });
  })
  .catch(error => {
    console.error("Failed to retrieve queues:", error);
  });