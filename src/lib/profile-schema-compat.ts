import { supabase } from "@/integrations/supabase/client";

export type AuthProfileCompat = {
  id: string;
  username: string;
  display_name: string | null;
  tiktok_username: string | null;
  avatar_url: string | null;
  bio: string | null;
};

export type ViewerProfileStatsCompat = {
  points: number;
  level: number;
  streak_days: number;
};

function isSchemaMismatch(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message = "message" in error && typeof error.message === "string" ? error.message.toLowerCase() : "";
  const details = "details" in error && typeof error.details === "string" ? error.details.toLowerCase() : "";
  const code = "code" in error && typeof error.code === "string" ? error.code.toLowerCase() : "";

  return code === "pgrst204" || message.includes("column") || details.includes("column") || message.includes("schema cache");
}

export async function getAuthProfileCompat(userId: string) {
  const full = await supabase
    .from("profiles")
    .select("id, username, display_name, tiktok_username, avatar_url, bio")
    .eq("id", userId)
    .maybeSingle();

  if (!full.error) {
    return (full.data ?? null) as AuthProfileCompat | null;
  }

  if (!isSchemaMismatch(full.error)) {
    throw full.error;
  }

  const fallback = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (fallback.error) {
    throw fallback.error;
  }

  if (!fallback.data) {
    return null;
  }

  return {
    ...fallback.data,
    tiktok_username: null,
    avatar_url: null,
    bio: null,
  } satisfies AuthProfileCompat;
}

export async function upsertAuthProfileCompat(input: {
  id: string;
  username: string;
  display_name: string;
  tiktok_username: string;
  avatar_url?: string | null;
  bio?: string | null;
}) {
  const full = await supabase.from("profiles").upsert(
    {
      id: input.id,
      username: input.username,
      display_name: input.display_name,
      tiktok_username: input.tiktok_username,
      avatar_url: input.avatar_url ?? null,
      bio: input.bio ?? null,
    },
    { onConflict: "id" }
  );

  if (!full.error) {
    return;
  }

  if (!isSchemaMismatch(full.error)) {
    throw full.error;
  }

  const fallback = await supabase.from("profiles").upsert(
    {
      id: input.id,
      username: input.username,
      display_name: input.display_name,
    },
    { onConflict: "id" }
  );

  if (fallback.error) {
    throw fallback.error;
  }
}

export async function getViewerProfileStatsCompat(userId: string) {
  const full = await supabase
    .from("profiles")
    .select("points, level, streak_days")
    .eq("id", userId)
    .maybeSingle();

  if (!full.error) {
    return (full.data ?? { points: 0, level: 1, streak_days: 0 }) as ViewerProfileStatsCompat;
  }

  if (!isSchemaMismatch(full.error)) {
    throw full.error;
  }

  const fallback = await supabase
    .from("profiles")
    .select("points, level")
    .eq("id", userId)
    .maybeSingle();

  if (fallback.error) {
    throw fallback.error;
  }

  return {
    points: fallback.data?.points ?? 0,
    level: fallback.data?.level ?? 1,
    streak_days: 0,
  } satisfies ViewerProfileStatsCompat;
}

export async function updateViewerProfileProgressCompat(input: {
  userId: string;
  points: number;
  level: number;
  streak_days: number;
}) {
  const full = await supabase
    .from("profiles")
    .update({
      points: input.points,
      level: input.level,
      streak_days: input.streak_days,
      activity_score: input.points,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", input.userId);

  if (!full.error) {
    return;
  }

  if (!isSchemaMismatch(full.error)) {
    throw full.error;
  }

  const fallback = await supabase
    .from("profiles")
    .update({
      points: input.points,
      level: input.level,
    })
    .eq("id", input.userId);

  if (fallback.error) {
    throw fallback.error;
  }
}