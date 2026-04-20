import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdmin } from "@/lib/server-admin-auth";
import type { AdminApplicationStatus, AdminManagedPlatformRole, AdminPanelAccessLevel, AdminStaffAccessLevel } from "@/lib/admin-moderation-data";
import { lookupTikTokProfile } from "@/lib/tiktok-profile-data";

type StaffAssignmentRow = {
  user_id: string;
  access_level: string;
  is_active: boolean;
  notes: string | null;
};

type ProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  tiktok_username: string | null;
  created_at: string;
};

type StreamerRow = {
  id: string;
  user_id: string | null;
  display_name: string;
  tiktok_username: string;
  is_live: boolean;
  viewer_count: number;
  followers_count: number;
  tracking_enabled: boolean;
  verification_status: AdminApplicationStatus;
  created_at?: string | null;
};

function normalizeTikTokUsername(value: string) {
  return value.trim().replace(/^https?:\/\/www\.tiktok\.com\//i, "").replace(/^@+/, "").replace(/\/live$/i, "").trim().toLowerCase();
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function normalizeAccessLevel(value: string | null | undefined): AdminStaffAccessLevel | null {
  if (value === "support" || value === "moderator" || value === "admin") {
    return value;
  }

  return null;
}

function isMissingRelationError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42P01" || Boolean(error?.message?.includes("admin_staff_assignments"));
}

async function loadUsers() {
  const [{ data: profiles, error: profilesError }, { data: streamers, error: streamersError }, { data: roles, error: rolesError }, { data: assignments, error: assignmentsError }, authUsersResponse] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, username, display_name, tiktok_username, created_at").order("created_at", { ascending: false }).limit(300),
    supabaseAdmin.from("streamers").select("id, user_id, display_name, tiktok_username, is_live, viewer_count, followers_count, tracking_enabled, verification_status, created_at"),
    supabaseAdmin.from("user_roles").select("user_id, role"),
    supabaseAdmin.from("admin_staff_assignments").select("user_id, access_level, is_active, notes"),
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 300 }),
  ]);

  if (profilesError) throw profilesError;
  if (streamersError) throw streamersError;
  if (rolesError) throw rolesError;
  if (assignmentsError && !isMissingRelationError(assignmentsError)) throw assignmentsError;
  if (authUsersResponse.error) throw authUsersResponse.error;

  const streamerByUserId = new Map<string, StreamerRow>();
  for (const streamer of (streamers ?? []) as StreamerRow[]) {
    if (streamer.user_id) {
      streamerByUserId.set(streamer.user_id, streamer);
    }
  }

  const adminRoleUserIds = new Set(
    ((roles ?? []) as Array<{ user_id: string; role: string }>).filter((row) => row.role === "admin").map((row) => row.user_id),
  );

  const assignmentByUserId = new Map<string, StaffAssignmentRow>();
  for (const assignment of ((assignments ?? []) as StaffAssignmentRow[])) {
    assignmentByUserId.set(assignment.user_id, assignment);
  }

  const authUserById = new Map((authUsersResponse.data?.users ?? []).map((item) => [item.id, item]));

  const users = ((profiles ?? []) as ProfileRow[]).map((profile) => {
    const streamer = streamerByUserId.get(profile.id) ?? null;
    const authUser = authUserById.get(profile.id);
    const declaredRole = authUser?.user_metadata?.account_role === "streamer" ? "streamer" : "viewer";
    const assignment = assignmentByUserId.get(profile.id);

    return {
      userId: profile.id,
      email: authUser?.email ?? null,
      username: profile.username,
      displayName: profile.display_name ?? profile.username,
      tiktokUsername: profile.tiktok_username,
      platformRole: streamer?.verification_status === "verified" || declaredRole === "streamer" ? "streamer" : "viewer",
      staffAccessLevel: adminRoleUserIds.has(profile.id) ? (assignment?.is_active ? (normalizeAccessLevel(assignment.access_level) ?? "admin") : "admin") : "none",
      streamerId: streamer?.id ?? null,
      streamerDisplayName: streamer?.display_name ?? null,
      streamerVerificationStatus: streamer?.verification_status ?? "none",
      hasStreamerProfile: Boolean(streamer),
      createdAt: profile.created_at ?? authUser?.created_at ?? null,
      lastSignInAt: authUser?.last_sign_in_at ?? null,
      adminNotes: assignment?.notes ?? null,
    };
  });

  const trackedStreamers = ((streamers ?? []) as StreamerRow[])
    .filter((streamer) => !streamer.user_id)
    .sort((left, right) => (right.created_at ?? "").localeCompare(left.created_at ?? ""))
    .map((streamer) => ({
      streamerId: streamer.id,
      displayName: streamer.display_name,
      tiktokUsername: streamer.tiktok_username,
      isLive: streamer.is_live,
      viewerCount: streamer.viewer_count ?? 0,
      followersCount: streamer.followers_count ?? 0,
      trackingEnabled: streamer.tracking_enabled,
      createdAt: streamer.created_at ?? null,
    }));

  return { users, trackedStreamers };
}

