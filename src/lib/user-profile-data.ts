import { supabase } from "@/integrations/supabase/client";
import { getStreamerById, type AppUser, type StreamerCardData } from "@/lib/mock-platform";
import { getViewerProfileStatsCompat } from "./profile-schema-compat";

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
  const fallback = getStreamerById(row.id);

  return {
    id: row.id,
    display_name: row.display_name || fallback?.display_name || row.tiktok_username,
    tiktok_username: row.tiktok_username,
    avatar_url: row.avatar_url ?? fallback?.avatar_url ?? null,
    bio: row.bio ?? fallback?.bio ?? null,
    is_live: row.is_live,
    viewer_count: row.viewer_count ?? 0,
    followers_count: row.followers_count ?? fallback?.followers_count ?? 0,
    needs_boost: row.needs_boost,
    total_boost_amount: row.total_boost_amount ?? 0,
  };
}

async function getViewerProfile(userId: string) {
  return getViewerProfileStatsCompat(userId);
}

async function getSubscriptions(userId: string) {
  const { data, error } = await supabase
    .from("streamer_subscriptions")
    .select("streamer_id")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  const ids = ((data ?? []) as Array<{ streamer_id: string }>).map((row) => row.streamer_id);

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

async function getCount(table: string, column: string, value: string) {
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
  const [profile, subscriptions, completedTasks, boostsJoined] = await Promise.all([
    getViewerProfile(user.id),
    getSubscriptions(user.id),
    getCount("task_completions", "user_id", user.id),
    getCount("boosts", "user_id", user.id),
  ]);

  return {
    points: profile?.points ?? 0,
    level: profile?.level ?? 1,
    streakDays: profile?.streak_days ?? 0,
    completedTasks,
    boostsJoined,
    subscriptions,
  };
}