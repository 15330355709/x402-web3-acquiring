import request from "supertest";
import express from "express";

// ---- Mock state (in-memory DB) ----
let dbState: {
  payment_links: Record<string, any>;
  merchant_balances: Record<string, any>;
  balance_ledger: any[];
  withdrawals: Record<string, any>;
};

function resetDb() {
  dbState = {
    payment_links: {},
    merchant_balances: {},
    balance_ledger: [],
    withdrawals: {},
  };
}

// ---- Mock Supabase ----
function createQueryBuilder(table: string) {
  let filters: Record<string, any> = {};
  let updateData: any = null;
  let insertData: any = null;

  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn((data: any) => {
      insertData = data;
      const records = dbState[table as keyof typeof dbState];
      if (table === "balance_ledger") {
        const entry = { id: `ledger-${Date.now()}`, ...data };
        (records as any[]).push(entry);
        return { data: entry, error: null, count: null };
      }
      const id = data.id || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const record = { id, ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      (records as Record<string, any>)[id] = record;
      // Return builder for chaining .select().single()
      builder._insertedRecord = record;
      return builder;
    }),
    update: jest.fn((data: any) => {
      updateData = data;
      return builder;
    }),
    upsert: jest.fn((data: any, _opts: any) => {
      const records = dbState[table as keyof typeof dbState] as Record<string, any>;
      const key = data.merchant_id;
      if (!records[key]) {
        records[key] = { ...data };
      }
      return { error: null };
    }),
    eq: jest.fn((field: string, value: any) => {
      filters[field] = value;

      // Apply update if pending
      if (updateData) {
        const records = dbState[table as keyof typeof dbState];
        if (table === "balance_ledger") {
          // Update ledger entries matching filters
          (records as any[]).forEach((entry: any) => {
            const match = Object.entries(filters).every(([k, v]) => entry[k] === v);
            if (match) Object.assign(entry, updateData);
          });
        } else {
          const key = filters.id || filters.merchant_id;
          if (key && (records as Record<string, any>)[key]) {
            Object.assign((records as Record<string, any>)[key], updateData);
          }
        }
      }

      return builder;
    }),
    lt: jest.fn(() => {
      // For expiration queries: find pending links past expiry
      if (table === "payment_links" && updateData) {
        const now = new Date();
        Object.values(dbState.payment_links).forEach((link: any) => {
          if (link.status === "pending" && new Date(link.expires_at) < now) {
            Object.assign(link, updateData);
          }
        });
      }
      return builder;
    }),
    gte: jest.fn(() => builder),
    lte: jest.fn(() => builder),
    order: jest.fn(() => builder),
    range: jest.fn(() => builder),
    single: jest.fn(() => {
      // If we just did an insert, return the inserted record
      if (builder._insertedRecord) {
        const rec = builder._insertedRecord;
        builder._insertedRecord = null;
        return Promise.resolve({ data: rec, error: null });
      }

      const records = dbState[table as keyof typeof dbState];
      const key = filters.id || filters.merchant_id;

      if (table === "balance_ledger") {
        return Promise.resolve({ data: null, error: { code: "PGRST116" } });
      }

      const record = (records as Record<string, any>)[key];
      if (!record) {
        return Promise.resolve({ data: null, error: { code: "PGRST116" } });
      }
      return Promise.resolve({ data: { ...record }, error: null });
    }),
  };

  return builder;
}

jest.mock("../db/supabase", () => ({
  supabase: {
    from: jest.fn((table: string) => createQueryBuilder(table)),
  },
}));

// ---- Mock Facilitator ----
const mockVerify = jest.fn();
const mockSettle = jest.fn();

jest.mock("../services/x402Service", () => ({
  facilitatorClient: {
    verify: mockVerify,
    settle: mockSettle,
  },
  buildPaymentRequirements: jest.fn((amount: string) => ({
    scheme: "exact",
    network: "eip155:1",
    asset: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    amount,
    payTo: "0xTestCustodyWallet",
    maxTimeoutSeconds: 1800,
    extra: {},
  })),
}));

jest.mock("../config", () => ({
  config: {
    server: { port: 4021, baseUrl: "http://localhost:4021" },
    facilitator: { url: "https://x402.org/facilitator" },
    custody: { walletAddress: "0xTestCustodyWallet" },
    usdt: { contractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
    payment: { expirationHours: 24 },
    supabase: { url: "http://localhost", serviceKey: "test" },
  },
}));

// ---- Import app after mocks ----
import { createApp } from "../app";

let app: express.Express;

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  resetDb();
  jest.clearAllMocks();
});

