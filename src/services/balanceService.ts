import { supabase } from "../db/supabase";
import { MerchantBalance, BalanceLedgerEntry } from "../db/types";

export async function ensureMerchantBalance(merchantId: string): Promise<void> {
  const { error } = await supabase
    .from("merchant_balances")
    .upsert({ merchant_id: merchantId, available_balance: 0 }, { onConflict: "merchant_id", ignoreDuplicates: true });

  if (error) throw error;
}

export async function creditMerchantBalance(
  merchantId: string,
  amount: number,
  paymentId: string,
  txHash: string
): Promise<void> {
  await ensureMerchantBalance(merchantId);

  // Get current balance
  const { data: current, error: fetchErr } = await supabase
    .from("merchant_balances")
    .select("available_balance")
    .eq("merchant_id", merchantId)
    .single();

  if (fetchErr) throw fetchErr;

  // Update balance
  const { error: balanceError } = await supabase
    .from("merchant_balances")
    .update({
      available_balance: (current?.available_balance || 0) + amount,
      updated_at: new Date().toISOString(),
    })
    .eq("merchant_id", merchantId);

  if (balanceError) throw balanceError;

  // Insert ledger entry
  const { error: ledgerError } = await supabase
    .from("balance_ledger")
    .insert({
      merchant_id: merchantId,
      type: "credit",
      amount,
      reference_type: "payment",
      reference_id: paymentId,
      tx_hash: txHash,
    });

  if (ledgerError) throw ledgerError;
}

export async function getBalance(merchantId: string): Promise<MerchantBalance | null> {
  const { data, error } = await supabase
    .from("merchant_balances")
    .select()
    .eq("merchant_id", merchantId)
    .single();

  if (error && error.code === "PGRST116") return null;
  if (error) throw error;
  return data;
}

export async function getLedgerHistory(
  merchantId: string,
  filters: { startDate?: string; endDate?: string },
  page: number = 1,
  pageSize: number = 20
): Promise<{ data: BalanceLedgerEntry[]; total: number }> {
  let query = supabase
    .from("balance_ledger")
    .select("*", { count: "exact" })
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (filters.startDate) query = query.gte("created_at", filters.startDate);
  if (filters.endDate) query = query.lte("created_at", filters.endDate);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], total: count || 0 };
}
