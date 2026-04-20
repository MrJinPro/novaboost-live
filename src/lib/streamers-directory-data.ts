import { supabase } from "@/integrations/supabase/client";
import { loadStreamerTrackingDetails, resolveLiveStatuses } from "@/lib/live-status-data";
import { mockStreamers, type StreamerCardData } from "@/lib/mock-platform";
import { loadActiveBoostTotals } from "@/lib/boost-data";

function normalizeTikTokUsername(username: string) {
  return username.trim().replace(/^@+/, "").toLowerCase();
}

type DbStreamerCard = {
  id: string;
  user_id?: string | null;
  display_name: string;
  tiktok_username: string;
  avatar_url: string | null;
  logo_url?: string | null;
  bio: string | null;
  is_live: boolean;
  viewer_count: number;
  followers_count: number;
  needs_boost: boolean;
  total_boost_amount: number;
};

type DbStreamerSubscription = {
  streamer_id: string;
  user_id: string;
};

type DbPageSettingsLogo = {
  streamer_id: string;
  logo_url: string | null;
};

function normalizeStreamer(row: DbStreamerCard): StreamerCardData {
  const fallback = mockStreamers.find(
    (item) => item.id === row.id || item.tiktok_username.toLowerCase() === row.tiktok_username.toLowerCase()
  );

  return {
    id: row.id,
    display_name: row.display_name || fallback?.display_name || row.tiktok_username,
    tiktok_username: row.tiktok_username,
    avatar_url: row.logo_url ?? row.avatar_url ?? fallback?.avatar_url ?? null,
    bio: row.bio ?? fallback?.bio ?? null,
    is_registered: row.user_id !== null,
    is_live: row.is_live,
    viewer_count: row.viewer_count ?? 0,
    like_count: fallback?.like_count ?? 0,
    gift_count: fallback?.gift_count ?? 0,
    message_count: fallback?.message_count ?? 0,
    peak_viewer_count: fallback?.peak_viewer_count ?? 0,
    followers_count: row.followers_count ?? fallback?.followers_count ?? 0,
    subscription_count: fallback?.subscription_count ?? 0,
    needs_boost: row.needs_boost,
    total_boost_amount: row.total_boost_amount ?? 0,
  };
}

export async function loadStreamerDirectory() {
  const [streamersResult, boostTotals] = await Promise.all([
    supabase
      .from("streamers")
      .select("id, user_id, display_name, tiktok_username, avatar_url, logo_url, bio, is_live, viewer_count, followers_count, needs_boost, total_boost_amount")
      .order("is_live", { ascending: false })
      .order("followers_count", { ascending: false }),
    loadActiveBoostTotals(),
  ]);

  const { data, error } = streamersResult;

  if (error) {
    throw error;
  }

  const streamers = (data ?? []) as DbStreamerCard[];
  let pageSettingsLogos = new Map<string, string | null>();
  let subscriptionCounts = new Map<string, number>();
  let liveStatuses = new Map<string, Awaited<ReturnType<typeof resolveLiveStatuses>> extends Map<string, infer TValue> ? TValue : never>();
  let trackingByStreamerId = new Map<string, Awaited<ReturnType<typeof loadStreamerTrackingDetails>>>();

  try {
    const { data: subscriptionRows, error: subscriptionError } = await supabase
      .from("streamer_subscriptions")
      .select("streamer_id, user_id")
      .in("streamer_id", streamers.map((row) => row.id));

    if (subscriptionError) {
      throw subscriptionError;
    }

    const uniqueSubscriptions = new Set<string>();

    subscriptionCounts = ((subscriptionRows ?? []) as DbStreamerSubscription[]).reduce((map, row) => {
      const key = `${row.streamer_id}:${row.user_id}`;

      if (uniqueSubscriptions.has(key)) {
        return map;
      }

      uniqueSubscriptions.add(key);
      return map;
    }, new Map<string, number>());

    for (const key of uniqueSubscriptions) {
      const [streamerId] = key.split(":", 1);
      subscriptionCounts.set(streamerId, (subscriptionCounts.get(streamerId) ?? 0) + 1);
    }
  } catch {
    // Keep follower-based fallbacks when subscription rows are unavailable.
  }

  try {
    const { data: pageSettingsData, error: pageSettingsError } = await supabase
      .from("streamer_page_settings")
      .select("streamer_id, logo_url")
      .in("streamer_id", streamers.map((row) => row.id));

    if (pageSettingsError) {
      throw pageSettingsError;
    }

    pageSettingsLogos = new Map(
      ((pageSettingsData ?? []) as DbPageSettingsLogo[]).map((row) => [row.streamer_id, row.logo_url]),
    );
  } catch {
    // Keep using streamers.avatar_url/logo_url when page settings are unavailable.
  }

  try {
    liveStatuses = await resolveLiveStatuses(streamers.map((row) => row.tiktok_username));
  } catch {
    // Fallback to stored DB values if the backend is temporarily unavailable.
  }

  try {
    const trackingEntries = await Promise.all(
      streamers.map(async (row) => {
        try {
          const details = await loadStreamerTrackingDetails(row.id);
          return [row.id, details] as const;
        } catch {
          return [row.id, null] as const;
        }
      }),
    );

    trackingByStreamerId = new Map(trackingEntries);
  } catch {
    // Fallback to directory-only fields when tracking details are unavailable.
  }

  const realStreamers = streamers.map((row) => {
    const liveStatus = liveStatuses.get(normalizeTikTokUsername(row.tiktok_username));
    const trackingDetails = trackingByStreamerId.get(row.id);
    const trackingState = trackingDetails?.realtimeState ?? trackingDetails?.state;
    const latestSession = trackingDetails?.latestSession;

    return normalizeStreamer({
      ...row,
      logo_url: pageSettingsLogos.get(row.id) ?? row.logo_url ?? row.avatar_url,
      is_live: trackingState?.isLive ?? trackingState?.is_live ?? liveStatus?.isLive ?? row.is_live,
      viewer_count: latestSession?.current_viewer_count ?? trackingState?.viewerCount ?? trackingState?.viewer_count ?? liveStatus?.viewerCount ?? row.viewer_count,
      followers_count: liveStatus?.followersCount || row.followers_count,
      total_boost_amount: boostTotals.get(row.id) ?? row.total_boost_amount ?? 0,
      like_count: latestSession?.like_count ?? 0,
      gift_count: latestSession?.gift_count ?? 0,
      message_count: latestSession?.message_count ?? 0,
      peak_viewer_count: latestSession?.peak_viewer_count ?? 0,
    });
  }).map((row) => ({
    ...row,
    subscription_count: subscriptionCounts.get(row.id) ?? row.subscription_count ?? 0,
  }));

  realStreamers.sort((left, right) => {
    if (left.is_live !== right.is_live) {
      return Number(right.is_live) - Number(left.is_live);
    }

    if (left.total_boost_amount !== right.total_boost_amount) {
      return right.total_boost_amount - left.total_boost_amount;
    }

    const subscriptionDelta = (right.subscription_count ?? 0) - (left.subscription_count ?? 0);
    if (subscriptionDelta !== 0) {
      return subscriptionDelta;
    }

    if (left.is_live && right.is_live && left.viewer_count !== right.viewer_count) {
      return right.viewer_count - left.viewer_count;
    }

    return right.followers_count - left.followers_count;
  });

  return realStreamers.length > 0 ? realStreamers : mockStreamers;
}