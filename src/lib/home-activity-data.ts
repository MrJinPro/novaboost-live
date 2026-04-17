import { supabase } from "@/integrations/supabase/client";
import type { StreamerCardData } from "@/lib/mock-platform";

export type HomeActivityItem = {
  id: string;
  tone: "live" | "boost" | "social";
  title: string;
  body: string;
  sortAt: string;
};

type DbBoostRow = {
  id: string;
  amount: number;
  created_at: string;
  streamers: {
    display_name: string;
    tiktok_username: string;
  } | null;
};

type DbPostRow = {
  id: string;
  title: string;
  published_at: string | null;
  created_at: string;
  streamers: {
    display_name: string;
    tiktok_username: string;
  } | null;
};

export async function loadHomeActivityFeed(streamers: StreamerCardData[]) {
  const now = new Date().toISOString();

  const [boostsResult, postsResult] = await Promise.all([
    supabase
      .from("boosts")
      .select("id, amount, created_at, streamers:streamer_id(display_name, tiktok_username)")
      .eq("status", "active")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("streamer_posts")
      .select("id, title, published_at, created_at, streamers:streamer_id(display_name, tiktok_username)")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (boostsResult.error) {
    throw boostsResult.error;
  }

  if (postsResult.error) {
    throw postsResult.error;
  }

  const boostItems = ((boostsResult.data ?? []) as DbBoostRow[]).map((row) => ({
    id: `boost-${row.id}`,
    tone: "boost" as const,
    title: `${row.streamers?.display_name ?? "Стример"} получил буст`,
    body: `Активирован буст на ${row.amount} ⚡ для @${row.streamers?.tiktok_username ?? "streamer"}`,
    sortAt: row.created_at,
  }));

  const postItems = ((postsResult.data ?? []) as DbPostRow[]).map((row) => ({
    id: `post-${row.id}`,
    tone: "social" as const,
    title: `${row.streamers?.display_name ?? "Стример"} опубликовал пост`,
    body: row.title,
    sortAt: row.published_at ?? row.created_at,
  }));

  const liveItems = streamers
    .filter((streamer) => streamer.is_live)
    .slice(0, 3)
    .map((streamer, index) => ({
      id: `live-${streamer.id}`,
      tone: "live" as const,
      title: `${streamer.display_name} сейчас в эфире`,
      body: `В онлайне ${streamer.viewer_count} зрителей у @${streamer.tiktok_username}`,
      sortAt: new Date(Date.now() - index * 60_000).toISOString(),
    }));

  return [...boostItems, ...postItems, ...liveItems]
    .sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime())
    .slice(0, 8);
}