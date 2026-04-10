import { createServer } from "http";
import { createApp } from "./app";
import { config } from "./config";

const app = createApp();
const server = createServer(app);

console.log(`Facilitator: ${config.facilitator.url}`);
console.log(`Custody wallet: ${config.custody.walletAddress}`);
console.log(`Base URL: ${config.server.baseUrl}`);

// Vercel serverless handler
export default function handler(req: any, res: any) {
  server.emit("request", req, res);
}
