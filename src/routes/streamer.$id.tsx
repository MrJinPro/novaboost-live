import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Header } from "@/components/Header";
import { LiveIndicator } from "@/components/LiveIndicator";
import { HowItWorksLink } from "@/components/HowItWorksLink";
import { BoostBadge } from "@/components/BoostBadge";
import { ProjectHelpPanel } from "@/components/ProjectHelpPanel";
import { AppAvatar } from "@/components/AppAvatar";
import { LocalizedPrice } from "@/components/LocalizedPrice";
import { usePaymentComingSoonSurvey } from "@/components/PaymentComingSoonDialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bell, ChevronDown, Crown, Eye, ExternalLink, Facebook, Instagram, Play, Send, Sparkles, Twitter, Users, Wallet, Zap, TrendingUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatNumber } from "@/lib/format";
import { getLocalizedMoney, useCurrencyPreference } from "@/lib/currency";
import type { PostReactionType, StreamerPageData, StreamerPost, SubscriptionPlanKey } from "@/lib/mock-platform";
import { getPaidSubscriptionPlans, getSubscriptionPlanLabel, loadPostReactionSummaries, loadStreamerMembershipState, SUBSCRIPTION_PLANS, togglePostReaction, type PostReactionSummary, type StreamerMembershipState } from "@/lib/monetization-data";
import { calculateCustomerAmount, groupTikTokPromotionServices, loadTikTokPromotionServices, type TikTokPromotionService } from "@/lib/prmotion-data";
import { resolveSocialLinkHref } from "@/lib/streamer-page-config";
import { getOwnedStreamerPublicPage, getStreamerSubscriptionState, loadPublicStreamerPage, toggleStreamerSubscription } from "@/lib/streamer-studio-data";
import { loadStreamerTrackingDetails, resolveLiveStatus, type ResolvedLiveStatus, type StreamTrackingDetails } from "@/lib/live-status-data";
import { toast } from "sonner";

const STREAMER_PAGE_REFRESH_MS = 5_000;

export const Route = createFileRoute("/streamer/$id")({
  component: StreamerProfile,
});

const PLAN_ORDER: Record<SubscriptionPlanKey, number> = {
  free: 0,
  supporter: 1,
  superfan: 2,
  legend: 3,
};

const REACTION_META: Record<PostReactionType, { label: string; icon: string }> = {
  nova: { label: "Искра", icon: "✨" },
  flare: { label: "Огонь", icon: "🔥" },
  pulse: { label: "Импульс", icon: "⚡" },
  crown: { label: "Респект", icon: "👑" },
};

function parseTrackingNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function deriveTrackingCounters(details: StreamTrackingDetails | null) {
  let totalLikes = 0;
  let maxTotalLikes = 0;
  let totalGifts = 0;
  let totalMessages = 0;
  let peakViewerCount = 0;

  for (const event of details?.recentEvents ?? []) {
    const payload = (event.normalized_payload ?? {}) as Record<string, unknown>;

    if (event.event_type === "chat_message") {
      totalMessages += 1;
      continue;
    }

    if (event.event_type === "like_received") {
      maxTotalLikes = Math.max(maxTotalLikes, parseTrackingNumber(payload.total_like_count) ?? 0);
      totalLikes += Math.max(1, parseTrackingNumber(payload.like_count) ?? 1);
      continue;
    }

    if (event.event_type === "snapshot_updated") {
      maxTotalLikes = Math.max(maxTotalLikes, parseTrackingNumber(payload.like_count) ?? 0);
    }

    if (event.event_type === "gift_received") {
      totalGifts += Math.max(1, parseTrackingNumber(payload.gift_count) ?? 1);
      continue;
    }

    if (event.event_type === "snapshot_updated" || event.event_type === "live_started") {
      peakViewerCount = Math.max(peakViewerCount, parseTrackingNumber(payload.viewer_count) ?? 0);
    }
  }

  return {
    totalLikes: Math.max(totalLikes, maxTotalLikes),
    totalGifts,
    totalMessages,
    peakViewerCount,
  };
}

function canAccessPost(post: StreamerPost, membership: StreamerMembershipState) {
  return PLAN_ORDER[membership.planKey] >= PLAN_ORDER[post.requiredPlan];
}

