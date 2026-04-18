import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BACKEND_PORT: z.coerce.number().int().positive().default(4310),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  REDIS_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  PLATFORM_TELEGRAM_CHAT_ID: z.string().min(1).optional(),
});

export type BackendEnv = z.infer<typeof envSchema>;

export function loadEnv(): BackendEnv {
  return envSchema.parse(process.env);
}