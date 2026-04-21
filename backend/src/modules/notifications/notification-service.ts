import type { NotificationPlan, NotificationPlanDestination, StreamRoutingIntent } from "../../domain/events.js";
import type { Logger } from "../../lib/logger.js";
import { NotificationRoutingRepository } from "../../repositories/notification-routing-repository.js";
import { TelegramService } from "../telegram/telegram-service.js";

export class NotificationService {
  constructor(
    private readonly logger: Logger,
    private readonly telegramService: TelegramService,
    private readonly routingRepository?: NotificationRoutingRepository,
  ) {}

  getHealth() {
    return {
      service: "notifications",
      status: this.routingRepository ? "connected" : "planned",
      channels: ["in_app", "telegram", "web_push"],
    };
  }

  async previewStreamPlan(intent: StreamRoutingIntent): Promise<NotificationPlan> {
    if (!this.routingRepository) {
      return {
        streamer: null,
        trigger: intent.trigger,
        destinations: [],
        warnings: ["Supabase service-role is not configured for backend notification planning."],
      };
    }

    const streamer = await this.routingRepository.getStreamerSummary(intent.streamerId);

    if (!streamer) {
      return {
        streamer: null,
        trigger: intent.trigger,
        destinations: [],
        warnings: ["Streamer not found."],
      };
    }

    const [platformRoutes, streamerRoutes, dmRoute, subscriberRecipients] = await Promise.all([
      this.routingRepository.getPlatformRoutes(),
      this.routingRepository.getStreamerChatRoutes(intent.streamerId),
      this.routingRepository.getSubscriberDmRoute(intent.streamerId),
      this.routingRepository.getSubscriberTelegramRecipients(intent.streamerId),
    ]);

    const destinations: NotificationPlanDestination[] = [
      ...platformRoutes
        .filter((route) => this.matchesTrigger(route, intent.trigger) && route.telegram_chats)
        .map((route) => ({
          kind: "platform_chat" as const,
          routeId: route.id,
          chatId: route.telegram_chats!.id,
          externalChatId: String(route.telegram_chats!.chat_id),
          title: route.telegram_chats!.title,
          username: route.telegram_chats!.username,
        })),
      ...streamerRoutes
        .filter((route) => this.matchesTrigger(route, intent.trigger) && route.telegram_chats)
        .map((route) => ({
          kind: "streamer_chat" as const,
          routeId: route.id,
          chatId: route.telegram_chats!.id,
          externalChatId: String(route.telegram_chats!.chat_id),
          title: route.telegram_chats!.title,
          username: route.telegram_chats!.username,
        })),
    ];

    if (dmRoute && this.matchesTrigger(dmRoute, intent.trigger)) {
      destinations.push(
        ...subscriberRecipients.map((recipient) => ({
          kind: "subscriber_dm" as const,
          routeId: dmRoute.id,
          userId: recipient.user_id,
          telegramUserId: String(recipient.telegram_user_id),
          telegramUsername: recipient.telegram_username,
        })),
      );
    }

    return {
      streamer: {
        id: streamer.id,
        displayName: streamer.display_name,
        tiktokUsername: streamer.tiktok_username,
      },
      trigger: intent.trigger,
      destinations,
      warnings: destinations.length === 0 ? ["No enabled Telegram routes matched this trigger."] : [],
    };
  }

  fanOutStreamIntent(intent: StreamRoutingIntent) {
    this.logger.info("Notification fan-out started", {
      streamerId: intent.streamerId,
      trigger: intent.trigger,
    });

    // Resolve the plan then route — don't block the caller
    this.previewStreamPlan(intent)
      .then((plan) => this.telegramService.routeStreamNotification(intent, plan))
      .catch((err) =>
        this.logger.error("Notification fan-out failed", { streamerId: intent.streamerId, error: String(err) })
      );
  }

  private matchesTrigger(
    route: {
      notify_on_live_start: boolean;
      notify_on_live_end: boolean;
      notify_on_post: boolean;
      notify_on_boost: boolean;
      notify_on_raid: boolean;
    },
    trigger: StreamRoutingIntent["trigger"],
  ) {
    if (trigger === "live_started") {
      return route.notify_on_live_start;
    }

    if (trigger === "post_published") {
      return route.notify_on_post;
    }

    return route.notify_on_boost;
  }
}