function StreamerProfile() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currencyPreference = useCurrencyPreference();
  const [subscribed, setSubscribed] = useState(false);
  const [streamer, setStreamer] = useState<StreamerPageData | null>(null);
  const [trackingDetails, setTrackingDetails] = useState<StreamTrackingDetails | null>(null);
  const [liveStatus, setLiveStatus] = useState<ResolvedLiveStatus | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageRefreshing, setPageRefreshing] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [membershipState, setMembershipState] = useState<StreamerMembershipState>({ subscribed: false, planKey: "free", paidUntil: null, totalPaidAmount: 0 });
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [reactionSummaries, setReactionSummaries] = useState<Map<string, PostReactionSummary>>(new Map());
  const [promotionServices, setPromotionServices] = useState<TikTokPromotionService[]>([]);
  const [activePromotionGroupKey, setActivePromotionGroupKey] = useState("");
  const [showGrowthTools, setShowGrowthTools] = useState(false);
  const [inviteReferral, setInviteReferral] = useState<{ id: string; displayName: string; tiktokUsername: string } | null>(null);
  const { openSurvey, surveyDialog } = usePaymentComingSoonSurvey();

  useEffect(() => {
    let active = true;

    if (!user?.isStreamer) {
      setInviteReferral(null);
      return;
    }

    const loadInviteReferral = async () => {
      try {
        const page = await getOwnedStreamerPublicPage(user.id);
        if (active && page) {
          setInviteReferral({
            id: page.id,
            displayName: page.displayName,
            tiktokUsername: page.tiktokUsername,
          });
        }
      } catch {
        if (active) {
          setInviteReferral(null);
        }
      }
    };

    void loadInviteReferral();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const syncPage = async (background = false) => {
      if (background) {
        setPageRefreshing(true);
      } else {
        setPageLoading(true);
      }

      try {
        const page = await loadPublicStreamerPage(id);
        if (active) {
          setStreamer(page);
        }

        if (page) {
          const [details, nextLiveStatus] = await Promise.all([
            loadStreamerTrackingDetails(page.id).catch(() => null),
            resolveLiveStatus(page.tiktok_username).catch(() => null),
          ]);
          if (active) {
            setTrackingDetails(details);
            setLiveStatus(nextLiveStatus);
          }
        } else if (active) {
          setTrackingDetails(null);
          setLiveStatus(null);
        }
      } catch (error) {
        if (active) {
          setStreamer(null);
          setTrackingDetails(null);
          setLiveStatus(null);
          if (!background) {
            toast.error(error instanceof Error ? error.message : "Не удалось загрузить публичную страницу стримера");
          }
        }
      } finally {
        if (active) {
          if (background) {
            setPageRefreshing(false);
          } else {
            setPageLoading(false);
          }

          timer = setTimeout(() => {
            void syncPage(true);
          }, STREAMER_PAGE_REFRESH_MS);
        }
      }
    };

    void syncPage();

    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [id]);

  useEffect(() => {
    let active = true;

    if (!streamer || !user || streamer.owner_user_id === user.id || streamer.is_registered === false) {
      setSubscribed(false);
      return;
    }

    const syncSubscription = async () => {
      try {
        const nextValue = await getStreamerSubscriptionState(id, user.id);
        if (active) {
          setSubscribed(nextValue);
        }
      } catch {
        if (active) {
          setSubscribed(false);
        }
      }
    };

    void syncSubscription();

    return () => {
      active = false;
    };
  }, [id, streamer, user]);

  useEffect(() => {
    let active = true;

    if (!streamer || streamer.is_registered === false) {
      setMembershipState({ subscribed: false, planKey: "free", paidUntil: null, totalPaidAmount: 0 });
      return;
    }

    const syncMembership = async () => {
      setMembershipLoading(true);
      try {
        const nextState = await loadStreamerMembershipState(streamer.id, user?.id);
        if (active) {
          setMembershipState(nextState);
        }
      } catch {
        if (active) {
          setMembershipState({ subscribed: false, planKey: "free", paidUntil: null, totalPaidAmount: 0 });
        }
      } finally {
        if (active) {
          setMembershipLoading(false);
        }
      }
    };

    void syncMembership();

    return () => {
      active = false;
    };
  }, [streamer, user]);

  useEffect(() => {
    let active = true;

    const syncServices = async () => {
      try {
        const nextServices = await loadTikTokPromotionServices();
        if (active) {
          setPromotionServices(nextServices);
        }
      } catch {
        if (active) {
          setPromotionServices([]);
        }
      }
    };

    void syncServices();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!streamer || streamer.is_registered === false) {
      setReactionSummaries(new Map());
      return;
    }

    const syncReactions = async () => {
      try {
        const summaries = await loadPostReactionSummaries(
          streamer.posts.map((post) => post.id),
          user?.id,
        );

        if (active) {
          setReactionSummaries(summaries);
        }
      } catch {
        if (active) {
          setReactionSummaries(new Map());
        }
      }
    };

    void syncReactions();

    return () => {
      active = false;
    };
  }, [streamer, user]);

  const promotionGroups = groupTikTokPromotionServices(promotionServices);
  const activePromotionGroup = promotionGroups.find((group) => group.key === activePromotionGroupKey) ?? promotionGroups[0] ?? null;

  useEffect(() => {
    if (!promotionGroups.length) {
      if (activePromotionGroupKey) {
        setActivePromotionGroupKey("");
      }
      return;
    }

    if (!promotionGroups.some((group) => group.key === activePromotionGroupKey)) {
      setActivePromotionGroupKey(promotionGroups[0].key);
    }
  }, [activePromotionGroupKey, promotionGroups]);

  if (!streamer && pageLoading) {
    return (
      <div className="min-h-screen"><Header />
        <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">Загрузка публичной страницы…</div>
      </div>
    );
  }

  if (!streamer) {
    return (
      <div className="min-h-screen"><Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="font-display text-2xl font-bold">Стример не найден</h1>
          <Link to="/streamers"><Button className="mt-4">К каталогу</Button></Link>
        </div>
      </div>
    );
  }

  const boosted = streamer.total_boost_amount > 0;
  const isRegistered = streamer.is_registered ?? Boolean(streamer.owner_user_id);
  const trackingCounters = deriveTrackingCounters(trackingDetails);
  const resolvedIsLive = trackingDetails?.realtimeState?.isLive
    ?? trackingDetails?.state?.is_live
    ?? liveStatus?.isLive
    ?? streamer.is_live;
  const liveViewerCount = trackingDetails?.realtimeState?.viewerCount
    ?? trackingDetails?.state?.viewer_count
    ?? trackingDetails?.latestSession?.current_viewer_count
    ?? liveStatus?.viewerCount
    ?? streamer.viewer_count;
  const resolvedFollowersCount = Math.max(streamer.followers_count ?? 0, liveStatus?.followersCount ?? 0);
  const liveLikes = Math.max(
    streamer.total_likes,
    trackingDetails?.realtimeState?.likeCount ?? 0,
    trackingDetails?.latestSession?.like_count ?? 0,
    trackingCounters.totalLikes,
  );
  const liveGifts = Math.max(
    streamer.total_gifts,
    trackingDetails?.realtimeState?.giftCount ?? 0,
    trackingDetails?.latestSession?.gift_count ?? 0,
    trackingCounters.totalGifts,
  );
  const liveMessages = Math.max(
    streamer.total_messages ?? 0,
    trackingDetails?.realtimeState?.messageCount ?? 0,
    trackingDetails?.latestSession?.message_count ?? 0,
    trackingCounters.totalMessages,
  );
  const livePeakViewers = Math.max(
    streamer.peak_viewer_count ?? 0,
    trackingDetails?.latestSession?.peak_viewer_count ?? 0,
    trackingDetails?.realtimeState?.viewerCount ?? 0,
    trackingCounters.peakViewerCount,
  );
  const hasFeaturedVideo = Boolean(streamer.featured_video_url);
  const featuredVideoCover = streamer.featured_video_url ?? streamer.videos[0]?.cover ?? "";
  const membershipPlan = SUBSCRIPTION_PLANS.find((plan) => plan.key === streamer.membership_settings?.highlightedPlanKey)
    ?? getPaidSubscriptionPlans()[0];
  const showPaidMembership = isRegistered && Boolean(streamer.membership_settings?.paidEnabled);
  const socialButtons = [
    { key: "telegram", icon: <Send className="h-4 w-4" />, href: resolveSocialLinkHref("telegram", streamer.social_links?.telegram ?? streamer.telegram_channel ?? ""), label: "Telegram" },
    { key: "instagram", icon: <Instagram className="h-4 w-4" />, href: resolveSocialLinkHref("instagram", streamer.social_links?.instagram ?? ""), label: "Instagram" },
    { key: "facebook", icon: <Facebook className="h-4 w-4" />, href: resolveSocialLinkHref("facebook", streamer.social_links?.facebook ?? ""), label: "Facebook" },
    { key: "twitter", icon: <Twitter className="h-4 w-4" />, href: resolveSocialLinkHref("twitter", streamer.social_links?.twitter ?? ""), label: "X" },
  ].filter((item) => item.href);

  const handleCopyInviteLink = async () => {
    if (typeof window === "undefined") {
      return;
    }

    const inviteUrl = new URL("/auth", window.location.origin);
    inviteUrl.searchParams.set("mode", "signup");
    inviteUrl.searchParams.set("tiktok", streamer.tiktok_username);

    if (inviteReferral) {
      inviteUrl.searchParams.set("ref", inviteReferral.id);
      inviteUrl.searchParams.set("refName", inviteReferral.displayName);
      inviteUrl.searchParams.set("refUsername", inviteReferral.tiktokUsername);
    }

    try {
      await navigator.clipboard.writeText(inviteUrl.toString());
      toast.success("Ссылка-приглашение скопирована. TikTok username уже зафиксирован в форме регистрации.");
    } catch {
      toast.error("Не удалось скопировать ссылку. Попробуй ещё раз.");
    }
  };

  const handleSubscription = async () => {
    if (!isRegistered) {
      toast.error("Этот стример ещё не зарегистрирован в NovaBoost Live. Пока мы отслеживаем только его live-статус.");
      return;
    }

    if (!user) {
      toast.error("Войди в аккаунт, чтобы подписываться на стримеров");
      navigate({ to: "/auth" });
      return;
    }

    if (streamer.owner_user_id === user.id) {
      toast.error("Нельзя подписаться на собственную страницу");
      return;
    }

    setSubscriptionLoading(true);
    try {
      const nextValue = await toggleStreamerSubscription(streamer.id, user.id, subscribed);
      setSubscribed(nextValue);
      setStreamer((current) => current ? {
        ...current,
        subscription_count: Math.max(0, current.subscription_count + (nextValue ? 1 : -1)),
      } : current);
      toast.success(nextValue ? "Подписка оформлена" : "Подписка отменена");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось обновить подписку");
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handlePlanUpgrade = (planKey: SubscriptionPlanKey) => {
    if (!isRegistered) {
      toast.error("Платные сценарии станут доступны после регистрации стримера в NovaBoost Live.");
      return;
    }

    const plan = SUBSCRIPTION_PLANS.find((item) => item.key === planKey);
    openSurvey({
      userId: user?.id ?? null,
      entryPoint: "streamer-plan",
      triggerLabel: `plan-${planKey}`,
      title: `Тариф ${plan?.title ?? planKey} для ${streamer.display_name}`,
      description: "Оплата тарифов ещё не включена. По кнопке мы просто собираем предпочтительный способ оплаты, чтобы запустить подписки с правильным gateway. / Membership payments are not live yet. We are only collecting preferred payment methods before launch.",
      context: {
        streamerId: streamer.id,
        streamerName: streamer.display_name,
        planKey,
        planTitle: plan?.title ?? planKey,
        priceRub: plan?.price ?? 0,
      },
    });
  };

  const handleReactionToggle = async (postId: string, reactionType: PostReactionType) => {
    if (!isRegistered) {
      toast.error("Для незарегистрированного стримера доступны только live-метрики и статус эфира.");
      return;
    }

    if (!user) {
      toast.error("Войди как зритель, чтобы ставить реакции");
      navigate({ to: "/auth" });
      return;
    }

    if (user.role !== "viewer") {
      toast.error("Реакции доступны только зрителям");
      return;
    }

    const currentSummary = reactionSummaries.get(postId);
    const isActive = currentSummary?.activeReactions.includes(reactionType) ?? false;

    try {
      const nextActive = await togglePostReaction(postId, user.id, reactionType, isActive);
      setReactionSummaries((current) => {
        const next = new Map(current);
        const summary = next.get(postId) ?? {
          postId,
          counts: { nova: 0, flare: 0, pulse: 0, crown: 0 },
          activeReactions: [],
        };

        next.set(postId, {
          ...summary,
          counts: {
            ...summary.counts,
            [reactionType]: Math.max(0, summary.counts[reactionType] + (nextActive ? 1 : -1)),
          },
          activeReactions: nextActive
            ? [...summary.activeReactions, reactionType].filter((value, index, array) => array.indexOf(value) === index)
            : summary.activeReactions.filter((value) => value !== reactionType),
        });

        return next;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось обновить реакцию");
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-5 md:py-6">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/streamers" })} className="gap-1.5 -ml-3">
          <ArrowLeft className="h-4 w-4" /> К каталогу
        </Button>

        <div className="mt-6 overflow-hidden rounded-3xl border border-border/50 bg-surface/70">
          <div className={`relative h-36 w-full overflow-hidden bg-linear-to-r sm:h-44 ${streamer.accent}`} style={{ backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.08), rgba(8,12,20,0.22)), url(${streamer.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" }}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_36%)]" />
            <div className="absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-background/45 to-transparent" />
            <div className="absolute right-4 top-4 hidden rounded-full border border-white/15 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-white/75 sm:block">
              NovaBoost Live
            </div>
          </div>

          <div className={`relative px-4 pb-5 sm:px-6 sm:pb-6 md:px-10 md:pb-10 ${boosted ? "shadow-glow" : ""}`}>
            <div className="relative -mt-12 flex flex-col gap-5 md:-mt-14 md:flex-row md:items-end md:gap-6">
              <div className="relative shrink-0">
                <AppAvatar
                  src={streamer.avatar_url ?? ""}
                  name={streamer.display_name}
                  className={`h-24 w-24 rounded-full bg-surface-2 object-cover ring-4 sm:h-28 sm:w-28 ${boosted ? "ring-blast/60" : "ring-border"}`}
                />
                {streamer.is_live && (
                  <span className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-live ring-4 ring-background animate-pulse-live" />
                )}
              </div>

              <div className="min-w-0 flex-1 pt-2 md:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl font-bold leading-tight sm:text-3xl md:text-4xl">{streamer.display_name}</h1>
                  {boosted && <span className="text-3xl text-crown">👑</span>}
                  {streamer.is_live && <LiveIndicator size="md" />}
                  {streamer.is_live && streamer.live_mode_label && (
                    <span className="rounded-full border border-cosmic/40 bg-cosmic/10 px-3 py-1 text-xs font-medium text-cosmic">
                      {streamer.live_mode_label}
                    </span>
                  )}
                  {streamer.is_live && streamer.live_status_label && streamer.live_status_label !== "В эфире" && (
                    <span className="rounded-full border border-border/60 bg-background/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                      {streamer.live_status_label}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-muted-foreground">@{streamer.tiktok_username}</div>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-foreground/90 sm:text-base">{streamer.tagline}</p>
                {streamer.bio && <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{streamer.bio}</p>}

                {!isRegistered && (
                  <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-50">
                    Этот стример ещё не зарегистрирован в NovaBoost Live. Сейчас мы показываем только его TikTok username и live-статус эфира. Пригласите владельца страницы подключиться, чтобы открыть бусты, подписки, контент и бонусы платформы.
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {streamer.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-border/60 bg-background/40 px-3 py-1 text-xs text-muted-foreground">
                      #{tag}
                    </span>
                  ))}
                </div>

                {boosted && (
                  <div className="mt-4">
                    <BoostBadge amount={streamer.total_boost_amount} />
                  </div>
                )}
              </div>

              <div className="flex w-full shrink-0 flex-col gap-3 pt-1 sm:pt-3 md:w-auto md:pt-0">
                {isRegistered ? (
                  <>
                    <Button size="lg" variant={subscribed ? "secondary" : "outline"} className="gap-2 w-full" onClick={handleSubscription} disabled={subscriptionLoading}>
                      <Bell className="h-4 w-4" /> {subscriptionLoading ? "Обновляю…" : subscribed ? "Подписка активна" : "Подписаться"}
                    </Button>
                    {showPaidMembership && membershipPlan ? (
                      <Button size="lg" variant={membershipState.planKey === membershipPlan.key ? "secondary" : "outline"} className="gap-2 w-full border-crown/40" onClick={() => void handlePlanUpgrade(membershipPlan.key)} disabled={membershipLoading}>
                        <Crown className="h-4 w-4 text-crown" /> {membershipState.planKey === membershipPlan.key ? "Boost-подписка активна" : `Оформить Boost-подписку ${membershipPlan.price.toFixed(2)}`}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
                    Внутренние действия NovaBoost Live пока закрыты. Доступно только отслеживание live-статуса этого TikTok-аккаунта.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <a href={`https://www.tiktok.com/@${streamer.tiktok_username}/live`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" className="w-full gap-2 bg-gradient-blast text-blast-foreground hover:opacity-90">
                      <ExternalLink className="h-4 w-4" /> TikTok LIVE
                    </Button>
                  </a>
                  {isRegistered ? (
                    <Link to="/boost" search={{ streamerId: streamer.id }}>
                      <Button size="sm" variant="outline" className="w-full gap-2 border-cosmic/40">
                        <Zap className="h-4 w-4 text-cosmic" /> Буст
                      </Button>
                    </Link>
                  ) : (
                    <Button size="sm" variant="outline" className="w-full gap-2 border-border/60 text-muted-foreground" disabled>
                      <Zap className="h-4 w-4" /> Boost недоступен
                    </Button>
                  )}
                </div>
                {user && !isRegistered && (
                  <Button type="button" variant="outline" className="w-full" onClick={handleCopyInviteLink}>
                    Скопировать ссылку-приглашение
                  </Button>
                )}
                {isRegistered && streamer.donation_link_slug ? (
                  <Link to="/support/$slug" params={{ slug: streamer.donation_link_slug }}>
                    <Button size="sm" variant="outline" className="gap-2 w-full border-blast/40 hover:bg-blast/10">
                      <Wallet className="h-4 w-4 text-blast" /> Поддержать стримера
                    </Button>
                  </Link>
                ) : null}
                {socialButtons.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {socialButtons.map((item) => (
                      <a key={item.key} href={item.href ?? undefined} target="_blank" rel="noopener noreferrer" aria-label={item.label} title={item.label}>
                        <Button size="icon" variant="outline" className="h-10 w-10 border-border/60 bg-background/30">
                          {item.icon}
                        </Button>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <div className="rounded-full border border-border/50 bg-background/30 px-3 py-1 text-xs text-muted-foreground">
            {pageRefreshing ? "Обновляю live-метрики…" : `Live refresh каждые ${Math.floor(STREAMER_PAGE_REFRESH_MS / 1000)} сек`}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<Eye className="h-5 w-5" />} label="Зрителей сейчас" value={resolvedIsLive ? formatNumber(liveViewerCount) : "—"} accent="live" />
          <StatCard icon={<Users className="h-5 w-5" />} label="TikTok подписчиков" value={formatNumber(resolvedFollowersCount)} />
          <StatCard icon={<Zap className="h-5 w-5" />} label="Поддержка сообщества" value={formatNumber(streamer.total_boost_amount)} accent="blast" />
          <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Подписки в платформе" value={formatNumber(streamer.subscription_count)} />
          <StatCard icon={<Sparkles className="h-5 w-5" />} label="Лайков в эфире" value={formatNumber(liveLikes)} accent="blast" />
          <StatCard icon={<Wallet className="h-5 w-5" />} label="Подарков" value={formatNumber(liveGifts)} />
          <StatCard icon={<Bell className="h-5 w-5" />} label="Сообщений в чате" value={formatNumber(liveMessages)} />
          <StatCard icon={<Play className="h-5 w-5" />} label="Пик зрителей" value={formatNumber(livePeakViewers)} accent="live" />
        </div>

        <div className="mt-8 flex justify-center">
          <HowItWorksLink />
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Публичный профиль</div>
                <h2 className="mt-2 font-display text-xl font-bold sm:text-2xl">О стримере</h2>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/30 px-4 py-3 text-right">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">TikTok LIVE</div>
                <div className="mt-1 font-semibold">@{streamer.tiktok_username}</div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border/50 bg-background/30 p-5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Позиционирование</div>
                <p className="mt-3 text-base leading-7 text-foreground/90">{streamer.tagline}</p>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {isRegistered
                    ? (streamer.bio || "Стример ещё не заполнил расширенное описание, но страница уже готова принимать подписчиков, посты и короткий видеоконтент.")
                    : "Это tracked-only карточка. Мы отслеживаем live-статус и базовые TikTok-метрики, пока владелец не зарегистрируется в NovaBoost Live и не активирует полную страницу."}
                </p>
              </div>

              <div className="rounded-2xl border border-border/50 bg-background/30 p-5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Что есть на странице</div>
                <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                  {streamer.is_live && (streamer.live_mode_label || streamer.live_status_label) && (
                    <div className="rounded-xl border border-cosmic/30 bg-cosmic/5 px-4 py-3 text-foreground">
                      {streamer.live_mode_label ? `Режим эфира: ${streamer.live_mode_label}. ` : ""}
                      {streamer.live_status_label ? `Статус комнаты: ${streamer.live_status_label}.` : ""}
                    </div>
                  )}
                  <div className="rounded-xl border border-border/40 bg-surface/60 px-4 py-3">Здесь видны username, аватар, баннер и текущее live-состояние.</div>
                  <div className="rounded-xl border border-border/40 bg-surface/60 px-4 py-3">{isRegistered ? "Здесь публикуются анонсы, новости и посты между эфирами." : "Пока здесь нет внутренних постов, подписок и донатов NovaBoost Live."}</div>
                  <div className="rounded-xl border border-border/40 bg-surface/60 px-4 py-3">{isRegistered ? "Короткие видео и отдельный блок для главного видео появляются только если их добавили." : "После регистрации стример сможет настроить полную страницу, бонусы, бусты и отдельный медиаблок."}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-border/50 bg-surface/60">
            <div className="relative min-h-72 bg-surface-2 sm:min-h-80">
              {featuredVideoCover ? (
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `linear-gradient(180deg, rgba(8,10,16,0.08), rgba(8,10,16,0.88)), url(${featuredVideoCover})` }}
                />
              ) : (
                <div className={`absolute inset-0 bg-linear-to-br ${streamer.accent}`} />
              )}
              <div className="relative flex h-full min-h-72 flex-col justify-end p-5 sm:min-h-80 sm:p-6">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/80">
                  <Play className="h-3.5 w-3.5" /> {isRegistered ? "Главное видео" : "Статус страницы"}
                </div>
                <h2 className="mt-4 max-w-lg font-display text-2xl font-bold text-white sm:text-3xl">{isRegistered ? `${streamer.display_name} показывает страницу не только для live, но и между эфирами.` : `${streamer.display_name} пока доступен в каталоге только как отслеживаемый TikTok-аккаунт.`}</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">{isRegistered ? "Этот блок можно использовать для главного видео страницы: анонса следующего эфира, лучшего фрагмента или короткого знакомства." : "Мы продолжаем отслеживать эфир и live-статус. Пригласите этого стримера зарегистрироваться в NovaBoost Live, чтобы открыть полную публичную страницу."}</p>
                <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap">
                  <a href={`https://www.tiktok.com/@${streamer.tiktok_username}/live`} target="_blank" rel="noopener noreferrer">
                    <Button className="w-full gap-2 bg-white text-black hover:bg-white/90 sm:w-auto">
                      <ExternalLink className="h-4 w-4" /> Открыть TikTok LIVE
                    </Button>
                  </a>
                  {isRegistered && hasFeaturedVideo && (
                    <Button variant="outline" className="w-full gap-2 border-white/20 bg-black/20 text-white hover:bg-black/30 sm:w-auto">
                      <Play className="h-4 w-4" /> Главное видео добавлено
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold sm:text-2xl">Контент стримера</h2>
            <p className="mt-2 text-sm text-muted-foreground">{isRegistered ? "Платформа должна жить между эфирами, поэтому здесь посты, анонсы и сигналы для подписчиков." : "Пока стример не зарегистрирован, контентный слой NovaBoost Live не активирован."}</p>
            <div className="mt-5 space-y-3">
              {streamer.posts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/50 bg-background/20 p-5 text-sm text-muted-foreground">
                  {isRegistered ? "Пока нет опубликованных постов. Как только стример добавит анонс или новость в студии, они появятся здесь." : "У этого TikTok-аккаунта пока нет внутреннего контента NovaBoost Live. Мы показываем только live-статус и ждём регистрации владельца страницы."}
                </div>
              ) : (
                streamer.posts.map((post) => {
                  const summary = reactionSummaries.get(post.id);
                  const postLocked = !canAccessPost(post, membershipState);

                  return (
                    <article key={post.id} className="rounded-2xl border border-border/50 bg-background/30 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">{post.type}</span>
                        <span className="text-xs text-muted-foreground">{post.createdAt}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                        <span className="rounded-full border border-border/50 px-2.5 py-1">{getSubscriptionPlanLabel(post.requiredPlan)}</span>
                        {post.expiresAt && <span className="rounded-full border border-blast/30 px-2.5 py-1 text-blast">временный пост</span>}
                        {post.blurPreview && <span className="rounded-full border border-crown/40 px-2.5 py-1 text-crown">blur preview</span>}
                      </div>
                      <h3 className="mt-3 font-display font-bold text-lg">{post.title}</h3>
                      <div className={`mt-2 rounded-2xl ${postLocked && post.blurPreview ? "blur-sm select-none" : ""}`}>
                        <p className="text-sm text-muted-foreground">{post.body}</p>
                      </div>
                      {postLocked && (
                        <div className="mt-3 rounded-2xl border border-crown/30 bg-crown/5 p-4">
                          <div className="flex items-center gap-2 text-crown">
                            <Crown className="h-4 w-4" /> Доступ с тарифа {getSubscriptionPlanLabel(post.requiredPlan)}
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">Оформи нужный план, чтобы открыть полный пост и все закрытые сигналы этого стримера.</p>
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {(Object.entries(REACTION_META) as Array<[PostReactionType, { label: string; icon: string }]>)
                          .map(([reactionType, meta]) => {
                            const active = summary?.activeReactions.includes(reactionType) ?? false;
                            const count = summary?.counts[reactionType] ?? 0;
                            return (
                              <button
                                key={reactionType}
                                type="button"
                                onClick={() => void handleReactionToggle(post.id, reactionType)}
                                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${active ? "border-blast/40 bg-blast/10 text-foreground" : "border-border/50 bg-background/30 text-muted-foreground"}`}
                              >
                                {meta.icon} {meta.label} {count > 0 ? count : ""}
                              </button>
                            );
                          })}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="space-y-4">
            {isRegistered && streamer.donation_link_slug ? (
              <div>
                <div className="overflow-hidden rounded-4xl border border-blast/30 bg-[radial-gradient(circle_at_top,rgba(255,133,32,0.18),transparent_58%),linear-gradient(180deg,rgba(19,13,44,0.96),rgba(14,11,34,0.96))] p-5 sm:p-6 shadow-glow">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-blast" />
                    <h2 className="font-display text-xl font-bold sm:text-2xl">Поддержка стримера</h2>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {streamer.donation_link_title ?? "Поддержать эфир через NovaBoost Live"}
                  </p>
                  <div className="mt-4 grid gap-3 rounded-2xl border border-white/8 bg-black/15 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <div className="text-xs uppercase tracking-[0.25em] text-blast/80">Live support</div>
                      <div className="mt-2 font-display text-2xl font-bold">Поддержать стримера</div>
                      <div className="mt-2 text-sm text-muted-foreground">Сообщение и сумма сразу попадут в публичную ленту поддержек и могут улететь в OBS overlay.</div>
                    </div>
                    <Link to="/support/$slug" params={{ slug: streamer.donation_link_slug }}>
                      <Button className="w-full gap-2 bg-gradient-blast px-6 py-6 text-base font-bold text-blast-foreground sm:w-auto">
                        <Wallet className="h-4 w-4" /> Поддержать через NovaBoost Live
                      </Button>
                    </Link>
                  </div>
                  <div className="mt-4 space-y-2">
                    {streamer.recent_donations.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/50 bg-background/20 px-4 py-3 text-sm text-muted-foreground">
                        Пока нет публичных донатов. После первых поддержек здесь появятся карточки с именем и суммой.
                      </div>
                    ) : (
                      streamer.recent_donations.map((donation) => (
                        <div key={donation.id} className="rounded-2xl border border-blast/20 bg-blast/5 px-4 py-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium">{donation.donorName}</div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-blast">+{getLocalizedMoney(donation.amount, { baseCurrency: "RUB", preference: currencyPreference }).primary}</div>
                              {getLocalizedMoney(donation.amount, { baseCurrency: "RUB", preference: currencyPreference }).secondary && (
                                <div className="text-[11px] text-muted-foreground">{getLocalizedMoney(donation.amount, { baseCurrency: "RUB", preference: currencyPreference }).secondary}</div>
                              )}
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{donation.createdAt}</div>
                          {donation.message && <div className="mt-2 text-sm text-foreground/85">{donation.message}</div>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
              <h2 className="font-display font-bold text-xl">Сигналы платформы</h2>
              <p className="mt-3 text-sm text-muted-foreground">{streamer.next_event}</p>
              <p className="mt-3 text-sm text-muted-foreground">{streamer.support_goal}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <MiniStat label="Лайки" value={formatNumber(liveLikes)} />
                <MiniStat label="Подарки" value={formatNumber(liveGifts)} />
                <MiniStat label="Сообщения" value={formatNumber(liveMessages)} />
                <MiniStat label="Пик онлайна" value={formatNumber(livePeakViewers)} />
              </div>
            </div>

            <div className="rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display font-bold text-xl">Последние события эфира</h2>
                <div className="rounded-full border border-border/50 bg-background/30 px-3 py-1 text-xs text-muted-foreground">
                  {streamer.current_session_status === "live" ? "live session" : streamer.current_session_status ?? "нет активной сессии"}
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {(streamer.recent_live_events ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/50 bg-background/20 px-4 py-3 text-sm text-muted-foreground">
                    События эфира пока не накоплены в базе. Как только tracking начнёт писать stream_events, здесь появятся лайки, сообщения, входы зрителей и обновления онлайна.
                  </div>
                ) : (
                  (streamer.recent_live_events ?? []).map((event) => (
                    <div key={event.id} className="rounded-2xl border border-border/50 bg-background/30 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{event.title}</div>
                        <div className="text-xs text-muted-foreground">{event.createdAt}</div>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">{event.description}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
          <h2 className="font-display text-xl font-bold sm:text-2xl">Короткие видео и тизеры</h2>
          <p className="mt-2 text-sm text-muted-foreground">{isRegistered ? "Здесь собираются несколько видео стримера: тизеры, клипы и обложки главных моментов." : "Медиатека откроется после регистрации стримера в NovaBoost Live."}</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {streamer.videos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/50 bg-background/20 p-5 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                {isRegistered ? "Пока нет добавленных видео. После заполнения медиатеки здесь появится витрина роликов стримера." : "Пока владелец аккаунта не зарегистрировался, здесь будет только сообщение о tracking-only режиме."}
              </div>
            ) : (
              streamer.videos.map((video) => (
                <div key={video.id} className="group overflow-hidden rounded-2xl border border-border/50 bg-background/30">
                  <div className="relative h-44 bg-cover bg-center" style={{ backgroundImage: `url(${video.cover})` }}>
                    <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
                    <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs text-white/80">
                      <Play className="h-3.5 w-3.5" /> тизер
                    </div>
                    <div className="absolute bottom-4 right-4 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white/80">{video.duration}</div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-foreground">{video.title}</h3>
                      <span className="text-xs text-muted-foreground">#{streamer.tiktok_username}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {isRegistered ? (
        <section className="mt-6 rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/30 px-3 py-1 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-cosmic" /> Дополнительные инструменты
              </div>
              <h2 className="mt-3 font-display text-2xl font-bold">Рост внутри NovaBoost</h2>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Этот блок вынесен отдельно, потому что он не должен мешать основному знакомству со стримером. Здесь собраны внутренний boost и отдельные инструменты роста платформы.
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
              Сначала контент и поддержка стримера, потом дополнительные механики роста.
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-2xl border border-cosmic/30 bg-cosmic/5 p-5">
              <div className="flex items-center gap-2 text-cosmic">
                <Zap className="h-5 w-5" />
                <h3 className="font-display text-xl font-bold text-foreground">Boost сообщества</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Зрители могут поддержать стримера своими viewer points. Это поднимает его видимость внутри NovaBoost, но не является обещанием внешней накрутки или автоматического роста в TikTok.
              </p>
              <Link to="/boost" search={{ streamerId: streamer.id }}>
                <Button className="mt-4 w-full gap-2 bg-gradient-cosmic text-foreground">
                  <Zap className="h-4 w-4" /> Поддержать boost внутри NovaBoost
                </Button>
              </Link>
            </div>

            <Collapsible open={showGrowthTools} onOpenChange={setShowGrowthTools} className="rounded-2xl border border-border/50 bg-background/20 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-display text-xl font-bold">Отдельные инструменты продвижения</h3>

              <div className="mt-10">
                <ProjectHelpPanel
                  badge="Как читать страницу стримера"
                  title="Что здесь может сделать зритель"
                  description="Публичная страница стримера в NovaBoost Live - это не только визитка, но и отдельная продуктовая поверхность для вовлечения между эфирами и во время live."
                  items={[
                    {
                      key: "public-page-purpose",
                      title: "Зачем нужна эта страница",
                      body: "Здесь собираются все ключевые точки взаимодействия со стримером внутри NovaBoost Live: подписка, boost, контент, support, платные сценарии в подготовке и внутренние сигналы активности.",
                    },
                    {
                      key: "boost-on-page",
                      title: "Что означает crown и boost-сумма",
                      body: "Если у стримера есть активный boost, его карточка и страница получают более высокий приоритет внутри NovaBoost Live. Crown и сумма показывают силу текущей волны поддержки аудитории внутри платформы.",
                    },
                    {
                      key: "memberships-page",
                      title: "Что с тарифами и поддержкой",
                      body: "Часть сценариев уже оформлена как продуктовый интерфейс, но реальные платежи ещё могут быть не активированы. В таких случаях платформа показывает coming-soon flow и собирает платёжные предпочтения.",
                    },
                  ]}
                />
              </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Это вторичный раздел. Он не является главным действием на публичной странице стримера.
                  </p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    {showGrowthTools ? "Скрыть блок" : "Показать блок"} <ChevronDown className={`h-4 w-4 transition-transform ${showGrowthTools ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent className="mt-5 space-y-6 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                <div className="flex flex-wrap gap-2">
                  {promotionGroups.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => setActivePromotionGroupKey(group.key)}
                      className={`rounded-full border px-4 py-2 text-sm transition-colors ${group.key === activePromotionGroup?.key ? "border-blast bg-blast/10 text-foreground" : "border-border/50 bg-background/20 text-muted-foreground hover:border-foreground/30"}`}
                    >
                      {group.title} · {group.services.length}
                    </button>
                  ))}
                </div>

                {activePromotionGroup && (
                  <div>
                    <div className="mb-3">
                      <h4 className="font-display text-lg font-bold">{activePromotionGroup.title}</h4>
                      <p className="mt-1 text-sm text-muted-foreground">{activePromotionGroup.description}</p>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {activePromotionGroup.services.map((service) => {
                        const price = calculateCustomerAmount("viewer", service.rate, service.min);

                        return (
                          <div key={service.id} className="rounded-2xl border border-border/50 bg-background/30 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="rounded-full border border-border/50 bg-background/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground w-fit">
                                  {service.subcategory}
                                </div>
                                <h4 className="mt-3 font-display text-lg font-bold leading-tight">{service.name}</h4>
                              </div>
                              <div className="text-right shrink-0">
                                <LocalizedPrice
                                  amount={price.customerAmount}
                                  preference={currencyPreference}
                                  primaryClassName="font-display text-lg font-bold text-blast"
                                  secondaryClassName="text-xs text-muted-foreground"
                                  align="right"
                                />
                                <div className="text-xs text-muted-foreground">от {service.min}</div>
                              </div>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-muted-foreground">{service.shortDescription}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(service.summaryBullets ?? []).slice(0, 2).map((bullet) => (
                                <span key={bullet} className="rounded-full border border-border/50 px-2 py-1 text-[11px] text-muted-foreground">{bullet}</span>
                              ))}
                            </div>
                            <div className="mt-3 text-xs text-muted-foreground">{service.targetLabel}</div>
                            <Link to="/services" search={{ streamerId: streamer.id, serviceId: String(service.id) }}>
                              <Button className="mt-4 w-full gap-2 bg-gradient-blast text-blast-foreground">
                                <Sparkles className="h-4 w-4" /> Перейти к услуге
                              </Button>
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </section>
        ) : (
        <section className="mt-6 rounded-3xl border border-amber-400/30 bg-amber-500/10 p-5 sm:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold text-amber-50">Пригласите этого стримера в NovaBoost Live</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-100/90">
                Сейчас карточка работает в tracking-only режиме: мы следим за статусом эфира и показываем базовые метрики. После регистрации стример сможет настроить страницу, открыть бусты, бонусы, подписки и дополнительный контент.
              </p>
            </div>
            <a href={`https://www.tiktok.com/@${streamer.tiktok_username}`} target="_blank" rel="noopener noreferrer">
              <Button className="gap-2 bg-white text-black hover:bg-white/90">
                <ExternalLink className="h-4 w-4" /> Открыть TikTok профиль
              </Button>
            </a>
          </div>
        </section>
        )}
        {surveyDialog}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/30 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-2xl font-bold">{value}</div>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: "live" | "blast" }) {
  const color = accent === "live" ? "text-[oklch(0.85_0.15_25)]" : accent === "blast" ? "text-blast" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border/50 bg-surface/60 p-5">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 ${color}`}>{icon}</div>
      <div className={`mt-3 font-display font-bold text-2xl ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}
