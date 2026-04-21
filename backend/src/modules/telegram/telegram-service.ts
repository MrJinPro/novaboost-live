import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModerationIntent, NotificationPlan, StreamRoutingIntent } from "../../domain/events.js";
import type { Logger } from "../../lib/logger.js";
import { TelegramBotHandler } from "./telegram-bot-handler.js";
import { TelegramSender, type TgUpdate } from "./telegram-sender.js";

export class TelegramService {
  private sender: TelegramSender | null = null;
  private botHandler: TelegramBotHandler | null = null;
  private polling = false;
  private pollOffset = 0;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly supabase?: SupabaseClient | null,
    private readonly botToken?: string | null,
    private readonly adminTelegramIds: number[] = [],
  ) {
    if (botToken && supabase) {
      this.sender = new TelegramSender(botToken, logger);
      this.botHandler = new TelegramBotHandler(this.sender, supabase, logger, adminTelegramIds);
    }
  }

  // ── Health ──────────────────────────────────────────────────────────────

  getHealth() {
    return {
      service: "telegram",
      status: this.sender ? (this.polling ? "polling" : "ready") : "disabled",
      capabilities: [
        "streamer group/channel notifications",
        "platform group notifications",
        "subscriber direct messages",
        "group moderation actions",
        "channel post sync",
        "multi-chat connect tokens",
      ],
    };
  }

  // ── Long polling ────────────────────────────────────────────────────────

  async startPolling() {
    if (!this.sender || !this.botHandler) {
      this.logger.info("[TelegramService] Bot token or Supabase not configured — polling disabled");
      return;
    }

    const me = await this.sender.getMe();
    if (!me) {
      this.logger.error("[TelegramService] Failed to get bot info — check TELEGRAM_BOT_TOKEN");
      return;
    }

    this.botHandler.setBotId(me.id);
    this.logger.info("[TelegramService] Bot identified", { id: me.id, username: me.username });

    // Remove any webhook that might be set
    await this.sender.deleteWebhook();

    this.polling = true;
    this.schedulePoll();
    this.logger.info("[TelegramService] Long polling started");
  }

  stopPolling() {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private schedulePoll() {
    if (!this.polling) return;
    this.pollTimer = setTimeout(() => this.doPoll(), 0);
  }

  private async doPoll() {
    if (!this.polling || !this.sender || !this.botHandler) return;

    try {
      const updates: TgUpdate[] = await this.sender.getUpdates(this.pollOffset || undefined);
      for (const update of updates) {
        this.pollOffset = update.update_id + 1;
        // Process each update without blocking the poll loop
        this.botHandler.handleUpdate(update).catch((err) =>
          this.logger.error("[TelegramService] Update error", { error: String(err) })
        );
      }
    } catch (err) {
      this.logger.warn("[TelegramService] Poll error", { error: String(err) });
    }

    // Schedule next poll — small gap between polls
    if (this.polling) {
      this.pollTimer = setTimeout(() => this.doPoll(), 1000);
    }
  }

  // ── Webhook mode (production) ────────────────────────────────────────────

  async processWebhookUpdate(update: TgUpdate): Promise<void> {
    if (!this.botHandler) return;
    await this.botHandler.handleUpdate(update);
  }

  async setWebhook(webhookUrl: string, secretToken?: string): Promise<boolean> {
    if (!this.sender) return false;
    const ok = await this.sender.setWebhook(webhookUrl, secretToken);
    if (ok) {
      this.logger.info("[TelegramService] Webhook set", { url: webhookUrl });
    }
    return ok;
  }

  // ── Notification routing ─────────────────────────────────────────────────

  async routeStreamNotification(intent: StreamRoutingIntent, plan?: NotificationPlan) {
    if (!this.sender) {
      this.logger.info("[TelegramService] Routing intent accepted (no-op, bot disabled)", intent);
      return;
    }

    if (!plan) {
      this.logger.info("[TelegramService] routeStreamNotification called without plan", intent);
      return;
    }

    if (!plan.streamer) {
      this.logger.warn("[TelegramService] No streamer in notification plan", intent);
      return;
    }

    const { streamer, trigger, destinations } = plan;
    if (!destinations.length) {
      this.logger.info("[TelegramService] No destinations for notification", { streamerId: intent.streamerId, trigger });
      return;
    }

    const message = this.buildLiveNotificationMessage(streamer, trigger, intent.liveTitle);

    // Deduplicate per live session if tracking session id is available
    for (const dest of destinations) {
      try {
        if (dest.kind === "subscriber_dm") {
          await this.sender.sendMessage(Number(dest.telegramUserId), message.text, {
            parseMode: "HTML",
            replyMarkup: message.keyboard,
            disableWebPagePreview: false,
          });
        } else {
          await this.sender.sendMessage(Number(dest.externalChatId), message.text, {
            parseMode: "HTML",
            replyMarkup: message.keyboard,
            disableWebPagePreview: false,
          });
        }
      } catch (err) {
        this.logger.warn("[TelegramService] Failed to send to destination", {
          kind: dest.kind,
          error: String(err),
        });
      }
    }

    this.logger.info("[TelegramService] Notifications sent", {
      streamerId: intent.streamerId,
      trigger,
      count: destinations.length,
    });
  }

  private buildLiveNotificationMessage(
    streamer: { id: string; displayName: string; tiktokUsername: string },
    trigger: StreamRoutingIntent["trigger"],
    liveTitle?: string,
  ) {
    if (trigger === "live_started") {
      const title = liveTitle ? `\n🎯 <i>${liveTitle}</i>` : "";
      const tiktokUrl = `https://www.tiktok.com/@${streamer.tiktokUsername}/live`;
      return {
        text:
          `🔴 <b>${streamer.displayName}</b> вышел в эфир!${title}\n\n` +
          `Смотри прямо сейчас на TikTok и поддержи стримера буст-очками в NovaBoost Live!`,
        keyboard: {
          inline_keyboard: [
            [
              { text: "📺 Смотреть на TikTok", url: tiktokUrl },
              { text: "⚡ Задания NovaBoost", url: `https://novaboost.cloud/boost?streamer=${streamer.tiktokUsername}` },
            ],
          ],
        },
      };
    }

    if (trigger === "boost_needed") {
      return {
        text:
          `⚡ <b>${streamer.displayName}</b> ищет поддержку!\n\n` +
          `Выполняй задания в NovaBoost Live и помогай стримеру расти!`,
        keyboard: {
          inline_keyboard: [[{ text: "⚡ Поддержать", url: `https://novaboost.cloud/boost?streamer=${streamer.tiktokUsername}` }]],
        },
      };
    }

    return {
      text: `📢 Новости от <b>${streamer.displayName}</b>!`,
      keyboard: undefined,
    };
  }

  // ── Moderation ───────────────────────────────────────────────────────────

  async applyModeration(intent: ModerationIntent) {
    if (!this.sender) {
      this.logger.warn("[TelegramService] Moderation intent (no-op, bot disabled)", intent);
      return;
    }

    const chatId = Number(intent.chatId);
    const userId = Number(intent.telegramUserId);

    if (intent.action === "ban") {
      await this.sender.banChatMember(chatId, userId);
    } else if (intent.action === "mute") {
      const until = Math.floor(Date.now() / 1000) + 3600;
      await this.sender.restrictChatMember(chatId, userId, until);
    } else if (intent.action === "warn") {
      await this.sender.sendMessage(chatId, `⚠️ Предупреждение пользователю: ${intent.reason}`);
    }

    this.logger.info("[TelegramService] Moderation applied", intent);
  }
}