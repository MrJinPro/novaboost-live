import { createServer } from "node:http";
import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import { NotificationService } from "../notifications/notification-service.js";
import { ScoringService } from "../scoring/scoring-service.js";
import { TelegramService } from "../telegram/telegram-service.js";
import { TrackingService } from "../tracking/tracking-service.js";

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

    if (request.url === "/health") {
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

    if (request.url === "/manifest") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        api: ["/health", "/manifest"],
        capabilities: [
          "tracking scheduler foundation",
          "priority scoring foundation",
          "telegram routing foundation",
          "notification fan-out foundation",
        ],
      }));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(env.BACKEND_PORT, () => {
    logger.info("NovaBoost backend listening", { port: env.BACKEND_PORT });
  });

  return server;
}