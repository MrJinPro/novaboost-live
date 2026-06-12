import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ScenarioSchema = z.enum(["donation", "promotion", "membership", "other"]);

const CreateOrderSchema = z.object({
  scenario: ScenarioSchema,
  scenarioRef: z.record(z.string(), z.unknown()).default({}),
  amount: z.number().positive().max(10_000),
  currency: z.literal("USD").default("USD"),
  description: z.string().min(1).max(120),
});

const CaptureOrderSchema = z.object({
  orderId: z.string().min(8).max(64),
});

const CreateSubscriptionSchema = z.object({
  planKey: z.enum(["supporter", "superfan", "legend"]),
  streamerId: z.string().uuid().optional(),
});

// Public client configuration (client id + env). Safe to expose client id.
export const getPayPalClientConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getPayPalEnv, getPayPalPublicClientId } = await import("@/lib/paypal.server");
  const env = getPayPalEnv();
  return { clientId: getPayPalPublicClientId(env), environment: env, currency: "USD" as const };
});

// Anyone (logged-in or guest) can create a donation/promotion order. Auth optional.
export const createPayPalOrderFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateOrderSchema.parse(data))
  .handler(async ({ data }) => {
    const { createPayPalOrder, getPayPalEnv } = await import("@/lib/paypal.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const env = getPayPalEnv();
    const amountStr = data.amount.toFixed(2);

    let userId: string | null = null;
    try {
      const { getRequestHeader } = await import("@tanstack/react-start/server");
      const auth = getRequestHeader("authorization");
      if (auth?.startsWith("Bearer ")) {
        const token = auth.slice(7);
        const { data: userData } = await supabaseAdmin.auth.getUser(token);
        userId = userData.user?.id ?? null;
      }
    } catch {
      userId = null;
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("payment_orders")
      .insert({
        user_id: userId,
        environment: env,
        scenario: data.scenario,
        scenario_ref: data.scenarioRef,
        amount_value: Number(amountStr),
        currency_code: data.currency,
        status: "created",
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Failed to record order");

    const order = await createPayPalOrder({
      amount: amountStr,
      currency: data.currency,
      description: data.description,
      custom_id: inserted.id,
      invoice_id: `nbl-${inserted.id.slice(0, 8)}-${Date.now()}`,
    });

    await supabaseAdmin
      .from("payment_orders")
      .update({ provider_order_id: order.id, raw_create: order as unknown as Record<string, unknown> })
      .eq("id", inserted.id);

    return { orderId: order.id, internalId: inserted.id };
  });

export const capturePayPalOrderFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CaptureOrderSchema.parse(data))
  .handler(async ({ data }) => {
    const { capturePayPalOrder } = await import("@/lib/paypal.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const captured = await capturePayPalOrder(data.orderId);
    const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
    const isSuccess = captured.status === "COMPLETED" && capture?.status === "COMPLETED";

    const payerName = [captured.payer?.name?.given_name, captured.payer?.name?.surname].filter(Boolean).join(" ").trim() || null;

    const { data: orderRow } = await supabaseAdmin
      .from("payment_orders")
      .update({
        provider_capture_id: capture?.id ?? null,
        payer_email: captured.payer?.email_address ?? null,
        payer_name: payerName,
        status: isSuccess ? "captured" : "failed",
        raw_capture: captured as unknown as Record<string, unknown>,
        failure_reason: isSuccess ? null : `Capture status: ${captured.status}`,
      })
      .eq("provider_order_id", data.orderId)
      .select("id, scenario, scenario_ref, amount_value, currency_code, user_id")
      .maybeSingle();

    if (isSuccess && orderRow) {
      try {
        await fulfillOrder(orderRow);
      } catch (fulfillError) {
        // Mark for retry but do not fail user-facing capture (money is taken)
        console.error("[paypal] fulfillment failed", fulfillError);
      }
    }

    return { status: isSuccess ? "success" : "failed" as const, captureId: capture?.id ?? null };
  });

async function fulfillOrder(order: {
  id: string;
  scenario: string;
  scenario_ref: Record<string, unknown> | null;
  amount_value: number;
  currency_code: string;
  user_id: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ref = order.scenario_ref ?? {};

  if (order.scenario === "donation") {
    const streamerId = typeof ref.streamerId === "string" ? ref.streamerId : null;
    const donorName = typeof ref.donorName === "string" && ref.donorName.trim() ? ref.donorName : "PayPal Supporter";
    const message = typeof ref.message === "string" ? ref.message : null;
    if (!streamerId) return;
    // donation_events.amount is stored in RUB historically; we store USD value here. Existing UI converts via currency table.
    await supabaseAdmin.from("donation_events").insert({
      streamer_id: streamerId,
      user_id: order.user_id,
      donor_name: donorName,
      amount: order.amount_value, // amount in USD
      currency: order.currency_code,
      message,
      status: "succeeded",
      source: `novaboost-paypal:${order.id}`,
    } as never);
  } else if (order.scenario === "promotion") {
    const promotionOrderId = typeof ref.promotionOrderId === "string" ? ref.promotionOrderId : null;
    if (!promotionOrderId) return;
    await supabaseAdmin
      .from("promotion_orders")
      .update({ status: "paid" } as never)
      .eq("id", promotionOrderId);
  }
}

// ---------- Subscriptions ----------

const PLAN_ENV_MAP: Record<"supporter" | "superfan" | "legend", string> = {
  supporter: "PAYPAL_PLAN_ID_SUPPORTER",
  superfan: "PAYPAL_PLAN_ID_SUPERFAN",
  legend: "PAYPAL_PLAN_ID_LEGEND",
};

export const createPayPalSubscriptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateSubscriptionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { createPayPalSubscription, getPayPalEnv } = await import("@/lib/paypal.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const env = getPayPalEnv();

    const envKey = `${PLAN_ENV_MAP[data.planKey]}${env === "live" ? "_LIVE" : "_SANDBOX"}`;
    const planId = process.env[envKey] ?? process.env[PLAN_ENV_MAP[data.planKey]];
    if (!planId) {
      throw new Error(`PayPal plan id is not configured (${envKey}). Create a billing plan in PayPal Dashboard and set the secret.`);
    }

    const userId = context.userId;
    const { data: inserted, error } = await supabaseAdmin
      .from("payment_subscriptions")
      .insert({
        user_id: userId,
        streamer_id: data.streamerId ?? null,
        plan_key: data.planKey,
        paypal_plan_id: planId,
        environment: env,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Failed to record subscription");

    const subscription = await createPayPalSubscription({
      plan_id: planId,
      custom_id: inserted.id,
    });

    await supabaseAdmin
      .from("payment_subscriptions")
      .update({
        provider_subscription_id: subscription.id,
        status: "approval_pending",
        raw_payload: subscription as unknown as Record<string, unknown>,
      })
      .eq("id", inserted.id);

    return { subscriptionId: subscription.id, internalId: inserted.id };
  });

export const activatePayPalSubscriptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ subscriptionId: z.string().min(8).max(64) }).parse(data))
  .handler(async ({ data }) => {
    const { getPayPalSubscription } = await import("@/lib/paypal.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sub = await getPayPalSubscription(data.subscriptionId);

    const status = sub.status?.toLowerCase() === "active" ? "active"
      : sub.status?.toLowerCase() === "approval_pending" ? "approval_pending"
      : sub.status?.toLowerCase() === "cancelled" ? "cancelled"
      : "pending";

    await supabaseAdmin
      .from("payment_subscriptions")
      .update({
        status,
        payer_email: sub.subscriber?.email_address ?? null,
        current_period_end: sub.billing_info?.next_billing_time ?? null,
        last_payment_amount: sub.billing_info?.last_payment?.amount?.value ? Number(sub.billing_info.last_payment.amount.value) : null,
        last_payment_currency: sub.billing_info?.last_payment?.amount?.currency_code ?? null,
        raw_payload: sub as unknown as Record<string, unknown>,
      })
      .eq("provider_subscription_id", data.subscriptionId);

    return { status };
  });