import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdmin } from "@/lib/server-admin-auth";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function computeLevel(points: number) {
  if (points >= 5000) return 10;
  if (points >= 2500) return 9;
  if (points >= 1500) return 8;
  if (points >= 1000) return 7;
  if (points >= 700) return 6;
  if (points >= 500) return 5;
  if (points >= 300) return 4;
  if (points >= 150) return 3;
  if (points >= 50) return 2;
  return 1;
}

export const Route = createFileRoute("/api/admin/points")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if ("error" in auth) return auth.error;

        if (auth.accessLevel !== "admin") {
          return jsonResponse({ error: "Доступ запрещён." }, 403);
        }

        const url = new URL(request.url);
        const targetUserId = url.searchParams.get("userId")?.trim();

        if (!targetUserId) {
          return jsonResponse({ error: "Укажи userId." }, 400);
        }

        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("id, username, display_name, points, level")
          .eq("id", targetUserId)
          .maybeSingle();

        if (profileError) return jsonResponse({ error: profileError.message }, 500);
        if (!profile) return jsonResponse({ error: "Пользователь не найден." }, 404);

        return jsonResponse({ profile });
      },

      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if ("error" in auth) return auth.error;

        if (auth.accessLevel !== "admin") {
          return jsonResponse({ error: "Доступ запрещён." }, 403);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Некорректный JSON." }, 400);
        }

        const { userId, delta, reason } = body as { userId?: string; delta?: unknown; reason?: string };

        if (!userId || typeof userId !== "string" || !userId.trim()) {
          return jsonResponse({ error: "Укажи userId." }, 400);
        }

        const parsedDelta = typeof delta === "number" ? delta : Number(delta);
        if (!Number.isFinite(parsedDelta) || parsedDelta === 0) {
          return jsonResponse({ error: "Укажи корректное количество очков (≠ 0)." }, 400);
        }
        if (Math.abs(parsedDelta) > 100_000) {
          return jsonResponse({ error: "Слишком большое значение (максимум ±100 000)." }, 400);
        }

        const trimmedReason = typeof reason === "string" ? reason.trim() : "";
        if (!trimmedReason) {
          return jsonResponse({ error: "Укажи причину начисления." }, 400);
        }

        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("id, username, display_name, points, level")
          .eq("id", userId.trim())
          .maybeSingle();

        if (profileError) return jsonResponse({ error: profileError.message }, 500);
        if (!profile) return jsonResponse({ error: "Пользователь не найден." }, 404);

        const currentPoints = (profile as { points?: number | null }).points ?? 0;
        const newPoints = Math.max(0, currentPoints + parsedDelta);
        const newLevel = computeLevel(newPoints);
        const now = new Date().toISOString();

        const { error: ledgerError } = await supabaseAdmin
          .from("viewer_points_ledger")
          .insert({
            user_id: userId.trim(),
            source_type: "admin.manual_award",
            source_id: auth.userId,
            delta: parsedDelta,
            balance_after: newPoints,
            reason: trimmedReason,
            metadata: { admin_id: auth.userId, manual: true },
            created_at: now,
          });

        if (ledgerError) return jsonResponse({ error: ledgerError.message }, 500);

        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({
            points: newPoints,
            level: newLevel,
            activity_score: newPoints,
            last_activity_at: now,
          })
          .eq("id", userId.trim());

        if (updateError) return jsonResponse({ error: updateError.message }, 500);

        return jsonResponse({
          ok: true,
          userId: userId.trim(),
          previousPoints: currentPoints,
          delta: parsedDelta,
          newPoints,
          newLevel,
        });
      },
    },
  },
});
