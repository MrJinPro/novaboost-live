// Low-level Telegram Bot API sender — no external dependency, pure fetch
import type { Logger } from "../../lib/logger.js";

export type TgSendResult = { ok: boolean; messageId?: number; error?: string };

export interface TgPhoto {
  url: string;
  caption?: string;
  parseMode?: "HTML" | "MarkdownV2";
}

export interface TgInlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface TgSendOptions {
  parseMode?: "HTML" | "MarkdownV2";
  replyMarkup?: { inline_keyboard: TgInlineButton[][] };
  disableWebPagePreview?: boolean;
  disableNotification?: boolean;
}

export class TelegramSender {
  constructor(
    private readonly token: string,
    private readonly logger: Logger,
  ) {}

  private get baseUrl() {
    return `https://api.telegram.org/bot${this.token}`;
  }

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T & { ok: boolean; description?: string }> {
    const res = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json() as Promise<T & { ok: boolean; description?: string }>;
  }

  async sendMessage(chatId: number | string, text: string, opts: TgSendOptions = {}): Promise<TgSendResult> {
    const res = await this.call<{ result?: { message_id: number } }>("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: opts.parseMode ?? "HTML",
      reply_markup: opts.replyMarkup,
      disable_web_page_preview: opts.disableWebPagePreview ?? false,
      disable_notification: opts.disableNotification ?? false,
    });
    if (!res.ok) {
      this.logger.warn("[TelegramSender] sendMessage failed", { chatId, error: res.description });
    }
    return { ok: res.ok, messageId: res.result?.message_id, error: res.description };
  }

  async sendPhoto(chatId: number | string, photo: TgPhoto, opts: TgSendOptions = {}): Promise<TgSendResult> {
    const res = await this.call<{ result?: { message_id: number } }>("sendPhoto", {
      chat_id: chatId,
      photo: photo.url,
      caption: photo.caption,
      parse_mode: photo.parseMode ?? "HTML",
      reply_markup: opts.replyMarkup,
      disable_notification: opts.disableNotification ?? false,
    });
    if (!res.ok) {
      this.logger.warn("[TelegramSender] sendPhoto failed", { chatId, error: res.description });
    }
    return { ok: res.ok, messageId: res.result?.message_id, error: res.description };
  }

  async deleteMessage(chatId: number | string, messageId: number): Promise<boolean> {
    const res = await this.call<Record<string, unknown>>("deleteMessage", { chat_id: chatId, message_id: messageId });
    return res.ok;
  }

  async banChatMember(chatId: number | string, userId: number, untilDate?: number): Promise<boolean> {
    const res = await this.call<Record<string, unknown>>("banChatMember", {
      chat_id: chatId,
      user_id: userId,
      until_date: untilDate ?? 0,
    });
    return res.ok;
  }

  async unbanChatMember(chatId: number | string, userId: number): Promise<boolean> {
    const res = await this.call<Record<string, unknown>>("unbanChatMember", {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: true,
    });
    return res.ok;
  }

  async restrictChatMember(chatId: number | string, userId: number, untilDate: number, permissions: Record<string, boolean> = {}): Promise<boolean> {
    const res = await this.call<Record<string, unknown>>("restrictChatMember", {
      chat_id: chatId,
      user_id: userId,
      until_date: untilDate,
      permissions: {
        can_send_messages: false,
        can_send_audios: false,
        can_send_documents: false,
        can_send_photos: false,
        can_send_videos: false,
        ...permissions,
      },
    });
    return res.ok;
  }

  async getMe(): Promise<{ id: number; username: string; first_name: string } | null> {
    const res = await this.call<{ result?: { id: number; username: string; first_name: string } }>("getMe", {});
    return res.result ?? null;
  }

  async setWebhook(url: string, secretToken?: string): Promise<boolean> {
    const body: Record<string, unknown> = { url };
    if (secretToken) body.secret_token = secretToken;
    const res = await this.call<Record<string, unknown>>("setWebhook", body);
    return res.ok;
  }

  async deleteWebhook(): Promise<boolean> {
    const res = await this.call<Record<string, unknown>>("deleteWebhook", { drop_pending_updates: false });
    return res.ok;
  }

  async getUpdates(offset?: number): Promise<TgUpdate[]> {
    const res = await this.call<{ result?: TgUpdate[] }>("getUpdates", {
      offset,
      timeout: 30,
      limit: 100,
    });
    return res.result ?? [];
  }

  async getChatMember(chatId: number | string, userId: number): Promise<{ status: string } | null> {
    const res = await this.call<{ result?: { status: string } }>("getChatMember", {
      chat_id: chatId,
      user_id: userId,
    });
    return res.result ?? null;
  }

  async getChatAdministrators(chatId: number | string): Promise<Array<{ user: { id: number }; status: string }>> {
    const res = await this.call<{ result?: Array<{ user: { id: number }; status: string }> }>("getChatAdministrators", {
      chat_id: chatId,
    });
    return res.result ?? [];
  }
}

// Minimal Telegram update types
export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  channel_post?: TgMessage;
  my_chat_member?: TgChatMemberUpdated;
};

export type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: unknown[];
  video?: unknown;
  video_note?: unknown;
  sticker?: unknown;
  document?: unknown;
  animation?: unknown;
  new_chat_members?: TgUser[];
  left_chat_member?: TgUser;
  forward_from_chat?: TgChat;
};

export type TgUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

export type TgChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
};

export type TgChatMemberUpdated = {
  chat: TgChat;
  from: TgUser;
  new_chat_member: { user: TgUser; status: string };
  old_chat_member: { user: TgUser; status: string };
};
