import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AdminApplicationStatus, AdminManagedPlatformRole, AdminPanelAccessLevel, AdminStaffAccessLevel } from "@/lib/admin-moderation-data";

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
  verification_status: AdminApplicationStatus;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function extractBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
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

async function requireAdmin(request: Request) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return { error: jsonResponse({ error: "Нужен access token администратора." }, 401) };
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) {
      return { error: jsonResponse({ error: "Не удалось подтвердить пользователя." }, 401) };
    }

    const { data: adminRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", authData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) {
      return { error: jsonResponse({ error: roleError.message }, 500) };
    }

    if (!adminRole) {
      return { error: jsonResponse({ error: "Доступ к админке запрещён." }, 403) };
    }

    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from("admin_staff_assignments")
      .select("access_level, is_active")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (assignmentError && !isMissingRelationError(assignmentError)) {
      return { error: jsonResponse({ error: assignmentError.message }, 500) };
    }

    return {
      userId: authData.user.id,
      accessLevel: assignment?.is_active ? (normalizeAccessLevel(assignment.access_level) ?? "admin") : "admin",
    };
  } catch (error) {
    return { error: jsonResponse({ error: error instanceof Error ? error.message : "Не удалось проверить права доступа." }, 500) };
  }
}

async function loadUsers() {
  const [{ data: profiles, error: profilesError }, { data: streamers, error: streamersError }, { data: roles, error: rolesError }, { data: assignments, error: assignmentsError }, authUsersResponse] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, username, display_name, tiktok_username, created_at").order("created_at", { ascending: false }).limit(300),
    supabaseAdmin.from("streamers").select("id, user_id, display_name, tiktok_username, verification_status"),
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

  return ((profiles ?? []) as ProfileRow[]).map((profile) => {
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
          const users = await loadUsers();
          return jsonResponse({ users, currentAccessLevel: auth.accessLevel });
        } catch (error) {
          return jsonResponse({ error: error instanceof Error ? error.message : "Не удалось загрузить пользователей." }, 500);
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