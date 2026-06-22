import Redis from "ioredis";

const client = new Redis({
  host: "master.valkey-demo-v2.pcfhkv.euc1.cache.amazonaws.com",
  port: 6379,
  tls: {}
});

await client.set("foo", "bar");
const value = await client.get("foo");
console.log("Value:", value);

const pong = await client.ping();
console.log("Ping:", pong);

client.disconnect();