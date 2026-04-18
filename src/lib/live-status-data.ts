type LiveStatusResponse = {
  statuses: Array<{
    tiktokUsername: string;
    isLive: boolean;
    viewerCount: number;
    followersCount: number;
    checkedAt: string;
    source: string;
  }>;
  error?: string;
};

type StreamTrackingResponse = {
  details: {
    state: {
      id: string;
      tiktok_username: string;
      is_live: boolean;
      viewer_count: number;
    } | null;
    latestSession: {
      id: string;
      streamer_id: string;
      source: string;
      status: "live" | "ended" | "failed";
      started_at: string;
      ended_at: string | null;
      peak_viewer_count: number;
      current_viewer_count: number;
      like_count: number;
      gift_count: number;
      message_count: number;
      raw_snapshot: Record<string, unknown>;
    } | null;
    recentEvents: Array<{
      id: string;
      event_type: string;
      event_timestamp: string;
      normalized_payload: Record<string, unknown>;
    }>;
  } | null;
  error?: string;
};

export type ResolvedLiveStatus = LiveStatusResponse["statuses"][number];

function getBackendBaseUrl() {
  return import.meta.env.VITE_BACKEND_URL || process.env.VITE_BACKEND_URL || "http://127.0.0.1:4310";
}

function normalizeTikTokUsername(username: string) {
  return username.trim().replace(/^@+/, "").toLowerCase();
}

export async function resolveLiveStatuses(usernames: string[]) {
  const uniqueUsernames = [...new Set(usernames.map(normalizeTikTokUsername).filter(Boolean))];
  if (uniqueUsernames.length === 0) {
    return new Map<string, ResolvedLiveStatus>();
  }

  const query = uniqueUsernames.map((username) => `username=${encodeURIComponent(username)}`).join("&");
  const response = await fetch(`${getBackendBaseUrl()}/tracking/live?${query}`);
  const data = await response.json() as LiveStatusResponse;

  if (!response.ok || data.error) {
    throw new Error(data.error || `Backend request failed with status ${response.status}`);
  }

  return new Map(
    (data.statuses ?? []).map((status) => [normalizeTikTokUsername(status.tiktokUsername), status]),
  );
}

export async function resolveLiveStatus(username: string) {
  const statuses = await resolveLiveStatuses([username]);
  return statuses.get(normalizeTikTokUsername(username)) ?? null;
}

export async function loadStreamerTrackingDetails(streamerId: string) {
  const response = await fetch(`${getBackendBaseUrl()}/tracking/stream/${encodeURIComponent(streamerId)}`);
  const data = await response.json() as StreamTrackingResponse;

  if (!response.ok || data.error) {
    throw new Error(data.error || `Backend request failed with status ${response.status}`);
  }

  return data.details;
}