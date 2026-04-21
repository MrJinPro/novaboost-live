import { randomUUID } from "node:crypto";

import type { LiveEngagementEvent } from "../../domain/events.js";
import type { Logger } from "../../lib/logger.js";
import type { TrackingStore, ViewerEngagementStore } from "../../storage/live-storage.js";
import type { TeamMembershipSnapshot } from "../../repositories/viewer-engagement-repository.js";
import type { ScoringService } from "../scoring/scoring-service.js";
import type { TrackingEventQueue, TrackingQueueEvent } from "./tracking-event-queue.js";
import type { TrackingRealtimeStateStore } from "./tracking-realtime-state.js";

type TrackingEventProcessorOptions = {
  logger: Logger;
  trackingRepository: TrackingStore;
  engagementRepository?: ViewerEngagementStore;
  realtimeStateStore?: TrackingRealtimeStateStore;
  scoringService: ScoringService;
  queue: TrackingEventQueue;
  intervalMs?: number;
};

type RewardDecision = {
  profilePoints: number;
  teamPoints: number;
  shouldRecordAction: boolean;
  watchSeconds?: number;
  ledgerReason?: string;
};

type ScheduledVisitReward = {
  userId: string;
  streamerId: string;
  streamSessionId: string;
  occurredAt: string;
  source: string;
  event: LiveEngagementEvent;
};

export class TrackingEventProcessor {
  private poller: NodeJS.Timeout | null = null;
  private processing = false;
  private readonly pendingVisitRewards = new Map<string, NodeJS.Timeout>();

  constructor(private readonly options: TrackingEventProcessorOptions) {}

  getHealth() {
    return {
      service: "tracking-event-processor",
      status: this.poller ? "active" : "idle",
      queue: this.options.queue.getHealth(),
    };
  }

  schedule() {
    if (this.poller) {
      return;
    }

    void this.runTick();
    this.poller = setInterval(() => {
      void this.runTick();
    }, this.options.intervalMs ?? 250);
  }

  stop() {
    if (!this.poller) {
      for (const timer of this.pendingVisitRewards.values()) {
        clearTimeout(timer);
      }
      this.pendingVisitRewards.clear();
      return;
    }

    clearInterval(this.poller);
    this.poller = null;
    for (const timer of this.pendingVisitRewards.values()) {
      clearTimeout(timer);
    }
    this.pendingVisitRewards.clear();
  }

