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
    status: "ready" | "disabled";
    driver: "memory";
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