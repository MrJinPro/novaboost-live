import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdmin } from "@/lib/server-admin-auth";

type AdminTaskType = "visit" | "code" | "boost" | "referral";

type AdminTaskRow = {
  id: string;
  title: string;
  description: string | null;
  reward_points: number;
  type: AdminTaskType;
  code: string | null;
  streamer_id: string | null;
  active: boolean;
  expires_at: string | null;
  created_at: string;
  streamers?: {
    display_name: string;
    tiktok_username: string;
  } | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function normalizeTaskType(value: string | null | undefined): AdminTaskType | null {
  if (value === "visit" || value === "code" || value === "boost" || value === "referral") {
    return value;
  }

  return null;
}

async function loadAdminTasks() {
  const { data, error } = await supabaseAdmin
    .from("tasks")
    .select("id, title, description, reward_points, type, code, streamer_id, active, expires_at, created_at, streamers(display_name, tiktok_username)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return ((data ?? []) as AdminTaskRow[]).map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    rewardPoints: task.reward_points,
    type: task.type,
    code: task.code,
    streamerId: task.streamer_id,
    active: task.active,
    expiresAt: task.expires_at,
    createdAt: task.created_at,
    streamerName: task.streamers?.display_name ?? null,
    streamerTikTokUsername: task.streamers?.tiktok_username ?? null,
  }));
}

async function createAdminTask(input: {
  title?: string;
  description?: string;
  rewardPoints?: number;
  type?: string;
  streamerId?: string | null;
  expiresAt?: string | null;
}) {
  const title = input.title?.trim() ?? "";
  const description = input.description?.trim() || null;
  const type = normalizeTaskType(input.type);
  const rewardPoints = Number.isFinite(input.rewardPoints) ? Math.max(1, Math.floor(input.rewardPoints ?? 0)) : 0;
  const streamerId = input.streamerId?.trim() || null;
  const expiresAt = input.expiresAt?.trim() || null;

  if (!title) {
    throw new Error("Укажи название задания.");
  }

  if (!type || type === "code") {
    throw new Error("Админка пока может создавать только visit, boost и referral задания.");
  }

  if (rewardPoints < 1) {
    throw new Error("Награда должна быть не меньше 1 очка.");
  }

  if ((type === "visit" || type === "boost") && !streamerId) {
    throw new Error("Для visit и boost задания нужно выбрать стримера.");
  }

  const { data, error } = await supabaseAdmin
    .from("tasks")
    .insert({
      title,
      description,
      reward_points: rewardPoints,
      type,
      streamer_id: streamerId,
      active: true,
      expires_at: expiresAt,
      auto_disable_on_live_end: false,
    })
    .select("id, title, description, reward_points, type, code, streamer_id, active, expires_at, created_at, streamers(display_name, tiktok_username)")
    .single();

  if (error) {
    throw error;
  }

  const task = data as AdminTaskRow;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    rewardPoints: task.reward_points,
    type: task.type,
    code: task.code,
    streamerId: task.streamer_id,
    active: task.active,
    expiresAt: task.expires_at,
    createdAt: task.created_at,
    streamerName: task.streamers?.display_name ?? null,
    streamerTikTokUsername: task.streamers?.tiktok_username ?? null,
  };
}

export const Route = createFileRoute("/api/admin/tasks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if ("error" in auth) {
          return auth.error;
        }

        try {
          const tasks = await loadAdminTasks();
          return jsonResponse({ tasks, currentAccessLevel: auth.accessLevel });
        } catch (error) {
          return jsonResponse({ error: error instanceof Error ? error.message : "Не удалось загрузить задания." }, 500);
        }
      },
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if ("error" in auth) {
          return auth.error;
        }

        if (auth.accessLevel === "support") {
          return jsonResponse({ error: "Support не может добавлять задания." }, 403);
        }

        let body: { title?: string; description?: string; rewardPoints?: number; type?: string; streamerId?: string | null; expiresAt?: string | null } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonResponse({ error: "Некорректный JSON body." }, 400);
        }

        try {
          const task = await createAdminTask(body);
          return jsonResponse({ ok: true, task });
        } catch (error) {
          return jsonResponse({ error: error instanceof Error ? error.message : "Не удалось создать задание." }, 500);
        }
      },
    },
  },
});