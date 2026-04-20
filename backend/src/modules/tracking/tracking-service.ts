import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import type { TrackingSnapshot } from "../../repositories/tracking-repository.js";
import type { TrackingStore } from "../../storage/live-storage.js";
import type { TrackingAdapter } from "./tracking-adapter.js";
import type { TrackingLiveEventBridge } from "./live-event-bridge.js";
import type { TrackingSocketHub } from "./tracking-socket-hub.js";
import type { TrackingRealtimeStateStore } from "./tracking-realtime-state.js";

export type ResolvedLiveStatus = {
  tiktokUsername: string;
  isLive: boolean;
  viewerCount: number;
  followersCount: number;
  checkedAt: string;
  source: string;
};

function normalizeTikTokUsername(username: string) {
  return username.trim().replace(/^@+/, "").toLowerCase();
}

export class TrackingService {
  private poller: NodeJS.Timeout | null = null;
  private lastRunAt: string | null = null;
  private socketHub: TrackingSocketHub | null = null;
  private liveEventBridge: TrackingLiveEventBridge | null = null;
  private tickInFlight = false;
  private startupRecoveryRunning = false;
  private startupRecoveryLastStartedAt: string | null = null;
  private startupRecoveryLastCompletedAt: string | null = null;
  private startupRecoveryCandidateCount = 0;
  private startupRecoveryRecoveredCount = 0;

