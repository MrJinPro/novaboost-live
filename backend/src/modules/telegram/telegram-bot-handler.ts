// Telegram bot update handler — multi-chat, multi-streamer
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "../../lib/logger.js";
import type { TelegramSender, TgMessage, TgUpdate } from "./telegram-sender.js";

const WHITELIST_IDS = new Set<number>([777000]); // Telegram service account

// ── Flood detector (in-memory per process) ──────────────────────────────────
class FloodDetector {
  private map = new Map<number, number[]>();

  check(userId: number, limitPerPeriod: number, periodSeconds: number): boolean {
    const now = Date.now();
    const ts = (this.map.get(userId) ?? []).filter((t) => now - t < periodSeconds * 1000);
    ts.push(now);
    this.map.set(userId, ts);
    return ts.length > limitPerPeriod;
  }
}

const floodDetector = new FloodDetector();

// ── Main handler ─────────────────────────────────────────────────────────────
export class TelegramBotHandler {
  private botId: number | null = null;

  constructor(
    private readonly sender: TelegramSender,
    private readonly supabase: SupabaseClient,
    private readonly logger: Logger,
    private readonly adminTelegramIds: number[] = [],
  ) {}

  setBotId(id: number) {
    this.botId = id;
    WHITELIST_IDS.add(id);
    for (const adminId of this.adminTelegramIds) WHITELIST_IDS.add(adminId);
  }

  async handleUpdate(update: TgUpdate): Promise<void> {
    try {
      // Bot added/removed from a chat
      if (update.my_chat_member) {
        await this.handleMyChatMember(update.my_chat_member);
        return;
      }

      // Channel post (content sync)
      if (update.channel_post) {
        await this.handleChannelPost(update.channel_post);
        return;
      }

      if (!update.message) return;
      const msg = update.message;

      // New members joined (track in telegram_chat_members)
      if (msg.new_chat_members?.length) {
        await this.handleNewMembers(msg);
        return;
      }

      const chatType = msg.chat.type;
      const text = msg.text ?? "";
      const userId = msg.from?.id;
      if (!userId) return;

      // Skip whitelist
      if (WHITELIST_IDS.has(userId)) return;

      // DM — commands
      if (chatType === "private") {
        await this.handleDmMessage(msg, text);
        return;
      }

      // Group / supergroup — commands + moderation
      if (chatType === "group" || chatType === "supergroup") {
        if (text.startsWith("/")) {
          await this.handleGroupCommand(msg, text);
          return;
        }
        await this.handleGroupModeration(msg, text, userId);
      }
    } catch (err) {
      this.logger.error("[TelegramBot] handleUpdate error", { error: String(err) });
    }
  }

  // ── DM messages ──────────────────────────────────────────────────────────

  private async handleDmMessage(msg: TgMessage, text: string) {
    const userId = msg.from!.id;
    const chatId = msg.chat.id;

    if (text.startsWith("/start")) {
      const param = text.split(" ")[1];
      if (param?.startsWith("link_")) {
        // Streamer linking their account
        await this.handleLinkToken(chatId, userId, msg.from!, param.slice(5));
      } else {
        await this.sendDmWelcome(chatId, msg.from!.first_name);
      }
      return;
    }

    if (text === "/subscribe" || text.startsWith("/subscribe ")) {
      await this.handleSubscribeCommand(chatId, userId, text);
      return;
    }

    if (text === "/unsubscribe" || text.startsWith("/unsubscribe ")) {
      await this.handleUnsubscribeCommand(chatId, userId, text);
      return;
    }

    if (text === "/mysubs" || text === "/list") {
      await this.handleMySubscriptions(chatId, userId);
      return;
    }

    if (text === "/connect") {
      await this.sender.sendMessage(chatId,
        "🔗 Чтобы подключить канал, сгенерируй токен в <b>Studio → Telegram</b> и отправь команду\n\n<code>/link ТОКЕН</code>\n\nот имени администратора в своём канале.");
      return;
    }

    if (text.startsWith("/link ")) {
      const token = text.split(" ")[1]?.trim();
      if (token) await this.handleLinkToken(chatId, userId, msg.from!, token);
      return;
    }
  }

