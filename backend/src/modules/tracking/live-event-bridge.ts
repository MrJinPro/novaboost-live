import { ControlEvent, TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";
import type { WebcastChatMessage, WebcastGiftMessage, WebcastLikeMessage, WebcastMemberMessage, WebcastRoomUserSeqMessage } from "tiktok-live-connector";

import type { Logger } from "../../lib/logger.js";
import type { ScoringService } from "../scoring/scoring-service.js";
import type { TrackingSnapshot, TrackedStreamer } from "../../repositories/tracking-repository.js";
import type { TeamMembershipSnapshot } from "../../repositories/viewer-engagement-repository.js";
import type { LiveEngagementEvent } from "../../domain/events.js";
import type { TrackingStore, ViewerEngagementStore } from "../../storage/live-storage.js";
import type { TrackingRealtimeStateStore } from "./tracking-realtime-state.js";

type LiveEventBridgeOptions = {
  logger: Logger;
  trackingRepository: TrackingStore;
  engagementRepository?: ViewerEngagementStore;
  scoringService: ScoringService;
  realtimeStateStore?: TrackingRealtimeStateStore;
  requestTimeoutMs: number;
  signApiKey?: string;
  sessionId?: string;
  ttTargetIdc?: string;
  msToken?: string;
  cookieHeader?: string;
};

type ActiveConnection = {
  streamerId: string;
  streamer: TrackedStreamer;
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
  private readonly reconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly idleTimers = new Map<string, NodeJS.Timeout>();

  private static readonly IDLE_RECONNECT_MS = 30_000;
  private static readonly RECONNECT_DELAY_MS = 2_000;

  constructor(private readonly options: LiveEventBridgeOptions) {}

  private hasCookie(cookieHeader: string, cookieName: string) {
    return new RegExp(`(?:^|;\\s*)${cookieName}=`).test(cookieHeader);
  }

  private mergeCookieHeader(connection: TikTokLiveConnection, cookieHeader?: string) {
    if (!cookieHeader || !connection?.webClient?.cookieJar) {
      return;
    }

    const parsedCookies = connection.webClient.cookieJar.parseCookie(cookieHeader);
    Object.assign(connection.webClient.cookieJar.cookies, parsedCookies);
  }

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
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }

    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }

    this.reconnectTimers.clear();
    this.idleTimers.clear();
    await Promise.all(Array.from(this.activeConnections.keys()).map((streamerId) => this.disconnectStreamer(streamerId, "shutdown")));
  }

  private async connectStreamer(streamer: TrackedStreamer, streamSessionId: string, username: string) {
    const connectionOptions: ConstructorParameters<typeof TikTokLiveConnection>[1] = {
      processInitialData: false,
      fetchRoomInfoOnConnect: true,
      enableExtendedGiftInfo: true,
      enableRequestPolling: true,
      requestPollingIntervalMs: 1_000,
      sessionId: (this.options.sessionId as never) ?? null,
      ttTargetIdc: (this.options.ttTargetIdc as never) ?? null,
      signApiKey: this.options.signApiKey ?? undefined,
      authenticateWs: false,
      webClientOptions: {
        timeout: this.options.requestTimeoutMs,
      },
    };

    const connection = new TikTokLiveConnection(username, connectionOptions);

    this.mergeCookieHeader(connection, this.options.cookieHeader);

    if (this.options.msToken && !this.hasCookie(connection.webClient.cookieJar.getCookieString(), "msToken")) {
      connection.webClient.cookieJar.cookies.msToken = this.options.msToken;
    }

    this.registerHandlers(streamer, streamSessionId, connection);

    try {
      const state = await connection.connect();
      this.activeConnections.set(streamer.id, { streamerId: streamer.id, streamer, streamSessionId, username, connection });
      this.touchConnection(streamer.id);
      await this.seedSessionFromRoomInfo(streamer, streamSessionId, state.roomInfo);
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
      this.scheduleReconnect(streamer, streamSessionId, username, "connect_failed");
    }
  }

  private registerHandlers(streamer: TrackedStreamer, streamSessionId: string, connection: TikTokLiveConnection) {
    connection.on(ControlEvent.CONNECTED, (state) => {
      this.touchConnection(streamer.id);
      this.options.logger.info("Live event bridge transport connected", {
        streamerId: streamer.id,
        streamSessionId,
        roomId: state.roomId,
      });
    });
    connection.on(ControlEvent.WEBSOCKET_CONNECTED, () => {
      this.touchConnection(streamer.id);
      this.options.logger.info("Live event bridge websocket connected", {
        streamerId: streamer.id,
        streamSessionId,
      });
    });
    connection.on(ControlEvent.RAW_DATA, (type, data) => {
      this.touchConnection(streamer.id);
      this.options.logger.info("Live event bridge raw data", {
        streamerId: streamer.id,
        streamSessionId,
        messageType: type,
        payloadBase64: Buffer.from(data).toString("base64"),
      });
    });
    connection.on(ControlEvent.DISCONNECTED, (event) => {
      this.options.logger.warn("Live event bridge transport disconnected", {
        streamerId: streamer.id,
        streamSessionId,
        code: event.code,
        reason: event.reason,
      });
      void this.reconnectStreamer(streamer.id, "transport_disconnected");
    });
    connection.on(ControlEvent.ERROR, (error) => {
      this.options.logger.warn("Live event bridge transport error", {
        streamerId: streamer.id,
        streamSessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      void this.reconnectStreamer(streamer.id, "transport_error");
    });
    connection.on(WebcastEvent.MEMBER, (data) => this.handleMemberEvent(streamer, streamSessionId, data));
    connection.on(WebcastEvent.CHAT, (data) => this.handleChatEvent(streamer, streamSessionId, data));
    connection.on(WebcastEvent.LIKE, (data) => this.handleLikeEvent(streamer, streamSessionId, data));
    connection.on(WebcastEvent.GIFT, (data) => this.handleGiftEvent(streamer, streamSessionId, data));
    connection.on(WebcastEvent.ROOM_USER, (data) => this.handleRoomUserEvent(streamer, streamSessionId, data));
    connection.on(WebcastEvent.STREAM_END, async () => {
      await this.disconnectStreamer(streamer.id, "stream_end");
    });
  }

  private touchConnection(streamerId: string) {
    const active = this.activeConnections.get(streamerId);
    if (!active) {
      return;
    }

    const existingTimer = this.idleTimers.get(streamerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const idleTimer = setTimeout(() => {
      void this.reconnectStreamer(streamerId, "idle_timeout");
    }, TrackingLiveEventBridge.IDLE_RECONNECT_MS);

    this.idleTimers.set(streamerId, idleTimer);
  }

  private scheduleReconnect(streamer: TrackedStreamer, streamSessionId: string, username: string, reason: string) {
    if (this.reconnectTimers.has(streamer.id)) {
      return;
    }

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(streamer.id);
      void this.connectStreamer(streamer, streamSessionId, username);
    }, TrackingLiveEventBridge.RECONNECT_DELAY_MS);

    this.reconnectTimers.set(streamer.id, timer);
    this.options.logger.info("Live event bridge reconnect scheduled", {
      streamerId: streamer.id,
      streamSessionId,
      reason,
      delayMs: TrackingLiveEventBridge.RECONNECT_DELAY_MS,
    });
  }

  private async reconnectStreamer(streamerId: string, reason: string) {
    const active = this.activeConnections.get(streamerId);
    if (!active) {
      return;
    }

    const { streamer, streamSessionId, username } = active;
    await this.disconnectStreamer(streamerId, reason);
    this.scheduleReconnect(streamer, streamSessionId, username, reason);
  }

  private async seedSessionFromRoomInfo(streamer: TrackedStreamer, streamSessionId: string, roomInfo: unknown) {
    const metrics = extractRoomMetrics(roomInfo);
    if (metrics.viewerCount === null && metrics.likeCount === null && metrics.followersCount === null) {
      return;
    }

    const session = await this.options.trackingRepository.getLatestSessionSummary(streamer.id);
    if (!session || session.id !== streamSessionId) {
      return;
    }

    const nextViewerCount = metrics.viewerCount ?? session.current_viewer_count;
    const likeDelta = metrics.likeCount === null ? 0 : Math.max(0, metrics.likeCount - session.like_count);

    if (likeDelta <= 0 && nextViewerCount === session.current_viewer_count) {
      return;
    }

    await this.options.trackingRepository.updateSessionEngagement(streamSessionId, {
      likeDelta,
      currentViewerCount: metrics.viewerCount ?? undefined,
      rawSnapshot: {
        initial_room_info_sync: true,
        viewer_count: metrics.viewerCount,
        like_count: metrics.likeCount,
        followers_count: metrics.followersCount,
      },
    });

    await this.options.trackingRepository.insertStreamEvent({
      streamerId: streamer.id,
      streamSessionId,
      eventType: "snapshot_updated",
      source: "tiktok-live-connector",
      eventTimestamp: new Date().toISOString(),
      normalizedPayload: {
        viewer_count: nextViewerCount,
        like_count: session.like_count + likeDelta,
        followers_count: metrics.followersCount,
        seeded_from_room_info: true,
      },
      rawPayload: summarizeRoomMetrics(roomInfo),
    });
  }

  private async handleMemberEvent(streamer: TrackedStreamer, streamSessionId: string, data: WebcastMemberMessage) {
    const viewerProfile = extractTikTokUserProfile(data.user);

    await this.processLiveEvent({
      type: "viewer_joined",
      streamerId: streamer.id,
      streamSessionId,
      occurredAt: new Date().toISOString(),
      source: "tiktok-live-connector",
      externalViewerId: data.user?.userId ?? data.userId ?? null,
      externalViewerUsername: data.user?.uniqueId ?? null,
      externalViewerDisplayName: data.user?.nickname ?? null,
      externalViewerAvatarUrl: viewerProfile.avatarUrl,
      externalViewerBio: viewerProfile.bio,
      externalViewerSecUid: viewerProfile.secUid,
      viewerLevel: parseNumeric(data.user?.fansClub?.data?.level) ?? parseNumeric(data.user?.payScore),
      rawPayload: {
        action: data.action,
        member_count: data.memberCount,
        username: data.user?.uniqueId ?? null,
        nickname: data.user?.nickname ?? null,
        avatar_url: viewerProfile.avatarUrl,
        bio: viewerProfile.bio,
        sec_uid: viewerProfile.secUid,
      },
    });
  }

  private async handleChatEvent(streamer: TrackedStreamer, streamSessionId: string, data: WebcastChatMessage) {
    const viewerProfile = extractTikTokUserProfile(data.user);

    await this.processLiveEvent({
      type: "chat_message",
      streamerId: streamer.id,
      streamSessionId,
      occurredAt: new Date().toISOString(),
      source: "tiktok-live-connector",
      externalViewerId: data.user?.userId ?? null,
      externalViewerUsername: data.user?.uniqueId ?? null,
      externalViewerDisplayName: data.user?.nickname ?? null,
      externalViewerAvatarUrl: viewerProfile.avatarUrl,
      externalViewerBio: viewerProfile.bio,
      externalViewerSecUid: viewerProfile.secUid,
      commentText: data.comment,
      viewerLevel: parseNumeric(data.user?.fansClub?.data?.level) ?? parseNumeric(data.user?.payScore),
      rawPayload: {
        comment: data.comment,
        username: data.user?.uniqueId ?? null,
        nickname: data.user?.nickname ?? null,
        avatar_url: viewerProfile.avatarUrl,
        bio: viewerProfile.bio,
        sec_uid: viewerProfile.secUid,
      },
    });

    await this.options.trackingRepository.updateSessionEngagement(streamSessionId, {
      messageDelta: 1,
      rawSnapshot: {
        last_chat_at: new Date().toISOString(),
      },
    });

    await this.options.realtimeStateStore?.applyEngagement(streamer.id, {
      streamId: streamSessionId,
      source: "tiktok-live-connector",
      eventType: "chat_message",
      occurredAt: new Date().toISOString(),
      messageDelta: 1,
    });
  }

  private async handleLikeEvent(streamer: TrackedStreamer, streamSessionId: string, data: WebcastLikeMessage) {
    const viewerProfile = extractTikTokUserProfile(data.user);

    await this.processLiveEvent({
      type: "like_received",
      streamerId: streamer.id,
      streamSessionId,
      occurredAt: new Date().toISOString(),
      source: "tiktok-live-connector",
      externalViewerId: data.user?.userId ?? null,
      externalViewerUsername: data.user?.uniqueId ?? null,
      externalViewerDisplayName: data.user?.nickname ?? null,
      externalViewerAvatarUrl: viewerProfile.avatarUrl,
      externalViewerBio: viewerProfile.bio,
      externalViewerSecUid: viewerProfile.secUid,
      likeCount: data.likeCount,
      viewerLevel: parseNumeric(data.user?.fansClub?.data?.level) ?? parseNumeric(data.user?.payScore),
      rawPayload: {
        like_count: data.likeCount,
        total_like_count: data.totalLikeCount,
        username: data.user?.uniqueId ?? null,
        nickname: data.user?.nickname ?? null,
        avatar_url: viewerProfile.avatarUrl,
        bio: viewerProfile.bio,
        sec_uid: viewerProfile.secUid,
      },
    });

    await this.options.trackingRepository.updateSessionEngagement(streamSessionId, {
      likeDelta: data.likeCount,
      rawSnapshot: {
        last_like_at: new Date().toISOString(),
        total_like_count: data.totalLikeCount,
      },
    });

    await this.options.realtimeStateStore?.applyEngagement(streamer.id, {
      streamId: streamSessionId,
      source: "tiktok-live-connector",
      eventType: "like_received",
      occurredAt: new Date().toISOString(),
      likeDelta: data.likeCount,
    });
  }

  private async handleGiftEvent(streamer: TrackedStreamer, streamSessionId: string, data: WebcastGiftMessage) {
    if (data.giftDetails?.giftType === 1 && !data.repeatEnd) {
      return;
    }

    const giftCount = Math.max(1, data.repeatCount || data.comboCount || data.groupCount || 1);
    const diamondCount = (data.giftDetails?.diamondCount ?? 0) * giftCount;
    const viewerProfile = extractTikTokUserProfile(data.user);

    await this.processLiveEvent({
      type: "gift_received",
      streamerId: streamer.id,
      streamSessionId,
      occurredAt: new Date().toISOString(),
      source: "tiktok-live-connector",
      externalViewerId: data.user?.userId ?? null,
      externalViewerUsername: data.user?.uniqueId ?? null,
      externalViewerDisplayName: data.user?.nickname ?? null,
      externalViewerAvatarUrl: viewerProfile.avatarUrl,
      externalViewerBio: viewerProfile.bio,
      externalViewerSecUid: viewerProfile.secUid,
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
        avatar_url: viewerProfile.avatarUrl,
        bio: viewerProfile.bio,
        sec_uid: viewerProfile.secUid,
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

    await this.options.realtimeStateStore?.applyEngagement(streamer.id, {
      streamId: streamSessionId,
      source: "tiktok-live-connector",
      eventType: "gift_received",
      occurredAt: new Date().toISOString(),
      giftDelta: giftCount,
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

    await this.options.realtimeStateStore?.applyEngagement(streamer.id, {
      streamId: streamSessionId,
      source: "tiktok-live-connector",
      eventType: "room_user",
      occurredAt: new Date().toISOString(),
      viewerCount: data.viewerCount,
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
        external_viewer_avatar_url: event.externalViewerAvatarUrl,
        external_viewer_bio: event.externalViewerBio,
        external_viewer_sec_uid: event.externalViewerSecUid,
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

    await this.options.engagementRepository.syncViewerIdentity({
      userId: eligibleViewer.userId,
      displayName: event.externalViewerDisplayName ?? eligibleViewer.displayName,
      tiktokUsername: event.externalViewerUsername ?? eligibleViewer.tiktokUsername,
      avatarUrl: event.externalViewerAvatarUrl,
      bio: event.externalViewerBio,
    });

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
        external_viewer_avatar_url: event.externalViewerAvatarUrl,
        external_viewer_bio: event.externalViewerBio,
        external_viewer_sec_uid: event.externalViewerSecUid,
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
    const idleTimer = this.idleTimers.get(streamerId);
    if (idleTimer) {
      clearTimeout(idleTimer);
      this.idleTimers.delete(streamerId);
    }

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

    await this.options.realtimeStateStore?.markStreamEnded(streamerId, {
      streamId: active.streamSessionId,
      source: "tiktok-live-connector",
      occurredAt: new Date().toISOString(),
    });
  }
}

function normalizeTikTokUsername(input: string) {
  const normalized = input.trim().replace(/^@+/, "");
  return normalized || null;
}

function extractTikTokUserProfile(user: unknown) {
  if (!user || typeof user !== "object") {
    return { avatarUrl: null, bio: null, secUid: null };
  }

  const record = user as Record<string, unknown>;

  const directProfilePictureUrl = typeof record.profilePictureUrl === "string" && record.profilePictureUrl.trim().length > 0
    ? record.profilePictureUrl.trim()
    : null;
  const avatarFromDetails = extractImageUrl(record.profilePicture) ?? extractImageUrl(record.avatarThumb) ?? null;
  const userDetails = typeof record.userDetails === "object" && record.userDetails ? record.userDetails as Record<string, unknown> : null;
  const bio = typeof userDetails?.bioDescription === "string" && userDetails.bioDescription.trim().length > 0
    ? userDetails.bioDescription.trim()
    : typeof record.signature === "string" && record.signature.trim().length > 0
      ? record.signature.trim()
      : null;
  const secUid = typeof record.secUid === "string" && record.secUid.trim().length > 0 ? record.secUid.trim() : null;

  return {
    avatarUrl: directProfilePictureUrl ?? avatarFromDetails,
    bio,
    secUid,
  };
}

function extractImageUrl(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map(extractImageUrl).find(Boolean) ?? null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return extractImageUrl(record.url) ?? extractImageUrl(record.urlList) ?? extractImageUrl(record.urls) ?? null;
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

function getValueAtPath(source: unknown, path: string[]) {
  let current: unknown = source;

  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function extractNumber(source: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = parseNumeric(getValueAtPath(source, path));
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function extractRoomMetrics(roomInfo: unknown) {
  return {
    viewerCount: extractNumber(roomInfo, [
      ["user_count"],
      ["stats", "user_count"],
      ["stats", "viewer_count"],
      ["data", "liveRoom", "user_count"],
      ["data", "liveRoom", "stats", "user_count"],
      ["data", "liveRoom", "stats", "viewer_count"],
      ["data", "liveRoom", "stats", "userCount"],
      ["liveRoomUserInfo", "liveRoom", "user_count"],
      ["liveRoomUserInfo", "liveRoom", "stats", "user_count"],
      ["liveRoomUserInfo", "liveRoom", "stats", "viewer_count"],
      ["liveRoomUserInfo", "liveRoom", "stats", "userCount"],
    ]),
    likeCount: extractNumber(roomInfo, [
      ["like_count"],
      ["stats", "like_count"],
      ["stats", "total_like_count"],
      ["stats", "likeCount"],
      ["stats", "totalLikeCount"],
      ["data", "liveRoom", "like_count"],
      ["data", "liveRoom", "stats", "like_count"],
      ["data", "liveRoom", "stats", "total_like_count"],
      ["data", "liveRoom", "stats", "likeCount"],
      ["data", "liveRoom", "stats", "totalLikeCount"],
      ["liveRoomUserInfo", "liveRoom", "like_count"],
      ["liveRoomUserInfo", "liveRoom", "stats", "like_count"],
      ["liveRoomUserInfo", "liveRoom", "stats", "total_like_count"],
      ["liveRoomUserInfo", "liveRoom", "stats", "likeCount"],
      ["liveRoomUserInfo", "liveRoom", "stats", "totalLikeCount"],
    ]),
    followersCount: extractNumber(roomInfo, [
      ["owner", "follow_info", "follower_count"],
      ["owner", "follower_count"],
      ["data", "owner", "follow_info", "follower_count"],
      ["data", "owner", "followInfo", "followerCount"],
      ["data", "owner", "follower_count"],
      ["data", "owner", "followerCount"],
      ["data", "user", "follower_count"],
      ["data", "user", "followerCount"],
      ["data", "user", "stats", "followerCount"],
      ["liveRoomUserInfo", "user", "follow_info", "follower_count"],
      ["liveRoomUserInfo", "user", "followInfo", "followerCount"],
      ["liveRoomUserInfo", "user", "follower_count"],
      ["liveRoomUserInfo", "user", "followerCount"],
    ]),
  };
}

function summarizeRoomMetrics(roomInfo: unknown) {
  return {
    room_id: getValueAtPath(roomInfo, ["id"]),
    status: getValueAtPath(roomInfo, ["status"]),
    data_status: getValueAtPath(roomInfo, ["data", "status"]),
    stats: getValueAtPath(roomInfo, ["stats"]),
    live_room_stats: getValueAtPath(roomInfo, ["data", "liveRoom", "stats"]),
    live_room_user_info: getValueAtPath(roomInfo, ["liveRoomUserInfo"]),
    metrics: extractRoomMetrics(roomInfo),
  } satisfies Record<string, unknown>;
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