import { TikTokLiveConnection } from "tiktok-live-connector";

import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import type { TrackingSnapshot, TrackedStreamer } from "../../repositories/tracking-repository.js";

export interface TrackingAdapter {
  readonly sourceName: string;
  fetchSnapshot(streamer: TrackedStreamer): Promise<TrackingSnapshot>;
}

function buildPassiveSnapshot(
  streamer: TrackedStreamer,
  checkedAt: string,
  source: string,
  rawSnapshot?: Record<string, unknown>,
): TrackingSnapshot {
  return {
    streamerId: streamer.id,
    displayName: streamer.display_name,
    tiktokUsername: streamer.tiktok_username,
    isLive: streamer.is_live,
    viewerCount: streamer.viewer_count,
    followersCount: streamer.followers_count,
    checkedAt,
    source,
    rawSnapshot:
      rawSnapshot ?? {
        display_name: streamer.display_name,
        tiktok_username: streamer.tiktok_username,
        is_live: streamer.is_live,
        viewer_count: streamer.viewer_count,
        followers_count: streamer.followers_count,
      },
  };
}

function normalizeTikTokUsername(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("tiktok.com/")) {
    const withoutQuery = trimmed.split("?")[0] ?? trimmed;
    const segments = withoutQuery.split("/").filter(Boolean);
    const lastSegment = segments.at(-1)?.replace(/^@+/, "") ?? "";
    return lastSegment ? `@${lastSegment}` : null;
  }

  const username = trimmed.replace(/^@+/, "");
  return username ? `@${username}` : null;
}

function pickNumber(value: unknown): number | null {
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
    const value = pickNumber(getValueAtPath(source, path));
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function summarizeRoomInfo(roomInfo: unknown) {
  return {
    room_id: getValueAtPath(roomInfo, ["id"]),
    data: getValueAtPath(roomInfo, ["data"]),
    live_room: getValueAtPath(roomInfo, ["data", "liveRoom"]),
    live_room_user_info: getValueAtPath(roomInfo, ["liveRoomUserInfo"]),
    status: getValueAtPath(roomInfo, ["status"]),
    create_time: getValueAtPath(roomInfo, ["create_time"]),
    title: getValueAtPath(roomInfo, ["title"]),
    owner: getValueAtPath(roomInfo, ["owner"]),
    stats: getValueAtPath(roomInfo, ["stats"]),
    user_count: extractNumber(roomInfo, [
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
    like_count: extractNumber(roomInfo, [
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
    follower_count: extractNumber(roomInfo, [
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
    stream_url: getValueAtPath(roomInfo, ["stream_url"]),
  } satisfies Record<string, unknown>;
}

export class PassiveTrackingAdapter implements TrackingAdapter {
  readonly sourceName = "passive-db-snapshot";

  async fetchSnapshot(streamer: TrackedStreamer): Promise<TrackingSnapshot> {
    return buildPassiveSnapshot(streamer, new Date().toISOString(), this.sourceName);
  }
}

type TikTokTrackingAdapterOptions = {
  logger: Logger;
  requestTimeoutMs: number;
  signApiKey?: string;
  sessionId?: string;
  ttTargetIdc?: string;
};

export class TikTokLiveTrackingAdapter implements TrackingAdapter {
  readonly sourceName = "tiktok-live-connector";

  constructor(private readonly options: TikTokTrackingAdapterOptions) {}

  async fetchSnapshot(streamer: TrackedStreamer): Promise<TrackingSnapshot> {
    const checkedAt = new Date().toISOString();
    const username = normalizeTikTokUsername(streamer.tiktok_username);

    if (!username) {
      this.options.logger.warn("TikTok tracking fallback: streamer username is empty", {
        streamerId: streamer.id,
      });

      return buildPassiveSnapshot(streamer, checkedAt, "passive-db-snapshot-fallback", {
        fallback_reason: "missing_tiktok_username",
        display_name: streamer.display_name,
        tiktok_username: streamer.tiktok_username,
      });
    }

    try {
      const connectionOptions = {
        fetchRoomInfoOnConnect: false,
        enableRequestPolling: true,
        requestPollingIntervalMs: 1_000,
        signApiKey: this.options.signApiKey ?? null,
        webClientOptions: {
          timeout: this.options.requestTimeoutMs,
        },
      };
      const connection = new TikTokLiveConnection(username, connectionOptions);

      const isLive = await connection.fetchIsLive();
      if (!isLive) {
        return buildPassiveSnapshot(streamer, checkedAt, this.sourceName, {
          tiktok_username: username,
          is_live: false,
        });
      }

      const roomInfo = await connection.fetchRoomInfo();
      const viewerCount = extractNumber(roomInfo, [
        ["user_count"],
        ["stats", "user_count"],
        ["stats", "viewer_count"],
        ["owner", "room_stats", "user_count"],
        ["data", "liveRoom", "user_count"],
        ["data", "liveRoom", "stats", "user_count"],
        ["data", "liveRoom", "stats", "viewer_count"],
        ["data", "liveRoom", "stats", "userCount"],
        ["liveRoomUserInfo", "liveRoom", "user_count"],
        ["liveRoomUserInfo", "liveRoom", "stats", "user_count"],
        ["liveRoomUserInfo", "liveRoom", "stats", "viewer_count"],
        ["liveRoomUserInfo", "liveRoom", "stats", "userCount"],
      ]);
      const likeCount = extractNumber(roomInfo, [
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
      ]);
      const followersCount = extractNumber(roomInfo, [
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
      ]);

      return {
        streamerId: streamer.id,
        displayName: streamer.display_name,
        tiktokUsername: streamer.tiktok_username,
        isLive: true,
        viewerCount: viewerCount ?? streamer.viewer_count,
        likeCount: likeCount ?? 0,
        followersCount: followersCount ?? streamer.followers_count,
        checkedAt,
        source: this.sourceName,
        rawSnapshot: summarizeRoomInfo(roomInfo),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.logger.warn("TikTok tracking fallback: request failed", {
        streamerId: streamer.id,
        tiktokUsername: username,
        error: message,
      });

      return buildPassiveSnapshot(streamer, checkedAt, "passive-db-snapshot-fallback", {
        fallback_reason: "tiktok_request_failed",
        error: message,
        display_name: streamer.display_name,
        tiktok_username: streamer.tiktok_username,
        is_live: streamer.is_live,
        viewer_count: streamer.viewer_count,
        followers_count: streamer.followers_count,
      });
    }
  }
}

export function createTrackingAdapter(logger: Logger, env: BackendEnv): TrackingAdapter {
  if (env.TRACKING_ADAPTER === "passive") {
    return new PassiveTrackingAdapter();
  }

  return new TikTokLiveTrackingAdapter({
    logger,
    requestTimeoutMs: env.TIKTOK_REQUEST_TIMEOUT_MS,
    signApiKey: env.TIKTOK_SIGN_API_KEY,
    sessionId: env.TIKTOK_SESSION_ID,
    ttTargetIdc: env.TIKTOK_TT_TARGET_IDC,
  });
}