import { hasSupabaseAdminCredentials, loadEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { createSupabaseAdminClient } from "./lib/supabase-admin.js";
import { startHttpServer } from "./modules/api/http-server.js";
import { NotificationService } from "./modules/notifications/notification-service.js";
import { ScoringService } from "./modules/scoring/scoring-service.js";
import { TelegramService } from "./modules/telegram/telegram-service.js";
import { TrackingService } from "./modules/tracking/tracking-service.js";
import { NotificationRoutingRepository } from "./repositories/notification-routing-repository.js";

export function bootstrapBackend() {
  const env = loadEnv();
  const logger = createLogger();
  const supabaseAdmin = hasSupabaseAdminCredentials(env) ? createSupabaseAdminClient(env) : null;
  const notificationRoutingRepository = supabaseAdmin ? new NotificationRoutingRepository(supabaseAdmin) : undefined;

  const tracking = new TrackingService(logger);
  const scoring = new ScoringService();
  const telegram = new TelegramService(logger);
  const notifications = new NotificationService(logger, telegram, notificationRoutingRepository);

  if (!supabaseAdmin) {
    logger.warn("Backend started without Supabase admin credentials. Data-backed backend features are disabled.");
  }

  const server = startHttpServer(env, logger, {
    tracking,
    scoring,
    notifications,
    telegram,
  });

  tracking.scheduleRegisteredStreamers();

  return { env, logger, server, tracking, scoring, notifications, telegram };
}