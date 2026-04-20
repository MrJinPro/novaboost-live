import { supabase } from "@/integrations/supabase/client";
import { getViewerProfileStatsCompat, resolveNextActivityStreak, updateViewerProfileProgressCompat } from "@/lib/profile-schema-compat";
import { getViewerLevel } from "@/lib/viewer-levels";
import type { Tables } from "@/integrations/supabase/types";
import {
  type AppUser,
  type DonationOverlayDisplayMode,
  type DonationOverlaySettings,
  type DonationOverlayVariant,
  type StreamerPageData,
  type StreamerPost,
  type StreamerStudioDraft,
} from "@/lib/mock-platform";
import { loadActiveBoostTotals } from "@/lib/boost-data";
import { loadStreamerTrackingDetails, resolveLiveStatus } from "@/lib/live-status-data";
import { loadDonationLinkByStreamerId, loadRecentDonationEvents } from "@/lib/monetization-data";
import { buildStreamerPageLayout, DEFAULT_STREAMER_MEMBERSHIP_SETTINGS, EMPTY_STREAMER_SOCIAL_LINKS, parseStreamerMembershipSettings, parseStreamerSocialLinks } from "@/lib/streamer-page-config";
import { ensureLinkedStreamer, resolveLinkedStreamer, type LinkedStreamerRow } from "@/lib/streamer-profile-linking";
import { lookupTikTokProfile } from "@/lib/tiktok-profile-data";

type DbStreamer = LinkedStreamerRow;

type DbPageSettings = Pick<
  Tables<"streamer_page_settings">,
  | "accent_color"
  | "banner_url"
  | "logo_url"
  | "headline"
  | "description"
  | "featured_video_url"
  | "layout"
>;

type DbPost = Pick<
  Tables<"streamer_posts">,
  "id" | "post_type" | "title" | "body" | "published_at" | "created_at" | "expires_at" | "required_plan" | "blur_preview"
>;

type DbMedia = Pick<
  Tables<"streamer_media">,
  "id" | "title" | "url" | "thumbnail_url" | "duration_seconds"
>;

type DbStreamSession = Pick<
  Tables<"stream_sessions">,
  "like_count" | "gift_count" | "message_count" | "current_viewer_count" | "peak_viewer_count" | "status" | "started_at"
>;

type DbStreamEvent = Pick<Tables<"stream_events">, "id" | "event_type" | "event_timestamp" | "normalized_payload">;

const DEFAULT_DONATION_OVERLAY: DonationOverlaySettings = {
  variant: "supernova",
  soundUrl: "",
  gifUrl: "",
  accessKey: "",
  displayMode: "original",
  displayCurrency: "USD",
  goalTitle: "Цель донатов",
  goalTarget: 100,
  goalCurrency: "USD",
};

const DEFAULT_STREAMER_THEMES = [
  {
    accent: "from-cosmic/85 via-magenta/35 to-blast/75",
    colors: ["#6D28D9", "#EC4899", "#F97316"],
  },
  {
    accent: "from-sky-500/85 via-cyan-400/35 to-emerald-400/75",
    colors: ["#0284C7", "#22D3EE", "#34D399"],
  },
  {
    accent: "from-amber-500/85 via-rose-400/35 to-fuchsia-500/75",
    colors: ["#F59E0B", "#FB7185", "#D946EF"],
  },
  {
    accent: "from-indigo-500/85 via-violet-400/35 to-cyan-400/75",
    colors: ["#6366F1", "#A78BFA", "#22D3EE"],
  },
] as const;

