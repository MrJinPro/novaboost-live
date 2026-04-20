import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { requireAdmin } from "@/lib/server-admin-auth";
import type { AdminStaffAccessLevel } from "@/lib/admin-moderation-data";

type VerificationStatus = Database["public"]["Enums"]["streamer_verification_status"];

async function updateUserMetadataRole(userId: string, role: "viewer" | "streamer") {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data.user) {
    throw error ?? new Error("Пользователь auth не найден.");
  }

  const metadata = typeof data.user.user_metadata === "object" && data.user.user_metadata ? data.user.user_metadata : {};
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...metadata,
      account_role: role,
    },
  });

  if (updateError) {
    throw updateError;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function loadApplications() {
  const { data, error } = await supabaseAdmin
    .from("streamer_verifications")
    .select("id, streamer_id, submitted_by, status, evidence_type, evidence_value, notes, created_at, reviewed_at, reviewed_by, streamers!inner(id, user_id, display_name, tiktok_username, avatar_url, bio, verification_method, verification_status)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Array<{
    id: string;
    streamer_id: string;
    submitted_by: string | null;
    status: VerificationStatus;
    evidence_type: string | null;
    evidence_value: string | null;
    notes: string | null;
    created_at: string;
    reviewed_at: string | null;
    reviewed_by: string | null;
    streamers: {
      id: string;
      user_id: string | null;
      display_name: string;
      tiktok_username: string;
      avatar_url: string | null;
      bio: string | null;
      verification_method: string | null;
      verification_status: VerificationStatus;
    };
  }>;

  const profileIds = [...new Set(rows.flatMap((row) => [row.submitted_by, row.reviewed_by]).filter((value): value is string => Boolean(value)))];
  const profileMap = new Map<string, { display_name: string | null; username: string }>();

  if (profileIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, username")
      .in("id", profileIds);

    if (profilesError) {
      throw profilesError;
    }

    for (const profile of profiles ?? []) {
      profileMap.set(profile.id, {
        display_name: profile.display_name,
        username: profile.username,
      });
    }
  }

  return rows.map((row) => ({
    verificationId: row.id,
    streamerId: row.streamers.id,
    streamerUserId: row.streamers.user_id,
    streamerDisplayName: row.streamers.display_name,
    streamerTikTokUsername: row.streamers.tiktok_username,
    streamerAvatarUrl: row.streamers.avatar_url,
    streamerBio: row.streamers.bio,
    verificationMethod: row.streamers.verification_method,
    streamerVerificationStatus: row.streamers.verification_status,
    submittedBy: row.submitted_by,
    submitterDisplayName: row.submitted_by ? (profileMap.get(row.submitted_by)?.display_name ?? null) : null,
    submitterUsername: row.submitted_by ? (profileMap.get(row.submitted_by)?.username ?? null) : null,
    status: row.status,
    evidenceType: row.evidence_type,
    evidenceValue: row.evidence_value,
    notes: row.notes,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    reviewerDisplayName: row.reviewed_by ? (profileMap.get(row.reviewed_by)?.display_name ?? null) : null,
  }));
}

async function reviewApplication(adminUserId: string, input: { verificationId?: string; decision?: string }) {
  const verificationId = input.verificationId?.trim();
  const decision = input.decision === "verified" || input.decision === "rejected" ? input.decision : null;

  if (!verificationId || !decision) {
    return new Response(JSON.stringify({ error: "Передай verificationId и решение verified/rejected." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { data: verification, error: verificationError } = await supabaseAdmin
    .from("streamer_verifications")
    .select("id, streamer_id, submitted_by, streamers(user_id)")
    .eq("id", verificationId)
    .maybeSingle();

  if (verificationError) {
    return new Response(JSON.stringify({ error: verificationError.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  if (!verification) {
    return new Response(JSON.stringify({ error: "Заявка не найдена." }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const targetUserId = verification.streamers?.user_id ?? verification.submitted_by ?? null;

  const now = new Date().toISOString();
  const { error: verificationUpdateError } = await supabaseAdmin
    .from("streamer_verifications")
    .update({
      status: decision,
      reviewed_at: now,
      reviewed_by: adminUserId,
      updated_at: now,
    })
    .eq("id", verification.id);

  if (verificationUpdateError) {
    return new Response(JSON.stringify({ error: verificationUpdateError.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const { error: streamerUpdateError } = await supabaseAdmin
    .from("streamers")
    .update({
      verification_status: decision,
      verified_at: decision === "verified" ? now : null,
      updated_at: now,
    })
    .eq("id", verification.streamer_id);

  if (streamerUpdateError) {
    return new Response(JSON.stringify({ error: streamerUpdateError.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  if (targetUserId) {
    try {
      await updateUserMetadataRole(targetUserId, decision === "verified" ? "streamer" : "viewer");
    } catch (metadataError) {
      return new Response(JSON.stringify({ error: metadataError instanceof Error ? metadataError.message : "Не удалось обновить роль пользователя." }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  }

  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/admin/streamer-applications")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if ("error" in auth) {
          return auth.error;
        }

        try {
          const applications = await loadApplications();
          return jsonResponse({ applications, currentAccessLevel: auth.accessLevel });
        } catch (error) {
          return jsonResponse({ error: error instanceof Error ? error.message : "Не удалось загрузить заявки." }, 500);
        }
      },
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if ("error" in auth) {
          return auth.error;
        }

        if (auth.accessLevel === "support") {
          return jsonResponse({ error: "Support не может менять статус заявок." }, 403);
        }

        let body: { verificationId?: string; decision?: string } = {};
        try {
          body = (await request.json()) as { verificationId?: string; decision?: string };
        } catch {
          return jsonResponse({ error: "Некорректный JSON body." }, 400);
        }

        return reviewApplication(auth.userId, body);
      },
    },
  },
});