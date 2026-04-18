import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import { NotificationService } from "../notifications/notification-service.js";
import { PRMotionService } from "../prmotion/prmotion-service.js";
import { ScoringService } from "../scoring/scoring-service.js";
import { TelegramService } from "../telegram/telegram-service.js";
import { TrackingService } from "../tracking/tracking-service.js";
import { TrackingSocketHub } from "../tracking/tracking-socket-hub.js";

type ServiceBundle = {
  tracking: TrackingService;
  scoring: ScoringService;
  notifications: NotificationService;
  telegram: TelegramService;
  prmotion: PRMotionService;
};

function writeJson(response: ServerResponse<IncomingMessage>, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(body));
}

export function startHttpServer(env: BackendEnv, logger: Logger, services: ServiceBundle) {
  const server = createServer((request, response) => {
    if (request.method === "OPTIONS") {
      writeJson(response, 204, {});
      return;
    }

    if (!request.url) {
      response.writeHead(400).end("Bad request");
      return;
    }

    const url = new URL(request.url, `http://127.0.0.1:${env.BACKEND_PORT}`);

    if (url.pathname === "/health") {
      writeJson(response, 200, {
        service: "novaboost-backend",
        status: "ok",
        env: env.NODE_ENV,
        modules: [
          services.tracking.getHealth(),
          services.scoring.getHealth(),
          services.notifications.getHealth(),
          services.telegram.getHealth(),
          services.prmotion.getHealth(),
        ],
      });
      return;
    }

    if (url.pathname === "/manifest") {
      writeJson(response, 200, {
        api: ["/health", "/manifest", "/tracking/status", "/notifications/stream/:streamerId/preview?trigger=...", "/growth/tiktok/services", "/growth/orders"],
        ws: ["/ws/tracking"],
        capabilities: [
          "tracking scheduler foundation",
          "tracking websocket updates",
          "tiktok live room listeners",
          "viewer rewards and achievements",
          "team progression and unlocks",
          "priority scoring foundation",
          "telegram routing foundation",
          "notification fan-out foundation",
          "tiktok promotion catalog",
        ],
      });
      return;
    }

    if (url.pathname === "/tracking/status") {
      writeJson(response, 200, { tracking: services.tracking.getHealth() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/growth/tiktok/services") {
      void services.prmotion.listTikTokServices().then((catalog) => {
        writeJson(response, 200, { services: catalog });
      }).catch((error: unknown) => {
        logger.error("Failed to load growth TikTok services", {
          error: error instanceof Error ? error.message : String(error),
        });
        writeJson(response, 500, {
          error: "Каталог услуг сейчас недоступен.",
        });
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/growth/orders") {
      let rawBody = "";
      request.on("data", (chunk) => {
        rawBody += chunk.toString();
      });
      request.on("end", () => {
        void (async () => {
          const parsedBody = JSON.parse(rawBody || "{}");
          const result = await services.prmotion.createOrder({
            requesterUserId: typeof parsedBody.requesterUserId === "string" ? parsedBody.requesterUserId : null,
            requesterRole: parsedBody.requesterRole === "streamer" || parsedBody.requesterRole === "admin" ? parsedBody.requesterRole : "viewer",
            streamerId: typeof parsedBody.streamerId === "string" ? parsedBody.streamerId : null,
            serviceId: Number(parsedBody.serviceId),
            link: String(parsedBody.link ?? "").trim(),
            quantity: Number(parsedBody.quantity),
            currency: parsedBody.currency === "USD" ? "USD" : "RUB",
          });
          writeJson(response, 200, result);
        })().catch((error: unknown) => {
          logger.error("Failed to create growth order", {
            error: error instanceof Error ? error.message : String(error),
          });
          writeJson(response, 500, {
            error: error instanceof Error ? error.message : "Не удалось оформить заказ услуги.",
          });
        });
      });
      return;
    }

    const previewMatch = url.pathname.match(/^\/notifications\/stream\/([^/]+)\/preview$/);
    if (previewMatch) {
      const streamerId = previewMatch[1];
      const trigger = url.searchParams.get("trigger") as "live_started" | "boost_needed" | "post_published" | null;

      if (!trigger) {
        writeJson(response, 400, { error: "Query param 'trigger' is required." });
        return;
      }

      void services.notifications.previewStreamPlan({ streamerId, trigger }).then((plan) => {
        writeJson(response, 200, plan);
      }).catch((error: unknown) => {
        logger.error("Failed to build notification preview", {
          streamerId,
          trigger,
          error: error instanceof Error ? error.message : String(error),
        });
        writeJson(response, 500, {
          error: error instanceof Error ? error.message : "Failed to build notification preview.",
        });
      });
      return;
    }

    writeJson(response, 404, { error: "Not found" });
  });

  const trackingSocketHub = new TrackingSocketHub(server, logger);

  server.listen(env.BACKEND_PORT, () => {
    logger.info("NovaBoost backend listening", { port: env.BACKEND_PORT });
  });

  return { server, trackingSocketHub };
}