import { config } from "../config";

// Mock supabase
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockLt = jest.fn();
const mockSingle = jest.fn();

const mockChain = {
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  eq: mockEq,
  lt: mockLt,
  single: mockSingle,
};

// Each method returns the chain for chaining
Object.values(mockChain).forEach((fn) => {
  fn.mockReturnValue(mockChain);
});

jest.mock("../db/supabase", () => ({
  supabase: {
    from: jest.fn(() => mockChain),
  },
}));

import {
  createPaymentLink,
  getPaymentLink,
  expirePendingLinks,
} from "../services/paymentLinkService";

describe("PaymentLinkService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockChain).forEach((fn) => {
      fn.mockReturnValue(mockChain);
    });
  });

  describe("createPaymentLink", () => {
    it("should reject zero amount", async () => {
      await expect(createPaymentLink("merchant-1", 0)).rejects.toThrow(
        "Amount must be greater than 0"
      );
    });

    it("should reject negative amount", async () => {
      await expect(createPaymentLink("merchant-1", -10)).rejects.toThrow(
        "Amount must be greater than 0"
      );
    });

    it("should create a payment link with correct data", async () => {
      const mockLink = {
        id: "test-id",
        merchant_id: "merchant-1",
        amount: 100,
        description: "Test payment",
        status: "pending",
        tx_hash: null,
        expires_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSingle.mockResolvedValue({ data: mockLink, error: null });

      const result = await createPaymentLink("merchant-1", 100, "Test payment");
      expect(result).toEqual(mockLink);
      expect(result.status).toBe("pending");
      expect(result.merchant_id).toBe("merchant-1");
    });
  });

  describe("getPaymentLink", () => {
    it("should return null for non-existent payment", async () => {
      mockSingle.mockResolvedValue({
        data: null,
        error: { code: "PGRST116" },
      });

      const result = await getPaymentLink("non-existent");
      expect(result).toBeNull();
    });

    it("should return payment link data", async () => {
      const mockLink = { id: "test-id", status: "pending", amount: 50 };
      mockSingle.mockResolvedValue({ data: mockLink, error: null });

      const result = await getPaymentLink("test-id");
      expect(result).toEqual(mockLink);
    });
  });

  describe("expirePendingLinks", () => {
    it("should return count of expired links", async () => {
      mockSelect.mockResolvedValue({
        data: [{ id: "1" }, { id: "2" }],
        error: null,
      });

      const result = await expirePendingLinks();
      expect(result).toBe(2);
    });

    it("should return 0 when no links to expire", async () => {
      mockSelect.mockResolvedValue({ data: [], error: null });

      const result = await expirePendingLinks();
      expect(result).toBe(0);
    });
  });
});
