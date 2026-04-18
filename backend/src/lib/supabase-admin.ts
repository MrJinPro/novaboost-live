import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BackendEnv } from "../config/env.js";

export function createSupabaseAdminClient(env: BackendEnv): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service-role credentials are required for backend data access.");
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}