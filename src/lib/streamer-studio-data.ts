import { supabase } from "@/integrations/supabase/client";
import {
  createStudioDraft,
  getStreamerById,
  type AppUser,
  type StreamerPageData,
  type StreamerPost,
  type StreamerStudioDraft,
} from "@/lib/mock-platform";

const db = supabase as any;

type DbStreamer = {
  id: string;
  user_id: string | null;
  display_name: string;
  tiktok_username: string;
  avatar_url: string | null;
  bio: string | null;
  banner_url: string | null;
  logo_url: string | null;
  tagline: string | null;
  telegram_channel: string | null;
  is_live: boolean;
  viewer_count: number;
  followers_count: number;
  needs_boost: boolean;
  total_boost_amount: number;
};

type DbPageSettings = {
  accent_color: string | null;
  banner_url: string | null;
  logo_url: string | null;
  headline: string | null;
  description: string | null;
  featured_video_url: string | null;
  layout: { tags?: string[] } | null;
};

type DbPost = {
  id: string;
  post_type: string;
  title: string;
  body: string | null;
  published_at: string | null;
  created_at: string;
};

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
  };
}

async function getOwnedStreamer(userId: string) {
  const { data, error } = await db
    .from("streamers")
    .select("id, user_id, display_name, tiktok_username, avatar_url, bio, banner_url, logo_url, tagline, telegram_channel, is_live, viewer_count, followers_count, needs_boost, total_boost_amount")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as DbStreamer | null;
}

async function getPageSettings(streamerId: string) {
  const { data, error } = await db
    .from("streamer_page_settings")
    .select("accent_color, banner_url, logo_url, headline, description, featured_video_url, layout")
    .eq("streamer_id", streamerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as DbPageSettings | null;
}

async function getPosts(streamerId: string) {
  const { data, error } = await db
    .from("streamer_posts")
    .select("id, post_type, title, body, published_at, created_at")
    .eq("streamer_id", streamerId)
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as DbPost[]).map(mapDbPost);
}

async function getSubscriptionCount(streamerId: string) {
  const { count, error } = await db
    .from("streamer_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("streamer_id", streamerId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

function buildDraft(base: StreamerStudioDraft, streamer: DbStreamer, settings: DbPageSettings | null): StreamerStudioDraft {
  const tags = Array.isArray(settings?.layout?.tags) ? settings?.layout?.tags ?? [] : [];

  return {
    bannerUrl: settings?.banner_url ?? streamer.banner_url ?? base.bannerUrl,
    logoUrl: settings?.logo_url ?? streamer.logo_url ?? streamer.avatar_url ?? base.logoUrl,
    headline: settings?.headline ?? streamer.tagline ?? base.headline,
    bio: settings?.description ?? streamer.bio ?? base.bio,
    telegramChannel: streamer.telegram_channel ?? base.telegramChannel,
    accent: settings?.accent_color ?? base.accent,
    tags: tags.length > 0 ? tags.join(", ") : base.tags,
    featuredVideoUrl: settings?.featured_video_url ?? base.featuredVideoUrl,
  };
}

export async function loadStreamerStudioData(user: AppUser) {
  const fallback = createStudioDraft(user.tiktokUsername, user.displayName);
  const streamer = await getOwnedStreamer(user.id);

  if (!streamer) {
    return {
      streamerId: fallback.streamer?.id ?? null,
      pageDraft: fallback.draft,
      posts: fallback.streamer?.posts ?? [],
    };
  }

  const [settings, posts, subscriptionCount] = await Promise.all([
    getPageSettings(streamer.id),
    getPosts(streamer.id),
    getSubscriptionCount(streamer.id),
  ]);

  return {
    streamerId: streamer.id,
    pageDraft: buildDraft(fallback.draft, streamer, settings),
    posts: posts.length > 0 ? posts : fallback.streamer?.posts ?? [],
  };
}

export async function saveStreamerStudioPage(user: AppUser, draft: StreamerStudioDraft) {
  const streamer = await getOwnedStreamer(user.id);

  if (!streamer) {
    throw new Error("Профиль стримера в базе ещё не создан.");
  }

  const tags = draft.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const { error: streamerError } = await db
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
    .eq("id", streamer.id);

  if (streamerError) {
    throw streamerError;
  }

  const { error: settingsError } = await db
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
        layout: { tags },
      },
      { onConflict: "streamer_id" }
    );

  if (settingsError) {
    throw settingsError;
  }

  return { streamerId: streamer.id };
}

