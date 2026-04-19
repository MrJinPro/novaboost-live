import { supabase } from "@/integrations/supabase/client";
import type { AppUser, DonationEventSummary, DonationOverlaySettings, DonationOverlayVariant, PostReactionType, SubscriptionPlanKey } from "@/lib/mock-platform";
import { resolveLinkedStreamer } from "@/lib/streamer-profile-linking";

export type SubscriptionPlanDefinition = {
  key: SubscriptionPlanKey;
  title: string;
  price: number;
  description: string;
  perks: string[];
};

export type StreamerMembershipState = {
  subscribed: boolean;
  planKey: SubscriptionPlanKey;
  paidUntil: string | null;
  totalPaidAmount: number;
};

export type PostReactionSummary = {
  postId: string;
  counts: Record<PostReactionType, number>;
  activeReactions: PostReactionType[];
};

export type DonationLinkDraft = {
  slug: string;
  title: string;
  description: string;
  minimumAmount: number;
  isActive: boolean;
};

type ReactionRow = {
  post_id: string;
  reaction_type: PostReactionType;
  user_id: string;
};

type DonationLinkRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  minimum_amount: number;
  is_active: boolean;
};

const DEFAULT_DONATION_OVERLAY: DonationOverlaySettings = {
  variant: "supernova",
  soundUrl: "",
  gifUrl: "",
  accessKey: "",
};

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

  return {
    variant: resolveDonationOverlayVariant(overlay?.variant),
    soundUrl: typeof overlay?.soundUrl === "string" ? overlay.soundUrl : DEFAULT_DONATION_OVERLAY.soundUrl,
    gifUrl: typeof overlay?.gifUrl === "string" ? overlay.gifUrl : DEFAULT_DONATION_OVERLAY.gifUrl,
    accessKey: typeof overlay?.accessKey === "string" ? overlay.accessKey : DEFAULT_DONATION_OVERLAY.accessKey,
  };
}

const PLAN_DURATION_DAYS = 30;

export const SUBSCRIPTION_PLANS: SubscriptionPlanDefinition[] = [
  {
    key: "free",
    title: "Открытый доступ",
    price: 0,
    description: "Базовое наблюдение за стримером, без закрытого контента.",
    perks: ["общедоступные посты", "анонсы эфиров"],
  },
  {
    key: "supporter",
    title: "Поддержка",
    price: 199,
    description: "Поддержка стримера и ранние сигналы перед эфиром.",
    perks: ["ранние анонсы", "бейдж поддержки", "список донатов"],
  },
  {
    key: "superfan",
    title: "Суперфан",
    price: 499,
    description: "Доступ к закрытым анонсам, кодам и премиум-постам.",
    perks: ["закрытые посты", "скрытые кодовые анонсы", "приоритетные сигналы"],
  },
  {
    key: "legend",
    title: "Легенда",
    price: 990,
    description: "Максимальный уровень поддержки для ядра комьюнити.",
    perks: ["все преимущества Суперфан", "легендарный бейдж", "спец-алерты в донатах"],
  },
];

