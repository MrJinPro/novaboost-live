import type { TrackingSnapshot, TrackedStreamer } from "../../repositories/tracking-repository.js";

export interface TrackingAdapter {
  readonly sourceName: string;
  fetchSnapshot(streamer: TrackedStreamer): Promise<TrackingSnapshot>;
}

export class PassiveTrackingAdapter implements TrackingAdapter {
  readonly sourceName = "passive-db-snapshot";

  async fetchSnapshot(streamer: TrackedStreamer): Promise<TrackingSnapshot> {
    return {
      streamerId: streamer.id,
      displayName: streamer.display_name,
      tiktokUsername: streamer.tiktok_username,
      isLive: streamer.is_live,
      viewerCount: streamer.viewer_count,
      followersCount: streamer.followers_count,
      checkedAt: new Date().toISOString(),
      source: this.sourceName,
    };
  }
}