import { createClient, type RedisClientType, type RedisModules, type RedisFunctions, type RedisScripts } from "redis";

import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";

export type TrackingQueueEvent = {
  id: string;
  streamerId: string;
  streamSessionId: string | null;
  type: string;
  source: string;
  occurredAt: string;
  tiktokUsername?: string | null;
  externalViewerId?: string | null;
  payload: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
};

export interface TrackingEventQueue {
  getHealth(): {
    service: string;
    status: "ready" | "disabled" | "degraded";
    driver: "memory" | "redis-streams";
  };
  publish(event: TrackingQueueEvent): Promise<void>;
  drain(limit?: number): Promise<TrackingQueueEvent[]>;
}

export class MemoryTrackingEventQueue implements TrackingEventQueue {
  private readonly events: TrackingQueueEvent[] = [];

  constructor(private readonly logger: Logger) {}

  getHealth() {
    return {
      service: "tracking-event-queue",
      status: "ready" as const,
      driver: "memory" as const,
    };
  }

  async publish(event: TrackingQueueEvent) {
    this.events.push(event);
    this.logger.info("Tracking event queued", {
      streamerId: event.streamerId,
      streamSessionId: event.streamSessionId,
      eventType: event.type,
    });
  }

  async drain(limit = 100) {
    return this.events.splice(0, limit);
  }
}

type TrackingRedisClient = RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

class RedisStreamsTrackingEventQueue implements TrackingEventQueue {
  private readonly client: TrackingRedisClient;
  private ready = false;
  private failed = false;
  private lastId = "$";

  constructor(
    private readonly logger: Logger,
    redisUrl: string,
    private readonly streamKey = "tracking:events",
  ) {
    this.client = createClient({ url: redisUrl });
    this.client.on("error", (error) => {
      this.failed = true;
      this.logger.warn("Tracking queue Redis error", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  getHealth() {
    return {
      service: "tracking-event-queue",
      status: this.ready ? "ready" as const : this.failed ? "degraded" as const : "disabled" as const,
      driver: "redis-streams" as const,
    };
  }

  async publish(event: TrackingQueueEvent) {
    await this.ensureConnected();

    await this.client.xAdd(this.streamKey, "*", {
      id: event.id,
      streamerId: event.streamerId,
      streamSessionId: event.streamSessionId ?? "",
      type: event.type,
      source: event.source,
      occurredAt: event.occurredAt,
      tiktokUsername: event.tiktokUsername ?? "",
      externalViewerId: event.externalViewerId ?? "",
      payload: JSON.stringify(event.payload),
      rawPayload: JSON.stringify(event.rawPayload),
    });
  }

  async drain(limit = 100) {
    await this.ensureConnected();

    const entries = await this.client.xRead(
      [{ key: this.streamKey, id: this.lastId }],
      { COUNT: limit, BLOCK: 1 },
    );

    if (!entries || entries.length === 0) {
      return [];
    }

    const results: TrackingQueueEvent[] = [];

    for (const stream of entries) {
      for (const message of stream.messages) {
        this.lastId = message.id;
        const values = message.message;
        results.push({
          id: values.id,
          streamerId: values.streamerId,
          streamSessionId: values.streamSessionId || null,
          type: values.type,
          source: values.source,
          occurredAt: values.occurredAt,
          tiktokUsername: values.tiktokUsername || null,
          externalViewerId: values.externalViewerId || null,
          payload: safeParseJson(values.payload),
          rawPayload: safeParseJson(values.rawPayload),
        });
      }
    }

    return results;
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

function safeParseJson(value: string | undefined) {
  if (!value) {
    return {} as Record<string, unknown>;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

export function createTrackingEventQueue(env: BackendEnv, logger: Logger): TrackingEventQueue {
  if (env.REDIS_URL) {
    return new RedisStreamsTrackingEventQueue(logger, env.REDIS_URL);
  }

  logger.warn("Tracking queue fallback: REDIS_URL is not configured, using memory queue.");
  return new MemoryTrackingEventQueue(logger);
}