import { supabase } from "@/integrations/supabase/client";
import type { AppUser } from "@/lib/mock-platform";
import { getViewerProfileStatsCompat, resolveNextActivityStreak, updateViewerProfileProgressCompat } from "./profile-schema-compat";
import { resolveLinkedStreamer } from "./streamer-profile-linking";
import { calculateCodeWordReward, getViewerLevel, validateCodeWord } from "./viewer-levels";

export type LiveTask = {
  id: string;
  title: string;
  description: string | null;
  reward_points: number;
  type: "visit" | "code" | "boost" | "referral";
  code: string | null;
  streamer_id: string | null;
  stream_session_id?: string | null;
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
  stream_session_id?: string | null;
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
    stream_session_id: row.stream_session_id ?? null,
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
    .select("id, title, description, reward_points, type, code, streamer_id, stream_session_id, expires_at, streamers(display_name, tiktok_username)")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (tasksError) {
    throw tasksError;
  }

  if (!userId) {
    const publicTasks = ((tasks ?? []) as RawTaskRow[])
      .filter((task) => task.type !== "code")
      .map(normalizeLiveTask);

    return {
      tasks: publicTasks,
      completedIds: new Set<string>(),
    };
  }

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("streamer_subscriptions")
    .select("streamer_id")
    .eq("user_id", userId);

  if (subscriptionsError) {
    throw subscriptionsError;
  }

  const subscribedStreamerIds = new Set(
    ((subscriptions ?? []) as Array<{ streamer_id: string }>).map((row) => row.streamer_id),
  );

  const { data: completions, error: completionsError } = await supabase
    .from("task_completions")
    .select("task_id")
    .eq("user_id", userId);

  if (completionsError) {
    throw completionsError;
  }

  const filteredTasks = ((tasks ?? []) as RawTaskRow[])
    .filter((task) => task.type !== "code" || (task.streamer_id ? subscribedStreamerIds.has(task.streamer_id) : false))
    .map(normalizeLiveTask);

  return {
    tasks: filteredTasks,
    completedIds: new Set(((completions ?? []) as Array<{ task_id: string }>).map((row) => row.task_id)),
  };
}

async function getProfileStats(userId: string) {
  return getViewerProfileStatsCompat(userId);
}

export async function completeLiveTask(user: AppUser, task: LiveTask) {
  if (task.type !== "code") {
    throw new Error("Это задание засчитывается автоматически по live-событиям.");
  }

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
  const nextLevel = getViewerLevel(nextPoints);

  if (task.streamer_id) {
    const ledgerMetadata = {
      task_id: task.id,
      task_type: task.type,
      streamer_id: task.streamer_id,
      code: task.type === "code" ? task.code : null,
    };

    const { error: actionError } = await supabase
      .from("viewer_stream_actions")
      .insert({
        user_id: user.id,
        streamer_id: task.streamer_id,
        stream_session_id: task.stream_session_id ?? null,
        action_type: task.type === "code" ? "code_submission" : task.type === "boost" ? "boost_participation" : task.type === "referral" ? "referral_join" : "stream_visit",
        points_awarded: task.reward_points,
        metadata: ledgerMetadata,
        occurred_at: new Date().toISOString(),
      });

    if (actionError) {
      throw actionError;
    }

    const { error: ledgerError } = await supabase
      .from("viewer_points_ledger")
      .insert({
        user_id: user.id,
        source_type: task.type === "code" ? "task.code_submission" : `task.${task.type}`,
        source_id: task.id,
        delta: task.reward_points,
        balance_after: nextPoints,
        reason: `Task completed: ${task.title}`,
        metadata: ledgerMetadata,
      });

    if (ledgerError) {
      throw ledgerError;
    }
  }

  await updateViewerProfileProgressCompat({
    userId: user.id,
    points: nextPoints,
    level: nextLevel,
    streak_days: resolveNextActivityStreak({
      currentStreak: current.streak_days,
      lastActivityAt: current.last_activity_at,
    }),
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
  rewardPoints?: number;
}) {
  const streamerId = await getManagedStreamerId(user);
  const normalizedCode = validateCodeWord(input.code);
  const activeStreamSessionId = await getLatestActiveStreamSession(streamerId);
  const rewardPoints = calculateCodeWordReward(normalizedCode);

  if (!activeStreamSessionId) {
    throw new Error("Кодовое слово можно публиковать только во время активного эфира.");
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
      reward_points: rewardPoints,
      type: "code",
      code: normalizedCode,
      active: true,
      stream_session_id: activeStreamSessionId,
      auto_disable_on_live_end: true,
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