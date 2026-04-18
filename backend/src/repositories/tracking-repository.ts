import type { SupabaseClient } from "@supabase/supabase-js";

export type TrackedStreamer = {
  id: string;
  display_name: string;
  tiktok_username: string;
  is_live: boolean;
  viewer_count: number;
  followers_count: number;
  tracking_enabled: boolean;
  tracking_source: string | null;
  last_checked_live_at: string | null;
};

export type TrackingSnapshot = {
  streamerId: string;
  displayName: string;
  tiktokUsername: string;
  isLive: boolean;
  viewerCount: number;
  followersCount: number;
  checkedAt: string;
  source: string;
};

export class TrackingRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getTrackedStreamers() {
    const { data, error } = await this.supabase
      .from("streamers")
      .select("id, display_name, tiktok_username, is_live, viewer_count, followers_count, tracking_enabled, tracking_source, last_checked_live_at")
      .eq("tracking_enabled", true)
      .order("priority_score", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []) as TrackedStreamer[];
  }

  async updateTrackingSnapshot(snapshot: TrackingSnapshot) {
    const { error } = await this.supabase
      .from("streamers")
      .update({
        is_live: snapshot.isLive,
        viewer_count: snapshot.viewerCount,
        followers_count: snapshot.followersCount,
        last_checked_live_at: snapshot.checkedAt,
        tracking_source: snapshot.source,
      })
      .eq("id", snapshot.streamerId);

    if (error) {
      throw error;
    }
  }
}