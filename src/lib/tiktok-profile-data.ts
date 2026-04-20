import { getBackendBaseUrl } from "@/lib/backend-base-url";

export type TikTokProfileData = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  followersCount: number | null;
  secUid: string | null;
  source: "universal-data" | "next-data" | "meta-tags";
};

type TikTokProfileCacheEntry = {
  expiresAt: number;
  profile?: TikTokProfileData;
  error?: Error;
};

const TIKTOK_PROFILE_SUCCESS_TTL_MS = 5 * 60_000;
const TIKTOK_PROFILE_FAILURE_TTL_MS = 60_000;
const tiktokProfileCache = new Map<string, TikTokProfileCacheEntry>();

export function normalizeTikTokUsername(value: string) {
  return value.trim().replace(/^https?:\/\/www\.tiktok\.com\//i, "").replace(/^@+/, "").replace(/\/live$/i, "").trim().toLowerCase();
}

export async function lookupTikTokProfile(username: string): Promise<TikTokProfileData> {
  const normalizedUsername = normalizeTikTokUsername(username);
  if (!normalizedUsername) {
    throw new Error("Укажи TikTok username.");
  }

  const cached = tiktokProfileCache.get(normalizedUsername);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.profile) {
      return cached.profile;
    }

    if (cached.error) {
      throw cached.error;
    }
  }

  const response = await fetch(`${getBackendBaseUrl()}/tiktok/profile?username=${encodeURIComponent(normalizedUsername)}`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(typeof data.error === "string" ? data.error : "Не удалось получить профиль TikTok.");
    tiktokProfileCache.set(normalizedUsername, {
      error,
      expiresAt: Date.now() + TIKTOK_PROFILE_FAILURE_TTL_MS,
    });
    throw error;
  }

  if (!data || typeof data !== "object" || !data.profile || typeof data.profile.username !== "string") {
    const error = new Error("Backend вернул некорректный TikTok profile payload.");
    tiktokProfileCache.set(normalizedUsername, {
      error,
      expiresAt: Date.now() + TIKTOK_PROFILE_FAILURE_TTL_MS,
    });
    throw error;
  }

  const profile = data.profile as TikTokProfileData;
  tiktokProfileCache.set(normalizedUsername, {
    profile,
    expiresAt: Date.now() + TIKTOK_PROFILE_SUCCESS_TTL_MS,
  });

  return profile;
}
