import { ControlEvent, TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";
import type {
  WebcastChatMessage,
  WebcastGiftMessage,
  WebcastLikeMessage,
  WebcastLinkMicArmies,
  WebcastLinkMicBattle,
  WebcastLinkLayerMessage,
  WebcastLinkMessage,
  WebcastMemberMessage,
  WebcastRoomUserSeqMessage,
} from "tiktok-live-connector";

import type { Logger } from "../../lib/logger.js";
import type { ScoringService } from "../scoring/scoring-service.js";
import type { TrackingSnapshot, TrackedStreamer } from "../../repositories/tracking-repository.js";
import type { TeamMembershipSnapshot } from "../../repositories/viewer-engagement-repository.js";
import type { LiveEngagementEvent } from "../../domain/events.js";
import type { TrackingStore, ViewerEngagementStore } from "../../storage/live-storage.js";
import type { TrackingEventQueue } from "./tracking-event-queue.js";
import type { TrackingRealtimeStateStore } from "./tracking-realtime-state.js";
import { createTrackingQueueEvent } from "./tracking-event-processor.js";
import { isTikTokSignRateLimitError, type TikTokSignKeyPool } from "./tiktok-sign-key-pool.js";
import type { TikTokSigningService } from "./tiktok-signing-service.js";

type LiveEventBridgeOptions = {
  logger: Logger;
  trackingRepository: TrackingStore;
  engagementRepository?: ViewerEngagementStore;
  scoringService: ScoringService;
  eventQueue: TrackingEventQueue;
  realtimeStateStore?: TrackingRealtimeStateStore;
  requestTimeoutMs: number;
  signApiKey?: string;
  signKeyPool?: TikTokSignKeyPool;
  signingService?: TikTokSigningService;
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

type ReconnectScheduleState = {
  streamerId: string;
  username: string;
  streamSessionId: string;
  reason: string;
  error?: string | null;
  attempt: number;
  delayMs: number;
  scheduledAt: string;
};

type BridgeFailureState = {
  streamerId: string;
  username: string;
  streamSessionId: string;
  reason: string;
  error: string | null;
  attempt: number;
  occurredAt: string;
};

const BRIDGE_IDLE_RECONNECT_MS = 30_000;
const BRIDGE_RECONNECT_DELAY_MS = 2_000;
const BRIDGE_MAX_RECONNECT_DELAY_MS = 30_000;
const BRIDGE_RATE_LIMIT_RECONNECT_MS = 15 * 60_000;

export class TrackingLiveEventBridge {
  private readonly activeConnections = new Map<string, ActiveConnection>();
  private readonly connectingPromises = new Map<string, Promise<void>>();
  private readonly reconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly idleTimers = new Map<string, NodeJS.Timeout>();
  private readonly reconnectAttempts = new Map<string, number>();
  private readonly reconnectStates = new Map<string, ReconnectScheduleState>();
  private readonly lastFailures = new Map<string, BridgeFailureState>();

  private static readonly MAX_FAILURES_IN_DIAGNOSTICS = 20;

  constructor(private readonly options: LiveEventBridgeOptions) {}

  getHealth() {
    return {
      service: "tracking-live-event-bridge",
      status: this.activeConnections.size > 0 || this.connectingPromises.size > 0 ? "active" as const : "idle" as const,
      activeConnections: this.activeConnections.size,
      connecting: this.connectingPromises.size,
      reconnectScheduled: this.reconnectTimers.size,
      idleWatchers: this.idleTimers.size,
      reconnectingStreamers: this.reconnectAttempts.size,
      recentFailures: this.lastFailures.size,
    };
  }

  getDiagnostics() {
    return {
      ...this.getHealth(),
      signing: this.options.signingService?.getDiagnostics() ?? null,
      scheduledReconnects: Array.from(this.reconnectStates.values())
        .sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt)),
      activeStreamers: Array.from(this.activeConnections.values()).map((active) => ({
        streamerId: active.streamerId,
        username: active.username,
        streamSessionId: active.streamSessionId,
      })),
      recentFailures: Array.from(this.lastFailures.values())
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
        .slice(0, TrackingLiveEventBridge.MAX_FAILURES_IN_DIAGNOSTICS),
    };
  }

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
      this.clearReconnectState(streamer.id);
      return;
    }

    const inFlight = this.connectingPromises.get(streamer.id);
    if (existing && existing.streamSessionId === streamSessionId && existing.username === username) {
      return;
    }

    if (inFlight) {
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
    const existingPromise = this.connectingPromises.get(streamer.id);
    if (existingPromise) {
      await existingPromise;
      return;
    }

    const connectPromise = this.connectStreamerInternal(streamer, streamSessionId, username)
      .finally(() => {
        this.connectingPromises.delete(streamer.id);
      });

    this.connectingPromises.set(streamer.id, connectPromise);
    await connectPromise;
  }

  private async connectStreamerInternal(streamer: TrackedStreamer, streamSessionId: string, username: string) {
    const signApiKey = this.options.signKeyPool?.getKey() ?? this.options.signApiKey;
    const connectionOptions: ConstructorParameters<typeof TikTokLiveConnection>[1] = {
      processInitialData: false,
      fetchRoomInfoOnConnect: true,
      enableExtendedGiftInfo: true,
      enableRequestPolling: true,
      requestPollingIntervalMs: 1_000,
      sessionId: (this.options.sessionId as never) ?? null,
      ttTargetIdc: (this.options.ttTargetIdc as never) ?? null,
      signApiKey: signApiKey ?? undefined,
      authenticateWs: false,
      signedWebSocketProvider: this.options.signingService
        ? (params) => this.options.signingService!.fetchSignedWebSocket(params)
        : undefined,
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
      this.clearReconnectState(streamer.id);
      this.touchConnection(streamer.id);
      await this.applyRoomInfo(streamer.id, streamSessionId, state.roomInfo);
      await this.seedSessionFromRoomInfo(streamer, streamSessionId, state.roomInfo);
      this.options.logger.info("Live event bridge connected", {
        streamerId: streamer.id,
        username,
        streamSessionId,
      });
    } catch (error) {
      const rawErrorMessage = error instanceof Error ? error.message : String(error);
      const errorMessage = rawErrorMessage.trim() || "Unknown bridge connect failure";
      this.options.signKeyPool?.reportFailure(signApiKey, errorMessage);

      this.recordFailure(streamer.id, {
        streamerId: streamer.id,
        username,
        streamSessionId,
        reason: "connect_failed",
        error: errorMessage,
        attempt: this.reconnectAttempts.get(streamer.id) ?? 0,
        occurredAt: new Date().toISOString(),
      });
      this.options.logger.warn("Live event bridge connection failed", {
        streamerId: streamer.id,
        username,
        error: errorMessage,
      });
      this.scheduleReconnect(streamer, streamSessionId, username, "connect_failed", errorMessage);
    }
  }

  private async applyRoomInfo(streamerId: string, streamSessionId: string, roomInfo: unknown) {
    const roomMetrics = extractRoomMetrics(roomInfo);
    const roomState = extractRoomState(roomInfo);

    if (
      roomMetrics.viewerCount === null
      && roomMetrics.likeCount === null
      && roomState.liveStatusCode === null
      && roomState.liveStatusLabel === null
      && roomState.isLinkMic === null
      && roomState.linkMicLayout === null
      && roomState.multiLiveEnum === null
      && roomState.liveModeLabel === null
    ) {
      return;
    }

    await this.options.realtimeStateStore?.applyRoomInfo(streamerId, {
      streamId: streamSessionId,
      source: "tiktok-live-connector",
      occurredAt: new Date().toISOString(),
      viewerCount: roomMetrics.viewerCount,
      likeCount: roomMetrics.likeCount,
      liveStatusCode: roomState.liveStatusCode,
      liveStatusLabel: roomState.liveStatusLabel,
      isLinkMic: roomState.isLinkMic,
      linkMicLayout: roomState.linkMicLayout,
      multiLiveEnum: roomState.multiLiveEnum,
      liveModeLabel: roomState.liveModeLabel,
    });
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
    connection.on(WebcastEvent.LINK_MIC_BATTLE, (data) => this.handleLinkMicBattleEvent(streamer, streamSessionId, data));
    connection.on(WebcastEvent.LINK_MIC_ARMIES, (data) => this.handleLinkMicArmiesEvent(streamer, streamSessionId, data));
    connection.on(WebcastEvent.LINK_MESSAGE, (data) => this.handleLinkMessageEvent(streamer, streamSessionId, data));
    connection.on(WebcastEvent.LINK_LAYER, (data) => this.handleLinkLayerEvent(streamer, streamSessionId, data));
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
    }, BRIDGE_IDLE_RECONNECT_MS);

    this.idleTimers.set(streamerId, idleTimer);
  }

  private scheduleReconnect(streamer: TrackedStreamer, streamSessionId: string, username: string, reason: string, error?: string | null) {
    if (this.reconnectTimers.has(streamer.id)) {
      return;
    }

    const attempt = (this.reconnectAttempts.get(streamer.id) ?? 0) + 1;
    this.reconnectAttempts.set(streamer.id, attempt);
    const delayMs = computeReconnectDelayMs(attempt, error);
    const scheduledAt = new Date().toISOString();
    this.reconnectStates.set(streamer.id, {
      streamerId: streamer.id,
      username,
      streamSessionId,
      reason,
      error: error ?? null,
      attempt,
      delayMs,
      scheduledAt,
    });

    this.recordFailure(streamer.id, {
      streamerId: streamer.id,
      username,
      streamSessionId,
      reason,
      error: error ?? null,
      attempt,
      occurredAt: scheduledAt,
    });

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(streamer.id);
      this.reconnectStates.delete(streamer.id);
      void this.connectStreamer(streamer, streamSessionId, username);
    }, delayMs);

    this.reconnectTimers.set(streamer.id, timer);
    this.options.logger.info("Live event bridge reconnect scheduled", {
      streamerId: streamer.id,
      streamSessionId,
      reason,
      attempt,
      delayMs,
    });
  }

  private async reconnectStreamer(streamerId: string, reason: string) {
    const active = this.activeConnections.get(streamerId);
    if (!active) {
      return;
    }

    const { streamer, streamSessionId, username } = active;
    await this.disconnectStreamer(streamerId, reason, { markEnded: false });
    this.scheduleReconnect(streamer, streamSessionId, username, reason);
  }

  private async seedSessionFromRoomInfo(streamer: TrackedStreamer, streamSessionId: string, roomInfo: unknown) {
    const metrics = extractRoomMetrics(roomInfo);
    if (metrics.viewerCount === null && metrics.likeCount === null && metrics.followersCount === null) {
      return;
    }

    if (metrics.viewerCount === null && metrics.likeCount === null) {
      return;
    }

    await this.options.eventQueue.publish(createTrackingQueueEvent({
      streamerId: streamer.id,
      streamSessionId,
      type: "snapshot_updated",
      source: "tiktok-live-connector",
      occurredAt: new Date().toISOString(),
      payload: {
        viewer_count: metrics.viewerCount,
        like_count: metrics.likeCount,
        followers_count: metrics.followersCount,
        seeded_from_room_info: true,
      },
      rawPayload: summarizeRoomMetrics(roomInfo),
    }));
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

  }

  private async handleRoomUserEvent(streamer: TrackedStreamer, streamSessionId: string, data: WebcastRoomUserSeqMessage) {
    await this.options.eventQueue.publish(createTrackingQueueEvent({
      streamerId: streamer.id,
      streamSessionId,
      type: "snapshot_updated",
      source: "tiktok-live-connector",
      occurredAt: new Date().toISOString(),
      payload: {
        viewer_count: data.viewerCount,
        total_user: data.totalUser,
      },
      rawPayload: {
        viewer_count: data.viewerCount,
        total_user: data.totalUser,
        popularity: data.popularity,
      },
    }));
  }

  private async handleLinkMicBattleEvent(streamer: TrackedStreamer, streamSessionId: string, data: WebcastLinkMicBattle) {
    const battleUsers = Object.values(data.anchorInfo ?? {}).map((entry) => entry?.user?.displayId).filter(Boolean);
    const liveModeLabel = resolveBattleModeLabel(data.action, battleUsers.length);
    if (!liveModeLabel) {
      return;
    }

    await this.applyLiveMode(streamer.id, streamSessionId, {
      liveModeLabel,
      force: true,
      eventType: "battle_mode_changed",
      normalizedPayload: {
        live_mode_label: liveModeLabel,
        battle_action: data.action,
        battle_users: battleUsers,
      },
      rawPayload: {
      battleId: data.battleId,
      action: data.action,
        battleUsers,
      bubbleText: data.bubbleText,
      },
    });
  }

  private async handleLinkMicArmiesEvent(streamer: TrackedStreamer, streamSessionId: string, data: WebcastLinkMicArmies) {
    await this.applyLiveMode(streamer.id, streamSessionId, {
      liveModeLabel: "Батл",
      force: true,
      eventType: "battle_mode_changed",
      normalizedPayload: {
        live_mode_label: "Батл",
        battle_status: data.battleStatus,
        gift_count: data.giftCount,
        total_diamond_count: data.totalDiamondCount,
      },
      rawPayload: {
      battleId: data.battleId,
      battleStatus: data.battleStatus,
      giftCount: data.giftCount,
      totalDiamondCount: data.totalDiamondCount,
      },
    });
  }

  private async handleLinkMessageEvent(streamer: TrackedStreamer, streamSessionId: string, data: WebcastLinkMessage) {
    const liveModeLabel = resolveSceneModeLabel(data.Scene);
    if (!liveModeLabel) {
      return;
    }

    await this.applyLiveMode(streamer.id, streamSessionId, {
      liveModeLabel,
      eventType: "link_scene_changed",
      normalizedPayload: {
        live_mode_label: liveModeLabel,
        scene: data.Scene,
        message_type: data.MessageType,
      },
      rawPayload: {
        scene: data.Scene,
        messageType: data.MessageType,
        linkerId: data.LinkerId,
        expireTimestamp: data.expireTimestamp,
      },
    });
  }

  private async handleLinkLayerEvent(streamer: TrackedStreamer, streamSessionId: string, data: WebcastLinkLayerMessage) {
    const liveModeLabel = resolveSceneModeLabel(data.scene);
    if (!liveModeLabel) {
      return;
    }

    await this.applyLiveMode(streamer.id, streamSessionId, {
      liveModeLabel,
      eventType: "link_scene_changed",
      normalizedPayload: {
        live_mode_label: liveModeLabel,
        scene: data.scene,
        message_type: data.messageType,
      },
      rawPayload: {
        scene: data.scene,
        messageType: data.messageType,
        channelId: data.channelId,
        rtcRoomId: data.rtcRoomId,
      },
    });
  }

  private async applyLiveMode(streamerId: string, streamSessionId: string, input: {
    liveModeLabel: string;
    eventType: string;
    normalizedPayload: Record<string, unknown>;
    rawPayload: Record<string, unknown>;
    force?: boolean;
  }) {
    const currentState = await this.options.realtimeStateStore?.getStreamerState(streamerId);
    if (!input.force && !shouldReplaceLiveMode(currentState?.liveModeLabel ?? null, input.liveModeLabel)) {
      return;
    }

    await this.options.realtimeStateStore?.applyRoomInfo(streamerId, {
      streamId: streamSessionId,
      source: "tiktok-live-connector",
      occurredAt: new Date().toISOString(),
      isLinkMic: true,
      liveStatusLabel: "В эфире",
      liveModeLabel: input.liveModeLabel,
    });

    await this.options.trackingRepository.insertStreamEvent({
      streamerId,
      streamSessionId,
      eventType: input.eventType,
      source: "tiktok-live-connector",
      eventTimestamp: new Date().toISOString(),
      normalizedPayload: input.normalizedPayload,
      rawPayload: input.rawPayload,
    });

    this.options.logger.info("Live mode updated from runtime event", {
      streamerId,
      streamSessionId,
      liveModeLabel: input.liveModeLabel,
      eventType: input.eventType,
    });
  }

  private async processLiveEvent(event: LiveEngagementEvent) {
    await this.options.eventQueue.publish(createTrackingQueueEvent({
      streamerId: event.streamerId,
      streamSessionId: event.streamSessionId,
      type: event.type,
      source: event.source,
      occurredAt: event.occurredAt,
      tiktokUsername: event.externalViewerUsername ?? null,
      externalViewerId: event.externalViewerId ?? null,
      payload: {
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
        viewer_count: event.viewerCount,
      },
      rawPayload: event.rawPayload,
    }));
  }

  private async disconnectStreamer(streamerId: string, reason: string, options?: { markEnded?: boolean }) {
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

    if (options?.markEnded ?? shouldMarkStreamEnded(reason)) {
      this.clearReconnectState(streamerId);
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

    if (options?.markEnded ?? shouldMarkStreamEnded(reason)) {
      await this.options.realtimeStateStore?.markStreamEnded(streamerId, {
        streamId: active.streamSessionId,
        source: "tiktok-live-connector",
        occurredAt: new Date().toISOString(),
      });
    }
  }

  private clearReconnectState(streamerId: string) {
    this.reconnectAttempts.delete(streamerId);
    this.reconnectStates.delete(streamerId);
    this.lastFailures.delete(streamerId);
    const reconnectTimer = this.reconnectTimers.get(streamerId);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      this.reconnectTimers.delete(streamerId);
    }
  }

  private recordFailure(streamerId: string, failure: BridgeFailureState) {
    this.lastFailures.set(streamerId, failure);
  }
}

