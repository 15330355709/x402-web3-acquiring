import { config } from "./config";
import { createApp } from "./app";
import { startExpirationJob } from "./services/expirationJob";

const app = createApp();

startExpirationJob();

app.listen(config.server.port, () => {
  console.log(`Server running on port ${config.server.port}`);
  console.log(`Facilitator: ${config.facilitator.url}`);
  console.log(`Custody wallet: ${config.custody.walletAddress}`);
});

export default app;
