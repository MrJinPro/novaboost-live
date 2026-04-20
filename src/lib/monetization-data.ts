import { supabase } from "@/integrations/supabase/client";
import { convertCurrency } from "@/lib/currency";
import type { SupportedCurrency } from "@/lib/currency";
import type { AppUser, DonationEventSummary, DonationGoalProgress, DonationOverlaySettings, DonationOverlayVariant, DonationWidgetEntry, PostReactionType, SubscriptionPlanKey } from "@/lib/mock-platform";
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

export type DonationOverlayEvent = {
  id: string;
  donorName: string;
  amount: number;
  currency: string;
  message: string;
  createdAt: string;
};

type DonationEventRow = {
  id: string;
  donor_name: string;
  amount: number;
  message: string | null;
  created_at: string;
  source: string;
};

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

type DonationEventSourcePayload = {
  originalCurrency: SupportedCurrency;
  originalAmount: number;
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

  const displayMode = overlay?.displayMode === "preferred" ? "preferred" : "original";
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

function encodeDonationEventSource(payload: DonationEventSourcePayload) {
  return `novaboost-donation:${JSON.stringify(payload)}`;
}

function decodeDonationEventSource(value: string | null | undefined): DonationEventSourcePayload | null {
  if (!value || !value.startsWith("novaboost-donation:")) {
    return null;
  }

  try {
    const raw = JSON.parse(value.slice("novaboost-donation:".length)) as Partial<DonationEventSourcePayload>;
    if (
      (raw.originalCurrency === "USD" || raw.originalCurrency === "RUB" || raw.originalCurrency === "KZT" || raw.originalCurrency === "MDL")
      && typeof raw.originalAmount === "number"
      && Number.isFinite(raw.originalAmount)
    ) {
      return {
        originalCurrency: raw.originalCurrency,
        originalAmount: raw.originalAmount,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function resolveOverlayMoney(
  amountRub: number,
  overlay: DonationOverlaySettings,
  source: string | null | undefined,
) {
  const original = decodeDonationEventSource(source);

  if (overlay.displayMode === "original" && original) {
    return {
      amount: original.originalAmount,
      currency: original.originalCurrency,
    };
  }

  const targetCurrency = overlay.displayMode === "preferred"
    ? overlay.displayCurrency
    : original?.originalCurrency ?? "RUB";

  return {
    amount: convertCurrency(amountRub, "RUB", targetCurrency),
    currency: targetCurrency,
  };
}

function startOfCurrentDayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

async function loadDonationRows(streamerId: string, options?: { since?: string; limit?: number }) {
  let query = supabase
    .from("donation_events")
    .select("id, donor_name, amount, message, created_at, source")
    .eq("streamer_id", streamerId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false });

  if (options?.since) {
    query = query.gte("created_at", options.since);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as DonationEventRow[];
}

function aggregateDonationRows(rows: DonationEventRow[], currency: SupportedCurrency): DonationWidgetEntry[] {
  const totals = new Map<string, DonationWidgetEntry>();

  for (const row of rows) {
    const current = totals.get(row.donor_name) ?? {
      donorName: row.donor_name,
      amount: 0,
      currency,
      donationCount: 0,
    };

    current.amount += convertCurrency(row.amount, "RUB", currency);
    current.donationCount += 1;
    totals.set(row.donor_name, current);
  }

  return Array.from(totals.values())
    .sort((left, right) => right.amount - left.amount || right.donationCount - left.donationCount)
    .slice(0, 5)
    .map((entry) => ({
      ...entry,
      amount: Number(entry.amount.toFixed(2)),
    }));
}

export async function loadDonationWidgetEntries(streamerId: string, widget: "top-day" | "top-all-time", currency: SupportedCurrency) {
  const rows = await loadDonationRows(streamerId, {
    since: widget === "top-day" ? startOfCurrentDayIso() : undefined,
  });

  return aggregateDonationRows(rows, currency);
}

export async function loadDonationGoalProgress(streamerId: string): Promise<DonationGoalProgress> {
  const { data: settings, error: settingsError } = await supabase
    .from("streamer_page_settings")
    .select("layout")
    .eq("streamer_id", streamerId)
    .maybeSingle();

  if (settingsError) {
    throw settingsError;
  }

  const overlay = parseDonationOverlaySettings(settings?.layout ?? null);
  const rows = await loadDonationRows(streamerId);
  const currentAmount = rows.reduce((sum, row) => sum + convertCurrency(row.amount, "RUB", overlay.goalCurrency), 0);

  return {
    title: overlay.goalTitle,
    currentAmount: Number(currentAmount.toFixed(2)),
    targetAmount: overlay.goalTarget,
    currency: overlay.goalCurrency,
    progressPercent: Math.max(0, Math.min(100, (currentAmount / overlay.goalTarget) * 100)),
  };
}

const PLAN_DURATION_DAYS = 30;

export const SUBSCRIPTION_PLANS: SubscriptionPlanDefinition[] = [
  {
    key: "free",
    title: "Подписка",
    price: 0,
    description: "Базовая подписка на стримера внутри NovaBoost без платного доступа.",
    perks: ["общедоступные посты", "анонсы эфиров"],
  },
  {
    key: "supporter",
    title: "Boost 2.90",
    price: 2.9,
    description: "Первый платный уровень доступа к контенту стримера.",
    perks: ["платные посты 2.90", "ранние анонсы"],
  },
  {
    key: "superfan",
    title: "Boost 5.90",
    price: 5.9,
    description: "Расширенный платный доступ к более глубокому контенту.",
    perks: ["платные посты 5.90", "закрытые анонсы", "доп. сигналы"],
  },
  {
    key: "legend",
    title: "Boost 10.90",
    price: 10.9,
    description: "Максимальный платный доступ для ядра аудитории.",
    perks: ["платные посты 10.90", "все уровни ниже", "макс. доступ"],
  },
];

export function getPaidSubscriptionPlans() {
  return SUBSCRIPTION_PLANS.filter((plan) => plan.key !== "free");
}

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

export async function loadLatestDonationOverlayEvent(streamerId: string): Promise<DonationOverlayEvent | null> {
  const { data: settings, error: settingsError } = await supabase
    .from("streamer_page_settings")
    .select("layout")
    .eq("streamer_id", streamerId)
    .maybeSingle();

  if (settingsError) {
    throw settingsError;
  }

  const overlay = parseDonationOverlaySettings(settings?.layout ?? null);
  const { data, error } = await supabase
    .from("donation_events")
    .select("id, donor_name, amount, message, created_at, status, source")
    .eq("streamer_id", streamerId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const money = resolveOverlayMoney(data.amount, overlay, data.source);

  return {
    id: data.id,
    donorName: data.donor_name,
    amount: money.amount,
    currency: money.currency,
    message: data.message ?? "",
    createdAt: data.created_at,
  };
}

export async function createDonationEvent(input: {
  streamerId: string;
  donationLinkId: string;
  donorUserId: string;
  donorName: string;
  amount: number;
  message?: string;
  originalCurrency?: SupportedCurrency;
  originalAmount?: number;
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
      source: input.originalCurrency && typeof input.originalAmount === "number" && Number.isFinite(input.originalAmount)
        ? encodeDonationEventSource({
          originalCurrency: input.originalCurrency,
          originalAmount: input.originalAmount,
        })
        : "novaboost-donation",
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