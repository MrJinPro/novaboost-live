import { supabase } from "@/integrations/supabase/client";
import type { AppUser } from "@/lib/mock-platform";
import { getViewerProfileStatsCompat, updateViewerProfileProgressCompat } from "./profile-schema-compat";
import { resolveLinkedStreamer } from "./streamer-profile-linking";

export type LiveTask = {
  id: string;
  title: string;
  description: string | null;
  reward_points: number;
  type: "visit" | "code" | "boost" | "referral";
  code: string | null;
  streamer_id: string | null;
  streamer_name?: string | null;
  streamer_tiktok_username?: string | null;
  expires_at?: string | null;
};

type RawTaskRow = {
  id: string;
  title: string;
  description: string | null;
  reward_points: number;
  type: "visit" | "code" | "boost" | "referral";
  code: string | null;
  streamer_id: string | null;
  expires_at?: string | null;
  streamers?: {
    display_name: string;
    tiktok_username: string;
  } | null;
};

function normalizeLiveTask(row: RawTaskRow): LiveTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    reward_points: row.reward_points,
    type: row.type,
    code: row.code,
    streamer_id: row.streamer_id,
    streamer_name: row.streamers?.display_name ?? null,
    streamer_tiktok_username: row.streamers?.tiktok_username ?? null,
    expires_at: row.expires_at ?? null,
  };
}

export type StreamerCodeWordTask = {
  id: string;
  title: string;
  description: string | null;
  reward_points: number;
  code: string;
  active: boolean;
  created_at: string;
  expires_at: string | null;
  stream_session_id: string | null;
  auto_disable_on_live_end: boolean;
};

export async function loadTasksData(userId?: string) {
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, title, description, reward_points, type, code, streamer_id, expires_at, streamers(display_name, tiktok_username)")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (tasksError) {
    throw tasksError;
  }

  if (!userId) {
    return {
      tasks: (tasks ?? []) as LiveTask[],
      completedIds: new Set<string>(),
    };
  }

  const { data: completions, error: completionsError } = await supabase
    .from("task_completions")
    .select("task_id")
    .eq("user_id", userId);

  if (completionsError) {
    throw completionsError;
  }

  return {
    tasks: ((tasks ?? []) as RawTaskRow[]).map(normalizeLiveTask),
    completedIds: new Set(((completions ?? []) as Array<{ task_id: string }>).map((row) => row.task_id)),
  };
}

async function getProfileStats(userId: string) {
  return getViewerProfileStatsCompat(userId);
}

export async function completeLiveTask(user: AppUser, task: LiveTask) {
  const { error: completionError } = await supabase
    .from("task_completions")
    .insert({
      user_id: user.id,
      task_id: task.id,
    });

  if (completionError) {
    throw completionError;
  }

  const current = await getProfileStats(user.id);
  const nextPoints = (current.points ?? 0) + task.reward_points;
  const nextLevel = Math.floor(nextPoints / 100) + 1;

  await updateViewerProfileProgressCompat({
    userId: user.id,
    points: nextPoints,
    level: nextLevel,
    streak_days: Math.max(1, current.streak_days ?? 0),
  });

  return {
    nextPoints,
    nextLevel,
  };
}

async function getManagedStreamerId(user: AppUser) {
  const streamer = await resolveLinkedStreamer({
    userId: user.id,
    tiktokUsername: user.tiktokUsername,
    displayName: user.displayName,
    claimIfNeeded: true,
  });

  if (!streamer) {
    throw new Error("Профиль стримера в базе ещё не создан.");
  }

  return streamer.id;
}

async function getLatestActiveStreamSession(streamerId: string) {
  const { data, error } = await supabase
    .from("stream_sessions")
    .select("id")
    .eq("streamer_id", streamerId)
    .eq("status", "live")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

export async function loadStreamerCodeWordTasks(user: AppUser) {
  const streamerId = await getManagedStreamerId(user);

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, description, reward_points, code, active, created_at, expires_at, stream_session_id, auto_disable_on_live_end")
    .eq("streamer_id", streamerId)
    .eq("type", "code")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw error;
  }

  return (data ?? []) as StreamerCodeWordTask[];
}

export async function publishStreamerCodeWordTask(user: AppUser, input: {
  title: string;
  description?: string;
  code: string;
  rewardPoints: number;
}) {
  const streamerId = await getManagedStreamerId(user);
  const normalizedCode = input.code.trim().toUpperCase();
  const activeStreamSessionId = await getLatestActiveStreamSession(streamerId);

  if (!normalizedCode) {
    throw new Error("Кодовое слово не может быть пустым.");
  }

  if (input.rewardPoints < 1) {
    throw new Error("Нужно указать хотя бы 1 очко награды.");
  }

  const { error: deactivateError } = await supabase
    .from("tasks")
    .update({ active: false })
    .eq("streamer_id", streamerId)
    .eq("type", "code")
    .eq("active", true);

  if (deactivateError) {
    throw deactivateError;
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      streamer_id: streamerId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      reward_points: input.rewardPoints,
      type: "code",
      code: normalizedCode,
      active: true,
      stream_session_id: activeStreamSessionId,
      auto_disable_on_live_end: Boolean(activeStreamSessionId),
    })
    .select("id, title, description, reward_points, code, active, created_at, expires_at, stream_session_id, auto_disable_on_live_end")
    .single();

  if (error) {
    throw error;
  }

  return data as StreamerCodeWordTask;
}

export async function deactivateStreamerCodeWordTask(user: AppUser, taskId: string) {
  const streamerId = await getManagedStreamerId(user);

  const { data, error } = await supabase
    .from("tasks")
    .update({ active: false })
    .eq("id", taskId)
    .eq("streamer_id", streamerId)
    .eq("type", "code")
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Не удалось отключить кодовое слово.");
  }
}