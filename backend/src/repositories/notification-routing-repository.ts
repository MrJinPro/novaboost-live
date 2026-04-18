import type { SupabaseClient } from "@supabase/supabase-js";

type StreamerSummaryRow = {
  id: string;
  display_name: string;
  tiktok_username: string;
};

type RouteRow = {
  id: string;
  route_type: "platform_chat" | "streamer_chat" | "subscriber_dm";
  notify_on_live_start: boolean;
  notify_on_live_end: boolean;
  notify_on_post: boolean;
  notify_on_boost: boolean;
  notify_on_raid: boolean;
  telegram_chats: Array<{
    id: string;
    chat_id: number;
    title: string | null;
    username: string | null;
  }> | null;
};

type StreamerSubscriptionRow = {
  user_id: string;
  notification_enabled: boolean;
  telegram_enabled: boolean;
};

type TelegramLinkRow = {
  id: string;
  user_id: string;
  telegram_user_id: number | null;
  telegram_username: string | null;
};

export class NotificationRoutingRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private normalizeRoutes(rows: RouteRow[]) {
    return rows.map((row) => ({
      ...row,
      telegram_chats: Array.isArray(row.telegram_chats) ? row.telegram_chats[0] ?? null : null,
    }));
  }

  async getStreamerSummary(streamerId: string) {
    const { data, error } = await this.supabase
      .from("streamers")
      .select("id, display_name, tiktok_username")
      .eq("id", streamerId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data ?? null) as StreamerSummaryRow | null;
  }

  async getPlatformRoutes() {
    const { data, error } = await this.supabase
      .from("telegram_notification_routes")
      .select("id, route_type, notify_on_live_start, notify_on_live_end, notify_on_post, notify_on_boost, notify_on_raid, telegram_chats:telegram_chat_id(id, chat_id, title, username)")
      .eq("enabled", true)
      .eq("route_type", "platform_chat");

    if (error) {
      throw error;
    }

    return this.normalizeRoutes((data ?? []) as unknown as RouteRow[]);
  }

  async getStreamerChatRoutes(streamerId: string) {
    const { data, error } = await this.supabase
      .from("telegram_notification_routes")
      .select("id, route_type, notify_on_live_start, notify_on_live_end, notify_on_post, notify_on_boost, notify_on_raid, telegram_chats:telegram_chat_id(id, chat_id, title, username)")
      .eq("enabled", true)
      .eq("streamer_id", streamerId)
      .eq("route_type", "streamer_chat");

    if (error) {
      throw error;
    }

    return this.normalizeRoutes((data ?? []) as unknown as RouteRow[]);
  }

  async getSubscriberDmRoute(streamerId: string) {
    const { data, error } = await this.supabase
      .from("telegram_notification_routes")
      .select("id, route_type, notify_on_live_start, notify_on_live_end, notify_on_post, notify_on_boost, notify_on_raid")
      .eq("enabled", true)
      .eq("streamer_id", streamerId)
      .eq("route_type", "subscriber_dm")
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data ?? null) as Omit<RouteRow, "telegram_chats"> | null;
  }

  async getSubscriberTelegramRecipients(streamerId: string) {
    const { data: subscriptions, error: subscriptionsError } = await this.supabase
      .from("streamer_subscriptions")
      .select("user_id, notification_enabled, telegram_enabled")
      .eq("streamer_id", streamerId)
      .eq("notification_enabled", true)
      .eq("telegram_enabled", true);

    if (subscriptionsError) {
      throw subscriptionsError;
    }

    const rows = (subscriptions ?? []) as StreamerSubscriptionRow[];
    const userIds = rows.map((row) => row.user_id);

    if (userIds.length === 0) {
      return [];
    }

    const { data: links, error: linksError } = await this.supabase
      .from("telegram_links")
      .select("id, user_id, telegram_user_id, telegram_username")
      .in("user_id", userIds);

    if (linksError) {
      throw linksError;
    }

    return ((links ?? []) as TelegramLinkRow[]).filter((row) => row.telegram_user_id !== null);
  }
}