  private async sendDmWelcome(chatId: number, firstName: string) {
    await this.sender.sendMessage(chatId,
      `👋 Привет, <b>${firstName}</b>!\n\n` +
      `Я <b>@novaboost_live_bot</b> — официальный бот платформы NovaBoost Live.\n` +
      `Уведомляю зрителей о начале эфиров и помогаю стримерам управлять их Telegram-каналами.\n\n` +
      `<b>Команды для зрителей:</b>\n` +
      `/subscribe — подписаться на стримера (получать уведомления о эфирах)\n` +
      `/unsubscribe — отписаться\n` +
      `/mysubs — мои подписки\n\n` +
      `<b>Для стримеров:</b>\n` +
      `Чтобы подключить свой Telegram-канал к NovaBoost:\n` +
      `1. Добавь меня как администратора канала с правом публикации\n` +
      `2. Зайди на <a href="https://live.novaboost.cloud/studio">live.novaboost.cloud/studio</a> → Telegram\n` +
      `3. Нажми «Создать токен» и отправь команду /link в своём канале`);
  }

  // ── Subscribe / unsubscribe ───────────────────────────────────────────────

  private async handleSubscribeCommand(chatId: number, telegramUserId: number, text: string) {
    // Lookup streamers with public profiles
    const { data: streamers } = await this.supabase
      .from("streamers")
      .select("id, display_name, tiktok_username")
      .eq("is_active", true)
      .order("display_name")
      .limit(20);

    if (!streamers?.length) {
      await this.sender.sendMessage(chatId, "Пока нет активных стримеров в NovaBoost Live.");
      return;
    }

    const lines = streamers.map((s, i) => `${i + 1}. <b>${s.display_name}</b> (@${s.tiktok_username})`).join("\n");

    await this.sender.sendMessage(chatId,
      `📋 <b>Стримеры NovaBoost Live:</b>\n\n${lines}\n\n` +
      `Чтобы подписаться, отправь:\n<code>/subscribe @tiktok_username</code>`, { parseMode: "HTML" });

    // Handle /subscribe @username directly
    const parts = text.trim().split(/\s+/);
    if (parts.length >= 2) {
      const handle = parts[1].replace(/^@/, "").toLowerCase();
      const streamer = streamers.find((s) => s.tiktok_username.toLowerCase() === handle);
      if (streamer) {
        await this.subscribeUserToStreamer(chatId, telegramUserId, streamer);
      }
    }
  }

  private async subscribeUserToStreamer(chatId: number, telegramUserId: number, streamer: { id: string; display_name: string; tiktok_username: string }) {
    // Check if user has linked their NovaBoost account
    const { data: link } = await this.supabase
      .from("telegram_links")
      .select("user_id")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (!link) {
      await this.sender.sendMessage(chatId,
        `Чтобы подписаться, сначала свяжи свой аккаунт NovaBoost.\n\nОткрой: <a href="https://live.novaboost.cloud/profile">live.novaboost.cloud/profile</a> → Настройки → Telegram`);
      return;
    }

    // Upsert subscription
    const { error } = await this.supabase
      .from("streamer_subscriptions")
      .upsert({
        user_id: link.user_id,
        streamer_id: streamer.id,
        notification_enabled: true,
        telegram_enabled: true,
      }, { onConflict: "user_id,streamer_id" });

    if (error) {
      this.logger.error("[TelegramBot] subscribe error", { error: error.message });
      await this.sender.sendMessage(chatId, "❌ Не удалось оформить подписку. Попробуй позже.");
      return;
    }

    await this.sender.sendMessage(chatId,
      `✅ Ты подписан на уведомления о стримах <b>${streamer.display_name}</b>!\n` +
      `Получишь сообщение в личку когда стример выйдет в эфир.`);
  }

