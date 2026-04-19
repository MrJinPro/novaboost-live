import { supabase } from "@/integrations/supabase/client";
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
import { resolveLinkedStreamer, type LinkedStreamerRow } from "@/lib/streamer-profile-linking";

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

function createOverlayAccessKey() {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
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
  return {
    bannerUrl: "",
    logoUrl: "",
    headline: displayName ? `Публичная страница ${displayName}` : "Публичная страница стримера",
    bio: tiktokUsername
      ? `Подписывайся на @${tiktokUsername}, чтобы следить за анонсами и активностью между эфирами.`
      : "Расскажи, зачем зрителю подписываться на тебя внутри платформы и что происходит на твоих эфирах.",
    telegramChannel: "",
    accent: "from-cosmic/80 via-magenta/30 to-blast/70",
    tags: "",
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
  return resolveLinkedStreamer({
    userId: user.id,
    tiktokUsername: user.tiktokUsername,
    displayName: user.displayName,
    claimIfNeeded: true,
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
          ...currentLayout,
          tags,
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

  const [settings, posts, subscriptionCount, boostTotals, media, latestSession, donationLink, recentDonations, liveStatus, recentLiveEvents, trackingDetails] = await Promise.all([
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
  ]);

  const resolvedSession = trackingDetails?.latestSession ?? latestSession;
  const resolvedEvents = trackingDetails?.recentEvents?.length
    ? trackingDetails.recentEvents.map(mapLiveEvent)
    : recentLiveEvents;

  return {
    id: streamer.id,
    owner_user_id: streamer.user_id,
    display_name: streamer.display_name,
    tiktok_username: streamer.tiktok_username,
    avatar_url: settings?.logo_url ?? streamer.logo_url ?? streamer.avatar_url,
    banner_url: settings?.banner_url ?? streamer.banner_url ?? "",
    bio: settings?.description ?? streamer.bio ?? "",
    tagline: settings?.headline ?? streamer.tagline ?? "Публичная страница стримера внутри NovaBoost Live.",
    featured_video_url: settings?.featured_video_url ?? media[0]?.cover ?? null,
    is_live: liveStatus?.isLive ?? streamer.is_live,
    viewer_count: liveStatus?.viewerCount ?? streamer.viewer_count,
    followers_count: liveStatus?.followersCount || streamer.followers_count,
    needs_boost: streamer.needs_boost,
    total_boost_amount: boostTotals.get(streamer.id) ?? streamer.total_boost_amount,
    subscription_count: subscriptionCount,
    telegram_channel: streamer.telegram_channel ?? "@telegram_channel",
    next_event: posts[0]?.title ? `Актуальный анонс: ${posts[0].title}` : "Следующий анонс появится после первой публикации в студии.",
    support_goal: streamer.needs_boost ? "Сейчас стримеру нужен дополнительный буст и трафик из платформы." : "Страница активна, следи за анонсами и новыми постами.",
    total_likes: resolvedSession?.like_count ?? 0,
    total_gifts: resolvedSession?.gift_count ?? 0,
    total_messages: resolvedSession?.message_count ?? 0,
    peak_viewer_count: resolvedSession?.peak_viewer_count ?? 0,
    current_session_status: resolvedSession?.status ?? null,
    current_session_started_at: resolvedSession?.started_at ?? null,
    accent: settings?.accent_color ?? "from-cosmic/80 via-magenta/30 to-blast/70",
    tags: (() => {
      const layout = (settings?.layout ?? {}) as { tags?: string[] };
      return Array.isArray(layout.tags) ? layout.tags : [];
    })(),
    perks: ["ранний доступ к анонсам", "сигналы по эфирам"],
    donation_link_slug: donationLink?.slug ?? null,
    donation_link_title: donationLink?.title ?? null,
    donation_overlay: toPublicDonationOverlaySettings(settings?.layout ?? null),
    recent_donations: recentDonations,
    recent_live_events: resolvedEvents,
    posts,
    videos: media,
  } satisfies StreamerPageData;
}

export async function getStreamerSubscriptionState(streamerId: string, userId: string) {
  const { data, error } = await supabase
    .from("streamer_subscriptions")
    .select("id")
    .eq("streamer_id", streamerId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function toggleStreamerSubscription(streamerId: string, userId: string, subscribed: boolean) {
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
    .insert({
      streamer_id: streamerId,
      user_id: userId,
      notification_enabled: true,
      telegram_enabled: false,
    });

  if (error && error.code !== "23505") {
    throw error;
  }

  return true;
}