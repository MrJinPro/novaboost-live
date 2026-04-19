import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppUser } from "@/lib/mock-platform";
import { getAuthProfileCompat, upsertAuthProfileCompat } from "@/lib/profile-schema-compat";
import { ensureLinkedStreamer, normalizeTikTokUsername } from "@/lib/streamer-profile-linking";

export type ProfileSettingsDraft = {
  displayName: string;
  username: string;
  tiktokUsername: string;
  bio: string;
  avatarUrl: string;
  telegramUsername: string;
  streamerTagline: string;
  streamerTelegramChannel: string;
  streamerBannerUrl: string;
  publicPageId: string | null;
};

type ProfileRow = {
  avatar_url: string | null;
  bio: string | null;
  telegram_username: string | null;
};

type StreamerRow = {
  id: string;
  display_name: string;
  tiktok_username: string;
  avatar_url: string | null;
  bio: string | null;
  banner_url: string | null;
  logo_url: string | null;
  tagline: string | null;
  telegram_channel: string | null;
};

type UploadMediaKind = "viewer-avatar" | "streamer-avatar" | "streamer-banner";

function getBackendBaseUrl() {
  return import.meta.env.VITE_BACKEND_URL || process.env.VITE_BACKEND_URL || "http://127.0.0.1:4310";
}

export async function loadProfileSettings(user: AppUser): Promise<ProfileSettingsDraft> {
  const [profileCompat, profileResult, streamerResult] = await Promise.all([
    getAuthProfileCompat(user.id),
    supabase
      .from("profiles")
      .select("avatar_url, bio, telegram_username")
      .eq("id", user.id)
      .maybeSingle(),
    user.role === "streamer"
      ? supabase
          .from("streamers")
          .select("id, display_name, tiktok_username, avatar_url, bio, banner_url, logo_url, tagline, telegram_channel")
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (profileResult.error) {
    throw profileResult.error;
  }

  if (streamerResult.error) {
    throw streamerResult.error;
  }

  const profile = (profileResult.data ?? null) as ProfileRow | null;
  const streamer = (streamerResult.data ?? null) as StreamerRow | null;

  return {
    displayName: streamer?.display_name ?? profileCompat?.display_name ?? user.displayName,
    username: profileCompat?.username ?? user.username,
    tiktokUsername: streamer?.tiktok_username ?? profileCompat?.tiktok_username ?? user.tiktokUsername,
    bio: streamer?.bio ?? profile?.bio ?? "",
    avatarUrl: streamer?.logo_url ?? streamer?.avatar_url ?? profile?.avatar_url ?? "",
    telegramUsername: profile?.telegram_username ?? "",
    streamerTagline: streamer?.tagline ?? "",
    streamerTelegramChannel: streamer?.telegram_channel ?? "",
    streamerBannerUrl: streamer?.banner_url ?? "",
    publicPageId: streamer?.id ?? null,
  };
}

export async function uploadProfileMedia(session: Session, kind: UploadMediaKind, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${getBackendBaseUrl()}/media/upload?kind=${encodeURIComponent(kind)}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Не удалось загрузить файл.");
  }

  if (!data || typeof data.url !== "string") {
    throw new Error("Backend не вернул URL загруженного файла.");
  }

  return data as { kind: UploadMediaKind; relativePath: string; url: string; bytes: number };
}

export async function saveProfileSettings(user: AppUser, draft: ProfileSettingsDraft) {
  const displayName = draft.displayName.trim();
  const username = draft.username.trim();
  const tiktokUsername = normalizeTikTokUsername(draft.tiktokUsername);

  if (!displayName) {
    throw new Error("Укажи отображаемое имя.");
  }

  if (!username) {
    throw new Error("Укажи username аккаунта.");
  }

  await upsertAuthProfileCompat({
    id: user.id,
    username,
    display_name: displayName,
    tiktok_username: tiktokUsername,
  });

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      username,
      tiktok_username: tiktokUsername || null,
      bio: draft.bio.trim() || null,
      avatar_url: draft.avatarUrl.trim() || null,
      telegram_username: draft.telegramUsername.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (profileError) {
    throw profileError;
  }

  if (user.role !== "streamer") {
    return { publicPageId: null };
  }

  const streamer = await ensureLinkedStreamer({
    userId: user.id,
    tiktokUsername,
    displayName,
  });

  const { error: streamerError } = await supabase
    .from("streamers")
    .update({
      display_name: displayName,
      tiktok_username: tiktokUsername,
      bio: draft.bio.trim() || null,
      avatar_url: draft.avatarUrl.trim() || null,
      logo_url: draft.avatarUrl.trim() || null,
      banner_url: draft.streamerBannerUrl.trim() || null,
      tagline: draft.streamerTagline.trim() || null,
      telegram_channel: draft.streamerTelegramChannel.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", streamer.id);

  if (streamerError) {
    throw streamerError;
  }

  const { error: settingsError } = await supabase
    .from("streamer_page_settings")
    .upsert({
      streamer_id: streamer.id,
      banner_url: draft.streamerBannerUrl.trim() || null,
      logo_url: draft.avatarUrl.trim() || null,
      headline: draft.streamerTagline.trim() || null,
      description: draft.bio.trim() || null,
    }, { onConflict: "streamer_id" });

  if (settingsError) {
    throw settingsError;
  }

  return { publicPageId: streamer.id };
}