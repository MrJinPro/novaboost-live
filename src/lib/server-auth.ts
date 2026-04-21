// Lightweight server-side auth helper for non-admin routes.
// Validates the Bearer token and returns the user's ID.
import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseEnvValue } from "@/integrations/supabase/env-utils";
import type { Database } from "@/integrations/supabase/types";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function extractBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export async function requireAuth(request: Request): Promise<{ userId: string } | { error: Response }> {
  const token = extractBearerToken(request);
  if (!token) {
    return { error: jsonResponse({ error: "Требуется авторизация." }, 401) };
  }

  const supabaseUrl = normalizeSupabaseEnvValue(process.env.SUPABASE_URL);
  const supabasePublishableKey = normalizeSupabaseEnvValue(
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY,
  );

  if (!supabaseUrl || !supabasePublishableKey) {
    return { error: jsonResponse({ error: "Supabase env not configured." }, 500) };
  }

  const client = createClient<Database>(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return { error: jsonResponse({ error: "Недействительный токен." }, 401) };
  }

  return { userId: data.claims.sub };
}
