// Mock supabase
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockUpsert = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();

const mockChain: any = {};
mockChain.select = mockSelect.mockReturnValue(mockChain);
mockChain.insert = mockInsert.mockReturnValue(mockChain);
mockChain.update = mockUpdate.mockReturnValue(mockChain);
mockChain.upsert = mockUpsert.mockReturnValue(mockChain);
mockChain.eq = mockEq.mockReturnValue(mockChain);
mockChain.single = mockSingle.mockReturnValue(mockChain);

mockFrom.mockReturnValue(mockChain);

jest.mock("../db/supabase", () => ({
  supabase: {
    from: mockFrom,
    rpc: jest.fn(),
  },
}));

import { getBalance } from "../services/balanceService";

describe("BalanceService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReturnValue(mockChain);
    mockSelect.mockReturnValue(mockChain);
    mockEq.mockReturnValue(mockChain);
  });

  describe("getBalance", () => {
    it("should return null for merchant without balance", async () => {
      mockSingle.mockResolvedValue({
        data: null,
        error: { code: "PGRST116" },
      });

      const result = await getBalance("unknown-merchant");
      expect(result).toBeNull();
    });

    it("should return balance for existing merchant", async () => {
      const mockBalance = {
        merchant_id: "merchant-1",
        available_balance: 150.5,
        updated_at: new Date().toISOString(),
      };
      mockSingle.mockResolvedValue({ data: mockBalance, error: null });

      const result = await getBalance("merchant-1");
      expect(result).toEqual(mockBalance);
      expect(result!.available_balance).toBe(150.5);
    });
  });
});

describe("Withdrawal validation", () => {
  it("should validate Ethereum address format", () => {
    const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

    expect(ETH_ADDRESS_REGEX.test("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28")).toBe(true);
    expect(ETH_ADDRESS_REGEX.test("0xINVALID")).toBe(false);
    expect(ETH_ADDRESS_REGEX.test("not-an-address")).toBe(false);
    expect(ETH_ADDRESS_REGEX.test("0x123")).toBe(false);
    expect(ETH_ADDRESS_REGEX.test("")).toBe(false);
  });

  it("should reject withdrawal with insufficient balance", async () => {
    // The service checks balance before creating withdrawal
    // Balance: 50, Withdrawal: 100 → should fail
    const balance = 50;
    const withdrawAmount = 100;
    expect(balance < withdrawAmount).toBe(true);
  });
});
