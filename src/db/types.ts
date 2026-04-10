export type PaymentStatus = "pending" | "paid" | "expired" | "settlement_failed";

export interface PaymentLink {
  id: string;
  merchant_id: string;
  amount: number;
  description: string | null;
  status: PaymentStatus;
  tx_hash: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface MerchantBalance {
  merchant_id: string;
  available_balance: number;
  updated_at: string;
}

export type LedgerType = "credit" | "debit";
export type ReferenceType = "payment" | "withdrawal";

export interface BalanceLedgerEntry {
  id: string;
  merchant_id: string;
  type: LedgerType;
  amount: number;
  reference_type: ReferenceType;
  reference_id: string;
  tx_hash: string | null;
  created_at: string;
}

export type WithdrawalStatus =
  | "pending_review"
  | "approved"
  | "completed"
  | "rejected"
  | "failed";

export interface Withdrawal {
  id: string;
  merchant_id: string;
  amount: number;
  destination_address: string;
  status: WithdrawalStatus;
  tx_hash: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}
