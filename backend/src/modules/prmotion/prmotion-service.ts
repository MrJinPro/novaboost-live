import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import type { PromotionOrderRepository } from "../../repositories/promotion-order-repository.js";
import type { PromotionOrderRow } from "../../repositories/promotion-order-repository.js";
import type { TrackingStore } from "../../storage/live-storage.js";

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
  targetType: "live" | "video" | "profile" | "comment";
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

function cleanCatalogText(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s.,:+\-()/]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function inferTargetType(name: string, category: string, type: string, tags: string[]) {
  const normalized = `${normalizeText(category)} ${normalizeText(name)} ${normalizeText(type)} ${tags.join(" ")}`;

  if (normalized.includes("comment")) {
    return "comment" as const;
  }

  if (normalized.includes("follow") || normalized.includes("account") || normalized.includes("package")) {
    return "profile" as const;
  }

  if (normalized.includes("live") || normalized.includes("minutes") || normalized.includes("эфир") || normalized.includes("stream")) {
    return "live" as const;
  }

  return "video" as const;
}

function isCompletedSupplierStatus(status: string) {
  return ["completed", "complete", "partial"].includes(status);
}

function isFailedSupplierStatus(status: string) {
  return ["canceled", "cancelled", "failed", "error", "refunded"].includes(status);
}

export class PRMotionService {
  private queuePoller: NodeJS.Timeout | null = null;

  constructor(
    private readonly env: BackendEnv,
    private readonly logger: Logger,
    private readonly promotionOrderRepository?: PromotionOrderRepository,
    private readonly trackingRepository?: TrackingStore,
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
      .map((row) => {
        const safeName = cleanCatalogText(row.name);
        const safeCategory = cleanCatalogText(row.category);
        const safeType = cleanCatalogText(row.type);
        const tags = extractTags(safeName, safeCategory);

        return {
        id: row.service,
        name: safeName,
        category: safeCategory,
        type: safeType,
        rate: Number(row.rate),
        min: row.min,
        max: row.max,
        tags,
        targetType: inferTargetType(safeName, safeCategory, safeType, tags),
      };
      })
      .sort((left, right) => left.name.localeCompare(right.name, "ru"));
  }