export function getSubscriptionPlanLabel(planKey: SubscriptionPlanKey) {
  return getPlanDefinition(planKey).title;
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function addDaysIso(days: number) {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function createEmptyCounts(): Record<PostReactionType, number> {
  return {
    nova: 0,
    flare: 0,
    pulse: 0,
    crown: 0,
  };
}

function getPlanDefinition(planKey: SubscriptionPlanKey) {
  return SUBSCRIPTION_PLANS.find((plan) => plan.key === planKey) ?? SUBSCRIPTION_PLANS[0];
}

export function createDonationLinkDraft(tiktokUsername: string, displayName: string): DonationLinkDraft {
  return {
    slug: normalizeSlug(tiktokUsername || displayName || "nova-streamer"),
    title: displayName ? `Поддержать ${displayName}` : "Поддержать стримера",
    description: "Поддержи эфир через NovaBoost Live, чтобы стример увидел алерт прямо на странице.",
    minimumAmount: 100,
    isActive: true,
  };
}

export async function loadStreamerMembershipState(streamerId: string, userId?: string): Promise<StreamerMembershipState> {
  if (!userId) {
    return {
      subscribed: false,
      planKey: "free",
      paidUntil: null,
      totalPaidAmount: 0,
    };
  }

  const { data, error } = await supabase
    .from("streamer_subscriptions")
    .select("id, plan_key, paid_until, total_paid_amount")
    .eq("streamer_id", streamerId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    subscribed: Boolean(data),
    planKey: data?.plan_key ?? "free",
    paidUntil: data?.paid_until ?? null,
    totalPaidAmount: data?.total_paid_amount ?? 0,
  };
}

export async function activateStreamerPlan(streamerId: string, userId: string, planKey: SubscriptionPlanKey) {
  const currentState = await loadStreamerMembershipState(streamerId, userId);
  const plan = getPlanDefinition(planKey);

  const { error } = await supabase
    .from("streamer_subscriptions")
    .upsert(
      {
        streamer_id: streamerId,
        user_id: userId,
        notification_enabled: true,
        telegram_enabled: currentState.subscribed,
        plan_key: planKey,
        paid_until: planKey === "free" ? null : addDaysIso(PLAN_DURATION_DAYS),
        total_paid_amount: currentState.totalPaidAmount + plan.price,
      },
      { onConflict: "streamer_id,user_id" },
    );

  if (error) {
    throw error;
  }

  return loadStreamerMembershipState(streamerId, userId);
}

export async function loadPostReactionSummaries(postIds: string[], userId?: string) {
  if (postIds.length === 0) {
    return new Map<string, PostReactionSummary>();
  }

  const { data, error } = await supabase
    .from("streamer_post_reactions")
    .select("post_id, reaction_type, user_id")
    .in("post_id", postIds);

  if (error) {
    throw error;
  }

  const summaries = new Map<string, PostReactionSummary>();

  for (const postId of postIds) {
    summaries.set(postId, {
      postId,
      counts: createEmptyCounts(),
      activeReactions: [],
    });
  }

  for (const row of (data ?? []) as ReactionRow[]) {
    const summary = summaries.get(row.post_id);

    if (!summary) {
      continue;
    }

    summary.counts[row.reaction_type] += 1;

    if (userId && row.user_id === userId && !summary.activeReactions.includes(row.reaction_type)) {
      summary.activeReactions.push(row.reaction_type);
    }
  }

  return summaries;
}

export async function togglePostReaction(postId: string, userId: string, reactionType: PostReactionType, isActive: boolean) {
  if (isActive) {
    const { error } = await supabase
      .from("streamer_post_reactions")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId)
      .eq("reaction_type", reactionType);

    if (error) {
      throw error;
    }

    return false;
  }

  const { error } = await supabase
    .from("streamer_post_reactions")
    .insert({
      post_id: postId,
      user_id: userId,
      reaction_type: reactionType,
    });

  if (error && error.code !== "23505") {
    throw error;
  }

  return true;
}

export async function loadDonationLinkByStreamerId(streamerId: string) {
  const { data, error } = await supabase
    .from("streamer_donation_links")
    .select("id, slug, title, description, minimum_amount, is_active")
    .eq("streamer_id", streamerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as DonationLinkRow | null;
}

export async function loadManagedDonationLink(user: AppUser) {
  const streamer = await resolveLinkedStreamer({
    userId: user.id,
    tiktokUsername: user.tiktokUsername,
    displayName: user.displayName,
    claimIfNeeded: true,
  });

  if (!streamer) {
    return null;
  }

  return loadDonationLinkByStreamerId(streamer.id);
}

export async function saveManagedDonationLink(user: AppUser, draft: DonationLinkDraft) {
  const streamer = await resolveLinkedStreamer({
    userId: user.id,
    tiktokUsername: user.tiktokUsername,
    displayName: user.displayName,
    claimIfNeeded: true,
  });

  if (!streamer) {
    throw new Error("Профиль стримера в базе ещё не создан.");
  }

  const { data, error } = await supabase
    .from("streamer_donation_links")
    .upsert(
      {
        streamer_id: streamer.id,
        slug: normalizeSlug(draft.slug),
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        minimum_amount: Math.max(10, Math.round(draft.minimumAmount)),
        is_active: draft.isActive,
      },
      { onConflict: "streamer_id" },
    )
    .select("id, slug, title, description, minimum_amount, is_active")
    .single();

  if (error) {
    throw error;
  }

  return data as DonationLinkRow;
}

export async function loadDonationLinkBySlug(slug: string) {
  const { data, error } = await supabase
    .from("streamer_donation_links")
    .select("id, streamer_id, slug, title, description, minimum_amount, is_active, streamers(display_name, tiktok_username, avatar_url)")
    .eq("slug", normalizeSlug(slug))
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function loadDonationOverlayBySlug(slug: string, accessKey?: string) {
  const { data, error } = await supabase
    .from("streamer_donation_links")
    .select("id, streamer_id, slug, title, description, minimum_amount, is_active, streamers(display_name, tiktok_username, avatar_url)")
    .eq("slug", normalizeSlug(slug))
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const { data: settings, error: settingsError } = await supabase
    .from("streamer_page_settings")
    .select("layout")
    .eq("streamer_id", data.streamer_id)
    .maybeSingle();

  if (settingsError) {
    throw settingsError;
  }

  const overlay = parseDonationOverlaySettings(settings?.layout ?? null);
  if (!overlay.accessKey || overlay.accessKey !== accessKey) {
    return null;
  }

  return {
    ...data,
    overlay,
  };
}

export async function loadRecentDonationEvents(streamerId: string, limit = 6) {
  const { data, error } = await supabase
    .from("donation_events")
    .select("id, donor_name, amount, message, created_at")
    .eq("streamer_id", streamerId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{
    id: string;
    donor_name: string;
    amount: number;
    message: string | null;
    created_at: string;
  }>).map(
    (row): DonationEventSummary => ({
      id: row.id,
      donorName: row.donor_name,
      amount: row.amount,
      message: row.message,
      createdAt: new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(row.created_at)),
    }),
  );
}

export async function createDonationEvent(input: {
  streamerId: string;
  donationLinkId: string;
  donorUserId: string;
  donorName: string;
  amount: number;
  message?: string;
}) {
  const { data, error } = await supabase
    .from("donation_events")
    .insert({
      streamer_id: input.streamerId,
      donation_link_id: input.donationLinkId,
      donor_user_id: input.donorUserId,
      donor_name: input.donorName.trim(),
      amount: Math.max(10, Math.round(input.amount)),
      message: input.message?.trim() || null,
      status: "succeeded",
    })
    .select("id, donor_name, amount, message, created_at")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    donorName: data.donor_name,
    amount: data.amount,
    message: data.message,
    createdAt: new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(data.created_at)),
  } satisfies DonationEventSummary;
}