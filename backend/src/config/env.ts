import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BACKEND_PORT: z.coerce.number().int().positive().default(4310),
  TRACKING_ENABLED: z.coerce.boolean().default(true),
  LIVE_STORAGE_DRIVER: z.enum(["supabase", "postgres"]).default("supabase"),
  TRACKING_ADAPTER: z.enum(["passive", "tiktok-live"]).default("tiktok-live"),
  TRACKING_POLL_INTERVAL_MS: z.coerce.number().int().min(15_000).max(30_000).default(15_000),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  POSTGRES_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  PLATFORM_TELEGRAM_CHAT_ID: z.string().min(1).optional(),
  TIKTOK_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
  TIKTOK_SIGN_API_KEY: z.string().min(1).optional(),
  TIKTOK_SESSION_ID: z.string().min(1).optional(),
  TIKTOK_TT_TARGET_IDC: z.string().min(1).optional(),
  PRMOTION_API_URL: z.string().url().default("https://api.prmotion.me/v1"),
  PRMOTION_API_KEY: z.string().min(1).optional(),
  PRMOTION_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
});

export type BackendEnv = z.infer<typeof envSchema>;

export function loadEnv(): BackendEnv {
  return envSchema.parse(process.env);
}

export function hasSupabaseAdminCredentials(env: BackendEnv) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}