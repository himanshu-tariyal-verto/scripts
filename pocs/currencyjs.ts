import currency from "currency.js";
import data from "./running-position-USD-NGN.json"

interface Data {
    "reference": string,
    "netOpenAmount": number,
    "lastRunningPosition": number,
    "runningPosition": number
}

const main = () => {

    let lastRunningPosition = 0

    const trades = data as any as Data[]
    
    let finalAmount = 0

    trades.map(trade => {
      finalAmount = currency(finalAmount).add(trade.netOpenAmount).value
    })

    console.log(finalAmount)
}

main()

// 5386468915179.182
// 5382224378982.253