function shouldMarkStreamEnded(reason: string) {
  return reason === "stream_not_live" || reason === "stream_end";
}

function computeReconnectDelayMs(attempt: number, error?: string | null) {
  if (isTikTokSignRateLimitError(error)) {
    const jitter = Math.floor(Math.random() * 60_000);
    return BRIDGE_RATE_LIMIT_RECONNECT_MS + jitter;
  }

  const baseDelay = Math.min(
    BRIDGE_RECONNECT_DELAY_MS * (2 ** Math.max(0, attempt - 1)),
    BRIDGE_MAX_RECONNECT_DELAY_MS,
  );
  const jitter = Math.floor(Math.random() * Math.max(250, Math.floor(baseDelay * 0.35)));
  return baseDelay + jitter;
}

function resolveSceneModeLabel(scene: unknown) {
  const numericScene = typeof scene === "number" ? scene : typeof scene === "string" ? Number(scene) : null;
  if (numericScene === 4) {
    return "Мультигость";
  }

  if (numericScene === 2) {
    return "Гостевой эфир";
  }

  return null;
}

function resolveBattleModeLabel(action: unknown, participantCount: number) {
  const numericAction = typeof action === "number" ? action : typeof action === "string" ? Number(action) : null;
  if (numericAction === 5 || numericAction === 6 || numericAction === 11) {
    return participantCount > 2 ? "Мультигость" : "Гостевой эфир";
  }

  return "Батл";
}

