import { supabase } from "../db/supabase";
import { config } from "../config";
import { PaymentLink } from "../db/types";

export async function createPaymentLink(
  merchantId: string,
  amount: number,
  description?: string
): Promise<PaymentLink> {
  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + config.payment.expirationHours);

  const { data, error } = await supabase
    .from("payment_links")
    .insert({
      merchant_id: merchantId,
      amount,
      description: description || null,
      status: "pending",
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getPaymentLink(id: string): Promise<PaymentLink | null> {
  const { data, error } = await supabase
    .from("payment_links")
    .select()
    .eq("id", id)
    .single();

  if (error && error.code === "PGRST116") return null;
  if (error) throw error;
  return data;
}

export async function listPaymentLinks(
  merchantId: string,
  filters: { status?: string; startDate?: string; endDate?: string },
  page: number = 1,
  pageSize: number = 20
): Promise<{ data: PaymentLink[]; total: number }> {
  let query = supabase
    .from("payment_links")
    .select("*", { count: "exact" })
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.startDate) {
    query = query.gte("created_at", filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte("created_at", filters.endDate);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], total: count || 0 };
}

export async function expirePendingLinks(): Promise<number> {
  const { data, error } = await supabase
    .from("payment_links")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) throw error;
  return data?.length || 0;
}
