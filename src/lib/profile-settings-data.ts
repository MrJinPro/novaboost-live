import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppUser } from "@/lib/mock-platform";
import { getBackendBaseUrl } from "@/lib/backend-base-url";
import { getAuthProfileCompat, upsertAuthProfileCompat } from "@/lib/profile-schema-compat";
import { ensureLinkedStreamer, normalizeTikTokUsername } from "@/lib/streamer-profile-linking";
import { buildStreamerPageLayout, DEFAULT_STREAMER_MEMBERSHIP_SETTINGS, EMPTY_STREAMER_SOCIAL_LINKS, normalizeSocialLinks, parseStreamerMembershipSettings, parseStreamerSocialLinks } from "@/lib/streamer-page-config";
import { lookupTikTokProfile } from "@/lib/tiktok-profile-data";

export type ProfileSettingsDraft = {
  displayName: string;
  username: string;
  tiktokUsername: string;
  bio: string;
  avatarUrl: string;
  telegramUsername: string;
  streamerTagline: string;
  streamerTelegramChannel: string;
  streamerInstagram: string;
  streamerFacebook: string;
  streamerTwitter: string;
  streamerPaidMembershipEnabled: boolean;
  streamerHighlightedPlanKey: "supporter" | "superfan" | "legend";
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
  verification_status: "pending" | "verified" | "rejected";
  verification_method: string | null;
};

type PageSettingsRow = {
  layout: Record<string, unknown> | null;
};

type StreamerVerificationRow = {
  evidence_type: string | null;
  evidence_value: string | null;
  notes: string | null;
  status: "pending" | "verified" | "rejected";
  created_at: string;
};

export type StreamerApplicationState = {
  streamerId: string | null;
  tiktokUsername: string;
  status: "none" | "pending" | "verified" | "rejected";
  evidenceType: string;
  evidenceValue: string;
  notes: string;
  submittedAt: string | null;
};

type UploadMediaKind = "viewer-avatar" | "streamer-avatar" | "streamer-banner";

