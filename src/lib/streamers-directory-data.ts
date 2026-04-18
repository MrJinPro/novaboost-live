import { supabase } from "@/integrations/supabase/client";
import { loadStreamerTrackingDetails, resolveLiveStatuses } from "@/lib/live-status-data";
import { mockStreamers, type StreamerCardData } from "@/lib/mock-platform";
import { loadActiveBoostTotals } from "@/lib/boost-data";

function normalizeTikTokUsername(username: string) {
  return username.trim().replace(/^@+/, "").toLowerCase();
}

type DbStreamerCard = {
  id: string;
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
    is_live: row.is_live,
    viewer_count: row.viewer_count ?? 0,
    like_count: fallback?.like_count ?? 0,
    gift_count: fallback?.gift_count ?? 0,
    message_count: fallback?.message_count ?? 0,
    peak_viewer_count: fallback?.peak_viewer_count ?? 0,
    followers_count: row.followers_count ?? fallback?.followers_count ?? 0,
    needs_boost: row.needs_boost,
    total_boost_amount: row.total_boost_amount ?? 0,
  };
}

export async function loadStreamerDirectory() {
  const [streamersResult, boostTotals] = await Promise.all([
    supabase
      .from("streamers")
      .select("id, display_name, tiktok_username, avatar_url, logo_url, bio, is_live, viewer_count, followers_count, needs_boost, total_boost_amount")
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
  let liveStatuses = new Map<string, Awaited<ReturnType<typeof resolveLiveStatuses>> extends Map<string, infer TValue> ? TValue : never>();
  let trackingByStreamerId = new Map<string, Awaited<ReturnType<typeof loadStreamerTrackingDetails>>>();

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
    const latestSession = trackingDetails?.latestSession;

    return normalizeStreamer({
      ...row,
      logo_url: pageSettingsLogos.get(row.id) ?? row.logo_url ?? row.avatar_url,
      is_live: liveStatus?.isLive ?? row.is_live,
      viewer_count: latestSession?.current_viewer_count ?? liveStatus?.viewerCount ?? row.viewer_count,
      followers_count: liveStatus?.followersCount || row.followers_count,
      total_boost_amount: boostTotals.get(row.id) ?? row.total_boost_amount ?? 0,
      like_count: latestSession?.like_count ?? 0,
      gift_count: latestSession?.gift_count ?? 0,
      message_count: latestSession?.message_count ?? 0,
      peak_viewer_count: latestSession?.peak_viewer_count ?? 0,
    });
  });

  return realStreamers.length > 0 ? realStreamers : mockStreamers;
}