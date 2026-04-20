import { createClient, type RedisClientType } from "redis";

import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import type { TrackingSnapshot } from "../../repositories/tracking-repository.js";

export type RealtimeStreamState = {
  streamId: string | null;
  isLive: boolean;
  viewerCount: number;
  likeCount: number;
  messageCount: number;
  giftCount: number;
  lastUpdate: string;
  source: string;
  lastEventType: string | null;
};

export interface TrackingRealtimeStateStore {
  getHealth(): {
    service: string;
    status: "ready" | "disabled" | "degraded";
    driver: "redis" | "memory";
  };
  getStreamerState(streamerId: string): Promise<RealtimeStreamState | null>;
  applySnapshot(streamerId: string, input: {
    streamId?: string | null;
    snapshot: TrackingSnapshot;
  }): Promise<void>;
  applyEngagement(streamerId: string, input: {
    streamId: string;
    source: string;
    eventType: string;
    occurredAt: string;
    viewerCount?: number | null;
    likeDelta?: number;
    messageDelta?: number;
    giftDelta?: number;
  }): Promise<void>;
  markStreamEnded(streamerId: string, input: {
    streamId?: string | null;
    source: string;
    occurredAt: string;
    viewerCount?: number | null;
  }): Promise<void>;
}

type RealtimeStreamStateRecord = {
  stream_id: string;
  is_live: string;
  viewer_count: string;
  like_count: string;
  message_count: string;
  gift_count: string;
  last_update: string;
  source: string;
  last_event_type: string;
};

const EMPTY_STATE: Omit<RealtimeStreamState, "lastUpdate" | "source"> = {
  streamId: null,
  isLive: false,
  viewerCount: 0,
  likeCount: 0,
  messageCount: 0,
  giftCount: 0,
  lastEventType: null,
};

function toKey(streamerId: string) {
  return `stream:${streamerId}`;
}

function parseIntSafe(value: string | undefined, fallback = 0) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapRecord(record: Record<string, string>): RealtimeStreamState | null {
  if (Object.keys(record).length === 0) {
    return null;
  }

  return {
    streamId: record.stream_id || null,
    isLive: record.is_live === "true",
    viewerCount: parseIntSafe(record.viewer_count),
    likeCount: parseIntSafe(record.like_count),
    messageCount: parseIntSafe(record.message_count),
    giftCount: parseIntSafe(record.gift_count),
    lastUpdate: record.last_update || new Date(0).toISOString(),
    source: record.source || "unknown",
    lastEventType: record.last_event_type || null,
  };
}

function mapStateToRecord(state: RealtimeStreamState): RealtimeStreamStateRecord {
  return {
    stream_id: state.streamId ?? "",
    is_live: String(state.isLive),
    viewer_count: String(state.viewerCount),
    like_count: String(state.likeCount),
    message_count: String(state.messageCount),
    gift_count: String(state.giftCount),
    last_update: state.lastUpdate,
    source: state.source,
    last_event_type: state.lastEventType ?? "",
  };
}

class MemoryTrackingRealtimeStateStore implements TrackingRealtimeStateStore {
  private readonly states = new Map<string, RealtimeStreamState>();

  getHealth() {
    return {
      service: "tracking-realtime-state",
      status: "degraded" as const,
      driver: "memory" as const,
    };
  }

  async getStreamerState(streamerId: string) {
    return this.states.get(streamerId) ?? null;
  }

  async applySnapshot(streamerId: string, input: { streamId?: string | null; snapshot: TrackingSnapshot; }) {
    const current = this.states.get(streamerId) ?? null;
    this.states.set(streamerId, {
      streamId: input.streamId ?? current?.streamId ?? null,
      isLive: input.snapshot.isLive,
      viewerCount: input.snapshot.viewerCount,
      likeCount: input.snapshot.likeCount ?? current?.likeCount ?? 0,
      messageCount: current?.messageCount ?? 0,
      giftCount: current?.giftCount ?? 0,
      lastUpdate: input.snapshot.checkedAt,
      source: input.snapshot.source,
      lastEventType: "snapshot_updated",
    });
  }

  async applyEngagement(streamerId: string, input: {
    streamId: string;
    source: string;
    eventType: string;
    occurredAt: string;
    viewerCount?: number | null;
    likeDelta?: number;
    messageDelta?: number;
    giftDelta?: number;
  }) {
    const current = this.states.get(streamerId) ?? {
      ...EMPTY_STATE,
      streamId: input.streamId,
      isLive: true,
      lastUpdate: input.occurredAt,
      source: input.source,
    };

    this.states.set(streamerId, {
      streamId: input.streamId,
      isLive: true,
      viewerCount: input.viewerCount ?? current.viewerCount,
      likeCount: current.likeCount + (input.likeDelta ?? 0),
      messageCount: current.messageCount + (input.messageDelta ?? 0),
      giftCount: current.giftCount + (input.giftDelta ?? 0),
      lastUpdate: input.occurredAt,
      source: input.source,
      lastEventType: input.eventType,
    });
  }

