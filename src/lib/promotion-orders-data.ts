import { supabase } from "@/integrations/supabase/client";

export type PromotionOrderSummary = {
  id: string;
  serviceName: string;
  quantity: number;
  quotedAmount: number;
  currency: string;
  status: "pending" | "queued" | "submitted" | "completed" | "failed" | "cancelled";
  targetLink: string;
  failureReason: string | null;
  createdAt: string;
};

export async function loadMyPromotionOrders(userId: string) {
  const { data, error } = await supabase
    .from("promotion_orders")
    .select("id, service_name, quantity, quoted_amount, currency, status, target_link, failure_reason, created_at")
    .eq("requester_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{
    id: string;
    service_name: string;
    quantity: number;
    quoted_amount: number;
    currency: string;
    status: "pending" | "queued" | "submitted" | "completed" | "failed" | "cancelled";
    target_link: string;
    failure_reason: string | null;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    serviceName: row.service_name,
    quantity: row.quantity,
    quotedAmount: row.quoted_amount,
    currency: row.currency,
    status: row.status,
    targetLink: row.target_link,
    failureReason: row.failure_reason,
    createdAt: new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(row.created_at)),
  }));
}