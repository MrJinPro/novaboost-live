import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeSupabaseEnvValue } from "@/integrations/supabase/env-utils";
import type { Database } from "@/integrations/supabase/types";
import type { AdminStaffAccessLevel } from "@/lib/admin-moderation-data";

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

async function validateAccessToken(token: string) {
  const supabaseUrl = normalizeSupabaseEnvValue(process.env.SUPABASE_URL);
  const supabasePublishableKey = normalizeSupabaseEnvValue(process.env.SUPABASE_PUBLISHABLE_KEY);

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing Supabase environment variables. Ensure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are set.");
  }

  const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return null;
  }

  return data.claims.sub;
}

export async function requireAdmin(request: Request) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return { error: jsonResponse({ error: "Нужен access token администратора." }, 401) };
    }

    const userId = await validateAccessToken(token);
    if (!userId) {
      return { error: jsonResponse({ error: "Не удалось подтвердить пользователя." }, 401) };
    }

    const { data: adminRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
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
      .eq("user_id", userId)
      .maybeSingle();

    if (assignmentError && !isMissingRelationError(assignmentError)) {
      return { error: jsonResponse({ error: assignmentError.message }, 500) };
    }

    return {
      userId,
      accessLevel: assignment?.is_active ? (normalizeAccessLevel(assignment.access_level) ?? "admin") : "admin",
    };
  } catch (error) {
    return { error: jsonResponse({ error: error instanceof Error ? error.message : "Не удалось проверить права доступа." }, 500) };
  }
}