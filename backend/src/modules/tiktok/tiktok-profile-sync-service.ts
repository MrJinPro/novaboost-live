import type { SupabaseClient } from "@supabase/supabase-js";

import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import { lookupTikTokProfile } from "./tiktok-profile-service.js";

type StreamerProfileRow = {
  id: string;
  user_id: string | null;
  display_name: string;
  tiktok_username: string;
  avatar_url: string | null;
  logo_url: string | null;
  bio: string | null;
};

const PROFILE_SYNC_BATCH_SIZE = 25;

export class TikTokProfileSyncService {
  private poller: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: Logger,
    private readonly env: BackendEnv,
  ) {}

  scheduleStreamerProfileSync() {
    if (this.env.TIKTOK_PROFILE_SYNC_INTERVAL_MS <= 0) {
      this.logger.warn("TikTok profile sync scheduler is disabled by env.");
      return;
    }

    if (this.poller) {
      return;
    }

    void this.runStreamerProfileSync();
    this.poller = setInterval(() => {
      void this.runStreamerProfileSync();
    }, this.env.TIKTOK_PROFILE_SYNC_INTERVAL_MS);

    this.logger.info("TikTok profile sync scheduler started", {
      intervalMs: this.env.TIKTOK_PROFILE_SYNC_INTERVAL_MS,
      batchSize: PROFILE_SYNC_BATCH_SIZE,
    });
  }

  stop() {
    if (!this.poller) {
      return;
    }

    clearInterval(this.poller);
    this.poller = null;
    this.logger.info("TikTok profile sync scheduler stopped");
  }

  async runStreamerProfileSync() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const { data, error } = await this.supabase
        .from("streamers")
        .select("id, user_id, display_name, tiktok_username, avatar_url, logo_url, bio")
        .not("tiktok_username", "is", null)
        .neq("tiktok_username", "")
        .order("updated_at", { ascending: true })
        .limit(PROFILE_SYNC_BATCH_SIZE);

      if (error) {
        throw error;
      }

      const streamers = (data ?? []) as StreamerProfileRow[];
      let syncedCount = 0;

      for (const streamer of streamers) {
        const normalizedUsername = streamer.tiktok_username.trim();
        if (!normalizedUsername) {
          continue;
        }

        try {
          const profile = await lookupTikTokProfile(normalizedUsername);
          const nextDisplayName = profile.displayName?.trim() || streamer.display_name;
          const nextAvatarUrl = profile.avatarUrl?.trim() || streamer.avatar_url || streamer.logo_url || null;
          const nextBio = profile.bio?.trim() || streamer.bio || null;

          const { error: streamerError } = await this.supabase
            .from("streamers")
            .update({
              display_name: nextDisplayName,
              avatar_url: nextAvatarUrl,
              logo_url: nextAvatarUrl,
              bio: nextBio,
              updated_at: new Date().toISOString(),
            })
            .eq("id", streamer.id);

          if (streamerError) {
            throw streamerError;
          }

          if (streamer.user_id) {
            const { error: profileError } = await this.supabase
              .from("profiles")
              .update({
                display_name: nextDisplayName,
                tiktok_username: normalizedUsername,
                avatar_url: nextAvatarUrl,
                bio: nextBio,
                updated_at: new Date().toISOString(),
              })
              .eq("id", streamer.user_id);

            if (profileError) {
              this.logger.warn("TikTok profile sync could not update linked user profile", {
                streamerId: streamer.id,
                userId: streamer.user_id,
                error: profileError.message,
              });
            }
          }

          syncedCount += 1;
        } catch (error) {
          this.logger.warn("TikTok profile sync failed for streamer", {
            streamerId: streamer.id,
            tiktokUsername: streamer.tiktok_username,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      this.logger.info("TikTok profile sync tick completed", {
        checked: streamers.length,
        synced: syncedCount,
      });
    } catch (error) {
      this.logger.error("TikTok profile sync tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isRunning = false;
    }
  }
}