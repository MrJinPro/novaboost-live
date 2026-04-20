import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BackendEnv } from "../config/env.js";

function normalizeSupabaseEnvValue(value: string | undefined) {
  if (!value) {
    return value;
  }

  return value.trim().replace(/^['\"]+|['\"]+$/g, "");
}

export function createSupabaseAdminClient(env: BackendEnv): SupabaseClient {
  const supabaseUrl = normalizeSupabaseEnvValue(env.SUPABASE_URL);
  const serviceRoleKey = normalizeSupabaseEnvValue(env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service-role credentials are required for backend data access.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}