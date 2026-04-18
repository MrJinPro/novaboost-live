import { TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";
import type { WebcastChatMessage, WebcastGiftMessage, WebcastLikeMessage, WebcastMemberMessage, WebcastRoomUserSeqMessage } from "tiktok-live-connector";

import type { Logger } from "../../lib/logger.js";
import type { ScoringService } from "../scoring/scoring-service.js";
import type { TrackingSnapshot, TrackedStreamer } from "../../repositories/tracking-repository.js";
import type { TeamMembershipSnapshot } from "../../repositories/viewer-engagement-repository.js";
import type { LiveEngagementEvent } from "../../domain/events.js";
import type { TrackingStore, ViewerEngagementStore } from "../../storage/live-storage.js";

type LiveEventBridgeOptions = {
  logger: Logger;
  trackingRepository: TrackingStore;
  engagementRepository?: ViewerEngagementStore;
  scoringService: ScoringService;
  requestTimeoutMs: number;
};

type ActiveConnection = {
  streamerId: string;
  streamSessionId: string;
  username: string;
  connection: TikTokLiveConnection;
};

type TeamProgress = {
  commentCount: number;
  likeCount: number;
  giftCount: number;
  totalGiftDiamonds: number;
  watchSeconds: number;
  teamPoints: number;
  achievementCount: number;
};

export class TrackingLiveEventBridge {
  private readonly activeConnections = new Map<string, ActiveConnection>();

  constructor(private readonly options: LiveEventBridgeOptions) {}

  async syncStreamer(streamer: TrackedStreamer, snapshot: TrackingSnapshot, streamSessionId: string | null) {
    const existing = this.activeConnections.get(streamer.id);
    const username = normalizeTikTokUsername(streamer.tiktok_username);

    if (!snapshot.isLive || !streamSessionId || !username) {
      if (existing) {
        await this.disconnectStreamer(streamer.id, "stream_not_live");
      }
      return;
    }

    if (existing && existing.streamSessionId === streamSessionId && existing.username === username) {
      return;
    }

    if (existing) {
      await this.disconnectStreamer(streamer.id, "session_changed");
    }

    await this.connectStreamer(streamer, streamSessionId, username);
  }

  async stopAll() {
    await Promise.all(Array.from(this.activeConnections.keys()).map((streamerId) => this.disconnectStreamer(streamerId, "shutdown")));
  }

  private async connectStreamer(streamer: TrackedStreamer, streamSessionId: string, username: string) {
    const connection = new TikTokLiveConnection(username, {
      fetchRoomInfoOnConnect: false,
      enableExtendedGiftInfo: true,
      enableRequestPolling: true,
      requestPollingIntervalMs: 1_000,
      webClientOptions: {
        timeout: this.options.requestTimeoutMs,
      },
    });

    this.registerHandlers(streamer, streamSessionId, connection);

    try {
      await connection.connect();
      this.activeConnections.set(streamer.id, { streamerId: streamer.id, streamSessionId, username, connection });
      this.options.logger.info("Live event bridge connected", {
        streamerId: streamer.id,
        username,
        streamSessionId,
      });
    } catch (error) {
      this.options.logger.warn("Live event bridge connection failed", {
        streamerId: streamer.id,
        username,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private registerHandlers(streamer: TrackedStreamer, streamSessionId: string, connection: TikTokLiveConnection) {
    connection.on(WebcastEvent.MEMBER, (data) => this.handleMemberEvent(streamer, streamSessionId, data));
    connection.on(WebcastEvent.CHAT, (data) => this.handleChatEvent(streamer, streamSessionId, data));
    connection.on(WebcastEvent.LIKE, (data) => this.handleLikeEvent(streamer, streamSessionId, data));
    connection.on(WebcastEvent.GIFT, (data) => this.handleGiftEvent(streamer, streamSessionId, data));
    connection.on(WebcastEvent.ROOM_USER, (data) => this.handleRoomUserEvent(streamer, streamSessionId, data));
    connection.on(WebcastEvent.STREAM_END, async () => {
      await this.disconnectStreamer(streamer.id, "stream_end");
    });
  }

  private async handleMemberEvent(streamer: TrackedStreamer, streamSessionId: string, data: WebcastMemberMessage) {
    await this.processLiveEvent({
      type: "viewer_joined",
      streamerId: streamer.id,
      streamSessionId,
      occurredAt: new Date().toISOString(),
      source: "tiktok-live-connector",
      externalViewerId: data.user?.userId ?? data.userId ?? null,
      externalViewerUsername: data.user?.uniqueId ?? null,
      externalViewerDisplayName: data.user?.nickname ?? null,
      viewerLevel: parseNumeric(data.user?.fansClub?.data?.level) ?? parseNumeric(data.user?.payScore),
      rawPayload: {
        action: data.action,
        member_count: data.memberCount,
        username: data.user?.uniqueId ?? null,
        nickname: data.user?.nickname ?? null,
      },
    });
  }

  private async handleChatEvent(streamer: TrackedStreamer, streamSessionId: string, data: WebcastChatMessage) {
    await this.processLiveEvent({
      type: "chat_message",
      streamerId: streamer.id,
      streamSessionId,
      occurredAt: new Date().toISOString(),
      source: "tiktok-live-connector",
      externalViewerId: data.user?.userId ?? null,
      externalViewerUsername: data.user?.uniqueId ?? null,
      externalViewerDisplayName: data.user?.nickname ?? null,
      commentText: data.comment,
      viewerLevel: parseNumeric(data.user?.fansClub?.data?.level) ?? parseNumeric(data.user?.payScore),
      rawPayload: {
        comment: data.comment,
        username: data.user?.uniqueId ?? null,
        nickname: data.user?.nickname ?? null,
      },
    });

    await this.options.trackingRepository.updateSessionEngagement(streamSessionId, {
      messageDelta: 1,
      rawSnapshot: {
        last_chat_at: new Date().toISOString(),
      },
    });
  }

  private async handleLikeEvent(streamer: TrackedStreamer, streamSessionId: string, data: WebcastLikeMessage) {
    await this.processLiveEvent({
      type: "like_received",
      streamerId: streamer.id,
      streamSessionId,
      occurredAt: new Date().toISOString(),
      source: "tiktok-live-connector",
      externalViewerId: data.user?.userId ?? null,
      externalViewerUsername: data.user?.uniqueId ?? null,
      externalViewerDisplayName: data.user?.nickname ?? null,
      likeCount: data.likeCount,
      viewerLevel: parseNumeric(data.user?.fansClub?.data?.level) ?? parseNumeric(data.user?.payScore),
      rawPayload: {
        like_count: data.likeCount,
        total_like_count: data.totalLikeCount,
        username: data.user?.uniqueId ?? null,
        nickname: data.user?.nickname ?? null,
      },
    });

    await this.options.trackingRepository.updateSessionEngagement(streamSessionId, {
      likeDelta: data.likeCount,
      rawSnapshot: {
        last_like_at: new Date().toISOString(),
        total_like_count: data.totalLikeCount,
      },
    });
  }

  private async handleGiftEvent(streamer: TrackedStreamer, streamSessionId: string, data: WebcastGiftMessage) {
    if (data.giftDetails?.giftType === 1 && !data.repeatEnd) {
      return;
    }

    const giftCount = Math.max(1, data.repeatCount || data.comboCount || data.groupCount || 1);
    const diamondCount = (data.giftDetails?.diamondCount ?? 0) * giftCount;

    await this.processLiveEvent({
      type: "gift_received",
      streamerId: streamer.id,
      streamSessionId,
      occurredAt: new Date().toISOString(),
      source: "tiktok-live-connector",
      externalViewerId: data.user?.userId ?? null,
      externalViewerUsername: data.user?.uniqueId ?? null,
      externalViewerDisplayName: data.user?.nickname ?? null,
      giftCount,
      giftDiamondCount: diamondCount,
      viewerLevel: parseNumeric(data.user?.fansClub?.data?.level) ?? parseNumeric(data.user?.payScore),
      rawPayload: {
        gift_id: data.giftId,
        gift_name: data.giftDetails?.giftName ?? null,
        gift_count: giftCount,
        diamond_count: diamondCount,
        username: data.user?.uniqueId ?? null,
        nickname: data.user?.nickname ?? null,
      },
    });

    await this.options.trackingRepository.updateSessionEngagement(streamSessionId, {
      giftDelta: giftCount,
      rawSnapshot: {
        last_gift_at: new Date().toISOString(),
        last_gift_name: data.giftDetails?.giftName ?? null,
        last_gift_diamond_count: diamondCount,
      },
    });
  }

  private async handleRoomUserEvent(streamer: TrackedStreamer, streamSessionId: string, data: WebcastRoomUserSeqMessage) {
    await this.options.trackingRepository.updateSessionEngagement(streamSessionId, {
      currentViewerCount: data.viewerCount,
      rawSnapshot: {
        current_viewer_count: data.viewerCount,
        total_user: data.totalUser,
        popularity: data.popularity,
      },
    });

    await this.options.trackingRepository.insertStreamEvent({
      streamerId: streamer.id,
      streamSessionId,
      eventType: "snapshot_updated",
      source: "tiktok-live-connector",
      eventTimestamp: new Date().toISOString(),
      normalizedPayload: {
        viewer_count: data.viewerCount,
        total_user: data.totalUser,
      },
      rawPayload: {
        viewer_count: data.viewerCount,
        total_user: data.totalUser,
        popularity: data.popularity,
      },
    });
  }

  private async processLiveEvent(event: LiveEngagementEvent) {
    const eligibleViewer = this.options.engagementRepository
      ? await this.options.engagementRepository.findEligibleViewer(event.streamerId, event.externalViewerUsername)
      : null;

    await this.options.trackingRepository.insertStreamEvent({
      streamerId: event.streamerId,
      streamSessionId: event.streamSessionId,
      eventType: event.type,
      source: event.source,
      eventTimestamp: event.occurredAt,
      viewerId: eligibleViewer?.userId ?? null,
      externalViewerId: event.externalViewerId ?? null,
      normalizedPayload: {
        external_viewer_username: event.externalViewerUsername,
        external_viewer_display_name: event.externalViewerDisplayName,
        comment_text: event.commentText,
        like_count: event.likeCount,
        gift_count: event.giftCount,
        gift_diamond_count: event.giftDiamondCount,
        viewer_level: event.viewerLevel,
      },
      rawPayload: event.rawPayload,
    });

    if (!eligibleViewer) {
      this.options.logger.info("Live event skipped for rewards because viewer is not eligible", {
        streamerId: event.streamerId,
        externalViewerUsername: event.externalViewerUsername,
        eventType: event.type,
      });
      return;
    }

    if (!this.options.engagementRepository) {
      return;
    }

    const reward = this.options.scoringService.getViewerReward({
      type: event.type,
      likeCount: event.likeCount,
      giftCount: event.giftCount,
      giftDiamondCount: event.giftDiamondCount,
    });
    const membership = await this.options.engagementRepository.getTeamMembership(event.streamerId, eligibleViewer.userId);
    const unlockedKeys = new Set(await this.options.engagementRepository.getAchievementKeys(event.streamerId, eligibleViewer.userId));
    const nextProgress = applyProgressDelta(membership, event, reward.teamPoints);
    const newlyUnlockedAchievements = this.options.scoringService
      .getAchievementDefinitions()
      .filter((achievement) => !unlockedKeys.has(achievement.key) && achievement.isUnlocked(nextProgress));

    const achievementProfilePoints = newlyUnlockedAchievements.reduce((sum, achievement) => sum + achievement.profilePoints, 0);
    const achievementTeamPoints = newlyUnlockedAchievements.reduce((sum, achievement) => sum + achievement.teamPoints, 0);
    const nextTeamPoints = nextProgress.teamPoints + achievementTeamPoints;
    const nextTeamLevel = this.options.scoringService.getTeamLevel(nextTeamPoints);
    const nextFeatures = this.options.scoringService.getTeamFeatures(nextTeamLevel);
    const nextProfilePoints = eligibleViewer.points + reward.profilePoints + achievementProfilePoints;
    const nextProfileLevel = this.options.scoringService.getViewerLevel(nextProfilePoints);

    await this.options.engagementRepository.insertViewerStreamAction({
      userId: eligibleViewer.userId,
      streamerId: event.streamerId,
      streamSessionId: event.streamSessionId,
      actionType: mapEventToViewerAction(event.type),
      pointsAwarded: reward.profilePoints,
      metadata: {
        source: event.source,
        external_viewer_username: event.externalViewerUsername,
        external_viewer_display_name: event.externalViewerDisplayName,
        comment_text: event.commentText,
        like_count: event.likeCount,
        gift_count: event.giftCount,
        gift_diamond_count: event.giftDiamondCount,
        viewer_level: event.viewerLevel,
      },
      occurredAt: event.occurredAt,
    });

    await this.options.engagementRepository.insertViewerLedgerEntry({
      userId: eligibleViewer.userId,
      sourceType: `stream.${event.type}`,
      sourceId: event.streamSessionId,
      delta: reward.profilePoints,
      balanceAfter: eligibleViewer.points + reward.profilePoints,
      reason: buildLedgerReason(event.type),
      metadata: {
        streamer_id: event.streamerId,
        stream_session_id: event.streamSessionId,
        team_points: reward.teamPoints,
      },
    });

    let runningBalance = eligibleViewer.points + reward.profilePoints;
    for (const achievement of newlyUnlockedAchievements) {
      runningBalance += achievement.profilePoints;
      await this.options.engagementRepository.insertAchievementUnlock({
        userId: eligibleViewer.userId,
        streamerId: event.streamerId,
        streamSessionId: event.streamSessionId,
        achievementKey: achievement.key,
        title: achievement.title,
        description: achievement.description,
        rewardPoints: achievement.profilePoints,
        rewardTeamPoints: achievement.teamPoints,
        metadata: {
          unlocked_by_event: event.type,
          external_viewer_username: event.externalViewerUsername,
        },
        unlockedAt: event.occurredAt,
      });

      await this.options.engagementRepository.insertViewerLedgerEntry({
        userId: eligibleViewer.userId,
        sourceType: "achievement.unlock",
        sourceId: event.streamSessionId,
        delta: achievement.profilePoints,
        balanceAfter: runningBalance,
        reason: `Achievement unlocked: ${achievement.title}`,
        metadata: {
          streamer_id: event.streamerId,
          achievement_key: achievement.key,
          reward_team_points: achievement.teamPoints,
        },
      });
    }

    await this.options.engagementRepository.updateViewerProfile({
      userId: eligibleViewer.userId,
      points: nextProfilePoints,
      level: nextProfileLevel,
      activityScoreDelta: nextProfilePoints,
      lastActivityAt: event.occurredAt,
    });

    await this.options.engagementRepository.upsertTeamMembership({
      streamerId: event.streamerId,
      userId: eligibleViewer.userId,
      teamPoints: nextTeamPoints,
      teamLevel: nextTeamLevel,
      availableFeatures: nextFeatures,
      commentCount: nextProgress.commentCount,
      likeCount: nextProgress.likeCount,
      giftCount: nextProgress.giftCount,
      totalGiftDiamonds: nextProgress.totalGiftDiamonds,
      watchSeconds: nextProgress.watchSeconds,
      achievementCount: nextProgress.achievementCount + newlyUnlockedAchievements.length,
      lastEventAt: event.occurredAt,
    });
  }

  private async disconnectStreamer(streamerId: string, reason: string) {
    const active = this.activeConnections.get(streamerId);
    if (!active) {
      return;
    }

    this.activeConnections.delete(streamerId);
    try {
      await active.connection.disconnect();
    } catch (error) {
      this.options.logger.warn("Live event bridge disconnect failed", {
        streamerId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    this.options.logger.info("Live event bridge disconnected", {
      streamerId,
      reason,
      streamSessionId: active.streamSessionId,
    });
  }
}

function normalizeTikTokUsername(input: string) {
  const normalized = input.trim().replace(/^@+/, "");
  return normalized ? `@${normalized}` : null;
}

function parseNumeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function mapEventToViewerAction(eventType: LiveEngagementEvent["type"]) {
  switch (eventType) {
    case "viewer_joined":
      return "stream_visit" as const;
    case "chat_message":
      return "chat_message" as const;
    case "like_received":
      return "like" as const;
    case "gift_received":
      return "gift" as const;
  }
}

function buildLedgerReason(eventType: LiveEngagementEvent["type"]) {
  switch (eventType) {
    case "viewer_joined":
      return "Live stream join reward";
    case "chat_message":
      return "Live chat engagement reward";
    case "like_received":
      return "Live like engagement reward";
    case "gift_received":
      return "Live gift support reward";
  }
}

function applyProgressDelta(membership: TeamMembershipSnapshot | null, event: LiveEngagementEvent, baseTeamPoints: number): TeamProgress {
  const current = {
    commentCount: membership?.comment_count ?? 0,
    likeCount: membership?.like_count ?? 0,
    giftCount: membership?.gift_count ?? 0,
    totalGiftDiamonds: membership?.total_gift_diamonds ?? 0,
    watchSeconds: membership?.watch_seconds ?? 0,
    teamPoints: membership?.team_points ?? 0,
    achievementCount: membership?.achievement_count ?? 0,
  };

  switch (event.type) {
    case "viewer_joined":
      return { ...current, teamPoints: current.teamPoints + baseTeamPoints };
    case "chat_message":
      return {
        ...current,
        commentCount: current.commentCount + 1,
        teamPoints: current.teamPoints + baseTeamPoints,
      };
    case "like_received":
      return {
        ...current,
        likeCount: current.likeCount + Math.max(1, event.likeCount ?? 1),
        teamPoints: current.teamPoints + baseTeamPoints,
      };
    case "gift_received":
      return {
        ...current,
        giftCount: current.giftCount + Math.max(1, event.giftCount ?? 1),
        totalGiftDiamonds: current.totalGiftDiamonds + Math.max(0, event.giftDiamondCount ?? 0),
        teamPoints: current.teamPoints + baseTeamPoints,
      };
  }
}