  private async handleUnsubscribeCommand(chatId: number, telegramUserId: number, text: string) {
    const { data: link } = await this.supabase
      .from("telegram_links")
      .select("user_id")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (!link) {
      await this.sender.sendMessage(chatId, "Нет связанного аккаунта NovaBoost.");
      return;
    }

    const parts = text.trim().split(/\s+/);
    if (parts.length >= 2) {
      const handle = parts[1].replace(/^@/, "").toLowerCase();
      const { data: streamer } = await this.supabase
        .from("streamers")
        .select("id, display_name")
        .ilike("tiktok_username", handle)
        .maybeSingle();

      if (!streamer) {
        await this.sender.sendMessage(chatId, `Стример @${handle} не найден.`);
        return;
      }

      await this.supabase
        .from("streamer_subscriptions")
        .update({ telegram_enabled: false })
        .eq("user_id", link.user_id)
        .eq("streamer_id", streamer.id);

      await this.sender.sendMessage(chatId, `Отписка от уведомлений <b>${streamer.display_name}</b> оформлена.`);
      return;
    }

    // Unsubscribe all
    await this.supabase
      .from("streamer_subscriptions")
      .update({ telegram_enabled: false })
      .eq("user_id", link.user_id);

    await this.sender.sendMessage(chatId, "Ты отписан от всех Telegram-уведомлений NovaBoost.");
  }

  private async handleMySubscriptions(chatId: number, telegramUserId: number) {
    const { data: link } = await this.supabase
      .from("telegram_links")
      .select("user_id")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (!link) {
      await this.sender.sendMessage(chatId, "Нет связанного аккаунта NovaBoost. Сначала свяжи аккаунт на live.novaboost.cloud/profile");
      return;
    }

    const { data: subs } = await this.supabase
      .from("streamer_subscriptions")
      .select("streamer_id, telegram_enabled, streamers(display_name, tiktok_username)")
      .eq("user_id", link.user_id)
      .eq("notification_enabled", true);

    if (!subs?.length) {
      await this.sender.sendMessage(chatId,
        "У тебя нет активных подписок. Используй /subscribe чтобы подписаться на стримеров.");
      return;
    }

    const lines = subs.map((s) => {
      const st = (s as unknown as { streamers: { display_name: string; tiktok_username: string } }).streamers;
      const tg = (s as { telegram_enabled: boolean }).telegram_enabled ? "🔔" : "🔕";
      return `${tg} <b>${st.display_name}</b> (@${st.tiktok_username})`;
    }).join("\n");

    await this.sender.sendMessage(chatId, `📋 <b>Твои подписки:</b>\n\n${lines}`);
  }

  // ── Link token (connect channel to streamer) ──────────────────────────────

