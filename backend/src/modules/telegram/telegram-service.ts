import type { ModerationIntent, StreamRoutingIntent } from "../../domain/events.js";
import type { Logger } from "../../lib/logger.js";

export class TelegramService {
  constructor(private readonly logger: Logger) {}

  getHealth() {
    return {
      service: "telegram",
      status: "planned",
      capabilities: [
        "streamer group/channel notifications",
        "platform group notifications",
        "subscriber direct messages",
        "group moderation actions",
      ],
    };
  }

  routeStreamNotification(intent: StreamRoutingIntent) {
    this.logger.info("Telegram routing intent accepted", intent);
  }

  applyModeration(intent: ModerationIntent) {
    this.logger.warn("Telegram moderation intent accepted", intent);
  }
}