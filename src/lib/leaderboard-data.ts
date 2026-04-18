import { supabase } from "@/integrations/supabase/client";

export type ViewerLeaderboardEntry = {
  id: string;
  username: string;
  display_name: string | null;
  points: number;
  level: number;
};

export async function loadViewerLeaderboard() {
  const [{ data: profiles, error: profilesError }, { data: streamers, error: streamersError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, points, level")
      .order("points", { ascending: false })
      .order("level", { ascending: false })
      .limit(100),
    supabase
      .from("streamers")
      .select("user_id")
      .not("user_id", "is", null),
  ]);

  if (profilesError) {
    throw profilesError;
  }

  if (streamersError) {
    throw streamersError;
  }

  const streamerUserIds = new Set(
    ((streamers ?? []) as Array<{ user_id: string | null }>)
      .map((row) => row.user_id)
      .filter((value): value is string => Boolean(value))
  );

  return ((profiles ?? []) as ViewerLeaderboardEntry[])
    .filter((entry) => !streamerUserIds.has(entry.id))
    .slice(0, 20);
}