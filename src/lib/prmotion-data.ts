export type TikTokPromotionService = {
  id: number;
  name: string;
  category: string;
  type: string;
  rate: number;
  min: number;
  max: number;
  tags: string[];
};

type CreateOrderInput = {
  requesterUserId?: string | null;
  requesterRole?: "viewer" | "streamer" | "admin";
  streamerId?: string | null;
  serviceId: number;
  link: string;
  quantity: number;
  currency?: "RUB" | "USD";
};

export function getPromotionMarkup(role: "viewer" | "streamer" | "admin") {
  if (role === "streamer") {
    return 0.15;
  }

  if (role === "admin") {
    return 0;
  }

  return 0.3;
}

export function calculateCustomerAmount(role: "viewer" | "streamer" | "admin", rate: number, quantity: number) {
  const supplierAmount = Number(((rate * quantity) / 1000).toFixed(2));
  const customerAmount = Number((supplierAmount * (1 + getPromotionMarkup(role))).toFixed(2));

  return {
    supplierAmount,
    customerAmount,
  };
}

function getBackendBaseUrl() {
  return import.meta.env.VITE_BACKEND_URL || process.env.VITE_BACKEND_URL || "http://127.0.0.1:4310";
}

async function requestJson<TResponse>(path: string, init?: RequestInit) {
  const response = await fetch(`${getBackendBaseUrl()}${path}`, init);
  const data = await response.json() as TResponse & { error?: string };

  if (!response.ok || data.error) {
    throw new Error(data.error || `Backend request failed with status ${response.status}`);
  }

  return data as TResponse;
}

export async function loadTikTokPromotionServices() {
  const response = await requestJson<{ services: TikTokPromotionService[] }>("/growth/tiktok/services");
  return response.services;
}

export async function createTikTokPromotionOrder(input: CreateOrderInput) {
  return requestJson<{
    orderId: string;
    service: TikTokPromotionService;
    quantity: number;
    link: string;
    currency: "RUB" | "USD";
    supplierAmount: number;
    customerAmount: number;
    status: "submitted";
  }>("/growth/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
}