import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { config } from "../config";

const facilitatorClient = new HTTPFacilitatorClient({
  url: config.facilitator.url,
});

export const resourceServer = new x402ResourceServer(facilitatorClient);

export function buildPaymentRequirements(amount: string) {
  return {
    scheme: "exact",
    network: config.chain.network as `${string}:${string}`,
    asset: config.usdt.contractAddress,
    amount,
    payTo: config.custody.walletAddress,
    maxTimeoutSeconds: 1800,
    extra: {
      assetTransferMethod: "permit2",
    },
  };
}

export { facilitatorClient };