function getLiveModePriority(value: string | null) {
  switch (value) {
    case "Батл":
      return 3;
    case "Мультигость":
      return 2;
    case "Гостевой эфир":
      return 1;
    default:
      return 0;
  }
}

function shouldReplaceLiveMode(currentValue: string | null, nextValue: string) {
  return getLiveModePriority(nextValue) >= getLiveModePriority(currentValue);
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

function readBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === 1 || value === "1" || value === "true") {
    return true;
  }

  if (value === 0 || value === "0" || value === "false") {
    return false;
  }

  return null;
}

function extractRoomState(roomInfo: unknown) {
  const liveStatusCode = extractNumber(roomInfo, [
    ["status"],
    ["liveRoom", "status"],
    ["data", "status"],
    ["data", "liveRoom", "status"],
    ["roomStatus"],
  ]);

  const linkMicLayout = extractNumber(roomInfo, [
    ["linkmic_layout"],
    ["liveRoom", "linkmic_layout"],
    ["streamRoom", "linkmic_layout"],
    ["data", "liveRoom", "linkmic_layout"],
  ]);

  const multiLiveEnum = extractNumber(roomInfo, [
    ["multi_live_enum"],
    ["liveRoom", "multi_live_enum"],
    ["streamRoom", "multi_live_enum"],
    ["data", "liveRoom", "multi_live_enum"],
  ]);

  const hasMultiLiveObject = Boolean(
    getValueAtPath(roomInfo, ["social_interaction", "multi_live"])
    || getValueAtPath(roomInfo, ["liveRoom", "social_interaction", "multi_live"])
    || getValueAtPath(roomInfo, ["streamRoom", "social_interaction", "multi_live"])
  );

  const isLinkMic = (
    readBoolean(getValueAtPath(roomInfo, ["live_type_linkmic"]))
    ?? readBoolean(getValueAtPath(roomInfo, ["liveRoom", "live_type_linkmic"]))
    ?? readBoolean(getValueAtPath(roomInfo, ["streamRoom", "live_type_linkmic"]))
    ?? (linkMicLayout !== null ? linkMicLayout > 0 : null)
    ?? (hasMultiLiveObject ? true : null)
  );

  let liveStatusLabel: string | null = null;
  switch (liveStatusCode) {
    case 2:
      liveStatusLabel = "В эфире";
      break;
    case 1:
      liveStatusLabel = "Подготовка";
      break;
    case 4:
      liveStatusLabel = "Пауза";
      break;
    default:
      liveStatusLabel = liveStatusCode === null ? null : `Статус ${liveStatusCode}`;
  }

  let liveModeLabel: string | null = null;
  if (isLinkMic) {
    liveModeLabel = (multiLiveEnum ?? 0) > 0 || (linkMicLayout ?? 0) > 0 || hasMultiLiveObject
      ? "Мультигость"
      : "Гостевой эфир";
  }

  return {
    liveStatusCode,
    liveStatusLabel,
    isLinkMic,
    linkMicLayout,
    multiLiveEnum,
    liveModeLabel,
  };
}