export async function publishStreamerPost(user: AppUser, input: Pick<StreamerPost, "type" | "title" | "body">) {
  const streamer = await getOwnedStreamer(user.id);

  if (!streamer) {
    throw new Error("Профиль стримера в базе ещё не создан.");
  }

  const { data, error } = await db
    .from("streamer_posts")
    .insert({
      streamer_id: streamer.id,
      author_user_id: user.id,
      post_type: toDbPostType(input.type),
      title: input.title.trim(),
      body: input.body.trim(),
      is_published: true,
      published_at: new Date().toISOString(),
    })
    .select("id, post_type, title, body, published_at, created_at")
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
  const fallback = getStreamerById(id);
  const { data, error } = await db
    .from("streamers")
    .select("id, user_id, display_name, tiktok_username, avatar_url, bio, banner_url, logo_url, tagline, telegram_channel, is_live, viewer_count, followers_count, needs_boost, total_boost_amount")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const streamer = (data ?? null) as DbStreamer | null;

  if (!streamer) {
    return fallback;
  }

  const [settings, posts] = await Promise.all([
    getPageSettings(streamer.id),
    getPosts(streamer.id),
  ]);

  return {
    id: streamer.id,
    display_name: streamer.display_name,
    tiktok_username: streamer.tiktok_username,
    avatar_url: settings?.logo_url ?? streamer.logo_url ?? streamer.avatar_url,
    banner_url: settings?.banner_url ?? streamer.banner_url ?? fallback?.banner_url ?? "",
    bio: settings?.description ?? streamer.bio ?? fallback?.bio ?? "",
    tagline: settings?.headline ?? streamer.tagline ?? fallback?.tagline ?? "Публичная страница стримера внутри NovaBoost Live.",
    is_live: streamer.is_live,
    viewer_count: streamer.viewer_count,
    followers_count: streamer.followers_count,
    needs_boost: streamer.needs_boost,
    total_boost_amount: streamer.total_boost_amount,
    subscription_count: subscriptionCount,
    telegram_channel: streamer.telegram_channel ?? fallback?.telegram_channel ?? "@telegram_channel",
    next_event: fallback?.next_event ?? "Следующий анонс появится после первой публикации в студии.",
    support_goal: fallback?.support_goal ?? "Цели роста и активности будут показываться здесь.",
    total_likes: fallback?.total_likes ?? 0,
    total_gifts: fallback?.total_gifts ?? 0,
    accent: settings?.accent_color ?? fallback?.accent ?? "from-cosmic/80 via-magenta/30 to-blast/70",
    tags: Array.isArray(settings?.layout?.tags) && (settings?.layout?.tags?.length ?? 0) > 0 ? settings!.layout!.tags! : fallback?.tags ?? [],
    perks: fallback?.perks ?? ["ранний доступ к анонсам", "сигналы по эфирам"],
    posts: posts.length > 0 ? posts : fallback?.posts ?? [],
    videos: fallback?.videos ?? [],
  } satisfies StreamerPageData;
}

export async function getStreamerSubscriptionState(streamerId: string, userId: string) {
  const { data, error } = await db
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
    const { error } = await db
      .from("streamer_subscriptions")
      .delete()
      .eq("streamer_id", streamerId)
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    return false;
  }

  const { error } = await db
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