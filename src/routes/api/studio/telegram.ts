import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAuth } from "@/lib/server-auth";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/studio/telegram")({
  server: {
    handlers: {
      // GET: load Telegram settings + connected chats + active token
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if ("error" in auth) return auth.error;

        const userId = auth.userId;

        // Find streamer owned by this user
        const { data: streamer, error: sErr } = await supabaseAdmin
          .from("streamers")
          .select("id, display_name, tiktok_username")
          .eq("user_id", userId)
          .maybeSingle();

        if (sErr) return jsonResponse({ error: sErr.message }, 500);
        if (!streamer) return jsonResponse({ error: "Профиль стримера не найден." }, 404);

        // Load connected chats
        const { data: chats } = await supabaseAdmin
          .from("telegram_chats")
          .select("id, chat_id, chat_kind, title, username, notifications_enabled, moderation_enabled, is_primary")
          .eq("streamer_id", streamer.id);

        // Load notification settings
        const { data: settings } = await supabaseAdmin
          .from("telegram_notification_settings")
          .select("live_notification_enabled, boost_notification_enabled, post_sync_enabled, live_message_template")
          .eq("streamer_id", streamer.id)
          .maybeSingle();

        // Active (unused, non-expired) token
        const { data: activeToken } = await supabaseAdmin
          .from("telegram_bot_connect_tokens")
          .select("id, token, expires_at, chat_kind")
          .eq("streamer_id", streamer.id)
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return jsonResponse({ streamer, chats: chats ?? [], settings, activeToken });
      },

      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if ("error" in auth) return auth.error;

        const userId = auth.userId;

        let body: unknown;
        try { body = await request.json(); } catch {
          return jsonResponse({ error: "Некорректный JSON." }, 400);
        }

        const { action, chatKind, chatId, settingsUpdate } = body as {
          action?: string;
          chatKind?: string;
          chatId?: string;
          settingsUpdate?: Record<string, unknown>;
        };

        const { data: streamer, error: sErr } = await supabaseAdmin
          .from("streamers")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        if (sErr) return jsonResponse({ error: sErr.message }, 500);
        if (!streamer) return jsonResponse({ error: "Профиль стримера не найден." }, 404);

        // ── Generate connect token ──────────────────────────────────────
        if (action === "generate_token") {
          const kind = chatKind ?? "streamer_channel";
          if (!["streamer_channel", "streamer_group"].includes(kind)) {
            return jsonResponse({ error: "Некорректный тип чата." }, 400);
          }

          // Invalidate previous unused tokens for this kind
          await supabaseAdmin
            .from("telegram_bot_connect_tokens")
            .update({ expires_at: new Date().toISOString() })
            .eq("streamer_id", streamer.id)
            .eq("chat_kind", kind)
            .is("used_at", null);

          const { data: token, error: tErr } = await supabaseAdmin
            .from("telegram_bot_connect_tokens")
            .insert({
              streamer_id: streamer.id,
              user_id: userId,
              chat_kind: kind,
            })
            .select("id, token, expires_at, chat_kind")
            .single();

          if (tErr) return jsonResponse({ error: tErr.message }, 500);
          return jsonResponse({ token });
        }

        // ── Disconnect a chat ───────────────────────────────────────────
        if (action === "disconnect_chat") {
          if (!chatId) return jsonResponse({ error: "Укажи chatId." }, 400);

          // Verify ownership
          const { data: chat } = await supabaseAdmin
            .from("telegram_chats")
            .select("id, streamer_id")
            .eq("id", chatId)
            .maybeSingle();

          if (!chat || chat.streamer_id !== streamer.id) {
            return jsonResponse({ error: "Чат не найден или недостаточно прав." }, 403);
          }

          // Soft-disconnect: disable notifications
          await supabaseAdmin
            .from("telegram_chats")
            .update({ notifications_enabled: false })
            .eq("id", chatId);

          // Remove notification routes
          await supabaseAdmin
            .from("telegram_notification_routes")
            .update({ enabled: false })
            .eq("telegram_chat_id", chatId);

          return jsonResponse({ ok: true });
        }

        // ── Update notification settings ────────────────────────────────
        if (action === "update_settings" && settingsUpdate) {
          const allowed = new Set(["live_notification_enabled", "boost_notification_enabled", "post_sync_enabled", "live_message_template"]);
          const safeUpdate: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(settingsUpdate)) {
            if (allowed.has(k)) safeUpdate[k] = v;
          }
          if (!Object.keys(safeUpdate).length) return jsonResponse({ error: "Нет допустимых полей для обновления." }, 400);

          safeUpdate.updated_at = new Date().toISOString();

          const { error: uErr } = await supabaseAdmin
            .from("telegram_notification_settings")
            .upsert({ streamer_id: streamer.id, ...safeUpdate }, { onConflict: "streamer_id" });

          if (uErr) return jsonResponse({ error: uErr.message }, 500);
          return jsonResponse({ ok: true });
        }

        return jsonResponse({ error: "Неизвестное действие." }, 400);
      },
    },
  },
});
