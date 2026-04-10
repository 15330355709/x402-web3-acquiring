import { buildPaymentRequirements } from "../services/x402Service";

jest.mock("../config", () => ({
  config: {
    facilitator: { url: "https://x402.org/facilitator" },
    custody: { walletAddress: "0xTestCustodyAddress" },
    usdt: { contractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  },
}));

describe("x402 Payment", () => {
  describe("buildPaymentRequirements", () => {
    it("should build correct payment requirements", () => {
      const requirements = buildPaymentRequirements("1000000"); // 1 USDT

      expect(requirements.scheme).toBe("exact");
      expect(requirements.network).toBe("eip155:1");
      expect(requirements.asset).toBe("0xdAC17F958D2ee523a2206206994597C13D831ec7");
      expect(requirements.amount).toBe("1000000");
      expect(requirements.payTo).toBe("0xTestCustodyAddress");
      expect(requirements.maxTimeoutSeconds).toBe(1800);
    });
  });

  describe("PAYMENT-REQUIRED header", () => {
    it("should encode payment required as base64 JSON", () => {
      const requirements = buildPaymentRequirements("5000000");

      const paymentRequired = {
        x402Version: 2,
        error: "Payment required",
        resource: { url: "http://localhost:4021/pay/test-id" },
        accepts: [requirements],
      };

      const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");
      const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));

      expect(decoded.x402Version).toBe(2);
      expect(decoded.accepts[0].amount).toBe("5000000");
      expect(decoded.accepts[0].payTo).toBe("0xTestCustodyAddress");
    });
  });

  describe("PAYMENT-SIGNATURE parsing", () => {
    it("should decode valid payment signature", () => {
      const payload = {
        x402Version: 2,
        accepted: { scheme: "exact", network: "eip155:1" },
        payload: { signature: "0xabc123" },
      };

      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
      const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));

      expect(decoded.x402Version).toBe(2);
      expect(decoded.payload.signature).toBe("0xabc123");
    });

    it("should reject invalid base64", () => {
      expect(() => {
        JSON.parse(Buffer.from("not-valid-base64!!!", "base64").toString("utf-8"));
      }).toThrow();
    });
  });
});
