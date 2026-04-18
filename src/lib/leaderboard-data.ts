import { supabase } from "@/integrations/supabase/client";

export type ViewerLeaderboardEntry = {
  id: string;
  username: string;
  display_name: string | null;
  points: number;
  level: number;
};

export async function loadViewerLeaderboard() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, points, level")
    .order("points", { ascending: false })
    .order("level", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  return (data ?? []) as ViewerLeaderboardEntry[];
}