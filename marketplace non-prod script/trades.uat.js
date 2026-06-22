const { GoogleSpreadsheet } = require("google-spreadsheet");
const creds = require("./key.json"); // Replace with the path to your JSON key file
const { default: axios } = require("axios");

// const CURRENCIES = {
//   USD: 1,
//   NGN: 6,
//   GBP: 4,
//   EUR: 5,
//   KES: 28,
//   TZS: 50,
// };

async function getTrades() {
  // Initialize the sheet - doc ID is the long id in the sheets URL
  const doc = new GoogleSpreadsheet(
    "sheetId"
  );

  // Authenticate with the Google Sheets API
  await doc.useServiceAccountAuth(creds);

  // Load the document properties and worksheets
  await doc.loadInfo();
  console.log(`Title: ${doc.title}`);

  // Get the first sheet
  const sheet = doc.sheetsByIndex[0];
  console.log(`Sheet title: ${sheet.title}`);
  console.log(`Row count: ${sheet.rowCount}`);

  // Read rows
  const rows = await sheet.getRows();

  const tokenResp = await axios.post(
    "https://api-v3-uat.vertofx.com/users/login",
    {
      clientId: "id",
      apiKey: "key",
      mode: "apiKey",
    }
  );

  //   console.log(tokenResp.data);
  const token = tokenResp.data.token;
  var date = new Date();
  date.setHours(date.getHours() + 12);

  for (const row of rows) {
    console.log(row);

    const rate = parseFloat(row["Inverse Rate"]);

    const payload = {
      
      fromCurrency: row["VERTO SELLS Currency"], // E
      toCurrency: row["VERTO BUYS Currency"], // B
      fromAmount: +(row["VERTO SELLS Amount"].replaceAll(",","")), // F
      toAmount: +(row["VERTO BUYS Amount"].replaceAll(",","")), // C
      // fromCurrency: row["VERTO SELLS Currency"], // E
      // toCurrency: row["VERTO BUYS Currency"], // B
      // fromAmount: Number(row["VERTO SELLS Amount"]), // F
      // toAmount: Number(row["VERTO BUYS Amount"]), // C
      rate,
      expiry: 288000,
      tradeType: "new",
    };
    console.log(payload);
    await axios.post("https://api-marketplace-uat.vertofx.com/trades", payload, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    // process.exit(0);
  }
}

getTrades();