export async function loadProfileSettings(user: AppUser): Promise<ProfileSettingsDraft> {
  const [profileCompat, profileResult, streamerResult] = await Promise.all([
    getAuthProfileCompat(user.id),
    supabase
      .from("profiles")
      .select("avatar_url, bio, telegram_username")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("streamers")
      .select("id, display_name, tiktok_username, avatar_url, bio, banner_url, logo_url, tagline, telegram_channel, verification_status, verification_method")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (profileResult.error) {
    throw profileResult.error;
  }

  if (streamerResult.error) {
    throw streamerResult.error;
  }

  const profile = (profileResult.data ?? null) as ProfileRow | null;
  const streamer = (streamerResult.data ?? null) as StreamerRow | null;
  let pageSettings: PageSettingsRow | null = null;

  if (streamer?.id) {
    const { data: pageSettingsData, error: pageSettingsError } = await supabase
      .from("streamer_page_settings")
      .select("layout")
      .eq("streamer_id", streamer.id)
      .maybeSingle();

    if (pageSettingsError && pageSettingsError.code !== "PGRST116") {
      throw pageSettingsError;
    }

    pageSettings = (pageSettingsData ?? null) as PageSettingsRow | null;
  }

  const socialLinks = parseStreamerSocialLinks(pageSettings?.layout ?? null);
  const membership = parseStreamerMembershipSettings(pageSettings?.layout ?? null);

  return {
    displayName: streamer?.display_name ?? profileCompat?.display_name ?? user.displayName,
    username: profileCompat?.username ?? user.username,
    tiktokUsername: streamer?.tiktok_username ?? profileCompat?.tiktok_username ?? user.tiktokUsername,
    bio: streamer?.bio ?? profile?.bio ?? "",
    avatarUrl: streamer?.logo_url ?? streamer?.avatar_url ?? profile?.avatar_url ?? "",
    telegramUsername: profile?.telegram_username ?? "",
    streamerTagline: streamer?.tagline ?? "",
    streamerTelegramChannel: socialLinks.telegram || (streamer?.telegram_channel ?? ""),
    streamerInstagram: socialLinks.instagram,
    streamerFacebook: socialLinks.facebook,
    streamerTwitter: socialLinks.twitter,
    streamerPaidMembershipEnabled: membership.paidEnabled,
    streamerHighlightedPlanKey: membership.highlightedPlanKey,
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
  const tiktokProfile = tiktokUsername ? await lookupTikTokProfile(tiktokUsername).catch(() => null) : null;
  const resolvedBio = draft.bio.trim() || tiktokProfile?.bio || null;
  const resolvedAvatarUrl = draft.avatarUrl.trim() || tiktokProfile?.avatarUrl || null;
  const resolvedFollowersCount = tiktokProfile?.followersCount ?? 0;

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
    avatar_url: resolvedAvatarUrl,
    bio: resolvedBio,
  });

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      username,
      tiktok_username: tiktokUsername || null,
      bio: resolvedBio,
      avatar_url: resolvedAvatarUrl,
      telegram_username: draft.telegramUsername.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (profileError) {
    throw profileError;
  }

  if (!user.isStreamer) {
    return { publicPageId: null };
  }

  const streamer = await ensureLinkedStreamer({
    userId: user.id,
    tiktokUsername,
    displayName,
  });

  const { data: existingSettingsData, error: existingSettingsError } = await supabase
    .from("streamer_page_settings")
    .select("layout")
    .eq("streamer_id", streamer.id)
    .maybeSingle();

  if (existingSettingsError && existingSettingsError.code !== "PGRST116") {
    throw existingSettingsError;
  }

  const currentLayout = existingSettingsData?.layout && typeof existingSettingsData.layout === "object"
    ? existingSettingsData.layout as Record<string, unknown>
    : {};

  const socialLinks = normalizeSocialLinks({
    telegram: draft.streamerTelegramChannel,
    instagram: draft.streamerInstagram,
    facebook: draft.streamerFacebook,
    twitter: draft.streamerTwitter,
  });

  const membership = {
    paidEnabled: draft.streamerPaidMembershipEnabled,
    highlightedPlanKey: draft.streamerHighlightedPlanKey,
  } satisfies typeof DEFAULT_STREAMER_MEMBERSHIP_SETTINGS;

  const { error: streamerError } = await supabase
    .from("streamers")
    .update({
      display_name: displayName,
      tiktok_username: tiktokUsername,
      bio: resolvedBio,
      avatar_url: resolvedAvatarUrl,
      logo_url: resolvedAvatarUrl,
      followers_count: resolvedFollowersCount,
      banner_url: draft.streamerBannerUrl.trim() || null,
      tagline: draft.streamerTagline.trim() || null,
      telegram_channel: socialLinks.telegram || null,
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
      logo_url: resolvedAvatarUrl,
      headline: draft.streamerTagline.trim() || null,
      description: resolvedBio,
      layout: buildStreamerPageLayout({
        currentLayout,
        socialLinks,
        membership,
      }),
    }, { onConflict: "streamer_id" });

  if (settingsError) {
    throw settingsError;
  }

  return { publicPageId: streamer.id };
}

export async function loadStreamerApplicationState(user: AppUser): Promise<StreamerApplicationState> {
  const { data: streamerData, error: streamerError } = await supabase
    .from("streamers")
    .select("id, tiktok_username, verification_status, verification_method")
    .eq("user_id", user.id)
    .maybeSingle();

  if (streamerError) {
    throw streamerError;
  }

  const streamer = (streamerData ?? null) as Pick<StreamerRow, "id" | "tiktok_username" | "verification_status" | "verification_method"> | null;
  if (!streamer) {
    return {
      streamerId: null,
      tiktokUsername: "",
      status: "none",
      evidenceType: "live-link",
      evidenceValue: "",
      notes: "",
      submittedAt: null,
    };
  }

  const { data: verificationData, error: verificationError } = await supabase
    .from("streamer_verifications")
    .select("evidence_type, evidence_value, notes, status, created_at")
    .eq("streamer_id", streamer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (verificationError) {
    throw verificationError;
  }

  const latestVerification = (verificationData ?? null) as StreamerVerificationRow | null;

  return {
    streamerId: streamer.id,
    tiktokUsername: streamer.tiktok_username ?? "",
    status: streamer.verification_status ?? latestVerification?.status ?? "none",
    evidenceType: latestVerification?.evidence_type ?? streamer.verification_method ?? "live-link",
    evidenceValue: latestVerification?.evidence_value ?? "",
    notes: latestVerification?.notes ?? "",
    submittedAt: latestVerification?.created_at ?? null,
  };
}

export async function submitStreamerApplication(user: AppUser, input: {
  tiktokUsername: string;
  evidenceType: string;
  evidenceValue: string;
  notes: string;
}) {
  const tiktokUsername = normalizeTikTokUsername(input.tiktokUsername);
  const evidenceType = input.evidenceType.trim();
  const evidenceValue = input.evidenceValue.trim();
  const notes = input.notes.trim();

  if (!tiktokUsername) {
    throw new Error("Укажи TikTok username для заявки на стримера.");
  }

  if (!evidenceValue) {
    throw new Error("Добавь ссылку или описание доказательства, что ты реально стримишь.");
  }

  const { data: existingStreamerData, error: existingStreamerError } = await supabase
    .from("streamers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingStreamerError) {
    throw existingStreamerError;
  }

  const existingStreamer = existingStreamerData as { id: string } | null;
  let streamerId = existingStreamer?.id ?? null;

  if (streamerId) {
    const { error: updateError } = await supabase
      .from("streamers")
      .update({
        display_name: user.displayName,
        tiktok_username: tiktokUsername,
        verification_status: "pending",
        verification_method: evidenceType,
        tracking_enabled: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", streamerId);

    if (updateError) {
      throw updateError;
    }
  } else {
    const { data: createdStreamer, error: createError } = await supabase
      .from("streamers")
      .insert({
        user_id: user.id,
        display_name: user.displayName,
        tiktok_username: tiktokUsername,
        verification_status: "pending",
        verification_method: evidenceType,
        tracking_enabled: true,
      })
      .select("id")
      .single();

    if (createError) {
      throw createError;
    }

    streamerId = createdStreamer.id;
  }

  const { error: verificationError } = await supabase
    .from("streamer_verifications")
    .insert({
      streamer_id: streamerId,
      submitted_by: user.id,
      status: "pending",
      evidence_type: evidenceType,
      evidence_value: evidenceValue,
      notes: notes || null,
    });

  if (verificationError) {
    throw verificationError;
  }

  return { streamerId };
}