  scheduleOrderQueue() {
    if (!this.promotionOrderRepository || !this.trackingRepository) {
      this.logger.warn("Growth queue scheduler skipped because repositories are unavailable.");
      return;
    }

    if (this.queuePoller) {
      return;
    }

    void this.runQueueTick();
    this.queuePoller = setInterval(() => {
      void this.runQueueTick();
    }, this.env.TRACKING_POLL_INTERVAL_MS);

    this.logger.info("Growth queue scheduler started", {
      intervalMs: this.env.TRACKING_POLL_INTERVAL_MS,
    });
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

    let submittedStreamSessionId: string | null = null;
    if (selectedService.targetType === "live") {
      if (!input.streamerId) {
        throw new Error("Для live-услуги нужно выбрать стримера.");
      }

      if (this.trackingRepository) {
        const streamerState = await this.trackingRepository.getStreamerLiveState(input.streamerId);
        if (!streamerState?.is_live) {
          throw new Error("Эта услуга доступна только когда эфир уже начался.");
        }

        const liveSession = await this.trackingRepository.getLatestLiveSession(input.streamerId);
        submittedStreamSessionId = liveSession?.id ?? null;
      }

      const activeLiveOrder = await this.promotionOrderRepository.getActiveSubmittedOrder(input.streamerId);
      if (activeLiveOrder) {
        const queuedOrderId = await this.promotionOrderRepository.createPendingOrder({
          requesterUserId: input.requesterUserId,
          requesterRole: input.requesterRole,
          streamerId: input.streamerId,
          targetLink: input.link,
          targetType: selectedService.targetType,
          serviceId: selectedService.id,
          serviceName: selectedService.name,
          serviceCategory: selectedService.category,
          serviceType: selectedService.type,
          serviceRate: selectedService.rate,
          quantity: input.quantity,
          currency: input.currency ?? "USD",
          supplierAmount: Number(((selectedService.rate * input.quantity) / 1000).toFixed(2)),
          customerAmount: Number((((selectedService.rate * input.quantity) / 1000) * (1 + getRoleMarkup(input.requesterRole))).toFixed(2)),
          status: "queued",
          queueReason: "waiting_previous_live_order",
        });

        return {
          orderId: queuedOrderId,
          service: selectedService,
          quantity: input.quantity,
          link: input.link,
          currency: input.currency ?? "USD",
          supplierAmount: Number(((selectedService.rate * input.quantity) / 1000).toFixed(2)),
          customerAmount: Number((((selectedService.rate * input.quantity) / 1000) * (1 + getRoleMarkup(input.requesterRole))).toFixed(2)),
          status: "queued" as const,
        };
      }
    }

    const supplierAmount = Number(((selectedService.rate * input.quantity) / 1000).toFixed(2));
    const customerAmount = Number((supplierAmount * (1 + getRoleMarkup(input.requesterRole))).toFixed(2));
    const internalOrderId = await this.promotionOrderRepository.createPendingOrder({
      requesterUserId: input.requesterUserId,
      requesterRole: input.requesterRole,
      streamerId: input.streamerId,
      targetLink: input.link,
      targetType: selectedService.targetType,
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      serviceCategory: selectedService.category,
      serviceType: selectedService.type,
      serviceRate: selectedService.rate,
      quantity: input.quantity,
      currency: input.currency ?? "USD",
      supplierAmount,
      customerAmount,
    });

    try {
      const response = await this.request<{ order: number }>({
        action: "add",
        service: String(input.serviceId),
        link: input.link,
        quantity: String(input.quantity),
        currency: input.currency ?? "USD",
      });

      await this.promotionOrderRepository.markSubmitted(internalOrderId, response.order, response as Record<string, unknown>, submittedStreamSessionId);

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
        currency: input.currency ?? "USD",
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

  private async runQueueTick() {
    if (!this.promotionOrderRepository || !this.trackingRepository || !this.env.PRMOTION_API_KEY) {
      return;
    }

    try {
      await this.refreshSubmittedOrders();
      await this.processQueuedOrders();
    } catch (error) {
      this.logger.error("Growth queue tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async refreshSubmittedOrders() {
    if (!this.promotionOrderRepository) {
      return;
    }

    const orders = await this.promotionOrderRepository.listSubmittedOrders();

    for (const order of orders) {
      if (!order.external_order_id) {
        continue;
      }

      try {
        const response = await this.request<{ status?: string }>({
          action: "status",
          order: String(order.external_order_id),
        });
        const normalizedStatus = String(response.status ?? "").trim().toLowerCase();

        if (isCompletedSupplierStatus(normalizedStatus)) {
          await this.promotionOrderRepository.markCompleted(order.id, response as Record<string, unknown>);
          continue;
        }

        if (isFailedSupplierStatus(normalizedStatus)) {
          await this.promotionOrderRepository.markFailed(order.id, `supplier_${normalizedStatus || "failed"}`, response as Record<string, unknown>);
          continue;
        }

        await this.promotionOrderRepository.touchStatusCheck(order.id, response as Record<string, unknown>);
      } catch (error) {
        this.logger.warn("Supplier status check failed", {
          orderId: order.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async processQueuedOrders() {
    if (!this.promotionOrderRepository || !this.trackingRepository) {
      return;
    }

    const queuedOrders = await this.promotionOrderRepository.listQueuedOrders();
    const submittedOrders = await this.promotionOrderRepository.listSubmittedOrders();
    const busyStreamers = new Set(submittedOrders.map((order) => order.streamer_id).filter(Boolean));

    for (const order of queuedOrders) {
      if (!order.streamer_id || order.target_type !== "live") {
        continue;
      }

      if (busyStreamers.has(order.streamer_id)) {
        continue;
      }

      const streamerState = await this.trackingRepository.getStreamerLiveState(order.streamer_id);
      if (!streamerState?.is_live) {
        continue;
      }

      const liveSession = await this.trackingRepository.getLatestLiveSession(order.streamer_id);
      await this.submitQueuedOrder(order, liveSession?.id ?? null);
      busyStreamers.add(order.streamer_id);
    }
  }

  private async submitQueuedOrder(order: PromotionOrderRow, submittedStreamSessionId: string | null) {
    if (!this.promotionOrderRepository) {
      return;
    }

    const response = await this.request<{ order: number }>({
      action: "add",
      service: String(order.service_id),
      link: order.target_link,
      quantity: String(order.quantity),
      currency: order.currency,
    });

    await this.promotionOrderRepository.markSubmitted(order.id, response.order, response as Record<string, unknown>, submittedStreamSessionId);
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