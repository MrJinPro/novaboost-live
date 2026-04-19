import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Pool } from "pg";

import type { BackendEnv } from "../config/env.js";
import type { StreamEventRecord, StreamSessionRow, StreamerLiveState, TrackedStreamer, TrackingSnapshot } from "../repositories/tracking-repository.js";
import type { TrackingStore } from "./live-storage.js";

type PostgresStreamSessionRow = {
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
  raw_snapshot: Record<string, unknown> | null;
};

function createPublicSupabaseClient(env: BackendEnv) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function mapSessionRow(row: PostgresStreamSessionRow): StreamSessionRow {
  return {
    id: row.id,
    streamer_id: row.streamer_id,
    source: row.source,
    status: row.status,
    started_at: row.started_at,
    ended_at: row.ended_at,
    peak_viewer_count: row.peak_viewer_count,
    current_viewer_count: row.current_viewer_count,
    like_count: row.like_count,
    gift_count: row.gift_count,
    message_count: row.message_count,
    raw_snapshot: row.raw_snapshot ?? {},
  };
}

export class PostgresTrackingStore implements TrackingStore {
  private readonly pool: Pool;
  private readonly streamersReader: SupabaseClient | null;

  constructor(env: BackendEnv, streamersReader?: SupabaseClient | null) {
    this.pool = new Pool({ connectionString: env.POSTGRES_URL });
    this.streamersReader = streamersReader ?? createPublicSupabaseClient(env);
  }

  async getStreamerLiveState(streamerId: string) {
    const state = await this.pool.query<StreamerLiveState>(
      `select streamer_id as id, tiktok_username, is_live, viewer_count from live_streamer_state where streamer_id = $1 limit 1`,
      [streamerId],
    );

    if (state.rows[0]) {
      return state.rows[0];
    }

    if (!this.streamersReader) {
      return null;
    }

    const { data, error } = await this.streamersReader
      .from("streamers")
      .select("id, tiktok_username, is_live, viewer_count")
      .eq("id", streamerId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data ?? null) as StreamerLiveState | null;
  }

