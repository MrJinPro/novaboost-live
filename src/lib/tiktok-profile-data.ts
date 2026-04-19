export type TikTokProfileData = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  secUid: string | null;
  source: "universal-data" | "next-data" | "meta-tags";
};

function getBackendBaseUrl() {
  return import.meta.env.VITE_BACKEND_URL || process.env.VITE_BACKEND_URL || "http://127.0.0.1:4310";
}

export function normalizeTikTokUsername(value: string) {
  return value.trim().replace(/^https?:\/\/www\.tiktok\.com\//i, "").replace(/^@+/, "").replace(/\/live$/i, "").trim().toLowerCase();
}

export async function lookupTikTokProfile(username: string): Promise<TikTokProfileData> {
  const normalizedUsername = normalizeTikTokUsername(username);
  if (!normalizedUsername) {
    throw new Error("Укажи TikTok username.");
  }

  const response = await fetch(`${getBackendBaseUrl()}/tiktok/profile?username=${encodeURIComponent(normalizedUsername)}`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Не удалось получить профиль TikTok.");
  }

  if (!data || typeof data !== "object" || !data.profile || typeof data.profile.username !== "string") {
    throw new Error("Backend вернул некорректный TikTok profile payload.");
  }

  return data.profile as TikTokProfileData;
}
