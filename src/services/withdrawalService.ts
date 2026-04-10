import { supabase } from "../db/supabase";
import { Withdrawal } from "../db/types";

const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export async function createWithdrawal(
  merchantId: string,
  amount: number,
  destinationAddress: string
): Promise<Withdrawal> {
  if (!ETH_ADDRESS_REGEX.test(destinationAddress)) {
    throw new Error("Invalid Ethereum address format");
  }

  // Check available balance
  const { data: balance, error: balanceErr } = await supabase
    .from("merchant_balances")
    .select("available_balance")
    .eq("merchant_id", merchantId)
    .single();

  if (balanceErr || !balance) {
    throw new Error("Merchant balance not found");
  }

  if (balance.available_balance < amount) {
    throw new Error("Insufficient balance");
  }

  // Deduct balance
  const { error: updateErr } = await supabase
    .from("merchant_balances")
    .update({
      available_balance: balance.available_balance - amount,
      updated_at: new Date().toISOString(),
    })
    .eq("merchant_id", merchantId);

  if (updateErr) throw updateErr;

  // Create withdrawal record
  const { data, error } = await supabase
    .from("withdrawals")
    .insert({
      merchant_id: merchantId,
      amount,
      destination_address: destinationAddress,
      status: "pending_review",
    })
    .select()
    .single();

  if (error) throw error;

  // Write ledger debit entry
  await supabase.from("balance_ledger").insert({
    merchant_id: merchantId,
    type: "debit",
    amount,
    reference_type: "withdrawal",
    reference_id: data.id,
  });

  return data;
}

export async function reviewWithdrawal(
  withdrawalId: string,
  action: "approve" | "reject",
  reviewedBy: string
): Promise<Withdrawal> {
  const { data: withdrawal, error: fetchErr } = await supabase
    .from("withdrawals")
    .select()
    .eq("id", withdrawalId)
    .single();

  if (fetchErr || !withdrawal) {
    throw new Error("Withdrawal not found");
  }

  if (withdrawal.status !== "pending_review") {
    throw new Error(`Cannot review withdrawal with status: ${withdrawal.status}`);
  }

  if (action === "reject") {
    // Refund balance
    const { data: balance } = await supabase
      .from("merchant_balances")
      .select("available_balance")
      .eq("merchant_id", withdrawal.merchant_id)
      .single();

    await supabase
      .from("merchant_balances")
      .update({
        available_balance: (balance?.available_balance || 0) + withdrawal.amount,
        updated_at: new Date().toISOString(),
      })
      .eq("merchant_id", withdrawal.merchant_id);

    // Reverse ledger entry
    await supabase.from("balance_ledger").insert({
      merchant_id: withdrawal.merchant_id,
      type: "credit",
      amount: withdrawal.amount,
      reference_type: "withdrawal",
      reference_id: withdrawalId,
    });

    const { data, error } = await supabase
      .from("withdrawals")
      .update({
        status: "rejected",
        reviewed_by: reviewedBy,
        updated_at: new Date().toISOString(),
      })
      .eq("id", withdrawalId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Approve - mark as approved (execution is separate)
  const { data, error } = await supabase
    .from("withdrawals")
    .update({
      status: "approved",
      reviewed_by: reviewedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", withdrawalId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function completeWithdrawal(
  withdrawalId: string,
  txHash: string
): Promise<Withdrawal> {
  const { data, error } = await supabase
    .from("withdrawals")
    .update({
      status: "completed",
      tx_hash: txHash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", withdrawalId)
    .select()
    .single();

  if (error) throw error;

  // Update ledger with tx hash
  await supabase
    .from("balance_ledger")
    .update({ tx_hash: txHash })
    .eq("reference_type", "withdrawal")
    .eq("reference_id", withdrawalId)
    .eq("type", "debit");

  return data;
}

export async function failWithdrawal(withdrawalId: string): Promise<Withdrawal> {
  const { data: withdrawal, error: fetchErr } = await supabase
    .from("withdrawals")
    .select()
    .eq("id", withdrawalId)
    .single();

  if (fetchErr || !withdrawal) {
    throw new Error("Withdrawal not found");
  }

  // Refund balance
  const { data: balance } = await supabase
    .from("merchant_balances")
    .select("available_balance")
    .eq("merchant_id", withdrawal.merchant_id)
    .single();

  await supabase
    .from("merchant_balances")
    .update({
      available_balance: (balance?.available_balance || 0) + withdrawal.amount,
      updated_at: new Date().toISOString(),
    })
    .eq("merchant_id", withdrawal.merchant_id);

  // Reverse ledger
  await supabase.from("balance_ledger").insert({
    merchant_id: withdrawal.merchant_id,
    type: "credit",
    amount: withdrawal.amount,
    reference_type: "withdrawal",
    reference_id: withdrawalId,
  });

  const { data, error } = await supabase
    .from("withdrawals")
    .update({
      status: "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", withdrawalId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
