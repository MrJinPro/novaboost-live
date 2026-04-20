import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NotificationService } from "../notifications/notification-service.js";
import { PRMotionService } from "../prmotion/prmotion-service.js";
import { ScoringService } from "../scoring/scoring-service.js";
import { TelegramService } from "../telegram/telegram-service.js";
import { lookupTikTokProfile } from "../tiktok/tiktok-profile-service.js";
import { TrackingService } from "../tracking/tracking-service.js";
import { TrackingEventProcessor } from "../tracking/tracking-event-processor.js";
import { TrackingSocketHub } from "../tracking/tracking-socket-hub.js";
import { handleMediaUploadRequest, tryServeMediaRequest } from "./media-storage.js";

type ServiceBundle = {
  tracking: TrackingService;
  trackingProcessor?: TrackingEventProcessor | null;
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
    "access-control-allow-headers": "content-type,authorization",
  });
  response.end(JSON.stringify(body));
}

export function startHttpServer(env: BackendEnv, logger: Logger, services: ServiceBundle, supabaseAdmin: SupabaseClient | null) {
  const server = createServer((request, response) => {
    void (async () => {
      if (await tryServeMediaRequest(request, response, env)) {
        return;
      }

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
            services.trackingProcessor?.getHealth() ?? null,
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
          api: ["/health", "/manifest", "/tracking/status", "/tracking/diagnostics", "/tracking/live?username=...", "/tracking/stream/:streamerId", "/tiktok/profile?username=...", "/notifications/stream/:streamerId/preview?trigger=...", "/growth/tiktok/services", "/growth/orders", "/media/upload?kind=...", "/media/*"],
          ws: ["/ws/tracking"],
          capabilities: [
            "tracking scheduler foundation",
            "tracking websocket updates",
            "tiktok live room listeners",
            "tiktok profile lookup by username",
            "viewer rewards and achievements",
            "team progression and unlocks",
            "priority scoring foundation",
            "telegram routing foundation",
            "notification fan-out foundation",
            "tiktok promotion catalog",
            "local media uploads with per-user folders",
          ],
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/media/upload") {
        await handleMediaUploadRequest(request, response, url, env, logger, supabaseAdmin);
        return;
      }

      if (url.pathname === "/tracking/status") {
        writeJson(response, 200, { tracking: services.tracking.getHealth() });
        return;
      }

      if (url.pathname === "/tracking/diagnostics") {
        writeJson(response, 200, { tracking: services.tracking.getDiagnostics() });
        return;
      }

      if (request.method === "GET" && url.pathname === "/tracking/live") {
        const usernames = url.searchParams
          .getAll("username")
          .flatMap((value) => value.split(","))
          .map((value) => value.trim())
          .filter(Boolean);

        if (usernames.length === 0) {
          writeJson(response, 400, { error: "Query param 'username' is required." });
          return;
        }

        void services.tracking.resolveLiveStatuses(usernames).then((statuses) => {
          writeJson(response, 200, { statuses });
        }).catch((error: unknown) => {
          logger.error("Failed to resolve live statuses", {
            usernames,
            error: error instanceof Error ? error.message : String(error),
          });
          writeJson(response, 500, {
            error: error instanceof Error ? error.message : "Не удалось проверить live-статус.",
          });
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/tiktok/profile") {
        const username = url.searchParams.get("username")?.trim() ?? "";

        if (!username) {
          writeJson(response, 400, { error: "Query param 'username' is required." });
          return;
        }

        void lookupTikTokProfile(username, {
          requestTimeoutMs: env.TIKTOK_REQUEST_TIMEOUT_MS,
          sessionId: env.TIKTOK_SESSION_ID,
          msToken: env.TIKTOK_MS_TOKEN,
          cookieHeader: env.TIKTOK_COOKIE_HEADER,
        }).then((profile) => {
          writeJson(response, 200, { profile });
        }).catch((error: unknown) => {
          logger.error("Failed to resolve TikTok profile", {
            username,
            error: error instanceof Error ? error.message : String(error),
          });
          writeJson(response, 502, {
            error: error instanceof Error ? error.message : "Не удалось получить профиль TikTok.",
          });
        });
        return;
      }

      const trackingStreamMatch = request.method === "GET"
        ? url.pathname.match(/^\/tracking\/stream\/([^/]+)$/)
        : null;
      if (trackingStreamMatch) {
        const streamerId = trackingStreamMatch[1];

        void services.tracking.getStreamerLiveDetails(streamerId).then((details) => {
          writeJson(response, 200, { details });
        }).catch((error: unknown) => {
          logger.error("Failed to load streamer tracking details", {
            streamerId,
            error: error instanceof Error ? error.message : String(error),
          });
          writeJson(response, 500, {
            error: error instanceof Error ? error.message : "Не удалось загрузить live-метрики стримера.",
          });
        });
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
              currency: parsedBody.currency === "RUB" ? "RUB" : "USD",
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
    })().catch((error: unknown) => {
      logger.error("Unhandled backend request error", {
        path: request.url,
        error: error instanceof Error ? error.message : String(error),
      });
      writeJson(response, 500, { error: "Internal server error" });
    });
  });

  const trackingSocketHub = new TrackingSocketHub(server, logger);

  server.listen(env.BACKEND_PORT, () => {
    logger.info("NovaBoost backend listening", { port: env.BACKEND_PORT });
  });

  return { server, trackingSocketHub };
}