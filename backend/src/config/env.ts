import { z } from "zod";

const optionalString = () =>
  z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().min(1).optional());

const optionalUrl = () =>
  z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BACKEND_PORT: z.coerce.number().int().positive().default(4310),
  TRACKING_ENABLED: z.coerce.boolean().default(true),
  LIVE_STORAGE_DRIVER: z.enum(["supabase", "postgres"]).default("supabase"),
  TRACKING_ADAPTER: z.enum(["passive", "tiktok-live"]).default("tiktok-live"),
  TRACKING_POLL_INTERVAL_MS: z.coerce.number().int().min(15_000).max(30_000).default(15_000),
  SUPABASE_URL: optionalUrl(),
  SUPABASE_PUBLISHABLE_KEY: optionalString(),
  SUPABASE_SERVICE_ROLE_KEY: optionalString(),
  POSTGRES_URL: optionalString(),
  REDIS_URL: optionalUrl(),
  TELEGRAM_BOT_TOKEN: optionalString(),
  PLATFORM_TELEGRAM_CHAT_ID: optionalString(),
  TIKTOK_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
  TIKTOK_PROFILE_SYNC_INTERVAL_MS: z.coerce.number().int().min(0).max(86_400_000).default(21_600_000),
  TIKTOK_SIGN_API_KEY: optionalString(),
  TIKTOK_SESSION_ID: optionalString(),
  TIKTOK_TT_TARGET_IDC: optionalString(),
  TIKTOK_MS_TOKEN: optionalString(),
  TIKTOK_COOKIE_HEADER: optionalString(),
  PRMOTION_API_URL: z.string().url().default("https://api.prmotion.me/v1"),
  PRMOTION_API_KEY: optionalString(),
  PRMOTION_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
  MEDIA_UPLOAD_DIR: optionalString(),
  MEDIA_PUBLIC_BASE_URL: optionalUrl(),
});

export type BackendEnv = z.infer<typeof envSchema>;

export function loadEnv(): BackendEnv {
  return envSchema.parse(process.env);
}

export function hasSupabaseAdminCredentials(env: BackendEnv) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}