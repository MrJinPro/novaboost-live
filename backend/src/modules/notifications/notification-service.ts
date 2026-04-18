import type { StreamRoutingIntent } from "../../domain/events.js";
import type { Logger } from "../../lib/logger.js";
import { TelegramService } from "../telegram/telegram-service.js";

export class NotificationService {
  constructor(
    private readonly logger: Logger,
    private readonly telegramService: TelegramService,
  ) {}

  getHealth() {
    return {
      service: "notifications",
      status: "planned",
      channels: ["in_app", "telegram", "web_push"],
    };
  }

  fanOutStreamIntent(intent: StreamRoutingIntent) {
    this.logger.info("Notification fan-out started", {
      streamerId: intent.streamerId,
      trigger: intent.trigger,
    });

    this.telegramService.routeStreamNotification(intent);
  }
}