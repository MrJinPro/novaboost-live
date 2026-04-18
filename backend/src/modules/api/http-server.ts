import { createServer } from "node:http";
import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import { NotificationService } from "../notifications/notification-service.js";
import { ScoringService } from "../scoring/scoring-service.js";
import { TelegramService } from "../telegram/telegram-service.js";
import { TrackingService } from "../tracking/tracking-service.js";
import { TrackingSocketHub } from "../tracking/tracking-socket-hub.js";

type ServiceBundle = {
  tracking: TrackingService;
  scoring: ScoringService;
  notifications: NotificationService;
  telegram: TelegramService;
};

export function startHttpServer(env: BackendEnv, logger: Logger, services: ServiceBundle) {
  const server = createServer((request, response) => {
    if (!request.url) {
      response.writeHead(400).end("Bad request");
      return;
    }

    const url = new URL(request.url, `http://127.0.0.1:${env.BACKEND_PORT}`);

    if (url.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        service: "novaboost-backend",
        status: "ok",
        env: env.NODE_ENV,
        modules: [
          services.tracking.getHealth(),
          services.scoring.getHealth(),
          services.notifications.getHealth(),
          services.telegram.getHealth(),
        ],
      }));
      return;
    }

    if (url.pathname === "/manifest") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        api: ["/health", "/manifest", "/tracking/status", "/notifications/stream/:streamerId/preview?trigger=..."],
        ws: ["/ws/tracking"],
        capabilities: [
          "tracking scheduler foundation",
          "tracking websocket updates",
          "priority scoring foundation",
          "telegram routing foundation",
          "notification fan-out foundation",
        ],
      }));
      return;
    }

    if (url.pathname === "/tracking/status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ tracking: services.tracking.getHealth() }));
      return;
    }

    const previewMatch = url.pathname.match(/^\/notifications\/stream\/([^/]+)\/preview$/);
    if (previewMatch) {
      const streamerId = previewMatch[1];
      const trigger = url.searchParams.get("trigger") as "live_started" | "boost_needed" | "post_published" | null;

      if (!trigger) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "Query param 'trigger' is required." }));
        return;
      }

      void services.notifications.previewStreamPlan({ streamerId, trigger }).then((plan) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(plan));
      }).catch((error: unknown) => {
        logger.error("Failed to build notification preview", {
          streamerId,
          trigger,
          error: error instanceof Error ? error.message : String(error),
        });
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({
          error: error instanceof Error ? error.message : "Failed to build notification preview.",
        }));
      });
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  });

  const trackingSocketHub = new TrackingSocketHub(server, logger);

  server.listen(env.BACKEND_PORT, () => {
    logger.info("NovaBoost backend listening", { port: env.BACKEND_PORT });
  });

  return { server, trackingSocketHub };
}