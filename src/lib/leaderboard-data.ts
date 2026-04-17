import { supabase } from "@/integrations/supabase/client";
import { mockViewerStandings } from "@/lib/mock-platform";

const db = supabase as any;

export type ViewerLeaderboardEntry = {
  id: string;
  username: string;
  display_name: string | null;
  points: number;
  level: number;
};

export async function loadViewerLeaderboard() {
  const { data, error } = await db
    .from("profiles")
    .select("id, username, display_name, points, level")
    .order("points", { ascending: false })
    .order("level", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as ViewerLeaderboardEntry[];
  return rows.length > 0 ? rows : mockViewerStandings;
}