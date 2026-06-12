import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/paypal-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        let payload: Record<string, unknown> | null = null;
        try {
          payload = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        if (!payload) return new Response("empty", { status: 400 });

        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });

        const { verifyPayPalWebhookSignature, getPayPalEnv } = await import("@/lib/paypal.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const env = getPayPalEnv();
        const verified = await verifyPayPalWebhookSignature({ headers, body: payload });

        const eventType = String((payload as { event_type?: unknown }).event_type ?? "unknown");
        const eventId = typeof (payload as { id?: unknown }).id === "string" ? (payload as { id: string }).id : null;
        const resource = (payload as { resource?: Record<string, unknown> }).resource ?? null;
        const resourceId = resource && typeof resource.id === "string" ? (resource.id as string) : null;

        await supabaseAdmin.from("payment_webhook_events").upsert(
          {
            environment: env,
            event_id: eventId,
            event_type: eventType,
            resource_id: resourceId,
            payload: payload as unknown as Record<string, unknown>,
            verified,
          },
          { onConflict: "event_id" },
        );

        if (!verified) {
          return new Response("unverified", { status: 200 });
        }

        try {
          await processEvent(eventType, resource, supabaseAdmin);
          await supabaseAdmin
            .from("payment_webhook_events")
            .update({ processed_at: new Date().toISOString(), process_error: null })
            .eq("event_id", eventId ?? "");
        } catch (error) {
          await supabaseAdmin
            .from("payment_webhook_events")
            .update({ process_error: error instanceof Error ? error.message : String(error) })
            .eq("event_id", eventId ?? "");
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});

async function processEvent(
  eventType: string,
  resource: Record<string, unknown> | null,
  supabaseAdmin: Awaited<ReturnType<typeof importSupabaseAdmin>>,
) {
  if (!resource) return;

  // Subscription lifecycle
  if (eventType.startsWith("BILLING.SUBSCRIPTION.")) {
    const subscriptionId = typeof resource.id === "string" ? (resource.id as string) : null;
    if (!subscriptionId) return;
    const status = String(resource.status ?? "").toLowerCase();
    const mappedStatus = status === "active" ? "active"
      : status === "approval_pending" ? "approval_pending"
      : status === "suspended" ? "suspended"
      : status === "cancelled" ? "cancelled"
      : status === "expired" ? "expired"
      : "pending";
    const billingInfo = (resource as { billing_info?: { next_billing_time?: string; last_payment?: { amount?: { value?: string; currency_code?: string } } } }).billing_info;
    const subscriber = (resource as { subscriber?: { email_address?: string } }).subscriber;
    await supabaseAdmin
      .from("payment_subscriptions")
      .update({
        status: mappedStatus,
        current_period_end: billingInfo?.next_billing_time ?? null,
        payer_email: subscriber?.email_address ?? null,
        last_payment_amount: billingInfo?.last_payment?.amount?.value ? Number(billingInfo.last_payment.amount.value) : null,
        last_payment_currency: billingInfo?.last_payment?.amount?.currency_code ?? null,
        raw_payload: resource as unknown as Record<string, unknown>,
      })
      .eq("provider_subscription_id", subscriptionId);
    return;
  }

  // Capture refund
  if (eventType === "PAYMENT.CAPTURE.REFUNDED") {
    const captureId = typeof (resource as { id?: unknown }).id === "string" ? (resource as { id: string }).id : null;
    if (!captureId) return;
    await supabaseAdmin
      .from("payment_orders")
      .update({ status: "refunded" })
      .eq("provider_capture_id", captureId);
  }
}

async function importSupabaseAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}