import { createFileRoute } from "@tanstack/react-router";
import { normalizeSupabaseEnvValue } from "@/integrations/supabase/env-utils";

const ONE_TIME_PASSWORD = "5as4d6as54das65d4as65s4d";

export const Route = createFileRoute("/api/reveal-key")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { password?: string } = {};
        try {
          body = (await request.json()) as { password?: string };
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        if (body.password !== ONE_TIME_PASSWORD) {
          return new Response("Forbidden", { status: 403 });
        }

        const key = normalizeSupabaseEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
        const url = normalizeSupabaseEnvValue(process.env.SUPABASE_URL);
        const publishableKey = normalizeSupabaseEnvValue(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY);

        if (!key) {
          return new Response("SUPABASE_SERVICE_ROLE_KEY is not set on the server", { status: 500 });
        }

        return Response.json({
          SUPABASE_URL: url ?? null,
          SUPABASE_PUBLISHABLE_KEY: publishableKey ?? null,
          SUPABASE_SERVICE_ROLE_KEY: key,
        });
      },
    },
  },
});