// ==========================================
// 7.4 Integration: Full payment flow
// ==========================================
describe("Full payment flow", () => {
  it("create link → 402 → sign → verify → settle → balance credited", async () => {
    // Step 1: Create payment link
    const createRes = await request(app)
      .post("/api/payment-links")
      .send({ merchant_id: "merchant-1", amount: 100, description: "Test order" });

    expect(createRes.status).toBe(201);
    const linkId = createRes.body.id;
    expect(createRes.body.payment_url).toContain(`/pay/${linkId}`);
    expect(createRes.body.status).toBe("pending");

    // Step 2: Access payment endpoint without signature → 402
    const payRes = await request(app)
      .get(`/pay/${linkId}`)
      .set("Accept", "application/json");

    expect(payRes.status).toBe(402);
    expect(payRes.headers["payment-required"]).toBeDefined();

    const paymentRequired = JSON.parse(
      Buffer.from(payRes.headers["payment-required"], "base64").toString("utf-8")
    );
    expect(paymentRequired.x402Version).toBe(2);
    expect(paymentRequired.accepts).toHaveLength(1);
    expect(paymentRequired.accepts[0].scheme).toBe("exact");
    expect(paymentRequired.accepts[0].amount).toBe("100000000"); // 100 USDT * 1e6

    // Step 3: Submit payment signature → verify → settle → 200
    const paymentPayload = {
      x402Version: 2,
      accepted: paymentRequired.accepts[0],
      payload: { signature: "0xmocksig" },
    };

    mockVerify.mockResolvedValue({ isValid: true, payer: "0xPayer" });
    mockSettle.mockResolvedValue({
      success: true,
      transaction: "0xTxHash123",
      network: "eip155:1",
    });

    const settleRes = await request(app)
      .get(`/pay/${linkId}`)
      .set("Accept", "application/json")
      .set("Payment-Signature", Buffer.from(JSON.stringify(paymentPayload)).toString("base64"));

    expect(settleRes.status).toBe(200);
    expect(settleRes.body.message).toBe("Payment successful");
    expect(settleRes.body.tx_hash).toBe("0xTxHash123");
    expect(settleRes.headers["payment-response"]).toBeDefined();

    const paymentResponse = JSON.parse(
      Buffer.from(settleRes.headers["payment-response"], "base64").toString("utf-8")
    );
    expect(paymentResponse.success).toBe(true);
    expect(paymentResponse.transaction).toBe("0xTxHash123");

    // Verify: facilitator was called correctly
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockSettle).toHaveBeenCalledTimes(1);

    // Verify: payment link status updated to paid
    expect(dbState.payment_links[linkId].status).toBe("paid");
    expect(dbState.payment_links[linkId].tx_hash).toBe("0xTxHash123");

    // Verify: merchant balance credited
    expect(dbState.merchant_balances["merchant-1"]).toBeDefined();

    // Verify: ledger entry created
    expect(dbState.balance_ledger.length).toBeGreaterThanOrEqual(1);
    const creditEntry = dbState.balance_ledger.find(
      (e: any) => e.type === "credit" && e.reference_type === "payment"
    );
    expect(creditEntry).toBeDefined();
    expect(creditEntry.amount).toBe(100);
    expect(creditEntry.tx_hash).toBe("0xTxHash123");
  });

  it("should return payment status after querying", async () => {
    // Create a link
    const createRes = await request(app)
      .post("/api/payment-links")
      .send({ merchant_id: "merchant-1", amount: 50 });

    const linkId = createRes.body.id;

    // Query status
    const statusRes = await request(app).get(`/api/payment-links/${linkId}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe("pending");
    expect(statusRes.body.amount).toBe(50);
  });
});

// ==========================================
// 7.5 Integration: Withdrawal flow
// ==========================================
describe("Withdrawal flow", () => {
  const merchantId = "merchant-withdraw";
  const validAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28";

  beforeEach(() => {
    // Set up merchant with balance
    dbState.merchant_balances[merchantId] = {
      merchant_id: merchantId,
      available_balance: 500,
      updated_at: new Date().toISOString(),
    };
  });

  it("request → review approve → complete", async () => {
    // Step 1: Submit withdrawal
    const withdrawRes = await request(app)
      .post(`/api/balance/${merchantId}/withdraw`)
      .send({ amount: 200, destination_address: validAddress });

    expect(withdrawRes.status).toBe(201);
    expect(withdrawRes.body.status).toBe("pending_review");
    expect(withdrawRes.body.amount).toBe(200);
    const withdrawalId = withdrawRes.body.id;

    // Balance should be deducted
    expect(dbState.merchant_balances[merchantId].available_balance).toBe(300);

    // Step 2: Approve
    const approveRes = await request(app)
      .post(`/api/balance/withdrawals/${withdrawalId}/review`)
      .send({ action: "approve", reviewed_by: "admin-1" });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("approved");

    // Step 3: Complete (after on-chain transfer)
    const completeRes = await request(app)
      .post(`/api/balance/withdrawals/${withdrawalId}/complete`)
      .send({ tx_hash: "0xWithdrawTx456" });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe("completed");
    expect(completeRes.body.tx_hash).toBe("0xWithdrawTx456");
  });

  it("request → review reject → balance refunded", async () => {
    // Submit withdrawal
    const withdrawRes = await request(app)
      .post(`/api/balance/${merchantId}/withdraw`)
      .send({ amount: 100, destination_address: validAddress });

    const withdrawalId = withdrawRes.body.id;
    expect(dbState.merchant_balances[merchantId].available_balance).toBe(400);

    // Reject
    const rejectRes = await request(app)
      .post(`/api/balance/withdrawals/${withdrawalId}/review`)
      .send({ action: "reject", reviewed_by: "admin-1" });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe("rejected");

    // Balance should be refunded
    expect(dbState.merchant_balances[merchantId].available_balance).toBe(500);
  });

  it("should fail withdrawal with insufficient balance", async () => {
    const res = await request(app)
      .post(`/api/balance/${merchantId}/withdraw`)
      .send({ amount: 999, destination_address: validAddress });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Insufficient balance");
  });

  it("should fail withdrawal with invalid address", async () => {
    const res = await request(app)
      .post(`/api/balance/${merchantId}/withdraw`)
      .send({ amount: 50, destination_address: "not-an-address" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid Ethereum address format");
  });
});

// ==========================================
// 7.6 Edge cases
// ==========================================
describe("Edge cases", () => {
  it("should return 410 for expired payment link", async () => {
    // Create an expired link directly in DB
    const expiredId = "expired-link";
    dbState.payment_links[expiredId] = {
      id: expiredId,
      merchant_id: "merchant-1",
      amount: 50,
      status: "expired",
      expires_at: new Date(Date.now() - 3600000).toISOString(),
    };

    const res = await request(app)
      .get(`/pay/${expiredId}`)
      .set("Accept", "application/json");

    expect(res.status).toBe(410);
    expect(res.body.error).toContain("expired");
  });

  it("should return already paid for completed payment", async () => {
    const paidId = "paid-link";
    dbState.payment_links[paidId] = {
      id: paidId,
      merchant_id: "merchant-1",
      amount: 100,
      status: "paid",
      tx_hash: "0xAlreadyPaid",
    };

    const res = await request(app)
      .get(`/pay/${paidId}`)
      .set("Accept", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Payment already completed");
    expect(res.body.tx_hash).toBe("0xAlreadyPaid");
  });

  it("should return 402 when verification fails", async () => {
    // Create a pending link
    const createRes = await request(app)
      .post("/api/payment-links")
      .send({ merchant_id: "merchant-1", amount: 50 });

    const linkId = createRes.body.id;

    // Submit invalid payment
    mockVerify.mockResolvedValue({ isValid: false, invalidReason: "Bad signature" });

    const payload = {
      x402Version: 2,
      accepted: { scheme: "exact" },
      payload: { signature: "0xbadsig" },
    };

    const res = await request(app)
      .get(`/pay/${linkId}`)
      .set("Accept", "application/json")
      .set("Payment-Signature", Buffer.from(JSON.stringify(payload)).toString("base64"));

    expect(res.status).toBe(402);
    expect(res.body.error).toBe("Bad signature");
  });

  it("should return 502 when facilitator settlement fails", async () => {
    const createRes = await request(app)
      .post("/api/payment-links")
      .send({ merchant_id: "merchant-1", amount: 75 });

    const linkId = createRes.body.id;

    mockVerify.mockResolvedValue({ isValid: true });
    mockSettle.mockRejectedValue(new Error("Facilitator timeout"));

    const payload = {
      x402Version: 2,
      accepted: { scheme: "exact" },
      payload: { signature: "0xsig" },
    };

    const res = await request(app)
      .get(`/pay/${linkId}`)
      .set("Accept", "application/json")
      .set("Payment-Signature", Buffer.from(JSON.stringify(payload)).toString("base64"));

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Settlement failed");

    // Payment should be marked as settlement_failed
    expect(dbState.payment_links[linkId].status).toBe("settlement_failed");
  });

  it("should return 404 for non-existent payment", async () => {
    const res = await request(app)
      .get("/pay/non-existent-id")
      .set("Accept", "application/json");

    expect(res.status).toBe(404);
  });

  it("should handle withdrawal failure and refund balance", async () => {
    const merchantId = "merchant-fail";
    dbState.merchant_balances[merchantId] = {
      merchant_id: merchantId,
      available_balance: 300,
      updated_at: new Date().toISOString(),
    };

    // Create and approve withdrawal
    const withdrawRes = await request(app)
      .post(`/api/balance/${merchantId}/withdraw`)
      .send({ amount: 100, destination_address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28" });

    const withdrawalId = withdrawRes.body.id;
    expect(dbState.merchant_balances[merchantId].available_balance).toBe(200);

    await request(app)
      .post(`/api/balance/withdrawals/${withdrawalId}/review`)
      .send({ action: "approve", reviewed_by: "admin" });

    // Mark as failed → balance should be refunded
    const failRes = await request(app)
      .post(`/api/balance/withdrawals/${withdrawalId}/fail`);

    expect(failRes.status).toBe(200);
    expect(failRes.body.status).toBe("failed");
    expect(dbState.merchant_balances[merchantId].available_balance).toBe(300);
  });
});
