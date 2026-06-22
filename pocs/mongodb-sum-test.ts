import currency from "currency.js";
import { MongoClient } from "mongodb";
// import data from "./running-position-USD-NGN.json"

interface Data {
    "reference": string,
    "netOpenAmount": number,
    "lastRunningPosition": number,
    "runningPosition": number
}

const MONGO_URL = "mongodb://localhost:27017";
const DB_NAME = "prodVerto";
// const DB_NAME = "floating_point_test";
const COLLECTION_NAME = "blotterTrades";
// const COLLECTION_NAME = "dmt";

const main = async () => {
    const client = new MongoClient(MONGO_URL);

    try {
        await client.connect();
        console.log("Connected to MongoDB");

        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        // // Check if data already exists
        // const count = await collection.countDocuments();
        
        // if (count === 0) {
        //     console.log("Inserting trades data...");
        //     const trades = data as any as Data[];
        //     await collection.insertMany(trades);
        //     console.log(`Inserted ${trades.length} trades`);
        // } else {
        //     console.log(`Found ${count} existing trades in database`);
        // }

        // Calculate using MongoDB $sum aggregation
        // console.log("\nCalculating with MongoDB $sum...");
        // const mongoResult = await collection.aggregate([
        //     {
        //         $group: {
        //             _id: null,
        //             totalNetOpenAmount: { $sum: "$netOpenAmount" }
        //         }
        //     }
        // ]).toArray();

        // const mongoSum = mongoResult[0]?.totalNetOpenAmount || 0;

        // Calculate using MongoDB aggregation and currency.js for comparison
        console.log("Fetching MongoDB aggregated sums for NGN pairs...");
        
        // Use the same date as the working query
        const DEFAULT_PNL_CALCULATION_START_DATE = new Date('2024-01-01T00:00:00Z'); // Adjust this date as needed
        
        const mongoGroups = await collection.aggregate([
            {
                $match: {
                    createdDate: { $gte: DEFAULT_PNL_CALCULATION_START_DATE },
                    $or: [
                        { 'buy.currency': 'NGN' },
                        { 'sell.currency': 'NGN' }
                    ]
                },
            },
            {
                $group: {
                    _id: {
                        buyCurrency: '$buy.currency',
                        sellCurrency: '$sell.currency',
                    },
                    mongoSumBuyAmount: { $sum: { $ifNull: ['$buy.amount', 0] } },
                    mongoSumSellAmount: { $sum: { $ifNull: ['$sell.amount', 0] } },
                    tradeCount: { $sum: 1 },
                },
            },
        ]).toArray();

        console.log(mongoGroups)

        console.log(`\nFound ${mongoGroups.length} NGN currency pair groups\n`);

        // Process each group and compare MongoDB vs currency.js
        for (const group of mongoGroups) {
            const { buyCurrency, sellCurrency } = group._id;
            const { mongoSumBuyAmount, mongoSumSellAmount, tradeCount } = group;

            // Fetch trades for this group and calculate using currency.js
            console.log(`Processing ${buyCurrency}/${sellCurrency}...`);
            const trades = await collection.find({
                createdDate: { $gte: DEFAULT_PNL_CALCULATION_START_DATE },
                'buy.currency': buyCurrency,
                'sell.currency': sellCurrency,
            }).toArray();

            let currencyJsBuySum = currency(0);
            let currencyJsSellSum = currency(0);

            trades.forEach(trade => {
                if (trade.buy?.amount != null) {
                    currencyJsBuySum = currencyJsBuySum.add(trade.buy.amount);
                }
                if (trade.sell?.amount != null) {
                    currencyJsSellSum = currencyJsSellSum.add(trade.sell.amount);
                }
            });

            const currencyJsBuyValue = currencyJsBuySum.value;
            const currencyJsSellValue = currencyJsSellSum.value;

            console.log(`\n=== ${buyCurrency} / ${sellCurrency} (${tradeCount} trades) ===`);
            console.log(`Buy Amount (${buyCurrency}):`);
            console.log(`  MongoDB $sum:     ${mongoSumBuyAmount}`);
            console.log(`  Currency.js sum:  ${currencyJsBuyValue}`);
            console.log(`  Difference:       ${mongoSumBuyAmount - currencyJsBuyValue}`);
            console.log(`\nSell Amount (${sellCurrency}):`);
            console.log(`  MongoDB $sum:     ${mongoSumSellAmount}`);
            console.log(`  Currency.js sum:  ${currencyJsSellValue}`);
            console.log(`  Difference:       ${mongoSumSellAmount - currencyJsSellValue}`);
            console.log('');
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await client.close();
        console.log("\nMongoDB connection closed");
    }
}


// const main = async () => {
//     const client = new MongoClient(MONGO_URL);

//     try {
//         await client.connect();
//         console.log("Connected to MongoDB");

//         const db = client.db(DB_NAME);
//         const collection = db.collection(COLLECTION_NAME);

//         // // Check if data already exists
//         // const count = await collection.countDocuments();
        
//         // if (count === 0) {
//         //     console.log("Inserting trades data...");
//         //     const trades = data as any as Data[];
//         //     await collection.insertMany(trades);
//         //     console.log(`Inserted ${trades.length} trades`);
//         // } else {
//         //     console.log(`Found ${count} existing trades in database`);
//         // }

//         // Calculate using MongoDB $sum aggregation
//         console.log("\nCalculating with MongoDB $sum...");
//         const mongoResult = await collection.aggregate([
//             {
//                 $group: {
//                     _id: null,
//                     totalNetOpenAmount: { $sum: "$netOpenAmount" }
//                 }
//             }
//         ]).toArray();

//         const mongoSum = mongoResult[0]?.totalNetOpenAmount || 0;

//         // Calculate using currency.js for precision
//         console.log("Calculating with currency.js...");
//         const trades = await collection.find({}).toArray();
//         let currencySum = currency(0);
//         trades.forEach(trade => {
//             currencySum = currencySum.add(trade.netOpenAmount);
//         });
//         const currencySumValue = currencySum.value;

//         // Calculate using plain JavaScript
//         console.log("Calculating with plain JavaScript...");
//         const jsSum = trades.reduce((sum, trade) => sum + trade.netOpenAmount, 0);

//         // Display results
//         console.log("\n=== RESULTS ===");
//         console.log(`MongoDB $sum:        ${mongoSum}`);
//         console.log(`Currency.js sum:     ${currencySumValue}`);
//         console.log(`Plain JS sum:        ${jsSum}`);
//         console.log(`\nDifference (Mongo - Currency.js): ${mongoSum - currencySumValue}`);
//         console.log(`Difference (Mongo - Plain JS):    ${mongoSum - jsSum}`);
//         console.log(`Difference (Currency.js - Plain JS): ${currencySumValue - jsSum}`);

//         // Expected outputs
//         console.log("\n=== EXPECTED VALUES ===");
//         console.log("Expected 1: 5386468915179.182");
//         console.log("Expected 2: 5382224378982.253");

//     } catch (error) {
//         console.error("Error:", error);
//     } finally {
//         await client.close();
//         console.log("\nMongoDB connection closed");
//     }
// }

main();