  async getTrackedStreamers() {
    if (!this.streamersReader) {
      return [];
    }

    const { data, error } = await this.streamersReader
      .from("streamers")
      .select("id, display_name, tiktok_username, is_live, viewer_count, followers_count, tracking_enabled, tracking_source, last_checked_live_at")
      .eq("tracking_enabled", true)
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []) as TrackedStreamer[];
  }

  async updateTrackingSnapshot(snapshot: TrackingSnapshot) {
    await this.pool.query(
      `insert into live_streamer_state (streamer_id, tiktok_username, is_live, viewer_count, followers_count, checked_at, source, raw_snapshot, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb, now())
       on conflict (streamer_id) do update
       set tiktok_username = excluded.tiktok_username,
           is_live = excluded.is_live,
           viewer_count = excluded.viewer_count,
           followers_count = excluded.followers_count,
           checked_at = excluded.checked_at,
           source = excluded.source,
           raw_snapshot = excluded.raw_snapshot,
           updated_at = now()`,
      [
        snapshot.streamerId,
        snapshot.tiktokUsername,
        snapshot.isLive,
        snapshot.viewerCount,
        snapshot.followersCount,
        snapshot.checkedAt,
        snapshot.source,
        JSON.stringify(snapshot.rawSnapshot ?? {}),
      ],
    );
  }

  async getLatestLiveSession(streamerId: string) {
    const result = await this.pool.query<PostgresStreamSessionRow>(
      `select id, streamer_id, source, status, started_at, ended_at, peak_viewer_count, current_viewer_count, like_count, gift_count, message_count, raw_snapshot
       from live_stream_sessions
       where streamer_id = $1 and status = 'live'
       order by started_at desc
       limit 1`,
      [streamerId],
    );

    return result.rows[0] ? mapSessionRow(result.rows[0]) : null;
  }

  async getLatestSessionSummary(streamerId: string) {
    const result = await this.pool.query<PostgresStreamSessionRow>(
      `select id, streamer_id, source, status, started_at, ended_at, peak_viewer_count, current_viewer_count, like_count, gift_count, message_count, raw_snapshot
       from live_stream_sessions
       where streamer_id = $1
       order by started_at desc
       limit 1`,
      [streamerId],
    );

    return result.rows[0] ? mapSessionRow(result.rows[0]) : null;
  }

  async listRecentStreamEvents(streamerId: string, limit = 12) {
    const result = await this.pool.query<StreamEventRecord>(
      `select id, event_type, event_timestamp, normalized_payload
       from live_stream_events
       where streamer_id = $1
       order by event_timestamp desc
       limit $2`,
      [streamerId, limit],
    );

    return result.rows.map((row) => ({
      ...row,
      normalized_payload: row.normalized_payload ?? {},
    }));
  }

  async startLiveSession(snapshot: TrackingSnapshot) {
    const result = await this.pool.query<PostgresStreamSessionRow>(
      `insert into live_stream_sessions (
         streamer_id, source, status, started_at, peak_viewer_count, current_viewer_count, raw_snapshot, created_at, updated_at
       ) values ($1,$2,'live',$3,$4,$5,$6::jsonb, now(), now())
       returning id, streamer_id, source, status, started_at, ended_at, peak_viewer_count, current_viewer_count, like_count, gift_count, message_count, raw_snapshot`,
      [
        snapshot.streamerId,
        snapshot.source,
        snapshot.checkedAt,
        snapshot.viewerCount,
        snapshot.viewerCount,
        JSON.stringify(snapshot.rawSnapshot ?? {}),
      ],
    );

    return mapSessionRow(result.rows[0]);
  }

  async updateLiveSession(sessionId: string, snapshot: TrackingSnapshot, previousPeak: number) {
    await this.pool.query(
      `update live_stream_sessions
       set current_viewer_count = $2,
           peak_viewer_count = $3,
           raw_snapshot = $4::jsonb,
           updated_at = now()
       where id = $1`,
      [sessionId, snapshot.viewerCount, Math.max(previousPeak, snapshot.viewerCount), JSON.stringify(snapshot.rawSnapshot ?? {})],
    );
  }

  async endLiveSession(sessionId: string, snapshot: TrackingSnapshot, previousPeak: number) {
    await this.pool.query(
      `update live_stream_sessions
       set status = 'ended',
           ended_at = $2,
           current_viewer_count = $3,
           peak_viewer_count = $4,
           raw_snapshot = $5::jsonb,
           updated_at = now()
       where id = $1`,
      [sessionId, snapshot.checkedAt, snapshot.viewerCount, Math.max(previousPeak, snapshot.viewerCount), JSON.stringify(snapshot.rawSnapshot ?? {})],
    );
  }

  async insertStreamEvent(input: {
    streamerId: string;
    streamSessionId: string | null;
    eventType: string;
    source: string;
    eventTimestamp: string;
    normalizedPayload: Record<string, unknown>;
    rawPayload?: Record<string, unknown>;
    viewerId?: string | null;
    externalViewerId?: string | null;
  }) {
    await this.pool.query(
      `insert into live_stream_events (
         stream_session_id, streamer_id, event_type, source, viewer_id, external_viewer_id, event_timestamp, raw_payload, normalized_payload, created_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb, now())`,
      [
        input.streamSessionId,
        input.streamerId,
        input.eventType,
        input.source,
        input.viewerId ?? null,
        input.externalViewerId ?? null,
        input.eventTimestamp,
        JSON.stringify(input.rawPayload ?? input.normalizedPayload),
        JSON.stringify(input.normalizedPayload),
      ],
    );
  }

  async updateSessionEngagement(sessionId: string, input: {
    likeDelta?: number;
    giftDelta?: number;
    messageDelta?: number;
    currentViewerCount?: number;
    rawSnapshot?: Record<string, unknown>;
  }) {
    await this.pool.query(
      `update live_stream_sessions
       set like_count = like_count + $2,
           gift_count = gift_count + $3,
           message_count = message_count + $4,
           current_viewer_count = case when $5 is null then current_viewer_count else $5 end,
           peak_viewer_count = greatest(peak_viewer_count, case when $5 is null then current_viewer_count else $5 end),
           raw_snapshot = case when $6::jsonb = '{}'::jsonb then raw_snapshot else $6::jsonb end,
           updated_at = now()
       where id = $1`,
      [
        sessionId,
        input.likeDelta ?? 0,
        input.giftDelta ?? 0,
        input.messageDelta ?? 0,
        input.currentViewerCount ?? null,
        JSON.stringify(input.rawSnapshot ?? {}),
      ],
    );
  }
}