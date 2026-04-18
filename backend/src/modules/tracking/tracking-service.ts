import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import type { TrackingRepository, TrackingSnapshot } from "../../repositories/tracking-repository.js";
import type { TrackingAdapter } from "./tracking-adapter.js";
import type { TrackingSocketHub } from "./tracking-socket-hub.js";

export class TrackingService {
  private poller: NodeJS.Timeout | null = null;
  private lastRunAt: string | null = null;
  private socketHub: TrackingSocketHub | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly env: BackendEnv,
    private readonly adapter: TrackingAdapter,
    private readonly trackingRepository?: TrackingRepository,
  ) {}

  attachSocketHub(socketHub: TrackingSocketHub) {
    this.socketHub = socketHub;
  }

  getHealth() {
    return {
      service: "tracking",
      status: this.env.TRACKING_ENABLED ? (this.trackingRepository ? "active" : "degraded") : "disabled",
      capabilities: [
        "streamer live status polling",
        "tracking worker scheduling",
        "stream session lifecycle",
      ],
      intervalMs: this.env.TRACKING_POLL_INTERVAL_MS,
      source: this.adapter.sourceName,
      lastRunAt: this.lastRunAt,
    };
  }

  scheduleRegisteredStreamers() {
    if (!this.env.TRACKING_ENABLED) {
      this.logger.warn("Tracking scheduler is disabled by env.");
      return;
    }

    if (!this.trackingRepository) {
      this.logger.warn("Tracking scheduler skipped because repository is unavailable.");
      return;
    }

    if (this.poller) {
      return;
    }

    void this.runTick();
    this.poller = setInterval(() => {
      void this.runTick();
    }, this.env.TRACKING_POLL_INTERVAL_MS);

    this.logger.info("Tracking scheduler started", {
      intervalMs: this.env.TRACKING_POLL_INTERVAL_MS,
      source: this.adapter.sourceName,
    });
  }

  stop() {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
      this.logger.info("Tracking scheduler stopped");
    }
  }

  private async runTick() {
    if (!this.trackingRepository) {
      return;
    }

    const streamers = await this.trackingRepository.getTrackedStreamers();
    const snapshots: TrackingSnapshot[] = [];

    for (const streamer of streamers) {
      const snapshot = await this.adapter.fetchSnapshot(streamer);
      await this.trackingRepository.updateTrackingSnapshot(snapshot);
      snapshots.push(snapshot);
    }

    this.lastRunAt = new Date().toISOString();
    this.socketHub?.broadcastSnapshots(snapshots);

    this.logger.info("Tracking scheduler tick", {
      checkedStreamers: streamers.length,
      source: this.adapter.sourceName,
      lastRunAt: this.lastRunAt,
    });
  }
}