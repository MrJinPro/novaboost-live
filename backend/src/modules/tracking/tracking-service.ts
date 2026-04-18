import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import type { TrackingSnapshot } from "../../repositories/tracking-repository.js";
import type { TrackingStore } from "../../storage/live-storage.js";
import type { TrackingAdapter } from "./tracking-adapter.js";
import type { TrackingLiveEventBridge } from "./live-event-bridge.js";
import type { TrackingSocketHub } from "./tracking-socket-hub.js";

export type ResolvedLiveStatus = {
  tiktokUsername: string;
  isLive: boolean;
  viewerCount: number;
  followersCount: number;
  checkedAt: string;
  source: string;
};

export class TrackingService {
  private poller: NodeJS.Timeout | null = null;
  private lastRunAt: string | null = null;
  private socketHub: TrackingSocketHub | null = null;
  private liveEventBridge: TrackingLiveEventBridge | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly env: BackendEnv,
    private readonly adapter: TrackingAdapter,
    private readonly trackingRepository?: TrackingStore,
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

  async resolveLiveStatuses(usernames: string[]) {
    const uniqueUsernames = [...new Set(usernames.map((username) => username.trim()).filter(Boolean))];
    const snapshots: ResolvedLiveStatus[] = [];

    for (const username of uniqueUsernames) {
      const snapshot = await this.adapter.fetchSnapshot({
        id: `lookup:${username.toLowerCase()}`,
        display_name: username,
        tiktok_username: username,
        is_live: false,
        viewer_count: 0,
        followers_count: 0,
        tracking_enabled: false,
        tracking_source: null,
        last_checked_live_at: null,
      });

      snapshots.push({
        tiktokUsername: username,
        isLive: snapshot.isLive,
        viewerCount: snapshot.viewerCount,
        followersCount: snapshot.followersCount,
        checkedAt: snapshot.checkedAt,
        source: snapshot.source,
      });
    }

    return snapshots;
  }

  async getStreamerLiveDetails(streamerId: string) {
    if (!this.trackingRepository) {
      return null;
    }

    const [state, latestSession, recentEvents] = await Promise.all([
      this.trackingRepository.getStreamerLiveState(streamerId),
      this.trackingRepository.getLatestSessionSummary(streamerId),
      this.trackingRepository.listRecentStreamEvents(streamerId, 12),
    ]);

    return {
      state,
      latestSession,
      recentEvents,
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
          if ((snapshot.likeCount ?? 0) > 0) {
            await this.trackingRepository.updateSessionEngagement(sessionId, {
              likeDelta: snapshot.likeCount,
              currentViewerCount: snapshot.viewerCount,
              rawSnapshot: snapshot.rawSnapshot,
            });
          }
          await this.trackingRepository.insertStreamEvent({
            streamerId: streamer.id,
            streamSessionId: sessionId,
            eventType: "live_started",
            source: snapshot.source,
            eventTimestamp: snapshot.checkedAt,
            normalizedPayload: {
              viewer_count: snapshot.viewerCount,
              like_count: snapshot.likeCount ?? 0,
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
          const likeDelta = Math.max(0, (snapshot.likeCount ?? 0) - (liveSession.like_count ?? 0));
          if (likeDelta > 0 || snapshot.viewerCount !== liveSession.current_viewer_count) {
            await this.trackingRepository.updateSessionEngagement(liveSession.id, {
              likeDelta,
              currentViewerCount: snapshot.viewerCount,
              rawSnapshot: snapshot.rawSnapshot,
            });
          }
          await this.trackingRepository.insertStreamEvent({
            streamerId: streamer.id,
            streamSessionId: liveSession.id,
            eventType: "snapshot_updated",
            source: snapshot.source,
            eventTimestamp: snapshot.checkedAt,
            normalizedPayload: {
              viewer_count: snapshot.viewerCount,
              like_count: snapshot.likeCount ?? liveSession.like_count,
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