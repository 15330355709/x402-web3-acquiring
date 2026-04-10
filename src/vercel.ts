import express, { Request, Response } from "express";
import path from "path";
import paymentLinksRouter from "./routes/paymentLinks";
import payRouter from "./routes/pay";
import balanceRouter from "./routes/balance";

const app = express();

app.use((req: Request, res: Response, next) => {
  // CSP header to allow eval for ethers.js
  res.setHeader("Content-Security-Policy", "default-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://cdnjs.cloudflare.com https://sepolia.base.org https://x402.org");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Payment-Signature, Accept");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  next();
});

app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

app.use("/api/payment-links", paymentLinksRouter);
app.use("/pay", payRouter);
app.use("/api/balance", balanceRouter);

export default app;
