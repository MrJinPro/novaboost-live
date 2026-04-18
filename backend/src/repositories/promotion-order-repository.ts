import type { SupabaseClient } from "@supabase/supabase-js";

export type PromotionOrderDraft = {
  requesterUserId: string | null;
  requesterRole: "viewer" | "streamer" | "admin";
  streamerId: string | null;
  targetLink: string;
  serviceId: number;
  serviceName: string;
  serviceCategory: string;
  serviceType: string;
  serviceRate: number;
  quantity: number;
  currency: "RUB" | "USD";
  supplierAmount: number;
  customerAmount: number;
};

export class PromotionOrderRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createPendingOrder(input: PromotionOrderDraft) {
    const { data, error } = await this.supabase
      .from("promotion_orders")
      .insert({
        requester_user_id: input.requesterUserId,
        requester_role: input.requesterRole,
        streamer_id: input.streamerId,
        target_link: input.targetLink,
        service_id: input.serviceId,
        service_name: input.serviceName,
        service_category: input.serviceCategory,
        service_type: input.serviceType,
        service_rate: input.serviceRate,
        quantity: input.quantity,
        currency: input.currency,
        quoted_amount: input.customerAmount,
        supplier_amount: input.supplierAmount,
        customer_amount: input.customerAmount,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    return data.id as string;
  }

  async markSubmitted(orderId: string, externalOrderId: number, externalPayload: Record<string, unknown>) {
    const { error } = await this.supabase
      .from("promotion_orders")
      .update({
        status: "submitted",
        external_order_id: externalOrderId,
        external_payload: externalPayload,
        failure_reason: null,
      })
      .eq("id", orderId);

    if (error) {
      throw error;
    }
  }

  async markFailed(orderId: string, reason: string, externalPayload?: Record<string, unknown>) {
    const { error } = await this.supabase
      .from("promotion_orders")
      .update({
        status: "failed",
        failure_reason: reason,
        external_payload: externalPayload ?? {},
      })
      .eq("id", orderId);

    if (error) {
      throw error;
    }
  }
}