async function createTrackedStreamer(tiktokUsername: string) {
  const normalizedUsername = normalizeTikTokUsername(tiktokUsername);
  if (!normalizedUsername) {
    throw new Error("Укажи TikTok username.");
  }

  const profile = await lookupTikTokProfile(normalizedUsername).catch(() => null);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("streamers")
    .select("id, user_id, tracking_enabled")
    .ilike("tiktok_username", normalizedUsername)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing?.user_id) {
    throw new Error("Этот TikTok username уже привязан к зарегистрированному стримеру.");
  }

  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from("streamers")
      .update({
        tracking_enabled: true,
        display_name: profile?.displayName?.trim() || normalizedUsername,
        avatar_url: profile?.avatarUrl ?? null,
        logo_url: profile?.avatarUrl ?? null,
        bio: profile?.bio ?? null,
        followers_count: profile?.followersCount ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateError) {
      throw updateError;
    }

    return;
  }

  const now = new Date().toISOString();
  const { error: insertError } = await supabaseAdmin
    .from("streamers")
    .insert({
      user_id: null,
      tiktok_username: normalizedUsername,
      display_name: profile?.displayName?.trim() || normalizedUsername,
      avatar_url: profile?.avatarUrl ?? null,
      logo_url: profile?.avatarUrl ?? null,
      bio: profile?.bio ?? null,
      tracking_enabled: true,
      verification_status: "pending",
      needs_boost: false,
      total_boost_amount: 0,
      is_live: false,
      viewer_count: 0,
      followers_count: profile?.followersCount ?? 0,
      created_at: now,
      updated_at: now,
    });

  if (insertError) {
    throw insertError;
  }
}

