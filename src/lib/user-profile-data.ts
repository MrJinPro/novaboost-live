import { supabase } from "@/integrations/supabase/client";
import type { AppUser, StreamerCardData } from "@/lib/mock-platform";
import { getViewerProfileStatsCompat } from "./profile-schema-compat";
import { resolveLinkedStreamer } from "./streamer-profile-linking";
import { getViewerLevel } from "./viewer-levels";

type SubscriptionStreamerRow = {
  id: string;
  display_name: string;
  tiktok_username: string;
  avatar_url: string | null;
  bio: string | null;
  is_live: boolean;
  viewer_count: number;
  followers_count: number;
  needs_boost: boolean;
  total_boost_amount: number;
};

export type ViewerProfileData = {
  points: number;
  level: number;
  streakDays: number;
  completedTasks: number;
  boostsJoined: number;
  subscriptions: StreamerCardData[];
};

function normalizeStreamer(row: SubscriptionStreamerRow): StreamerCardData {
  return {
    id: row.id,
    display_name: row.display_name || row.tiktok_username,
    tiktok_username: row.tiktok_username,
    avatar_url: row.avatar_url ?? null,
    bio: row.bio ?? null,
    is_live: row.is_live,
    viewer_count: row.viewer_count ?? 0,
    followers_count: row.followers_count ?? 0,
    needs_boost: row.needs_boost,
    total_boost_amount: row.total_boost_amount ?? 0,
  };
}

async function getViewerProfile(userId: string) {
  return getViewerProfileStatsCompat(userId);
}

function getIsoDay(value: string) {
  return value.slice(0, 10);
}

function addUtcDays(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function calculateConsecutiveDayStreak(days: string[]) {
  if (days.length === 0) {
    return 0;
  }

  let streak = 1;

  for (let index = 1; index < days.length; index += 1) {
    if (days[index] !== addUtcDays(days[index - 1], -1)) {
      break;
    }

    streak += 1;
  }

  return streak;
}

async function getStreamerLiveStreak(user: AppUser) {
  const streamer = await resolveLinkedStreamer({
    userId: user.id,
    tiktokUsername: user.tiktokUsername,
    displayName: user.displayName,
    claimIfNeeded: false,
  });

  if (!streamer) {
    return 0;
  }

  const { data, error } = await supabase
    .from("stream_sessions")
    .select("started_at")
    .eq("streamer_id", streamer.id)
    .order("started_at", { ascending: false })
    .limit(30);

  if (error) {
    throw error;
  }

  const uniqueDays = Array.from(
    new Set(((data ?? []) as Array<{ started_at: string }>).map((row) => getIsoDay(row.started_at))),
  );

  return calculateConsecutiveDayStreak(uniqueDays);
}

async function getSubscriptions(userId: string) {
  const { data, error } = await supabase
    .from("streamer_subscriptions")
    .select("streamer_id")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  const ids = Array.from(new Set(((data ?? []) as Array<{ streamer_id: string }>).map((row) => row.streamer_id)));

  if (ids.length === 0) {
    return [];
  }

  const { data: streamers, error: streamersError } = await supabase
    .from("streamers")
    .select("id, display_name, tiktok_username, avatar_url, bio, is_live, viewer_count, followers_count, needs_boost, total_boost_amount")
    .in("id", ids);

  if (streamersError) {
    throw streamersError;
  }

  const mapped = ((streamers ?? []) as SubscriptionStreamerRow[]).map(normalizeStreamer);
  const byId = new Map(mapped.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as StreamerCardData[];
}

async function getCount(table: "task_completions" | "boosts", column: string, value: string) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function loadViewerProfileData(user: AppUser): Promise<ViewerProfileData> {
  const [profile, subscriptions, completedTasks, boostsJoined, liveStreak] = await Promise.all([
    getViewerProfile(user.id),
    getSubscriptions(user.id),
    getCount("task_completions", "user_id", user.id),
    getCount("boosts", "user_id", user.id),
    getStreamerLiveStreak(user).catch(() => 0),
  ]);

  return {
    points: profile?.points ?? 0,
    level: getViewerLevel(profile?.points ?? 0),
    streakDays: Math.max(profile?.streak_days ?? 0, liveStreak),
    completedTasks,
    boostsJoined,
    subscriptions,
  };
}