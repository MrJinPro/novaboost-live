import { supabase } from "@/integrations/supabase/client";
import type { AppUser } from "@/lib/mock-platform";

const db = supabase as any;

export type LiveTask = {
  id: string;
  title: string;
  description: string | null;
  reward_points: number;
  type: "visit" | "code" | "boost" | "referral";
  code: string | null;
  streamer_id: string | null;
};

type ProfileStatsRow = {
  points: number;
  streak_days: number;
};

export async function loadTasksData(userId?: string) {
  const { data: tasks, error: tasksError } = await db
    .from("tasks")
    .select("id, title, description, reward_points, type, code, streamer_id")
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

  const { data: completions, error: completionsError } = await db
    .from("task_completions")
    .select("task_id")
    .eq("user_id", userId);

  if (completionsError) {
    throw completionsError;
  }

  return {
    tasks: (tasks ?? []) as LiveTask[],
    completedIds: new Set(((completions ?? []) as Array<{ task_id: string }>).map((row) => row.task_id)),
  };
}

async function getProfileStats(userId: string) {
  const { data, error } = await db
    .from("profiles")
    .select("points, streak_days")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? { points: 0, streak_days: 0 }) as ProfileStatsRow;
}

export async function completeLiveTask(user: AppUser, task: LiveTask) {
  const { error: completionError } = await db
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

  const { error: profileError } = await db
    .from("profiles")
    .update({
      points: nextPoints,
      level: nextLevel,
      streak_days: Math.max(1, current.streak_days ?? 0),
      activity_score: nextPoints,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (profileError) {
    throw profileError;
  }

  return {
    nextPoints,
    nextLevel,
  };
}