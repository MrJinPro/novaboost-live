/**
 * Server-only PayPal REST client. Do NOT import from client / route components.
 * Provides OAuth token management, Orders v2 (create/capture), Subscriptions v1
 * (create/get/cancel), and webhook signature verification.
 */

type Env = "sandbox" | "live";

const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
const LIVE_BASE = "https://api-m.paypal.com";

export function getPayPalEnv(): Env {
  const raw = (process.env.PAYPAL_ENV ?? "sandbox").toLowerCase();
  return raw === "live" || raw === "production" ? "live" : "sandbox";
}

export function getPayPalCredentials(env: Env = getPayPalEnv()) {
  const clientId = env === "live" ? process.env.PAYPAL_CLIENT_ID_LIVE : process.env.PAYPAL_CLIENT_ID_SANDBOX;
  const clientSecret = env === "live" ? process.env.PAYPAL_CLIENT_SECRET_LIVE : process.env.PAYPAL_CLIENT_SECRET_SANDBOX;
  if (!clientId || !clientSecret) {
    throw new Error(`PayPal credentials for ${env} are not configured`);
  }
  return { clientId, clientSecret, baseUrl: env === "live" ? LIVE_BASE : SANDBOX_BASE, env };
}

export function getPayPalPublicClientId(env: Env = getPayPalEnv()): string {
  const id = env === "live" ? process.env.PAYPAL_CLIENT_ID_LIVE : process.env.PAYPAL_CLIENT_ID_SANDBOX;
  if (!id) throw new Error(`PayPal client id for ${env} is not configured`);
  return id;
}

let cachedToken: { value: string; expiresAt: number; env: Env } | null = null;

async function fetchAccessToken(): Promise<string> {
  const now = Date.now();
  const { clientId, clientSecret, baseUrl, env } = getPayPalCredentials();
  if (cachedToken && cachedToken.env === env && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.value;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal token error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: now + data.expires_in * 1000,
    env,
  };
  return data.access_token;
}

async function paypalFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const token = await fetchAccessToken();
  const { baseUrl } = getPayPalCredentials();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined ?? {}),
  };

  const body = init.json !== undefined ? JSON.stringify(init.json) : init.body;
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers, body });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.message || data?.error_description || `PayPal ${path} ${res.status}`;
    const error = new Error(`${message}`);
    (error as Error & { details?: unknown }).details = data;
    throw error;
  }
  return data as T;
}

// ---------- Orders v2 ----------

export type CreateOrderInput = {
  amount: string; // decimal string e.g. "10.00"
  currency?: string;
  description?: string;
  custom_id?: string;
  invoice_id?: string;
  return_url?: string;
  cancel_url?: string;
  brand_name?: string;
};

export async function createPayPalOrder(input: CreateOrderInput) {
  return paypalFetch<{ id: string; status: string; links?: { href: string; rel: string }[] }>(
    "/v2/checkout/orders",
    {
      method: "POST",
      json: {
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: { currency_code: input.currency ?? "USD", value: input.amount },
            description: input.description?.slice(0, 127),
            custom_id: input.custom_id?.slice(0, 127),
            invoice_id: input.invoice_id?.slice(0, 127),
          },
        ],
        application_context: {
          brand_name: input.brand_name ?? "NovaBoost Live",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: input.return_url,
          cancel_url: input.cancel_url,
        },
      },
    },
  );
}

export async function capturePayPalOrder(orderId: string) {
  return paypalFetch<{
    id: string;
    status: string;
    payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
    purchase_units?: Array<{
      payments?: { captures?: Array<{ id: string; status: string; amount: { currency_code: string; value: string } }> };
    }>;
  }>(`/v2/checkout/orders/${orderId}/capture`, { method: "POST", body: "" });
}

export async function getPayPalOrder(orderId: string) {
  return paypalFetch<{ id: string; status: string }>(`/v2/checkout/orders/${orderId}`, { method: "GET" });
}

// ---------- Subscriptions v1 ----------

export async function createPayPalSubscription(input: {
  plan_id: string;
  custom_id?: string;
  brand_name?: string;
  return_url?: string;
  cancel_url?: string;
}) {
  return paypalFetch<{ id: string; status: string; links?: { href: string; rel: string }[] }>(
    "/v1/billing/subscriptions",
    {
      method: "POST",
      json: {
        plan_id: input.plan_id,
        custom_id: input.custom_id?.slice(0, 127),
        application_context: {
          brand_name: input.brand_name ?? "NovaBoost Live",
          user_action: "SUBSCRIBE_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: input.return_url,
          cancel_url: input.cancel_url,
        },
      },
    },
  );
}

export async function getPayPalSubscription(subscriptionId: string) {
  return paypalFetch<{
    id: string;
    status: string;
    plan_id: string;
    billing_info?: { next_billing_time?: string; last_payment?: { amount: { value: string; currency_code: string } } };
    subscriber?: { email_address?: string };
    custom_id?: string;
  }>(`/v1/billing/subscriptions/${subscriptionId}`, { method: "GET" });
}

export async function cancelPayPalSubscription(subscriptionId: string, reason = "User cancelled") {
  await paypalFetch(`/v1/billing/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    json: { reason },
  });
}

// ---------- Webhook signature verification ----------

export async function verifyPayPalWebhookSignature(args: {
  headers: Record<string, string | null | undefined>;
  body: unknown;
}): Promise<boolean> {
  const env = getPayPalEnv();
  const webhookId = env === "live" ? process.env.PAYPAL_WEBHOOK_ID_LIVE : process.env.PAYPAL_WEBHOOK_ID_SANDBOX;
  if (!webhookId) {
    // Webhook ID not configured yet — treat as unverified (do not process).
    return false;
  }

  const required = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"];
  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(args.headers)) {
    if (v) lowerHeaders[k.toLowerCase()] = v;
  }
  if (!required.every((h) => lowerHeaders[h])) return false;

  try {
    const result = await paypalFetch<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      json: {
        auth_algo: lowerHeaders["paypal-auth-algo"],
        cert_url: lowerHeaders["paypal-cert-url"],
        transmission_id: lowerHeaders["paypal-transmission-id"],
        transmission_sig: lowerHeaders["paypal-transmission-sig"],
        transmission_time: lowerHeaders["paypal-transmission-time"],
        webhook_id: webhookId,
        webhook_event: args.body,
      },
    });
    return result.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}