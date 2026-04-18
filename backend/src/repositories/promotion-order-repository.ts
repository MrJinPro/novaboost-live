import type { SupabaseClient } from "@supabase/supabase-js";

export type PromotionOrderDraft = {
  requesterUserId: string | null;
  requesterRole: "viewer" | "streamer" | "admin";
  streamerId: string | null;
  targetLink: string;
  targetType: string;
  serviceId: number;
  serviceName: string;
  serviceCategory: string;
  serviceType: string;
  serviceRate: number;
  quantity: number;
  currency: "RUB" | "USD";
  supplierAmount: number;
  customerAmount: number;
  status?: "pending" | "queued";
  queueReason?: string | null;
};

export type PromotionOrderRow = {
  id: string;
  requester_user_id: string | null;
  requester_role: "viewer" | "streamer" | "admin";
  streamer_id: string | null;
  target_link: string;
  target_type: string;
  service_id: number;
  service_name: string;
  service_category: string;
  service_type: string;
  service_rate: number;
  quantity: number;
  currency: "RUB" | "USD";
  quoted_amount: number;
  supplier_amount: number;
  customer_amount: number;
  external_order_id: number | null;
  external_payload: Record<string, unknown>;
  status: "pending" | "queued" | "submitted" | "completed" | "failed" | "cancelled";
  failure_reason: string | null;
  queue_reason: string | null;
  submitted_stream_session_id: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  last_status_check_at: string | null;
  created_at: string;
  updated_at: string;
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
        target_type: input.targetType,
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
        status: input.status ?? "pending",
        queue_reason: input.queueReason ?? null,
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    return data.id as string;
  }

  async getActiveSubmittedOrder(streamerId: string) {
    const { data, error } = await this.supabase
      .from("promotion_orders")
      .select("id, streamer_id, status, submitted_at")
      .eq("streamer_id", streamerId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  async listQueuedOrders() {
    const { data, error } = await this.supabase
      .from("promotion_orders")
      .select("*")
      .eq("status", "queued")
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []) as PromotionOrderRow[];
  }

  async listSubmittedOrders() {
    const { data, error } = await this.supabase
      .from("promotion_orders")
      .select("*")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []) as PromotionOrderRow[];
  }

  async markSubmitted(orderId: string, externalOrderId: number, externalPayload: Record<string, unknown>, submittedStreamSessionId?: string | null) {
    const { error } = await this.supabase
      .from("promotion_orders")
      .update({
        status: "submitted",
        external_order_id: externalOrderId,
        external_payload: externalPayload,
        failure_reason: null,
        queue_reason: null,
        submitted_stream_session_id: submittedStreamSessionId ?? null,
        submitted_at: new Date().toISOString(),
        last_status_check_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) {
      throw error;
    }
  }

  async markQueued(orderId: string, reason: string) {
    const { error } = await this.supabase
      .from("promotion_orders")
      .update({
        status: "queued",
        queue_reason: reason,
        failure_reason: null,
      })
      .eq("id", orderId);

    if (error) {
      throw error;
    }
  }

  async markCompleted(orderId: string, externalPayload?: Record<string, unknown>) {
    const { error } = await this.supabase
      .from("promotion_orders")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        last_status_check_at: new Date().toISOString(),
        external_payload: externalPayload ?? {},
        failure_reason: null,
      })
      .eq("id", orderId);

    if (error) {
      throw error;
    }
  }

  async touchStatusCheck(orderId: string, externalPayload?: Record<string, unknown>) {
    const { error } = await this.supabase
      .from("promotion_orders")
      .update({
        last_status_check_at: new Date().toISOString(),
        external_payload: externalPayload ?? {},
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
        last_status_check_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) {
      throw error;
    }
  }
}