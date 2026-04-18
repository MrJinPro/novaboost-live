import type { SupabaseClient } from "@supabase/supabase-js";
import type { ViewerEngagementStore } from "../storage/live-storage.js";

type ViewerProfileRow = {
  id: string;
  points: number;
  level: number;
  display_name: string | null;
  tiktok_username: string | null;
};

type StreamerSubscriptionRow = {
  id: string;
  user_id: string;
};

export type EligibleViewer = {
  userId: string;
  displayName: string | null;
  tiktokUsername: string | null;
  points: number;
  level: number;
};

export type TeamMembershipSnapshot = {
  id: string;
  team_points: number;
  team_level: number;
  available_features: unknown;
  comment_count: number;
  like_count: number;
  gift_count: number;
  total_gift_diamonds: number;
  watch_seconds: number;
  achievement_count: number;
};

export type AchievementUnlockRow = {
  achievement_key: string;
};

export class ViewerEngagementRepository implements ViewerEngagementStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async findEligibleViewer(streamerId: string, externalViewerUsername?: string | null) {
    const usernameVariants = normalizeUsernameVariants(externalViewerUsername);
    if (!usernameVariants.length) {
      return null;
    }

    const { data: profiles, error: profilesError } = await this.supabase
      .from("profiles")
      .select("id, points, level, display_name, tiktok_username")
      .in("tiktok_username", usernameVariants)
      .limit(5);

    if (profilesError) {
      throw profilesError;
    }

    const candidateProfiles = (profiles ?? []) as ViewerProfileRow[];
    const normalizedMap = new Map(candidateProfiles.map((profile) => [normalizeLooseUsername(profile.tiktok_username), profile]));
    const matchedProfile = usernameVariants.map((value) => normalizedMap.get(normalizeLooseUsername(value))).find(Boolean) ?? candidateProfiles[0];

    if (!matchedProfile) {
      return null;
    }

    const { data: subscription, error: subscriptionError } = await this.supabase
      .from("streamer_subscriptions")
      .select("id, user_id")
      .eq("streamer_id", streamerId)
      .eq("user_id", matchedProfile.id)
      .maybeSingle();

    if (subscriptionError) {
      throw subscriptionError;
    }

    if (!(subscription as StreamerSubscriptionRow | null)) {
      return null;
    }

    return {
      userId: matchedProfile.id,
      displayName: matchedProfile.display_name,
      tiktokUsername: matchedProfile.tiktok_username,
      points: matchedProfile.points,
      level: matchedProfile.level,
    } satisfies EligibleViewer;
  }

  async getTeamMembership(streamerId: string, userId: string) {
    const { data, error } = await this.supabase
      .from("streamer_team_memberships")
      .select("id, team_points, team_level, available_features, comment_count, like_count, gift_count, total_gift_diamonds, watch_seconds, achievement_count")
      .eq("streamer_id", streamerId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data ?? null) as TeamMembershipSnapshot | null;
  }

  async getAchievementKeys(streamerId: string, userId: string) {
    const { data, error } = await this.supabase
      .from("viewer_achievement_unlocks")
      .select("achievement_key")
      .eq("streamer_id", streamerId)
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    return ((data ?? []) as AchievementUnlockRow[]).map((row) => row.achievement_key);
  }

  async insertViewerStreamAction(input: {
    userId: string;
    streamerId: string;
    streamSessionId: string;
    actionType: "stream_visit" | "watch_time" | "code_submission" | "boost_participation" | "like" | "gift" | "chat_message" | "referral_join";
    pointsAwarded: number;
    watchSeconds?: number;
    metadata: Record<string, unknown>;
    occurredAt: string;
  }) {
    const { error } = await this.supabase.from("viewer_stream_actions").insert({
      user_id: input.userId,
      streamer_id: input.streamerId,
      stream_session_id: input.streamSessionId,
      action_type: input.actionType,
      points_awarded: input.pointsAwarded,
      watch_seconds: input.watchSeconds ?? 0,
      metadata: input.metadata,
      occurred_at: input.occurredAt,
    });

    if (error) {
      throw error;
    }
  }

  async insertViewerLedgerEntry(input: {
    userId: string;
    sourceType: string;
    sourceId?: string;
    delta: number;
    balanceAfter: number;
    reason: string;
    metadata: Record<string, unknown>;
  }) {
    const { error } = await this.supabase.from("viewer_points_ledger").insert({
      user_id: input.userId,
      source_type: input.sourceType,
      source_id: input.sourceId,
      delta: input.delta,
      balance_after: input.balanceAfter,
      reason: input.reason,
      metadata: input.metadata,
    });

    if (error) {
      throw error;
    }
  }

  async updateViewerProfile(input: { userId: string; points: number; level: number; activityScoreDelta: number; lastActivityAt: string }) {
    const { error } = await this.supabase
      .from("profiles")
      .update({
        points: input.points,
        level: input.level,
        activity_score: input.activityScoreDelta,
        last_activity_at: input.lastActivityAt,
      })
      .eq("id", input.userId);

    if (error) {
      throw error;
    }
  }

  async upsertTeamMembership(input: {
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
  }) {
    const { error } = await this.supabase.from("streamer_team_memberships").upsert({
      streamer_id: input.streamerId,
      user_id: input.userId,
      team_points: input.teamPoints,
      team_level: input.teamLevel,
      available_features: input.availableFeatures,
      comment_count: input.commentCount,
      like_count: input.likeCount,
      gift_count: input.giftCount,
      total_gift_diamonds: input.totalGiftDiamonds,
      watch_seconds: input.watchSeconds,
      achievement_count: input.achievementCount,
      last_event_at: input.lastEventAt,
    }, { onConflict: "streamer_id,user_id" });

    if (error) {
      throw error;
    }
  }

  async insertAchievementUnlock(input: {
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
  }) {
    const { error } = await this.supabase.from("viewer_achievement_unlocks").insert({
      user_id: input.userId,
      streamer_id: input.streamerId,
      stream_session_id: input.streamSessionId,
      achievement_key: input.achievementKey,
      title: input.title,
      description: input.description,
      reward_points: input.rewardPoints,
      reward_team_points: input.rewardTeamPoints,
      metadata: input.metadata,
      unlocked_at: input.unlockedAt,
    });

    if (error) {
      throw error;
    }
  }
}

function normalizeLooseUsername(input?: string | null) {
  return (input ?? "").trim().toLowerCase().replace(/^@+/, "");
}

function normalizeUsernameVariants(input?: string | null) {
  const base = normalizeLooseUsername(input);
  if (!base) {
    return [];
  }

  return Array.from(new Set([base, `@${base}`]));
}