import type { EligibleViewer, TeamMembershipSnapshot } from "../repositories/viewer-engagement-repository.js";
import type { StreamEventRecord, StreamSessionRow, StreamerLiveState, TrackedStreamer, TrackingSnapshot } from "../repositories/tracking-repository.js";

export interface TrackingStore {
  getStreamerLiveState(streamerId: string): Promise<StreamerLiveState | null>;
  getTrackedStreamers(): Promise<TrackedStreamer[]>;
  updateTrackingSnapshot(snapshot: TrackingSnapshot): Promise<void>;
  getLatestLiveSession(streamerId: string): Promise<StreamSessionRow | null>;
  getLatestSessionSummary(streamerId: string): Promise<StreamSessionRow | null>;
  listRecentStreamEvents(streamerId: string, limit?: number): Promise<StreamEventRecord[]>;
  startLiveSession(snapshot: TrackingSnapshot): Promise<StreamSessionRow>;
  updateLiveSession(sessionId: string, snapshot: TrackingSnapshot, previousPeak: number): Promise<void>;
  endLiveSession(sessionId: string, snapshot: TrackingSnapshot, previousPeak: number): Promise<void>;
  insertStreamEvent(input: {
    streamerId: string;
    streamSessionId: string | null;
    eventType: string;
    source: string;
    eventTimestamp: string;
    normalizedPayload: Record<string, unknown>;
    rawPayload?: Record<string, unknown>;
    viewerId?: string | null;
    externalViewerId?: string | null;
  }): Promise<void>;
  updateSessionEngagement(sessionId: string, input: {
    likeDelta?: number;
    giftDelta?: number;
    messageDelta?: number;
    currentViewerCount?: number;
    rawSnapshot?: Record<string, unknown>;
  }): Promise<void>;
}

export interface ViewerEngagementStore {
  findEligibleViewer(streamerId: string, externalViewerUsername?: string | null): Promise<EligibleViewer | null>;
  getTeamMembership(streamerId: string, userId: string): Promise<TeamMembershipSnapshot | null>;
  getAchievementKeys(streamerId: string, userId: string): Promise<string[]>;
  insertViewerStreamAction(input: {
    userId: string;
    streamerId: string;
    streamSessionId: string;
    actionType: "stream_visit" | "watch_time" | "code_submission" | "boost_participation" | "like" | "gift" | "chat_message" | "referral_join";
    pointsAwarded: number;
    watchSeconds?: number;
    metadata: Record<string, unknown>;
    occurredAt: string;
  }): Promise<void>;
  insertViewerLedgerEntry(input: {
    userId: string;
    sourceType: string;
    sourceId?: string;
    delta: number;
    balanceAfter: number;
    reason: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  updateViewerProfile(input: { userId: string; points: number; level: number; activityScoreDelta: number; lastActivityAt: string }): Promise<void>;
  upsertTeamMembership(input: {
    streamerId: string;
    userId: string;
    teamPoints: number;
    teamLevel: number;
    availableFeatures: string[];
    commentCount: number;
    likeCount: number;
    giftCount: number;
    totalGiftDiamonds: number;
    watchSeconds: number;
    achievementCount: number;
    lastEventAt: string;
  }): Promise<void>;
  insertAchievementUnlock(input: {
    userId: string;
    streamerId: string;
    streamSessionId: string;
    achievementKey: string;
    title: string;
    description: string;
    rewardPoints: number;
    rewardTeamPoints: number;
    metadata: Record<string, unknown>;
    unlockedAt: string;
  }): Promise<void>;
}