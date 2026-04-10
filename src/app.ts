import express from "express";
import path from "path";
import paymentLinksRouter from "./routes/paymentLinks";
import payRouter from "./routes/pay";
import balanceRouter from "./routes/balance";

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, "../public")));

  app.use("/api/payment-links", paymentLinksRouter);
  app.use("/pay", payRouter);
  app.use("/api/balance", balanceRouter);

  return app;
}
