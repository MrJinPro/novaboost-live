import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import type { PromotionOrderRepository } from "../../repositories/promotion-order-repository.js";

type PRMotionServiceRow = {
  service: number;
  name: string;
  type: string;
  category: string;
  rate: string;
  min: number;
  max: number;
};

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

function getRoleMarkup(role: "viewer" | "streamer" | "admin") {
  if (role === "streamer") {
    return 0.15;
  }

  if (role === "admin") {
    return 0;
  }

  return 0.3;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function isTikTokCategory(category: string) {
  const normalized = normalizeText(category);
  return normalized.includes("tik tok") || normalized.includes("tiktok") || normalized.includes("тик ток") || normalized.includes("тикток");
}

function isCoinService(name: string, category: string) {
  const normalized = `${normalizeText(category)} ${normalizeText(name)}`;
  return normalized.includes("coin") || normalized.includes("coins") || normalized.includes("монет") || normalized.includes("монеты") || normalized.includes("пополнение");
}

function extractTags(name: string, category: string) {
  const normalized = `${normalizeText(category)} ${normalizeText(name)}`;
  const tags = new Set<string>();

  if (normalized.includes("live") || normalized.includes("эфир") || normalized.includes("стрим")) {
    tags.add("live");
  }
  if (normalized.includes("like") || normalized.includes("лайк")) {
    tags.add("likes");
  }
  if (normalized.includes("view") || normalized.includes("просмотр")) {
    tags.add("views");
  }
  if (normalized.includes("share") || normalized.includes("repost") || normalized.includes("репост")) {
    tags.add("shares");
  }
  if (normalized.includes("follow") || normalized.includes("подпис")) {
    tags.add("followers");
  }
  if (normalized.includes("comment") || normalized.includes("коммент")) {
    tags.add("comments");
  }

  return [...tags];
}

export class PRMotionService {
  constructor(
    private readonly env: BackendEnv,
    private readonly logger: Logger,
    private readonly promotionOrderRepository?: PromotionOrderRepository,
  ) {}

  getHealth() {
    return {
      service: "growth-catalog",
      status: this.env.PRMOTION_API_KEY ? "ready" : "disabled",
      warnings: this.env.PRMOTION_API_KEY ? [] : ["Growth supplier API key is not configured."],
    };
  }

  async listTikTokServices() {
    const rows = await this.request<PRMotionServiceRow[]>({
      action: "services",
    });

    return rows
      .filter((row) => isTikTokCategory(row.category) && !isCoinService(row.name, row.category))
      .map((row) => ({
        id: row.service,
        name: row.name,
        category: row.category,
        type: row.type,
        rate: Number(row.rate),
        min: row.min,
        max: row.max,
        tags: extractTags(row.name, row.category),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "ru"));
  }

  async createOrder(input: {
    requesterUserId: string | null;
    requesterRole: "viewer" | "streamer" | "admin";
    streamerId: string | null;
    serviceId: number;
    link: string;
    quantity: number;
    currency?: "RUB" | "USD";
  }) {
    const services = await this.listTikTokServices();
    const selectedService = services.find((service) => service.id === input.serviceId);

    if (!selectedService) {
      throw new Error("Выбранная услуга не относится к TikTok или недоступна через NovaBoost Live.");
    }

    if (input.quantity < selectedService.min || input.quantity > selectedService.max) {
      throw new Error(`Количество должно быть в диапазоне ${selectedService.min}-${selectedService.max}.`);
    }

    if (!this.promotionOrderRepository) {
      throw new Error("Внутреннее хранилище заказов не настроено.");
    }

    const supplierAmount = Number(((selectedService.rate * input.quantity) / 1000).toFixed(2));
    const customerAmount = Number((supplierAmount * (1 + getRoleMarkup(input.requesterRole))).toFixed(2));
    const internalOrderId = await this.promotionOrderRepository.createPendingOrder({
      requesterUserId: input.requesterUserId,
      requesterRole: input.requesterRole,
      streamerId: input.streamerId,
      targetLink: input.link,
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      serviceCategory: selectedService.category,
      serviceType: selectedService.type,
      serviceRate: selectedService.rate,
      quantity: input.quantity,
      currency: input.currency ?? "RUB",
      supplierAmount,
      customerAmount,
    });

    try {
      const response = await this.request<{ order: number }>({
        action: "add",
        service: String(input.serviceId),
        link: input.link,
        quantity: String(input.quantity),
        currency: input.currency ?? "RUB",
      });

      await this.promotionOrderRepository.markSubmitted(internalOrderId, response.order, response as Record<string, unknown>);

      this.logger.info("Supplier order created", {
        internalOrderId,
        serviceId: input.serviceId,
        externalOrderId: response.order,
        quantity: input.quantity,
      });

      return {
        orderId: internalOrderId,
        service: selectedService,
        quantity: input.quantity,
        link: input.link,
        currency: input.currency ?? "RUB",
        supplierAmount,
        customerAmount,
        status: "submitted" as const,
      };
    } catch (error) {
      await this.promotionOrderRepository.markFailed(
        internalOrderId,
        error instanceof Error ? error.message : "supplier_request_failed",
      );
      throw error;
    }
  }

  private async request<TResponse>(params: Record<string, string>) {
    if (!this.env.PRMOTION_API_KEY) {
      throw new Error("Supplier API key is not configured on the backend.");
    }

    const body = new URLSearchParams({
      key: this.env.PRMOTION_API_KEY,
      ...params,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.env.PRMOTION_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(this.env.PRMOTION_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Supplier HTTP ${response.status}`);
      }

      const data = (await response.json()) as TResponse & { error?: string };
      if (typeof data === "object" && data !== null && "error" in data && data.error) {
        throw new Error(data.error);
      }

      return data as TResponse;
    } finally {
      clearTimeout(timeout);
    }
  }
}