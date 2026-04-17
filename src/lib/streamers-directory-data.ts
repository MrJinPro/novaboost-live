import { supabase } from "@/integrations/supabase/client";
import { mockStreamers, type StreamerCardData } from "@/lib/mock-platform";
import { loadActiveBoostTotals } from "@/lib/boost-data";

const db = supabase as any;

type DbStreamerCard = {
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

function normalizeStreamer(row: DbStreamerCard): StreamerCardData {
  const fallback = mockStreamers.find(
    (item) => item.id === row.id || item.tiktok_username.toLowerCase() === row.tiktok_username.toLowerCase()
  );

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

export async function loadStreamerDirectory() {
  const [streamersResult, boostTotals] = await Promise.all([
    db
      .from("streamers")
      .select("id, display_name, tiktok_username, avatar_url, bio, is_live, viewer_count, followers_count, needs_boost, total_boost_amount")
      .order("is_live", { ascending: false })
      .order("followers_count", { ascending: false }),
    loadActiveBoostTotals(),
  ]);

  const { data, error } = streamersResult;

  if (error) {
    throw error;
  }

  const realStreamers = ((data ?? []) as DbStreamerCard[]).map((row) =>
    normalizeStreamer({
      ...row,
      total_boost_amount: boostTotals.get(row.id) ?? row.total_boost_amount ?? 0,
    })
  );
  const seen = new Set(realStreamers.map((item) => item.id));
  const fallbackOnly = mockStreamers.filter((item) => !seen.has(item.id));

  return [...realStreamers, ...fallbackOnly];
}