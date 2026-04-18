import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import type { TrackingRepository, TrackingSnapshot } from "../../repositories/tracking-repository.js";
import type { TrackingAdapter } from "./tracking-adapter.js";
import type { TrackingLiveEventBridge } from "./live-event-bridge.js";
import type { TrackingSocketHub } from "./tracking-socket-hub.js";

export class TrackingService {
  private poller: NodeJS.Timeout | null = null;
  private lastRunAt: string | null = null;
  private socketHub: TrackingSocketHub | null = null;
  private liveEventBridge: TrackingLiveEventBridge | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly env: BackendEnv,
    private readonly adapter: TrackingAdapter,
    private readonly trackingRepository?: TrackingRepository,
  ) {}

  attachSocketHub(socketHub: TrackingSocketHub) {
    this.socketHub = socketHub;
  }

  attachLiveEventBridge(liveEventBridge: TrackingLiveEventBridge) {
    this.liveEventBridge = liveEventBridge;
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

    if (this.liveEventBridge) {
      void this.liveEventBridge.stopAll();
    }
  }

  private async runTick() {
    if (!this.trackingRepository) {
      return;
    }

    const streamers = await this.trackingRepository.getTrackedStreamers();
    const snapshots: TrackingSnapshot[] = [];

    for (const streamer of streamers) {
      try {
        const snapshot = await this.adapter.fetchSnapshot(streamer);
        await this.trackingRepository.updateTrackingSnapshot(snapshot);

        const liveSession = await this.trackingRepository.getLatestLiveSession(streamer.id);
        let sessionId: string | null = liveSession?.id ?? null;

        if (snapshot.isLive && !liveSession) {
          const session = await this.trackingRepository.startLiveSession(snapshot);
          sessionId = session.id;
          await this.trackingRepository.insertStreamEvent({
            streamerId: streamer.id,
            streamSessionId: sessionId,
            eventType: "live_started",
            source: snapshot.source,
            eventTimestamp: snapshot.checkedAt,
            normalizedPayload: {
              viewer_count: snapshot.viewerCount,
              followers_count: snapshot.followersCount,
            },
            rawPayload: snapshot.rawSnapshot,
          });
        } else if (!snapshot.isLive && liveSession) {
          await this.trackingRepository.endLiveSession(liveSession.id, snapshot, liveSession.peak_viewer_count);
          await this.trackingRepository.insertStreamEvent({
            streamerId: streamer.id,
            streamSessionId: liveSession.id,
            eventType: "live_ended",
            source: snapshot.source,
            eventTimestamp: snapshot.checkedAt,
            normalizedPayload: {
              viewer_count: snapshot.viewerCount,
              followers_count: snapshot.followersCount,
            },
            rawPayload: snapshot.rawSnapshot,
          });
        } else if (snapshot.isLive && liveSession) {
          await this.trackingRepository.updateLiveSession(liveSession.id, snapshot, liveSession.peak_viewer_count);
          await this.trackingRepository.insertStreamEvent({
            streamerId: streamer.id,
            streamSessionId: liveSession.id,
            eventType: "snapshot_updated",
            source: snapshot.source,
            eventTimestamp: snapshot.checkedAt,
            normalizedPayload: {
              viewer_count: snapshot.viewerCount,
              followers_count: snapshot.followersCount,
            },
            rawPayload: snapshot.rawSnapshot,
          });
        }

        await this.liveEventBridge?.syncStreamer(streamer, snapshot, sessionId);

        snapshots.push(snapshot);
      } catch (error) {
        this.logger.error("Tracking tick failed for streamer", {
          streamerId: streamer.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
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