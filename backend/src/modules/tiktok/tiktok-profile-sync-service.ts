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
  followers_count: number | null;
};

type ViewerProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  tiktok_username: string | null;
  avatar_url: string | null;
  bio: string | null;
};

const PROFILE_SYNC_BATCH_SIZE = 250;

export class TikTokProfileSyncService {
  private poller: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: Logger,
    private readonly env: BackendEnv,
  ) {}

  scheduleProfileSync() {
    if (this.env.TIKTOK_PROFILE_SYNC_INTERVAL_MS <= 0) {
      this.logger.warn("TikTok profile sync scheduler is disabled by env.");
      return;
    }

    if (this.poller) {
      return;
    }

    void this.runProfileSync();
    this.poller = setInterval(() => {
      void this.runProfileSync();
    }, this.env.TIKTOK_PROFILE_SYNC_INTERVAL_MS);

    this.logger.info("TikTok profile sync scheduler started", {
      intervalMs: this.env.TIKTOK_PROFILE_SYNC_INTERVAL_MS,
      batchSize: PROFILE_SYNC_BATCH_SIZE,
    });
  }

  scheduleStreamerProfileSync() {
    this.scheduleProfileSync();
  }

  stop() {
    if (!this.poller) {
      return;
    }

    clearInterval(this.poller);
    this.poller = null;
    this.logger.info("TikTok profile sync scheduler stopped");
  }

  async runProfileSync() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      await this.runStreamerProfileSync();
      await this.runViewerProfileSync();
    } catch (error) {
      this.logger.error("TikTok profile sync tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isRunning = false;
    }
  }

  async runStreamerProfileSync() {
    try {
      const { data, error } = await this.supabase
        .from("streamers")
        .select("id, user_id, display_name, tiktok_username, avatar_url, logo_url, bio, followers_count")
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
          const nextFollowersCount = profile.followersCount ?? streamer.followers_count ?? 0;

          const { error: streamerError } = await this.supabase
            .from("streamers")
            .update({
              display_name: nextDisplayName,
              avatar_url: nextAvatarUrl,
              logo_url: nextAvatarUrl,
              bio: nextBio,
              followers_count: nextFollowersCount,
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
        target: "streamers",
        checked: streamers.length,
        synced: syncedCount,
      });
    } catch (error) {
      this.logger.error("TikTok streamer profile sync tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async runViewerProfileSync() {
    try {
      const { data, error } = await this.supabase
        .from("profiles")
        .select("id, username, display_name, tiktok_username, avatar_url, bio")
        .not("tiktok_username", "is", null)
        .neq("tiktok_username", "")
        .order("updated_at", { ascending: true })
        .limit(PROFILE_SYNC_BATCH_SIZE);

      if (error) {
        throw error;
      }

      const profiles = (data ?? []) as ViewerProfileRow[];
      let syncedCount = 0;

      for (const profileRow of profiles) {
        const normalizedUsername = profileRow.tiktok_username?.trim() ?? "";
        if (!normalizedUsername) {
          continue;
        }

        try {
          const profile = await lookupTikTokProfile(normalizedUsername);
          const nextDisplayName = profile.displayName?.trim() || profileRow.display_name || profileRow.username;
          const nextAvatarUrl = profile.avatarUrl?.trim() || profileRow.avatar_url || null;
          const nextBio = profile.bio?.trim() || profileRow.bio || null;

          const { error: profileError } = await this.supabase
            .from("profiles")
            .update({
              display_name: nextDisplayName,
              tiktok_username: normalizedUsername,
              avatar_url: nextAvatarUrl,
              bio: nextBio,
              updated_at: new Date().toISOString(),
            })
            .eq("id", profileRow.id);

          if (profileError) {
            throw profileError;
          }

          syncedCount += 1;
        } catch (error) {
          this.logger.warn("TikTok profile sync failed for viewer", {
            userId: profileRow.id,
            tiktokUsername: normalizedUsername,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      this.logger.info("TikTok profile sync tick completed", {
        target: "profiles",
        checked: profiles.length,
        synced: syncedCount,
      });
    } catch (error) {
      this.logger.error("TikTok viewer profile sync tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}