  async markStreamEnded(streamerId: string, input: {
    streamId?: string | null;
    source: string;
    occurredAt: string;
    viewerCount?: number | null;
  }) {
    const current = this.states.get(streamerId) ?? null;
    this.states.set(streamerId, {
      streamId: input.streamId ?? current?.streamId ?? null,
      isLive: false,
      viewerCount: input.viewerCount ?? current?.viewerCount ?? 0,
      likeCount: current?.likeCount ?? 0,
      messageCount: current?.messageCount ?? 0,
      giftCount: current?.giftCount ?? 0,
      lastUpdate: input.occurredAt,
      source: input.source,
      lastEventType: "live_ended",
    });
  }
}

class RedisTrackingRealtimeStateStore implements TrackingRealtimeStateStore {
  private readonly client: RedisClientType;
  private ready = false;
  private failed = false;

  constructor(private readonly logger: Logger, redisUrl: string) {
    this.client = createClient({ url: redisUrl });
    this.client.on("error", (error) => {
      this.failed = true;
      this.logger.warn("Tracking realtime Redis error", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  getHealth() {
    return {
      service: "tracking-realtime-state",
      status: this.ready ? "ready" as const : this.failed ? "degraded" as const : "disabled" as const,
      driver: "redis" as const,
    };
  }

  async getStreamerState(streamerId: string) {
    await this.ensureConnected();
    const record = await this.client.hGetAll(toKey(streamerId));
    return mapRecord(record);
  }

  async applySnapshot(streamerId: string, input: { streamId?: string | null; snapshot: TrackingSnapshot; }) {
    await this.ensureConnected();
    const current = await this.getStreamerState(streamerId);
    const nextState: RealtimeStreamState = {
      streamId: input.streamId ?? current?.streamId ?? null,
      isLive: input.snapshot.isLive,
      viewerCount: input.snapshot.viewerCount,
      likeCount: input.snapshot.likeCount ?? current?.likeCount ?? 0,
      messageCount: current?.messageCount ?? 0,
      giftCount: current?.giftCount ?? 0,
      lastUpdate: input.snapshot.checkedAt,
      source: input.snapshot.source,
      lastEventType: "snapshot_updated",
    };

    await this.client.hSet(toKey(streamerId), mapStateToRecord(nextState));
  }

  async applyEngagement(streamerId: string, input: {
    streamId: string;
    source: string;
    eventType: string;
    occurredAt: string;
    viewerCount?: number | null;
    likeDelta?: number;
    messageDelta?: number;
    giftDelta?: number;
  }) {
    await this.ensureConnected();
    const current = await this.getStreamerState(streamerId);
    const nextState: RealtimeStreamState = {
      streamId: input.streamId,
      isLive: true,
      viewerCount: input.viewerCount ?? current?.viewerCount ?? 0,
      likeCount: (current?.likeCount ?? 0) + (input.likeDelta ?? 0),
      messageCount: (current?.messageCount ?? 0) + (input.messageDelta ?? 0),
      giftCount: (current?.giftCount ?? 0) + (input.giftDelta ?? 0),
      lastUpdate: input.occurredAt,
      source: input.source,
      lastEventType: input.eventType,
    };

    await this.client.hSet(toKey(streamerId), mapStateToRecord(nextState));
  }

  async markStreamEnded(streamerId: string, input: {
    streamId?: string | null;
    source: string;
    occurredAt: string;
    viewerCount?: number | null;
  }) {
    await this.ensureConnected();
    const current = await this.getStreamerState(streamerId);
    const nextState: RealtimeStreamState = {
      streamId: input.streamId ?? current?.streamId ?? null,
      isLive: false,
      viewerCount: input.viewerCount ?? current?.viewerCount ?? 0,
      likeCount: current?.likeCount ?? 0,
      messageCount: current?.messageCount ?? 0,
      giftCount: current?.giftCount ?? 0,
      lastUpdate: input.occurredAt,
      source: input.source,
      lastEventType: "live_ended",
    };

    await this.client.hSet(toKey(streamerId), mapStateToRecord(nextState));
  }

  private async ensureConnected() {
    if (this.ready) {
      return;
    }

    await this.client.connect();
    this.ready = true;
    this.failed = false;
  }
}

export function createTrackingRealtimeStateStore(env: BackendEnv, logger: Logger): TrackingRealtimeStateStore {
  if (env.REDIS_URL) {
    return new RedisTrackingRealtimeStateStore(logger, env.REDIS_URL);
  }

  logger.warn("Tracking realtime state fallback: REDIS_URL is not configured, using memory store.");
  return new MemoryTrackingRealtimeStateStore();
}