  private async runTick() {
    if (this.processing) {
      return;
    }

    this.processing = true;

    try {
    const events = await this.options.queue.drain(100);
    if (events.length === 0) {
      return;
    }

    for (const event of events) {
      try {
        await this.processEvent(event);
      } catch (error) {
        this.options.logger.error("Tracking event processor failed", {
          eventId: event.id,
          streamerId: event.streamerId,
          streamSessionId: event.streamSessionId,
          eventType: event.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    } finally {
      this.processing = false;
    }
  }

  private async processEvent(event: TrackingQueueEvent) {
    switch (event.type) {
      case "snapshot_updated":
        await this.processSnapshotEvent(event);
        return;
      case "viewer_joined":
      case "chat_message":
      case "like_received":
      case "gift_received":
        await this.processLiveEngagementEvent(event);
        return;
      default:
        this.options.logger.warn("Tracking event processor skipped unknown event type", {
          eventId: event.id,
          eventType: event.type,
        });
    }
  }

  private async processSnapshotEvent(event: TrackingQueueEvent) {
    if (!event.streamSessionId) {
      return;
    }

    const viewerCount = parseNumber(event.payload.viewer_count);
    const totalLikeCount = parseNumber(event.payload.like_count);
    const session = await this.options.trackingRepository.getLatestSessionSummary(event.streamerId);
    const likeDelta = session && totalLikeCount !== null ? Math.max(0, totalLikeCount - session.like_count) : 0;

    await this.options.trackingRepository.updateSessionEngagement(event.streamSessionId, {
      likeDelta,
      currentViewerCount: viewerCount ?? undefined,
      rawSnapshot: event.rawPayload,
    });

    await this.options.trackingRepository.insertStreamEvent({
      streamerId: event.streamerId,
      streamSessionId: event.streamSessionId,
      eventType: "snapshot_updated",
      source: event.source,
      eventTimestamp: event.occurredAt,
      normalizedPayload: event.payload,
      rawPayload: event.rawPayload,
    });

    await this.options.realtimeStateStore?.applyEngagement(event.streamerId, {
      streamId: event.streamSessionId,
      source: event.source,
      eventType: event.type,
      occurredAt: event.occurredAt,
      viewerCount,
      likeDelta,
    });
  }

  private async processLiveEngagementEvent(event: TrackingQueueEvent) {
    const normalizedEvent = mapQueueEventToLiveEngagementEvent(event);
    const eligibleViewer = this.options.engagementRepository
      ? await this.options.engagementRepository.findEligibleViewer(normalizedEvent.streamerId, normalizedEvent.externalViewerUsername)
      : null;

    await this.options.trackingRepository.insertStreamEvent({
      streamerId: normalizedEvent.streamerId,
      streamSessionId: normalizedEvent.streamSessionId,
      eventType: normalizedEvent.type,
      source: normalizedEvent.source,
      eventTimestamp: normalizedEvent.occurredAt,
      viewerId: eligibleViewer?.userId ?? null,
      externalViewerId: normalizedEvent.externalViewerId ?? null,
      normalizedPayload: {
        external_viewer_username: normalizedEvent.externalViewerUsername,
        external_viewer_display_name: normalizedEvent.externalViewerDisplayName,
        external_viewer_avatar_url: normalizedEvent.externalViewerAvatarUrl,
        external_viewer_bio: normalizedEvent.externalViewerBio,
        external_viewer_sec_uid: normalizedEvent.externalViewerSecUid,
        comment_text: normalizedEvent.commentText,
        like_count: normalizedEvent.likeCount,
        total_like_count: parseNumber(normalizedEvent.rawPayload.total_like_count),
        gift_count: normalizedEvent.giftCount,
        gift_diamond_count: normalizedEvent.giftDiamondCount,
        viewer_level: normalizedEvent.viewerLevel,
      },
      rawPayload: normalizedEvent.rawPayload,
    });

    await this.updateRealtimeStateForEngagement(normalizedEvent);

    if (!eligibleViewer) {
      this.options.logger.info("Live event skipped for rewards because viewer is not eligible", {
        streamerId: normalizedEvent.streamerId,
        externalViewerUsername: normalizedEvent.externalViewerUsername,
        eventType: normalizedEvent.type,
      });
      return;
    }

    if (!this.options.engagementRepository) {
      return;
    }

    if (normalizedEvent.type === "viewer_joined") {
      this.scheduleStreamVisitReward(eligibleViewer.userId, normalizedEvent);
      return;
    }

    await this.applyGamification(eligibleViewer, normalizedEvent);
  }

  private scheduleStreamVisitReward(userId: string, event: LiveEngagementEvent) {
    const rewardKey = createVisitRewardKey(userId, event.streamerId, event.occurredAt);
    if (this.pendingVisitRewards.has(rewardKey)) {
      return;
    }

    const timer = setTimeout(() => {
      this.pendingVisitRewards.delete(rewardKey);
      void this.applyDelayedStreamVisitReward({
        userId,
        streamerId: event.streamerId,
        streamSessionId: event.streamSessionId,
        occurredAt: new Date().toISOString(),
        source: event.source,
        event,
      });
    }, 30_000);

    this.pendingVisitRewards.set(rewardKey, timer);
  }

  private async applyDelayedStreamVisitReward(input: ScheduledVisitReward) {
    if (!this.options.engagementRepository) {
      return;
    }

    const viewer = await this.options.engagementRepository.getViewerProfile(input.userId);
    if (!viewer) {
      return;
    }

    await this.applyGamification(viewer, {
      ...input.event,
      occurredAt: input.occurredAt,
    });
  }

  private async updateRealtimeStateForEngagement(event: LiveEngagementEvent) {
    const likeDelta = event.type === "like_received" ? event.likeCount ?? 0 : 0;
    const messageDelta = event.type === "chat_message" ? 1 : 0;
    const giftDelta = event.type === "gift_received" ? event.giftCount ?? 0 : 0;

    await this.options.trackingRepository.updateSessionEngagement(event.streamSessionId, {
      likeDelta,
      messageDelta,
      giftDelta,
      currentViewerCount: event.viewerCount ?? undefined,
      rawSnapshot: event.rawPayload,
    });

    await this.options.realtimeStateStore?.applyEngagement(event.streamerId, {
      streamId: event.streamSessionId,
      source: event.source,
      eventType: event.type,
      occurredAt: event.occurredAt,
      viewerCount: event.viewerCount,
      likeDelta,
      messageDelta,
      giftDelta,
    });
  }

  private async applyGamification(eligibleViewer: { userId: string; points: number; displayName: string | null; tiktokUsername: string | null }, event: LiveEngagementEvent) {
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

    const membership = await this.options.engagementRepository.getTeamMembership(event.streamerId, eligibleViewer.userId);
    const unlockedKeys = new Set(await this.options.engagementRepository.getAchievementKeys(event.streamerId, eligibleViewer.userId));
    const reward = await this.resolveRewardDecision(eligibleViewer.userId, event);

    if (!reward.shouldRecordAction) {
      return;
    }

    const nextProgress = applyProgressDelta(membership, event, reward.teamPoints);
    const newlyUnlockedAchievements = this.options.scoringService
      .getAchievementDefinitions()
      .filter((achievement) => !unlockedKeys.has(achievement.key) && achievement.isUnlocked(nextProgress));

    const achievementTeamPoints = newlyUnlockedAchievements.reduce((sum, achievement) => sum + achievement.teamPoints, 0);
    const nextTeamPoints = nextProgress.teamPoints + achievementTeamPoints;
    const nextTeamLevel = this.options.scoringService.getTeamLevel(nextTeamPoints);
    const nextFeatures = this.options.scoringService.getTeamFeatures(nextTeamLevel);
    const nextProfilePoints = eligibleViewer.points + reward.profilePoints;
    const nextProfileLevel = this.options.scoringService.getViewerLevel(nextProfilePoints);

    await this.options.engagementRepository.insertViewerStreamAction({
      userId: eligibleViewer.userId,
      streamerId: event.streamerId,
      streamSessionId: event.streamSessionId,
      actionType: mapEventToViewerAction(event.type),
      pointsAwarded: reward.profilePoints,
      watchSeconds: reward.watchSeconds,
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
      reason: reward.ledgerReason ?? buildLedgerReason(event.type),
      metadata: {
        streamer_id: event.streamerId,
        stream_session_id: event.streamSessionId,
        team_points: reward.teamPoints,
      },
    });

    for (const achievement of newlyUnlockedAchievements) {
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

  private async resolveRewardDecision(userId: string, event: LiveEngagementEvent): Promise<RewardDecision> {
    if (!this.options.engagementRepository) {
      return { profilePoints: 0, teamPoints: 0, shouldRecordAction: false };
    }

    const dayStart = startOfUtcDay(event.occurredAt);
    const dayActions = await this.options.engagementRepository.listViewerStreamActions({
      userId,
      occurredAfter: dayStart,
      actionTypes: ["stream_visit", "chat_message", "gift", "like"],
      limit: 500,
    });

    switch (event.type) {
      case "viewer_joined": {
        const streamVisitsToday = dayActions.filter((action) => action.actionType === "stream_visit");
        if (streamVisitsToday.some((action) => action.streamerId === event.streamerId)) {
          return { profilePoints: 0, teamPoints: 0, shouldRecordAction: false };
        }

        const pointsSoFar = streamVisitsToday.reduce((sum, action) => sum + action.pointsAwarded, 0);
        if (pointsSoFar >= 55) {
          return { profilePoints: 0, teamPoints: 0, shouldRecordAction: false };
        }

        const basePoints = streamVisitsToday.length === 0 ? 15 : 5;
        return {
          profilePoints: Math.max(0, Math.min(basePoints, 55 - pointsSoFar)),
          teamPoints: 1,
          shouldRecordAction: true,
          ledgerReason: streamVisitsToday.length === 0 ? "Первое посещение эфира за день" : "Посещение нового эфира за день",
        };
      }
      case "chat_message": {
        const normalizedComment = normalizeCommentText(event.commentText);
        if (!normalizedComment) {
          return { profilePoints: 0, teamPoints: 0, shouldRecordAction: false };
        }

        const commentActionsToday = dayActions.filter((action) => action.actionType === "chat_message");
        const lastComment = commentActionsToday[0] ?? null;
        if (lastComment && toTimestamp(lastComment.occurredAt) >= toTimestamp(event.occurredAt) - 5_000) {
          return { profilePoints: 0, teamPoints: 0, shouldRecordAction: false };
        }

        if (commentActionsToday.some((action) => normalizeCommentText(readMetadataText(action.metadata, "comment_text")) === normalizedComment)) {
          return { profilePoints: 0, teamPoints: 0, shouldRecordAction: false };
        }

        const streamerCommentsToday = commentActionsToday.filter((action) => action.streamerId === event.streamerId);
        const firstCommentBonus = commentActionsToday.length === 0 ? 25 : 0;
        const tenCommentBonus = streamerCommentsToday.length === 9 ? 50 : 0;

        return {
          profilePoints: 2 + firstCommentBonus + tenCommentBonus,
          teamPoints: 1,
          shouldRecordAction: true,
          ledgerReason: tenCommentBonus > 0 ? "Комментарий и бонус за 10 сообщений у стримера" : firstCommentBonus > 0 ? "Первый комментарий за день" : "Комментарий в эфире",
        };
      }
      case "gift_received": {
        const diamonds = Math.max(0, event.giftDiamondCount ?? 0);
        return {
          profilePoints: diamonds,
          teamPoints: 5 + Math.floor(diamonds / 10),
          shouldRecordAction: diamonds > 0,
          ledgerReason: "Подарок в эфире",
        };
      }
      case "like_received": {
        return {
          profilePoints: 0,
          teamPoints: 0,
          shouldRecordAction: true,
          ledgerReason: "Лайк в эфире",
        };
      }
    }
  }
}

function mapQueueEventToLiveEngagementEvent(event: TrackingQueueEvent): LiveEngagementEvent {
  return {
    type: event.type as LiveEngagementEvent["type"],
    streamerId: event.streamerId,
    streamSessionId: event.streamSessionId ?? "",
    occurredAt: event.occurredAt,
    source: event.source,
    externalViewerId: event.externalViewerId ?? null,
    externalViewerUsername: readString(event.payload.external_viewer_username),
    externalViewerDisplayName: readString(event.payload.external_viewer_display_name),
    externalViewerAvatarUrl: readString(event.payload.external_viewer_avatar_url),
    externalViewerBio: readString(event.payload.external_viewer_bio),
    externalViewerSecUid: readString(event.payload.external_viewer_sec_uid),
    commentText: readString(event.payload.comment_text),
    likeCount: parseNumber(event.payload.like_count) ?? undefined,
    giftCount: parseNumber(event.payload.gift_count) ?? undefined,
    giftDiamondCount: parseNumber(event.payload.gift_diamond_count) ?? undefined,
    viewerLevel: parseNumber(event.payload.viewer_level),
    viewerCount: parseNumber(event.payload.viewer_count),
    rawPayload: event.rawPayload,
  };
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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

type TeamProgress = {
  commentCount: number;
  likeCount: number;
  giftCount: number;
  totalGiftDiamonds: number;
  watchSeconds: number;
  teamPoints: number;
  achievementCount: number;
};

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

export function createTrackingQueueEvent(input: Omit<TrackingQueueEvent, "id">): TrackingQueueEvent {
  return {
    id: randomUUID(),
    ...input,
  };
}

function startOfUtcDay(value: string) {
  return `${value.slice(0, 10)}T00:00:00.000Z`;
}

function createVisitRewardKey(userId: string, streamerId: string, occurredAt: string) {
  return `${userId}:${streamerId}:${occurredAt.slice(0, 10)}`;
}

function normalizeCommentText(value?: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function readMetadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function toTimestamp(value: string) {
  return new Date(value).getTime();
}