function createOverlayAccessKey() {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function hashString(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function getStreamerThemeSeed(tiktokUsername: string, displayName: string) {
  const seed = `${tiktokUsername}:${displayName}`.trim().toLowerCase() || "novaboost";
  return DEFAULT_STREAMER_THEMES[hashString(seed) % DEFAULT_STREAMER_THEMES.length];
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createDefaultBannerDataUrl(displayName: string, tiktokUsername: string) {
  const theme = getStreamerThemeSeed(tiktokUsername, displayName);
  const title = escapeSvgText(displayName || "NovaBoost Live");
  const username = escapeSvgText(tiktokUsername ? `@${tiktokUsername}` : "TikTok LIVE");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 520" fill="none">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${theme.colors[0]}" />
          <stop offset="52%" stop-color="${theme.colors[1]}" />
          <stop offset="100%" stop-color="${theme.colors[2]}" />
        </linearGradient>
        <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1280 90) rotate(130) scale(520 380)">
          <stop stop-color="white" stop-opacity="0.24" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="520" fill="url(#bg)"/>
      <rect width="1600" height="520" fill="rgba(5,10,20,0.18)"/>
      <circle cx="1320" cy="90" r="340" fill="url(#glow)" />
      <circle cx="220" cy="500" r="260" fill="rgba(255,255,255,0.08)" />
      <path d="M0 420C180 350 320 330 470 360C630 392 780 470 930 476C1080 483 1220 420 1360 392C1460 372 1540 374 1600 386V520H0V420Z" fill="rgba(255,255,255,0.08)"/>
      <g opacity="0.12">
        <path d="M1180 40h260v42h-260zM1248 118h192v18h-192zM1124 150h316v18h-316z" fill="white"/>
      </g>
      <text x="84" y="184" fill="white" font-size="28" font-family="Arial, sans-serif" opacity="0.78">NovaBoost Live</text>
      <text x="84" y="276" fill="white" font-size="72" font-weight="700" font-family="Arial, sans-serif">${title}</text>
      <text x="84" y="334" fill="white" font-size="34" font-family="Arial, sans-serif" opacity="0.86">${username}</text>
      <text x="84" y="414" fill="white" font-size="26" font-family="Arial, sans-serif" opacity="0.72">LIVE, анонсы, контент между эфирами и внутренняя поддержка сообщества</text>
    </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;
}

function createDefaultHeadline(displayName: string, tiktokUsername: string) {
  if (displayName && tiktokUsername) {
    return `${displayName} в NovaBoost Live: эфиры, анонсы и контент между стримами.`;
  }

  if (displayName) {
    return `${displayName} в NovaBoost Live: публичная страница для эфиров и комьюнити.`;
  }

  return "Публичная страница стримера в NovaBoost Live.";
}

function createDefaultTags(tiktokUsername: string) {
  return ["live", "creator", tiktokUsername || "novaboost"].join(", ");
}

function resolveDonationOverlayVariant(value: unknown): DonationOverlayVariant {
  if (value === "epic-burst" || value === "nova-ring" || value === "supernova") {
    return value;
  }

  return DEFAULT_DONATION_OVERLAY.variant;
}

function parseDonationOverlaySettings(layout: unknown): DonationOverlaySettings {
  const overlay = layout && typeof layout === "object"
    ? (layout as { donationOverlay?: Record<string, unknown> }).donationOverlay
    : null;

  const displayMode: DonationOverlayDisplayMode = overlay?.displayMode === "preferred" ? "preferred" : "original";
  const displayCurrency = overlay?.displayCurrency === "RUB" || overlay?.displayCurrency === "KZT" || overlay?.displayCurrency === "MDL" || overlay?.displayCurrency === "USD"
    ? overlay.displayCurrency
    : DEFAULT_DONATION_OVERLAY.displayCurrency;
  const goalCurrency = overlay?.goalCurrency === "RUB" || overlay?.goalCurrency === "KZT" || overlay?.goalCurrency === "MDL" || overlay?.goalCurrency === "USD"
    ? overlay.goalCurrency
    : DEFAULT_DONATION_OVERLAY.goalCurrency;
  const goalTarget = typeof overlay?.goalTarget === "number" && Number.isFinite(overlay.goalTarget)
    ? Math.max(1, overlay.goalTarget)
    : DEFAULT_DONATION_OVERLAY.goalTarget;

  return {
    variant: resolveDonationOverlayVariant(overlay?.variant),
    soundUrl: typeof overlay?.soundUrl === "string" ? overlay.soundUrl : DEFAULT_DONATION_OVERLAY.soundUrl,
    gifUrl: typeof overlay?.gifUrl === "string" ? overlay.gifUrl : DEFAULT_DONATION_OVERLAY.gifUrl,
    accessKey: typeof overlay?.accessKey === "string" ? overlay.accessKey : DEFAULT_DONATION_OVERLAY.accessKey,
    displayMode,
    displayCurrency,
    goalTitle: typeof overlay?.goalTitle === "string" && overlay.goalTitle.trim() ? overlay.goalTitle : DEFAULT_DONATION_OVERLAY.goalTitle,
    goalTarget,
    goalCurrency,
  };
}

function toPublicDonationOverlaySettings(layout: unknown): DonationOverlaySettings {
  const overlay = parseDonationOverlaySettings(layout);
  return {
    ...overlay,
    accessKey: "",
  };
}

function createEmptyStudioDraft(tiktokUsername: string, displayName: string): StreamerStudioDraft {
  const theme = getStreamerThemeSeed(tiktokUsername, displayName);

  return {
    bannerUrl: createDefaultBannerDataUrl(displayName, tiktokUsername),
    logoUrl: "",
    headline: createDefaultHeadline(displayName, tiktokUsername),
    bio: tiktokUsername
      ? `Подписывайся на @${tiktokUsername}, чтобы следить за live-активностью, анонсами, новостями и движением комьюнити между эфирами.`
      : "Расскажи, зачем зрителю подписываться на тебя внутри платформы и что происходит на твоих эфирах.",
    telegramChannel: "",
    accent: theme.accent,
    tags: createDefaultTags(tiktokUsername),
    featuredVideoUrl: "",
    donationOverlayVariant: DEFAULT_DONATION_OVERLAY.variant,
    donationSoundUrl: DEFAULT_DONATION_OVERLAY.soundUrl,
    donationGifUrl: DEFAULT_DONATION_OVERLAY.gifUrl,
    donationOverlayAccessKey: DEFAULT_DONATION_OVERLAY.accessKey,
    donationOverlayDisplayMode: DEFAULT_DONATION_OVERLAY.displayMode,
    donationOverlayDisplayCurrency: DEFAULT_DONATION_OVERLAY.displayCurrency,
    donationGoalTitle: DEFAULT_DONATION_OVERLAY.goalTitle,
    donationGoalTarget: String(DEFAULT_DONATION_OVERLAY.goalTarget),
    donationGoalCurrency: DEFAULT_DONATION_OVERLAY.goalCurrency,
    membershipPaidEnabled: DEFAULT_STREAMER_MEMBERSHIP_SETTINGS.paidEnabled,
    membershipHighlightedPlanKey: DEFAULT_STREAMER_MEMBERSHIP_SETTINGS.highlightedPlanKey,
  };
}

function toUiPostType(postType: string): StreamerPost["type"] {
  if (postType === "announcement" || postType === "news") {
    return postType;
  }

  return "clip";
}

function toDbPostType(postType: StreamerPost["type"]) {
  return postType === "clip" ? "video" : postType;
}

function formatPostDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function mapDbPost(row: DbPost): StreamerPost {
  return {
    id: row.id,
    type: toUiPostType(row.post_type),
    title: row.title,
    body: row.body ?? "",
    createdAt: formatPostDate(row.published_at ?? row.created_at),
    requiredPlan: row.required_plan,
    blurPreview: row.blur_preview,
    expiresAt: row.expires_at,
  };
}

function isPostActive(row: DbPost) {
  if (!row.expires_at) {
    return true;
  }

  return new Date(row.expires_at).getTime() > Date.now();
}

async function getManagedStreamer(user: Pick<AppUser, "id" | "tiktokUsername" | "displayName">) {
  return ensureLinkedStreamer({
    userId: user.id,
    tiktokUsername: user.tiktokUsername,
    displayName: user.displayName,
  });
}

export async function getOwnedStreamerPublicPage(userId: string) {
  const streamer = await resolveLinkedStreamer({ userId, claimIfNeeded: false });

  if (!streamer) {
    return null;
  }

  return {
    id: streamer.id,
    displayName: streamer.display_name,
    tiktokUsername: streamer.tiktok_username,
  };
}

async function getPageSettings(streamerId: string) {
  const { data, error } = await supabase
    .from("streamer_page_settings")
    .select("accent_color, banner_url, logo_url, headline, description, featured_video_url, layout")
    .eq("streamer_id", streamerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as DbPageSettings | null;
}

async function getPosts(streamerId: string, options?: { includeExpired?: boolean }) {
  const { data, error } = await supabase
    .from("streamer_posts")
    .select("id, post_type, title, body, published_at, created_at, expires_at, required_plan, blur_preview")
    .eq("streamer_id", streamerId)
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as DbPost[];

  return rows
    .filter((row) => (options?.includeExpired ?? true ? true : isPostActive(row)))
    .map(mapDbPost);
}

async function getMedia(streamerId: string) {
  const { data, error } = await supabase
    .from("streamer_media")
    .select("id, title, url, thumbnail_url, duration_seconds")
    .eq("streamer_id", streamerId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) {
    throw error;
  }

  return ((data ?? []) as DbMedia[]).map((row) => ({
    id: row.id,
    title: row.title ?? "Тизер стримера",
    duration: row.duration_seconds ? `${Math.floor(row.duration_seconds / 60)}:${String(row.duration_seconds % 60).padStart(2, "0")}` : "0:30",
    cover: row.thumbnail_url ?? row.url,
  }));
}

async function getLatestSessionStats(streamerId: string) {
  const { data, error } = await supabase
    .from("stream_sessions")
    .select("like_count, gift_count, message_count, current_viewer_count, peak_viewer_count, status, started_at")
    .eq("streamer_id", streamerId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (
    data ?? {
      like_count: 0,
      gift_count: 0,
      message_count: 0,
      current_viewer_count: 0,
      peak_viewer_count: 0,
      status: null,
      started_at: null,
    }
  ) as DbStreamSession;
}

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function mapLiveEvent(row: DbStreamEvent) {
  const payload = (row.normalized_payload ?? {}) as Record<string, unknown>;
  const username = typeof payload.external_viewer_username === "string" ? payload.external_viewer_username : null;
  const likeCount = typeof payload.like_count === "number" ? payload.like_count : 0;
  const giftCount = typeof payload.gift_count === "number" ? payload.gift_count : 0;
  const viewerCount = typeof payload.viewer_count === "number" ? payload.viewer_count : 0;
  const commentText = typeof payload.comment_text === "string" ? payload.comment_text : null;

  switch (row.event_type) {
    case "live_started":
      return {
        id: row.id,
        type: row.event_type,
        createdAt: formatEventTime(row.event_timestamp),
        title: "Эфир начался",
        description: "Система зафиксировала старт live-сессии.",
      };
    case "live_ended":
      return {
        id: row.id,
        type: row.event_type,
        createdAt: formatEventTime(row.event_timestamp),
        title: "Эфир завершён",
        description: "Активная live-сессия была закрыта.",
      };
    case "snapshot_updated":
      return {
        id: row.id,
        type: row.event_type,
        createdAt: formatEventTime(row.event_timestamp),
        title: "Обновление онлайна",
        description: viewerCount > 0 ? `В эфире ${viewerCount} зрителей.` : "Получен новый live-снимок.",
      };
    case "chat_message":
      return {
        id: row.id,
        type: row.event_type,
        createdAt: formatEventTime(row.event_timestamp),
        title: "Сообщение в чате",
        description: commentText ? `${username ? `@${username}: ` : ""}${commentText}` : "В чате появилось новое сообщение.",
      };
    case "like_received":
      return {
        id: row.id,
        type: row.event_type,
        createdAt: formatEventTime(row.event_timestamp),
        title: "Пришли лайки",
        description: `${username ? `@${username} отправил` : "Получено"} ${likeCount || 1} лайк${likeCount === 1 ? "" : likeCount < 5 ? "а" : "ов"}.`,
      };
    case "gift_received":
      return {
        id: row.id,
        type: row.event_type,
        createdAt: formatEventTime(row.event_timestamp),
        title: "Получен подарок",
        description: `${username ? `@${username} отправил` : "Получено"} ${giftCount || 1} подарок${giftCount === 1 ? "" : giftCount < 5 ? "а" : "ов"}.`,
      };
    case "viewer_joined":
      return {
        id: row.id,
        type: row.event_type,
        createdAt: formatEventTime(row.event_timestamp),
        title: "Новый зритель в эфире",
        description: username ? `К эфиру подключился @${username}.` : "К эфиру подключился новый зритель.",
      };
    default:
      return {
        id: row.id,
        type: row.event_type,
        createdAt: formatEventTime(row.event_timestamp),
        title: "Событие эфира",
        description: "Система сохранила новое событие live-эфира.",
      };
  }
}

async function getRecentLiveEvents(streamerId: string) {
  const { data, error } = await supabase
    .from("stream_events")
    .select("id, event_type, event_timestamp, normalized_payload")
    .eq("streamer_id", streamerId)
    .order("event_timestamp", { ascending: false })
    .limit(12);

  if (error) {
    throw error;
  }

  return ((data ?? []) as DbStreamEvent[]).map(mapLiveEvent);
}

async function getSubscriptionCount(streamerId: string) {
  const { count, error } = await supabase
    .from("streamer_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("streamer_id", streamerId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

function buildDraft(base: StreamerStudioDraft, streamer: DbStreamer, settings: DbPageSettings | null): StreamerStudioDraft {
  const layout = (settings?.layout ?? {}) as { tags?: string[] };
  const tags = Array.isArray(layout.tags) ? layout.tags : [];
  const donationOverlay = parseDonationOverlaySettings(settings?.layout ?? null);
  const membership = parseStreamerMembershipSettings(settings?.layout ?? null);

  return {
    bannerUrl: settings?.banner_url ?? streamer.banner_url ?? base.bannerUrl,
    logoUrl: settings?.logo_url ?? streamer.logo_url ?? streamer.avatar_url ?? base.logoUrl,
    headline: settings?.headline ?? streamer.tagline ?? base.headline,
    bio: settings?.description ?? streamer.bio ?? base.bio,
    telegramChannel: streamer.telegram_channel ?? base.telegramChannel,
    accent: settings?.accent_color ?? base.accent,
    tags: tags.length > 0 ? tags.join(", ") : base.tags,
    featuredVideoUrl: settings?.featured_video_url ?? base.featuredVideoUrl,
    donationOverlayVariant: donationOverlay.variant,
    donationSoundUrl: donationOverlay.soundUrl,
    donationGifUrl: donationOverlay.gifUrl,
    donationOverlayAccessKey: donationOverlay.accessKey,
    donationOverlayDisplayMode: donationOverlay.displayMode,
    donationOverlayDisplayCurrency: donationOverlay.displayCurrency,
    donationGoalTitle: donationOverlay.goalTitle,
    donationGoalTarget: String(donationOverlay.goalTarget),
    donationGoalCurrency: donationOverlay.goalCurrency,
    membershipPaidEnabled: membership.paidEnabled,
    membershipHighlightedPlanKey: membership.highlightedPlanKey,
  };
}

export async function saveStreamerDonationOverlaySettings(user: AppUser, input: DonationOverlaySettings) {
  const streamer = await getManagedStreamer(user);

  if (!streamer) {
    throw new Error("Профиль стримера в базе ещё не создан.");
  }

  const existingSettings = await getPageSettings(streamer.id);
  const currentLayout = existingSettings?.layout && typeof existingSettings.layout === "object"
    ? (existingSettings.layout as Record<string, unknown>)
    : {};
  const currentOverlay = parseDonationOverlaySettings(currentLayout);
  const accessKey = input.accessKey || currentOverlay.accessKey || createOverlayAccessKey();
  const nextLayout = {
    ...currentLayout,
    donationOverlay: {
      variant: input.variant,
      soundUrl: input.soundUrl || null,
      gifUrl: input.gifUrl || null,
      accessKey,
      displayMode: input.displayMode,
      displayCurrency: input.displayCurrency,
      goalTitle: input.goalTitle.trim() || DEFAULT_DONATION_OVERLAY.goalTitle,
      goalTarget: Math.max(1, Math.round(input.goalTarget)),
      goalCurrency: input.goalCurrency,
    },
  };

  const { error } = await supabase
    .from("streamer_page_settings")
    .upsert(
      {
        streamer_id: streamer.id,
        accent_color: existingSettings?.accent_color ?? null,
        banner_url: existingSettings?.banner_url ?? null,
        logo_url: existingSettings?.logo_url ?? null,
        headline: existingSettings?.headline ?? null,
        description: existingSettings?.description ?? null,
        featured_video_url: existingSettings?.featured_video_url ?? null,
        layout: nextLayout,
      },
      { onConflict: "streamer_id" },
    );

  if (error) {
    throw error;
  }

  return {
    variant: input.variant,
    soundUrl: input.soundUrl || "",
    gifUrl: input.gifUrl || "",
    accessKey,
    displayMode: input.displayMode,
    displayCurrency: input.displayCurrency,
    goalTitle: input.goalTitle.trim() || DEFAULT_DONATION_OVERLAY.goalTitle,
    goalTarget: Math.max(1, Math.round(input.goalTarget)),
    goalCurrency: input.goalCurrency,
  } satisfies DonationOverlaySettings;
}

export async function loadStreamerStudioData(user: AppUser) {
  const fallbackDraft = createEmptyStudioDraft(user.tiktokUsername, user.displayName);
  const streamer = await getManagedStreamer(user);

  if (!streamer) {
    return {
      streamerId: null,
      pageDraft: fallbackDraft,
      posts: [],
    };
  }

  const [settings, posts] = await Promise.all([
    getPageSettings(streamer.id),
    getPosts(streamer.id),
  ]);

  return {
    streamerId: streamer.id,
    pageDraft: buildDraft(fallbackDraft, streamer, settings),
    posts,
  };
}

export async function saveStreamerStudioPage(user: AppUser, draft: StreamerStudioDraft) {
  const streamer = await getManagedStreamer(user);

  if (!streamer) {
    throw new Error("Профиль стримера в базе ещё не создан.");
  }

  const tags = draft.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const existingSettings = await getPageSettings(streamer.id);
  const currentLayout = existingSettings?.layout && typeof existingSettings.layout === "object"
    ? (existingSettings.layout as Record<string, unknown>)
    : {};

  const { data: updatedStreamer, error: streamerError } = await supabase
    .from("streamers")
    .update({
      display_name: user.displayName,
      tiktok_username: user.tiktokUsername,
      bio: draft.bio || null,
      banner_url: draft.bannerUrl || null,
      logo_url: draft.logoUrl || null,
      tagline: draft.headline || null,
      telegram_channel: draft.telegramChannel || null,
    })
    .eq("id", streamer.id)
    .select("id")
    .maybeSingle();

  if (streamerError) {
    throw streamerError;
  }

  if (!updatedStreamer) {
    throw new Error("Профиль стримера не был обновлён. Скорее всего, запись ещё не привязана к текущему аккаунту.");
  }

  const { data: upsertedSettings, error: settingsError } = await supabase
    .from("streamer_page_settings")
    .upsert(
      {
        streamer_id: streamer.id,
        accent_color: draft.accent || null,
        banner_url: draft.bannerUrl || null,
        logo_url: draft.logoUrl || null,
        headline: draft.headline || null,
        description: draft.bio || null,
        featured_video_url: draft.featuredVideoUrl || null,
        layout: {
          ...buildStreamerPageLayout({
            currentLayout,
            tags,
            socialLinks: parseStreamerSocialLinks(currentLayout),
            membership: {
              paidEnabled: draft.membershipPaidEnabled,
              highlightedPlanKey: draft.membershipHighlightedPlanKey,
            },
          }),
        },
      },
      { onConflict: "streamer_id" }
    )
    .select("streamer_id");

  if (settingsError) {
    throw settingsError;
  }

  if (!upsertedSettings || upsertedSettings.length === 0) {
    throw new Error("Настройки публичной страницы не сохранились в Supabase.");
  }

  return { streamerId: streamer.id };
}

export async function publishStreamerPost(
  user: AppUser,
  input: Pick<StreamerPost, "type" | "title" | "body"> & Partial<Pick<StreamerPost, "requiredPlan" | "blurPreview" | "expiresAt">>,
) {
  const streamer = await getManagedStreamer(user);

  if (!streamer) {
    throw new Error("Профиль стримера в базе ещё не создан.");
  }

  const { data, error } = await supabase
    .from("streamer_posts")
    .insert({
      streamer_id: streamer.id,
      author_user_id: user.id,
      post_type: toDbPostType(input.type),
      title: input.title.trim(),
      body: input.body.trim(),
      required_plan: input.requiredPlan ?? "free",
      blur_preview: input.blurPreview ?? false,
      expires_at: input.expiresAt ?? null,
      is_published: true,
      published_at: new Date().toISOString(),
    })
    .select("id, post_type, title, body, published_at, created_at, expires_at, required_plan, blur_preview")
    .single();

  if (error) {
    throw error;
  }

  return {
    streamerId: streamer.id,
    post: mapDbPost(data as DbPost),
  };
}

export async function loadPublicStreamerPage(id: string) {
  const { data, error } = await supabase
    .from("streamers")
    .select("id, user_id, display_name, tiktok_username, avatar_url, bio, banner_url, logo_url, tagline, telegram_channel, is_live, viewer_count, followers_count, needs_boost, total_boost_amount")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const streamer = (data ?? null) as DbStreamer | null;

  if (!streamer) {
    return null;
  }

  const shouldLookupTikTokProfile = !streamer.user_id && (
    !streamer.avatar_url
    || !streamer.bio
    || !streamer.followers_count
    || streamer.display_name.trim().toLowerCase() === streamer.tiktok_username.trim().toLowerCase()
  );

  const [settings, posts, subscriptionCount, boostTotals, media, latestSession, donationLink, recentDonations, liveStatus, recentLiveEvents, trackingDetails, tiktokProfile] = await Promise.all([
    getPageSettings(streamer.id),
    getPosts(streamer.id, { includeExpired: false }),
    getSubscriptionCount(streamer.id),
    loadActiveBoostTotals(),
    getMedia(streamer.id),
    getLatestSessionStats(streamer.id),
    loadDonationLinkByStreamerId(streamer.id),
    loadRecentDonationEvents(streamer.id),
    resolveLiveStatus(streamer.tiktok_username).catch(() => null),
    getRecentLiveEvents(streamer.id).catch(() => []),
    loadStreamerTrackingDetails(streamer.id).catch(() => null),
    shouldLookupTikTokProfile ? lookupTikTokProfile(streamer.tiktok_username).catch(() => null) : Promise.resolve(null),
  ]);

  const resolvedSession = trackingDetails?.latestSession ?? latestSession;
  const resolvedEvents = trackingDetails?.recentEvents?.length
    ? trackingDetails.recentEvents.map(mapLiveEvent)
    : recentLiveEvents;
  const currentViewerCount = trackingDetails?.state?.viewer_count
    ?? resolvedSession?.current_viewer_count
    ?? liveStatus?.viewerCount
    ?? streamer.viewer_count;
  const isLive = trackingDetails?.state?.is_live ?? liveStatus?.isLive ?? streamer.is_live;
  const resolvedDisplayName = tiktokProfile?.displayName?.trim()
    && streamer.display_name.trim().toLowerCase() === streamer.tiktok_username.trim().toLowerCase()
    ? tiktokProfile.displayName.trim()
    : streamer.display_name;
  const resolvedAvatarUrl = settings?.logo_url ?? streamer.logo_url ?? streamer.avatar_url ?? tiktokProfile?.avatarUrl ?? null;
  const resolvedBio = settings?.description ?? streamer.bio ?? tiktokProfile?.bio ?? "";
  const resolvedFollowersCount = liveStatus?.followersCount ?? tiktokProfile?.followersCount ?? streamer.followers_count;

  return {
    id: streamer.id,
    owner_user_id: streamer.user_id,
    is_registered: Boolean(streamer.user_id),
    display_name: resolvedDisplayName,
    tiktok_username: streamer.tiktok_username,
    avatar_url: resolvedAvatarUrl,
    banner_url: settings?.banner_url ?? streamer.banner_url ?? createDefaultBannerDataUrl(streamer.display_name, streamer.tiktok_username),
    bio: resolvedBio,
    tagline: settings?.headline ?? streamer.tagline ?? createDefaultHeadline(streamer.display_name, streamer.tiktok_username),
    featured_video_url: settings?.featured_video_url ?? media[0]?.cover ?? null,
    is_live: isLive,
    viewer_count: currentViewerCount,
    followers_count: resolvedFollowersCount,
    needs_boost: streamer.needs_boost,
    total_boost_amount: boostTotals.get(streamer.id) ?? streamer.total_boost_amount,
    subscription_count: streamer.user_id ? subscriptionCount : 0,
    telegram_channel: streamer.telegram_channel ?? "",
    social_links: (() => {
      const socialLinks = parseStreamerSocialLinks(settings?.layout ?? null);
      return {
        ...EMPTY_STREAMER_SOCIAL_LINKS,
        ...socialLinks,
        telegram: socialLinks.telegram || streamer.telegram_channel || "",
      };
    })(),
    membership_settings: parseStreamerMembershipSettings(settings?.layout ?? null),
    next_event: posts[0]?.title ? `Актуальный анонс: ${posts[0].title}` : "Следующий анонс появится после первой публикации в студии.",
    support_goal: streamer.needs_boost ? "Сейчас стримеру нужен дополнительный буст и трафик из платформы." : "Страница активна, следи за анонсами и новыми постами.",
    total_likes: resolvedSession?.like_count ?? 0,
    total_gifts: resolvedSession?.gift_count ?? 0,
    total_messages: resolvedSession?.message_count ?? 0,
    peak_viewer_count: resolvedSession?.peak_viewer_count ?? 0,
    current_session_status: resolvedSession?.status ?? null,
    current_session_started_at: resolvedSession?.started_at ?? null,
    accent: settings?.accent_color ?? getStreamerThemeSeed(streamer.tiktok_username, streamer.display_name).accent,
    tags: (() => {
      const layout = (settings?.layout ?? {}) as { tags?: string[] };
      return Array.isArray(layout.tags) && layout.tags.length > 0
        ? layout.tags
        : createDefaultTags(streamer.tiktok_username).split(", ");
    })(),
    perks: ["ранний доступ к анонсам", "сигналы по эфирам"],
    donation_link_slug: streamer.user_id ? (donationLink?.slug ?? null) : null,
    donation_link_title: streamer.user_id ? (donationLink?.title ?? null) : null,
    donation_overlay: streamer.user_id ? toPublicDonationOverlaySettings(settings?.layout ?? null) : null,
    recent_donations: recentDonations,
    recent_live_events: resolvedEvents,
    posts: streamer.user_id ? posts : [],
    videos: streamer.user_id ? media : [],
  } satisfies StreamerPageData;
}

export async function getStreamerSubscriptionState(streamerId: string, userId: string) {
  const { data: streamer, error: streamerError } = await supabase
    .from("streamers")
    .select("user_id")
    .eq("id", streamerId)
    .maybeSingle();

  if (streamerError) {
    throw streamerError;
  }

  if (!streamer?.user_id) {
    return false;
  }

  const { data, error } = await supabase
    .from("streamer_subscriptions")
    .select("id")
    .eq("streamer_id", streamerId)
    .eq("user_id", userId)
    .limit(1);

  if (error) {
    throw error;
  }

  return (data?.length ?? 0) > 0;
}

export async function toggleStreamerSubscription(streamerId: string, userId: string, subscribed: boolean) {
  const { data: streamer, error: streamerError } = await supabase
    .from("streamers")
    .select("user_id")
    .eq("id", streamerId)
    .maybeSingle();

  if (streamerError) {
    throw streamerError;
  }

  if (!streamer?.user_id) {
    throw new Error("На незарегистрированного стримера нельзя оформить подписку. Пока мы отслеживаем только его live-статус.");
  }

  if (subscribed) {
    const { error } = await supabase
      .from("streamer_subscriptions")
      .delete()
      .eq("streamer_id", streamerId)
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    return false;
  }

  const { error } = await supabase
    .from("streamer_subscriptions")
    .upsert(
      {
        streamer_id: streamerId,
        user_id: userId,
        notification_enabled: true,
        telegram_enabled: false,
      },
      { onConflict: "streamer_id,user_id", ignoreDuplicates: true },
    );

  if (error) {
    throw error;
  }

  try {
    const { count, error: rewardLookupError } = await supabase
      .from("viewer_points_ledger")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source_type", "streamer.subscription")
      .eq("source_id", streamerId);

    if (rewardLookupError) {
      throw rewardLookupError;
    }

    if ((count ?? 0) === 0) {
      const profile = await getViewerProfileStatsCompat(userId);
      const nextPoints = (profile.points ?? 0) + 10;
      const nextLevel = getViewerLevel(nextPoints);
      const streakDays = resolveNextActivityStreak({
        currentStreak: profile.streak_days,
        lastActivityAt: profile.last_activity_at,
      });

      await updateViewerProfileProgressCompat({
        userId,
        points: nextPoints,
        level: nextLevel,
        streak_days: streakDays,
      });

      const { error: ledgerError } = await supabase
        .from("viewer_points_ledger")
        .insert({
          user_id: userId,
          source_type: "streamer.subscription",
          source_id: streamerId,
          delta: 10,
          balance_after: nextPoints,
          reason: "Первичная подписка на стримера",
          metadata: {
            streamer_id: streamerId,
            awarded_once: true,
          },
        });

      if (ledgerError) {
        throw ledgerError;
      }
    }
  } catch (rewardError) {
    console.warn("Subscription reward grant failed", rewardError);
  }

  return true;
}