  private async handleLinkToken(chatId: number, userId: number, user: { id: number; username?: string; first_name: string }, token: string) {
    const { data: tokenRow } = await this.supabase
      .from("telegram_bot_connect_tokens")
      .select("id, streamer_id, chat_kind, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (!tokenRow) {
      await this.sender.sendMessage(chatId, "❌ Токен не найден.");
      return;
    }
    if (tokenRow.used_at) {
      await this.sender.sendMessage(chatId, "❌ Токен уже использован.");
      return;
    }
    if (new Date(tokenRow.expires_at) < new Date()) {
      await this.sender.sendMessage(chatId, "❌ Токен истёк. Создай новый в Studio → Telegram.");
      return;
    }

    const chat = await this.getOrCreateTelegramChat(chatId, tokenRow.streamer_id, tokenRow.chat_kind);
    if (!chat) {
      await this.sender.sendMessage(chatId, "❌ Не удалось зарегистрировать чат. Попробуй позже.");
      return;
    }

    // Ensure notification route exists — explicit insert/update to avoid partial-index upsert issues
    const { data: existingRoute } = await this.supabase
      .from("telegram_notification_routes")
      .select("id")
      .eq("telegram_chat_id", chat.id)
      .eq("route_type", "streamer_chat")
      .maybeSingle();

    if (existingRoute) {
      const { error: routeUpdateErr } = await this.supabase
        .from("telegram_notification_routes")
        .update({
          streamer_id: tokenRow.streamer_id,
          enabled: true,
          notify_on_live_start: true,
          notify_on_boost: true,
        })
        .eq("id", existingRoute.id);
      if (routeUpdateErr) {
        this.logger.error("[TelegramBot] Failed to update notification route", { error: routeUpdateErr.message });
      }
    } else {
      const { error: routeInsertErr } = await this.supabase
        .from("telegram_notification_routes")
        .insert({
          streamer_id: tokenRow.streamer_id,
          telegram_chat_id: chat.id,
          route_type: "streamer_chat",
          enabled: true,
          notify_on_live_start: true,
          notify_on_boost: true,
          notify_on_post: false,
        });
      if (routeInsertErr) {
        this.logger.error("[TelegramBot] Failed to insert notification route", { error: routeInsertErr.message });
        await this.sender.sendMessage(chatId, "❌ Не удалось создать маршрут уведомлений. Попробуй позже.");
        return;
      }
    }

    // Mark token as used
    await this.supabase
      .from("telegram_bot_connect_tokens")
      .update({ used_at: new Date().toISOString(), used_chat_id: chatId })
      .eq("id", tokenRow.id);

    // Also link telegram_user_id to telegram_links if in DM
    if (chatId === userId) {
      await this.supabase
        .from("telegram_links")
        .update({ telegram_user_id: userId, telegram_username: user.username ?? null })
        .eq("user_id", tokenRow.streamer_id);
    }

    // Check if streamer is currently live — send immediate notification if yes
    const liveMessage = await this.buildCurrentLiveMessage(tokenRow.streamer_id);

    await this.sender.sendMessage(chatId,
      `✅ <b>Канал успешно подключён к NovaBoost Live!</b>\n\n` +
      `Теперь бот будет автоматически публиковать уведомления о начале эфира в этот чат.\n\n` +
      `Управляй настройками в <a href="https://live.novaboost.cloud/studio">Studio → Telegram</a>`);

    if (liveMessage) {
      // Streamer is live right now — send notification immediately
      await this.sender.sendMessage(chatId, liveMessage.text, {
        parseMode: "HTML",
        replyMarkup: liveMessage.keyboard,
        disableWebPagePreview: false,
      });
    }

    this.logger.info("[TelegramBot] Channel linked", { chatId, streamerId: tokenRow.streamer_id, sentLiveNow: !!liveMessage });
  }

  // ── Group commands ────────────────────────────────────────────────────────

  private async handleGroupCommand(msg: TgMessage, text: string) {
    const chatId = msg.chat.id;

    if (text.startsWith("/link ")) {
      const token = text.split(" ")[1]?.trim();
      if (token && msg.from) await this.handleLinkToken(chatId, msg.from.id, msg.from, token);
    }
  }

  // ── Group moderation ──────────────────────────────────────────────────────

  private async handleGroupModeration(msg: TgMessage, text: string, userId: number) {
    const chatId = msg.chat.id;

    // Check if this chat has moderation enabled
    const { data: chatRow } = await this.supabase
      .from("telegram_chats")
      .select("id, moderation_enabled, streamer_id")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (!chatRow?.moderation_enabled) return;

    // Load moderation rules
    const { data: rules } = await this.supabase
      .from("telegram_moderation_rules")
      .select("rule_key, action_type, threshold_count, window_seconds, is_enabled")
      .eq("telegram_chat_id", chatRow.id)
      .eq("is_enabled", true);

    if (!rules?.length) return;

    for (const rule of rules) {
      let violated = false;
      let reason = "";

      if (rule.rule_key === "flood") {
        const limit = rule.threshold_count ?? 5;
        const period = rule.window_seconds ?? 10;
        if (floodDetector.check(userId, limit, period)) {
          violated = true;
          reason = `Флуд — более ${limit} сообщений за ${period}с`;
        }
      }

      if (rule.rule_key === "links" && this.hasLinks(text)) {
        violated = true;
        reason = "Запрещённые ссылки";
      }

      if (violated) {
        await this.applyModerationAction(msg, chatRow.id, chatRow.streamer_id, rule.action_type, reason);
        return;
      }
    }
  }