  constructor(
    private readonly logger: Logger,
    private readonly env: BackendEnv,
    private readonly adapter: TrackingAdapter,
    private readonly trackingRepository?: TrackingStore,
    private readonly realtimeStateStore?: TrackingRealtimeStateStore,
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
      tickInFlight: this.tickInFlight,
      startupRecovery: {
        running: this.startupRecoveryRunning,
        lastStartedAt: this.startupRecoveryLastStartedAt,
        lastCompletedAt: this.startupRecoveryLastCompletedAt,
        candidates: this.startupRecoveryCandidateCount,
        recovered: this.startupRecoveryRecoveredCount,
      },
      liveEventBridge: this.liveEventBridge?.getHealth() ?? null,
      realtimeState: this.realtimeStateStore?.getHealth() ?? null,
    };
  }

  async resolveLiveStatuses(usernames: string[]) {
    const uniqueUsernames = [...new Set(usernames.map((username) => username.trim()).filter(Boolean))];
    const realtimeStatuses = new Map<string, ResolvedLiveStatus>();

    if (this.trackingRepository && this.realtimeStateStore) {
      const trackedStreamers = await this.trackingRepository.getTrackedStreamers();
      const trackedByUsername = new Map(
        trackedStreamers.map((streamer) => [normalizeTikTokUsername(streamer.tiktok_username), streamer]),
      );

      for (const username of uniqueUsernames) {
        const trackedStreamer = trackedByUsername.get(normalizeTikTokUsername(username));
        if (!trackedStreamer) {
          continue;
        }

        const realtimeState = await this.realtimeStateStore.getStreamerState(trackedStreamer.id);
        if (!realtimeState) {
          continue;
        }

        realtimeStatuses.set(normalizeTikTokUsername(username), {
          tiktokUsername: trackedStreamer.tiktok_username,
          isLive: realtimeState.isLive,
          viewerCount: realtimeState.viewerCount,
          followersCount: trackedStreamer.followers_count,
          checkedAt: realtimeState.lastUpdate,
          source: realtimeState.source,
        });
      }
    }

    const snapshots: ResolvedLiveStatus[] = [];

    for (const username of uniqueUsernames) {
      const realtimeStatus = realtimeStatuses.get(normalizeTikTokUsername(username));
      if (realtimeStatus) {
        snapshots.push(realtimeStatus);
        continue;
      }

      const trackedStreamer = this.trackingRepository
        ? (await this.trackingRepository.getTrackedStreamers()).find(
            (streamer) => normalizeTikTokUsername(streamer.tiktok_username) === normalizeTikTokUsername(username),
          )
        : null;

      const snapshot = await this.adapter.fetchSnapshot(
        trackedStreamer ?? {
          id: `lookup:${username.toLowerCase()}`,
          user_id: null,
          display_name: username,
          tiktok_username: username,
          is_live: false,
          viewer_count: 0,
          followers_count: 0,
          tracking_enabled: false,
          tracking_source: null,
          last_checked_live_at: null,
        },
      );

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

    const [state, latestSession, recentEvents, realtimeState] = await Promise.all([
      this.trackingRepository.getStreamerLiveState(streamerId),
      this.trackingRepository.getLatestSessionSummary(streamerId),
      this.trackingRepository.listRecentStreamEvents(streamerId, 12),
      this.realtimeStateStore?.getStreamerState(streamerId) ?? Promise.resolve(null),
    ]);

    const mergedState = realtimeState
      ? {
          id: state?.id ?? streamerId,
          tiktok_username: state?.tiktok_username ?? "",
          is_live: realtimeState.isLive,
          viewer_count: realtimeState.viewerCount,
        }
      : state;

    const mergedLatestSession = realtimeState
      ? {
          id: latestSession?.id ?? realtimeState.streamId ?? `realtime:${streamerId}`,
          streamer_id: latestSession?.streamer_id ?? streamerId,
          source: latestSession?.source ?? realtimeState.source,
          status: realtimeState.isLive ? "live" : (latestSession?.status ?? "ended"),
          started_at: latestSession?.started_at ?? realtimeState.lastUpdate,
          ended_at: realtimeState.isLive ? null : (latestSession?.ended_at ?? realtimeState.lastUpdate),
          peak_viewer_count: Math.max(latestSession?.peak_viewer_count ?? 0, realtimeState.viewerCount),
          current_viewer_count: realtimeState.viewerCount,
          like_count: realtimeState.likeCount,
          gift_count: realtimeState.giftCount,
          message_count: realtimeState.messageCount,
          raw_snapshot: latestSession?.raw_snapshot ?? {},
        }
      : latestSession;

    return {
      state: mergedState,
      realtimeState,
      latestSession: mergedLatestSession,
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

    void this.recoverLiveConnections().finally(() => this.runTick());
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

    if (this.tickInFlight) {
      this.logger.warn("Tracking tick skipped because previous run is still in progress.");
      return;
    }

    this.tickInFlight = true;

    try {
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

          await this.realtimeStateStore?.applySnapshot(streamer.id, {
            streamId: sessionId,
            snapshot,
          });

          if (!snapshot.isLive) {
            await this.realtimeStateStore?.markStreamEnded(streamer.id, {
              streamId: sessionId,
              source: snapshot.source,
              occurredAt: snapshot.checkedAt,
              viewerCount: snapshot.viewerCount,
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
    } finally {
      this.tickInFlight = false;
    }
  }

  private async recoverLiveConnections() {
    if (!this.trackingRepository || !this.liveEventBridge) {
      return;
    }

    this.startupRecoveryRunning = true;
    this.startupRecoveryLastStartedAt = new Date().toISOString();
    this.startupRecoveryRecoveredCount = 0;

    const trackingRepository = this.trackingRepository;
    const liveEventBridge = this.liveEventBridge;
    const streamers = await trackingRepository.getTrackedStreamers();
    const liveCandidates = streamers.filter((streamer) => streamer.is_live && Boolean(normalizeTikTokUsername(streamer.tiktok_username)));
    this.startupRecoveryCandidateCount = liveCandidates.length;

    if (liveCandidates.length === 0) {
      this.startupRecoveryRunning = false;
      this.startupRecoveryLastCompletedAt = new Date().toISOString();
      return;
    }

    this.logger.info("Tracking startup recovery started", {
      candidates: liveCandidates.length,
    });

    await Promise.all(liveCandidates.map(async (streamer) => {
      try {
        const liveSession = await trackingRepository.getLatestLiveSession(streamer.id);
        if (!liveSession) {
          return;
        }

        await liveEventBridge.syncStreamer(streamer, {
          streamerId: streamer.id,
          displayName: streamer.display_name,
          tiktokUsername: streamer.tiktok_username,
          isLive: true,
          viewerCount: Math.max(streamer.viewer_count, liveSession.current_viewer_count),
          likeCount: liveSession.like_count,
          followersCount: streamer.followers_count,
          checkedAt: streamer.last_checked_live_at ?? liveSession.started_at,
          source: liveSession.source,
          rawSnapshot: liveSession.raw_snapshot,
        }, liveSession.id);
        this.startupRecoveryRecoveredCount += 1;
      } catch (error) {
        this.logger.warn("Tracking startup recovery failed for streamer", {
          streamerId: streamer.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }));

    this.logger.info("Tracking startup recovery finished", {
      candidates: liveCandidates.length,
      recovered: this.startupRecoveryRecoveredCount,
    });
    this.startupRecoveryRunning = false;
    this.startupRecoveryLastCompletedAt = new Date().toISOString();
  }
}