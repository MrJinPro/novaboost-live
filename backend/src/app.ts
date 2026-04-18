import { hasSupabaseAdminCredentials, loadEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { createSupabaseAdminClient } from "./lib/supabase-admin.js";
import { startHttpServer } from "./modules/api/http-server.js";
import { NotificationService } from "./modules/notifications/notification-service.js";
import { PRMotionService } from "./modules/prmotion/prmotion-service.js";
import { PromotionOrderRepository } from "./repositories/promotion-order-repository.js";
import { ScoringService } from "./modules/scoring/scoring-service.js";
import { createTrackingAdapter } from "./modules/tracking/tracking-adapter.js";
import { TrackingLiveEventBridge } from "./modules/tracking/live-event-bridge.js";
import { createLiveStorage } from "./storage/create-live-storage.js";
import { TelegramService } from "./modules/telegram/telegram-service.js";
import { TrackingService } from "./modules/tracking/tracking-service.js";
import { NotificationRoutingRepository } from "./repositories/notification-routing-repository.js";

export function bootstrapBackend() {
  const env = loadEnv();
  const logger = createLogger();
  const supabaseAdmin = hasSupabaseAdminCredentials(env) ? createSupabaseAdminClient(env) : null;
  const notificationRoutingRepository = supabaseAdmin ? new NotificationRoutingRepository(supabaseAdmin) : undefined;
  const promotionOrderRepository = supabaseAdmin ? new PromotionOrderRepository(supabaseAdmin) : undefined;
  const { trackingStore, engagementStore } = createLiveStorage(env, supabaseAdmin);
  const trackingAdapter = createTrackingAdapter(logger, env);

  const tracking = new TrackingService(logger, env, trackingAdapter, trackingStore);
  const scoring = new ScoringService();
  const telegram = new TelegramService(logger);
  const notifications = new NotificationService(logger, telegram, notificationRoutingRepository);
  const prmotion = new PRMotionService(env, logger, promotionOrderRepository, trackingStore);

  if (trackingStore && engagementStore) {
    tracking.attachLiveEventBridge(new TrackingLiveEventBridge({
      logger,
      trackingRepository: trackingStore,
      engagementRepository: engagementStore,
      scoringService: scoring,
      requestTimeoutMs: env.TIKTOK_REQUEST_TIMEOUT_MS,
    }));
  }

  if (!supabaseAdmin) {
    logger.warn("Backend started without Supabase admin credentials. Data-backed backend features are disabled.");
  }

  const { server, trackingSocketHub } = startHttpServer(env, logger, {
    tracking,
    scoring,
    notifications,
    telegram,
    prmotion,
  });

  tracking.attachSocketHub(trackingSocketHub);

  tracking.scheduleRegisteredStreamers();
  prmotion.scheduleOrderQueue();

  return { env, logger, server, tracking, scoring, notifications, telegram, prmotion };
}