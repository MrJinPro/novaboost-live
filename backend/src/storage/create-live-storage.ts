import type { SupabaseClient } from "@supabase/supabase-js";

import { TrackingRepository } from "../repositories/tracking-repository.js";
import { ViewerEngagementRepository } from "../repositories/viewer-engagement-repository.js";
import type { BackendEnv } from "../config/env.js";
import { PostgresTrackingStore } from "./postgres-tracking-store.js";
import type { TrackingStore, ViewerEngagementStore } from "./live-storage.js";

export function createLiveStorage(env: BackendEnv, supabaseAdmin: SupabaseClient | null) {
  if (env.LIVE_STORAGE_DRIVER === "postgres" && env.POSTGRES_URL) {
    return {
      trackingStore: new PostgresTrackingStore(env, supabaseAdmin) as TrackingStore,
      engagementStore: undefined,
    };
  }

  const trackingStore: TrackingStore | undefined = supabaseAdmin ? new TrackingRepository(supabaseAdmin) : undefined;
  const engagementStore: ViewerEngagementStore | undefined = supabaseAdmin ? new ViewerEngagementRepository(supabaseAdmin) : undefined;

  return {
    trackingStore,
    engagementStore,
  };
}