  private hasLinks(text: string): boolean {
    return /(https?:\/\/[^\s]+)|(www\.[^\s]+)|(@[a-zA-Z0-9_]{5,})/i.test(text);
  }

  private async applyModerationAction(
    msg: TgMessage,
    chatRowId: string,
    streamerId: string | null,
    action: string,
    reason: string,
  ) {
    const chatId = msg.chat.id;
    const userId = msg.from!.id;
    const messageId = msg.message_id;

    if (action === "delete_message") {
      await this.sender.deleteMessage(chatId, messageId);
    } else if (action === "ban") {
      await this.sender.deleteMessage(chatId, messageId);
      await this.sender.banChatMember(chatId, userId);
    } else if (action === "mute") {
      const until = Math.floor(Date.now() / 1000) + 3600;
      await this.sender.restrictChatMember(chatId, userId, until);
    }

    // Record incident
    await this.supabase.from("telegram_moderation_incidents").insert({
      telegram_chat_id: chatRowId,
      streamer_id: streamerId,
      telegram_user_id: userId,
      reason,
      severity: action === "ban" ? "severe" : "medium",
      payload: { message_text: msg.text ?? "", message_id: messageId },
    });

    this.logger.info("[TelegramBot] Moderation applied", { chatId, userId, action, reason });
  }

  // ── Bot added/removed ────────────────────────────────────────────────────

  private async handleMyChatMember(update: NonNullable<TgUpdate["my_chat_member"]>) {
    const { chat, new_chat_member, old_chat_member } = update;
    const wasAdded = old_chat_member.status === "left" && ["member", "administrator"].includes(new_chat_member.status);
    const wasRemoved = ["kicked", "left"].includes(new_chat_member.status);

    if (wasAdded) {
      this.logger.info("[TelegramBot] Bot added to chat", { chatId: chat.id, type: chat.type });
      // Bot was added — send welcome instructions
      if (chat.type !== "private") {
        await this.sender.sendMessage(chat.id,
          `👋 Привет! Я <b>@novaboost_live_bot</b> — бот платформы NovaBoost Live.\n\n` +
          `Чтобы подключить этот канал к аккаунту стримера и получить автоматические уведомления о эфирах:\n\n` +
          `1. Зайди на <b><a href="https://live.novaboost.cloud/studio">live.novaboost.cloud/studio</a></b>\n` +
          `2. Нажми «Создать токен для канала»\n` +
          `3. Скопируй команду и отправь её сюда:\n` +
          `<code>/link ВАШ_ТОКЕН</code>`);
      }
    }

    if (wasRemoved && chat.type !== "private") {
      // Disable notifications for this chat
      await this.supabase
        .from("telegram_chats")
        .update({ notifications_enabled: false })
        .eq("chat_id", chat.id);
      this.logger.info("[TelegramBot] Bot removed from chat", { chatId: chat.id });
    }
  }

  // ── Channel posts ─────────────────────────────────────────────────────────

