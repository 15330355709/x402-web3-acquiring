import dotenv from "dotenv";
dotenv.config();

export const config = {
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceKey: process.env.SUPABASE_SERVICE_KEY!,
  },
  facilitator: {
    url: process.env.FACILITATOR_URL || "https://x402.org/facilitator",
  },
  custody: {
    walletAddress: process.env.CUSTODY_WALLET_ADDRESS!,
  },
  chain: {
    network: process.env.CHAIN_NETWORK || "eip155:84532", // Base Sepolia testnet
    chainId: parseInt(process.env.CHAIN_ID || "84532", 10),
  },
  usdt: {
    contractAddress:
      process.env.TOKEN_CONTRACT_ADDRESS ||
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
  },
  server: {
    port: parseInt(process.env.PORT || "4021", 10),
    baseUrl: process.env.BASE_URL || "http://localhost:4021",
  },
  payment: {
    expirationHours: 24,
  },
};