async function updateUserMetadataRole(userId: string, role: AdminManagedPlatformRole) {
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

async function setPlatformRole(userId: string, role: AdminManagedPlatformRole) {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, username, display_name, tiktok_username, avatar_url, bio")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) throw new Error("Профиль пользователя не найден.");

  const now = new Date().toISOString();

  if (role === "streamer") {
    const tiktokUsername = (profile.tiktok_username?.trim() || profile.username).trim();
    const { error: upsertError } = await supabaseAdmin
      .from("streamers")
      .upsert({
        user_id: userId,
        tiktok_username: tiktokUsername,
        display_name: profile.display_name?.trim() || profile.username,
        avatar_url: profile.avatar_url ?? null,
        logo_url: profile.avatar_url ?? null,
        bio: profile.bio ?? null,
        verification_status: "verified",
        verified_at: now,
        updated_at: now,
      }, { onConflict: "user_id" });

    if (upsertError) throw upsertError;
  } else {
    const { error: updateStreamerError } = await supabaseAdmin
      .from("streamers")
      .update({
        verification_status: "rejected",
        verified_at: null,
        updated_at: now,
      })
      .eq("user_id", userId);

    if (updateStreamerError) throw updateStreamerError;
  }

  await updateUserMetadataRole(userId, role);
}

async function setStaffAccess(actorUserId: string, userId: string, accessLevel: AdminPanelAccessLevel, notes?: string) {
  if (accessLevel === "none") {
    const { error: deleteAssignmentError } = await supabaseAdmin.from("admin_staff_assignments").delete().eq("user_id", userId);
    if (deleteAssignmentError && !isMissingRelationError(deleteAssignmentError)) throw deleteAssignmentError;

    const { error: deleteRoleError } = await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
    if (deleteRoleError) throw deleteRoleError;
    return;
  }

  const { error: roleUpsertError } = await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
  if (roleUpsertError) throw roleUpsertError;

  const { error: assignmentUpsertError } = await supabaseAdmin.from("admin_staff_assignments").upsert({
    user_id: userId,
    access_level: accessLevel,
    is_active: true,
    notes: notes?.trim() || null,
    created_by: actorUserId,
    updated_by: actorUserId,
  }, { onConflict: "user_id" });

  if (assignmentUpsertError) throw assignmentUpsertError;
}

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if ("error" in auth) {
          return auth.error;
        }

        try {
          const data = await loadUsers();
          return jsonResponse({ ...data, currentAccessLevel: auth.accessLevel });
        } catch (error) {
          return jsonResponse({ error: error instanceof Error ? error.message : "Не удалось загрузить пользователей." }, 500);
        }
      },
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if ("error" in auth) {
          return auth.error;
        }

        if (auth.accessLevel === "support") {
          return jsonResponse({ error: "Support не может добавлять tracked-only стримеров." }, 403);
        }

        let body: { action?: string; tiktokUsername?: string } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonResponse({ error: "Некорректный JSON body." }, 400);
        }

        if (body.action !== "create-tracked-streamer") {
          return jsonResponse({ error: "Неизвестное действие." }, 400);
        }

        try {
          await createTrackedStreamer(body.tiktokUsername ?? "");
          return jsonResponse({ ok: true });
        } catch (error) {
          return jsonResponse({ error: error instanceof Error ? error.message : "Не удалось добавить tracked-only стримера." }, 500);
        }
      },
      PATCH: async ({ request }) => {
        const auth = await requireAdmin(request);
        if ("error" in auth) {
          return auth.error;
        }

        let body: { action?: string; userId?: string; role?: string; accessLevel?: string; notes?: string } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonResponse({ error: "Некорректный JSON body." }, 400);
        }

        const userId = body.userId?.trim();
        if (!userId) {
          return jsonResponse({ error: "Передай userId." }, 400);
        }

        try {
          if (body.action === "set-platform-role") {
            if (auth.accessLevel === "support") {
              return jsonResponse({ error: "Support не может менять роль пользователя." }, 403);
            }

            const role = body.role === "viewer" || body.role === "streamer" ? body.role : null;
            if (!role) {
              return jsonResponse({ error: "Роль должна быть viewer или streamer." }, 400);
            }

            await setPlatformRole(userId, role);
            return jsonResponse({ ok: true });
          }

          if (body.action === "set-staff-access") {
            if (auth.accessLevel !== "admin") {
              return jsonResponse({ error: "Только admin может менять staff access." }, 403);
            }

            const accessLevel = body.accessLevel === "none" ? "none" : normalizeAccessLevel(body.accessLevel);
            if (!accessLevel) {
              return jsonResponse({ error: "accessLevel должен быть none, support, moderator или admin." }, 400);
            }

            await setStaffAccess(auth.userId, userId, accessLevel, body.notes);
            return jsonResponse({ ok: true });
          }

          return jsonResponse({ error: "Неизвестное действие." }, 400);
        } catch (error) {
          return jsonResponse({ error: error instanceof Error ? error.message : "Не удалось обновить пользователя." }, 500);
        }
      },
    },
  },
});