  private async handleChannelPost(msg: TgMessage) {
    const chatId = msg.chat.id;
    const { data: chatRow } = await this.supabase
      .from("telegram_chats")
      .select("id, streamer_id")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (!chatRow?.streamer_id) return;

    // Check if post sync is enabled for this streamer
    const { data: settings } = await this.supabase
      .from("telegram_notification_settings")
      .select("post_sync_enabled")
      .eq("streamer_id", chatRow.streamer_id)
      .maybeSingle();

    if (!settings?.post_sync_enabled) return;

    const messageType = this.detectMessageType(msg);
    const username = msg.chat.username;
    const telegramLink = username ? `https://t.me/${username}/${msg.message_id}` : null;

    await this.supabase
      .from("telegram_channel_posts")
      .upsert({
        streamer_id: chatRow.streamer_id,
        telegram_chat_id: chatRow.id,
        message_id: msg.message_id,
        message_type: messageType,
        text: msg.text ?? null,
        caption: msg.caption ?? null,
        telegram_link: telegramLink,
        posted_at: new Date(msg.date * 1000).toISOString(),
        raw_payload: msg as unknown as Record<string, unknown>,
      }, { onConflict: "telegram_chat_id,message_id" });

    this.logger.info("[TelegramBot] Channel post synced", { chatId, messageId: msg.message_id, type: messageType });
  }

  private detectMessageType(msg: TgMessage): string {
    if (msg.photo) return "photo";
    if (msg.video) return "video";
    if (msg.video_note) return "video_note";
    if (msg.sticker) return "sticker";
    if (msg.document) return "document";
    if (msg.animation) return "animation";
    return "text";
  }

  // ── New members ───────────────────────────────────────────────────────────

  private async handleNewMembers(msg: TgMessage) {
    const chatId = msg.chat.id;
    const { data: chatRow } = await this.supabase
      .from("telegram_chats")
      .select("id")
      .eq("chat_id", chatId)
      .maybeSingle();
    if (!chatRow) return;

    for (const member of msg.new_chat_members ?? []) {
      if (member.is_bot) continue;
      await this.supabase
        .from("telegram_chat_members")
        .upsert({
          telegram_chat_id: chatRow.id,
          telegram_user_id: member.id,
          telegram_username: member.username ?? null,
          display_name: member.first_name,
          member_role: "member",
          status: "active",
          joined_at: new Date(msg.date * 1000).toISOString(),
        }, { onConflict: "telegram_chat_id,telegram_user_id" });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Returns a live notification message if the streamer is currently live, null otherwise */
  private async buildCurrentLiveMessage(streamerId: string) {
    const { data: streamer } = await this.supabase
      .from("streamers")
      .select("id, display_name, tiktok_username")
      .eq("id", streamerId)
      .maybeSingle();

    if (!streamer) return null;

    // Check for active (non-ended) live session
    const { data: session } = await this.supabase
      .from("stream_sessions")
      .select("id, started_at")
      .eq("streamer_id", streamerId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) return null;

    const tiktokUrl = `https://www.tiktok.com/@${streamer.tiktok_username}/live`;
    return {
      text:
        `🔴 <b>${streamer.display_name}</b> сейчас в эфире!\n\n` +
        `Подключился? Лови уведомление — стример уже ведёт трансляцию прямо сейчас!`,
      keyboard: {
        inline_keyboard: [[
          { text: "📺 Смотреть на TikTok", url: tiktokUrl },
          { text: "⚡ Задания NovaBoost", url: `https://live.novaboost.cloud/boost?streamer=${streamer.tiktok_username}` },
        ]],
      },
    };
  }

  private async getOrCreateTelegramChat(chatId: number, streamerId: string, chatKind: string) {
    // Try to get existing
    const { data: existing } = await this.supabase
      .from("telegram_chats")
      .select("id")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (existing) return existing;

    // Create new
    const { data: created, error } = await this.supabase
      .from("telegram_chats")
      .insert({
        streamer_id: streamerId,
        chat_id: chatId,
        chat_kind: chatKind,
        is_primary: true,
        notifications_enabled: true,
        moderation_enabled: chatKind === "streamer_group",
      })
      .select("id")
      .single();

    if (error) {
      this.logger.error("[TelegramBot] Failed to create telegram_chat", { error: error.message });
      return null;
    }
    return created;
  }
}
