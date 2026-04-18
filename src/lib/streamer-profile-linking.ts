import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type LinkedStreamerRow = Pick<
  Tables<"streamers">,
  | "id"
  | "user_id"
  | "display_name"
  | "tiktok_username"
  | "avatar_url"
  | "bio"
  | "banner_url"
  | "logo_url"
  | "tagline"
  | "telegram_channel"
  | "is_live"
  | "viewer_count"
  | "followers_count"
  | "needs_boost"
  | "total_boost_amount"
>;

const STREAMER_SELECT = "id, user_id, display_name, tiktok_username, avatar_url, bio, banner_url, logo_url, tagline, telegram_channel, is_live, viewer_count, followers_count, needs_boost, total_boost_amount";

export function normalizeTikTokUsername(value: string) {
  return value.trim().replace(/^@+/, "");
}

async function getStreamerByUserId(userId: string) {
  const { data, error } = await supabase
    .from("streamers")
    .select(STREAMER_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as LinkedStreamerRow | null;
}

async function getStreamerByTikTokUsername(tiktokUsername: string) {
  const normalizedUsername = normalizeTikTokUsername(tiktokUsername);

  if (!normalizedUsername) {
    return null;
  }

  const { data, error } = await supabase
    .from("streamers")
    .select(STREAMER_SELECT)
    .ilike("tiktok_username", normalizedUsername)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as LinkedStreamerRow | null;
}

async function claimStreamerProfile(input: {
  streamerId: string;
  userId: string;
  tiktokUsername: string;
  displayName?: string;
}) {
  const normalizedUsername = normalizeTikTokUsername(input.tiktokUsername);
  const { data, error } = await supabase
    .from("streamers")
    .update({
      user_id: input.userId,
      tiktok_username: normalizedUsername,
      ...(input.displayName ? { display_name: input.displayName } : {}),
    })
    .eq("id", input.streamerId)
    .is("user_id", null)
    .select(STREAMER_SELECT)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as LinkedStreamerRow | null;
}

export async function resolveLinkedStreamer(input: {
  userId: string;
  tiktokUsername?: string;
  displayName?: string;
  claimIfNeeded?: boolean;
}) {
  const ownedStreamer = await getStreamerByUserId(input.userId);
  if (ownedStreamer) {
    return ownedStreamer;
  }

  const normalizedUsername = normalizeTikTokUsername(input.tiktokUsername ?? "");
  if (!normalizedUsername) {
    return null;
  }

  const usernameMatch = await getStreamerByTikTokUsername(normalizedUsername);
  if (!usernameMatch) {
    return null;
  }

  if (usernameMatch.user_id === input.userId) {
    return usernameMatch;
  }

  if (usernameMatch.user_id && usernameMatch.user_id !== input.userId) {
    throw new Error("Этот TikTok username уже привязан к другому аккаунту стримера.");
  }

  if (!input.claimIfNeeded) {
    return usernameMatch;
  }

  const claimedStreamer = await claimStreamerProfile({
    streamerId: usernameMatch.id,
    userId: input.userId,
    tiktokUsername: normalizedUsername,
    displayName: input.displayName,
  });

  if (claimedStreamer) {
    return claimedStreamer;
  }

  throw new Error("Профиль стримера найден, но не удалось привязать его к текущему аккаунту. Примените новую SQL migration для claim-политики и повторите вход.");
}

export async function ensureLinkedStreamer(input: {
  userId: string;
  tiktokUsername: string;
  displayName: string;
}) {
  const normalizedUsername = normalizeTikTokUsername(input.tiktokUsername);
  const existing = await resolveLinkedStreamer({
    userId: input.userId,
    tiktokUsername: normalizedUsername,
    displayName: input.displayName,
    claimIfNeeded: true,
  });

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("streamers")
    .insert({
      user_id: input.userId,
      tiktok_username: normalizedUsername,
      display_name: input.displayName,
    })
    .select(STREAMER_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data as LinkedStreamerRow;
}