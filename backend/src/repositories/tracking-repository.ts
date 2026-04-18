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
  rawSnapshot?: Record<string, unknown>;
};

type StreamSessionRow = {
  id: string;
  streamer_id: string;
  source: string;
  status: "live" | "ended" | "failed";
  started_at: string;
  ended_at: string | null;
  peak_viewer_count: number;
  current_viewer_count: number;
  like_count: number;
  gift_count: number;
  message_count: number;
  raw_snapshot: Record<string, unknown>;
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

  async getLatestLiveSession(streamerId: string) {
    const { data, error } = await this.supabase
      .from("stream_sessions")
      .select("id, streamer_id, source, status, started_at, ended_at, peak_viewer_count, current_viewer_count, like_count, gift_count, message_count, raw_snapshot")
      .eq("streamer_id", streamerId)
      .eq("status", "live")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data ?? null) as StreamSessionRow | null;
  }

  async startLiveSession(snapshot: TrackingSnapshot) {
    const { data, error } = await this.supabase
      .from("stream_sessions")
      .insert({
        streamer_id: snapshot.streamerId,
        source: snapshot.source,
        status: "live",
        started_at: snapshot.checkedAt,
        peak_viewer_count: snapshot.viewerCount,
        current_viewer_count: snapshot.viewerCount,
        raw_snapshot: snapshot.rawSnapshot ?? {
          display_name: snapshot.displayName,
          tiktok_username: snapshot.tiktokUsername,
          checked_at: snapshot.checkedAt,
        },
      })
      .select("id, streamer_id, source, status, started_at, ended_at, peak_viewer_count, current_viewer_count, like_count, gift_count, message_count, raw_snapshot")
      .single();

    if (error) {
      throw error;
    }

    return data as StreamSessionRow;
  }

  async updateLiveSession(sessionId: string, snapshot: TrackingSnapshot, previousPeak: number) {
    const { error } = await this.supabase
      .from("stream_sessions")
      .update({
        current_viewer_count: snapshot.viewerCount,
        peak_viewer_count: Math.max(previousPeak, snapshot.viewerCount),
        raw_snapshot: snapshot.rawSnapshot ?? {
          display_name: snapshot.displayName,
          tiktok_username: snapshot.tiktokUsername,
          checked_at: snapshot.checkedAt,
        },
      })
      .eq("id", sessionId);

    if (error) {
      throw error;
    }
  }

  async endLiveSession(sessionId: string, snapshot: TrackingSnapshot, previousPeak: number) {
    const { error } = await this.supabase
      .from("stream_sessions")
      .update({
        status: "ended",
        ended_at: snapshot.checkedAt,
        current_viewer_count: snapshot.viewerCount,
        peak_viewer_count: Math.max(previousPeak, snapshot.viewerCount),
        raw_snapshot: snapshot.rawSnapshot ?? {
          display_name: snapshot.displayName,
          tiktok_username: snapshot.tiktokUsername,
          checked_at: snapshot.checkedAt,
        },
      })
      .eq("id", sessionId);

    if (error) {
      throw error;
    }
  }

  async insertStreamEvent(input: {
    streamerId: string;
    streamSessionId: string | null;
    eventType: "live_started" | "live_ended" | "snapshot_updated";
    source: string;
    eventTimestamp: string;
    normalizedPayload: Record<string, unknown>;
    rawPayload?: Record<string, unknown>;
  }) {
    const sessionId = input.streamSessionId;
    if (!sessionId) {
      return;
    }

    const { error } = await this.supabase
      .from("stream_events")
      .insert({
        stream_session_id: sessionId,
        streamer_id: input.streamerId,
        event_type: input.eventType,
        source: input.source,
        event_timestamp: input.eventTimestamp,
        raw_payload: input.rawPayload ?? input.normalizedPayload,
        normalized_payload: input.normalizedPayload,
      });

    if (error) {
      throw error;
    }
  }
}