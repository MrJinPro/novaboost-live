import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Header } from "@/components/Header";
import { LiveIndicator } from "@/components/LiveIndicator";
import { CurrencySwitcher } from "@/components/CurrencySwitcher";
import { LocalizedPrice } from "@/components/LocalizedPrice";
import { BoostBadge } from "@/components/BoostBadge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bell, Crown, Eye, ExternalLink, Play, Send, Sparkles, Users, Wallet, Zap, TrendingUp } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { getLocalizedMoney, useCurrencyPreference } from "@/lib/currency";
import type { PostReactionType, StreamerPageData, StreamerPost, SubscriptionPlanKey } from "@/lib/mock-platform";
import { activateStreamerPlan, getSubscriptionPlanLabel, loadPostReactionSummaries, loadStreamerMembershipState, SUBSCRIPTION_PLANS, togglePostReaction, type PostReactionSummary, type StreamerMembershipState } from "@/lib/monetization-data";
import { calculateCustomerAmount, groupTikTokPromotionServices, loadTikTokPromotionServices, type TikTokPromotionService } from "@/lib/prmotion-data";
import { getStreamerSubscriptionState, loadPublicStreamerPage, toggleStreamerSubscription } from "@/lib/streamer-studio-data";
import { toast } from "sonner";

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
  const [pageLoading, setPageLoading] = useState(true);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [membershipState, setMembershipState] = useState<StreamerMembershipState>({ subscribed: false, planKey: "free", paidUntil: null, totalPaidAmount: 0 });
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [reactionSummaries, setReactionSummaries] = useState<Map<string, PostReactionSummary>>(new Map());
  const [promotionServices, setPromotionServices] = useState<TikTokPromotionService[]>([]);
  const [activePromotionGroupKey, setActivePromotionGroupKey] = useState("");

  useEffect(() => {
    let active = true;

    const syncPage = async () => {
      setPageLoading(true);
      try {
        const page = await loadPublicStreamerPage(id);
        if (active) {
          setStreamer(page);
        }
      } catch (error) {
        if (active) {
          setStreamer(null);
          toast.error(error instanceof Error ? error.message : "Не удалось загрузить публичную страницу стримера");
        }
      } finally {
        if (active) {
          setPageLoading(false);
        }
      }
    };

    void syncPage();

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    let active = true;

    if (!user || user.role !== "viewer") {
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
  }, [id, user]);

  useEffect(() => {
    let active = true;

    if (!streamer) {
      setMembershipState({ subscribed: false, planKey: "free", paidUntil: null, totalPaidAmount: 0 });
      return;
    }

    const syncMembership = async () => {
      setMembershipLoading(true);
      try {
        const nextState = await loadStreamerMembershipState(streamer.id, user?.role === "viewer" ? user.id : undefined);
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

    if (!streamer) {
      setReactionSummaries(new Map());
      return;
    }

    const syncReactions = async () => {
      try {
        const summaries = await loadPostReactionSummaries(
          streamer.posts.map((post) => post.id),
          user?.role === "viewer" ? user.id : undefined,
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
  const featuredVideoCover = streamer.featured_video_url ?? streamer.videos[0]?.cover ?? "";
  const telegramChannel = streamer.telegram_channel?.trim() ?? "";
  const telegramHref = telegramChannel
    ? `https://t.me/${telegramChannel.replace(/^@+/, "")}`
    : null;

  const handleSubscription = async () => {
    if (!user) {
      toast.error("Войди как зритель, чтобы подписываться на стримеров");
      navigate({ to: "/auth" });
      return;
    }

    if (user.role !== "viewer") {
      toast.error("Подписка доступна из профиля зрителя");
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

  const handlePlanUpgrade = async (planKey: SubscriptionPlanKey) => {
    if (!user) {
      toast.error("Войди как зритель, чтобы оформить тариф");
      navigate({ to: "/auth" });
      return;
    }

    if (user.role !== "viewer") {
      toast.error("Тарифы доступны из профиля зрителя");
      return;
    }

    setMembershipLoading(true);
    try {
      const nextState = await activateStreamerPlan(streamer.id, user.id, planKey);
      setMembershipState(nextState);
      if (!subscribed && nextState.subscribed) {
        setSubscribed(true);
        setStreamer((current) => current ? { ...current, subscription_count: current.subscription_count + 1 } : current);
      }
      toast.success(`Тариф ${planKey} активирован`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось активировать тариф");
    } finally {
      setMembershipLoading(false);
    }
  };

  const handleReactionToggle = async (postId: string, reactionType: PostReactionType) => {
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
      <div className="container mx-auto px-4 py-6">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/streamers" })} className="gap-1.5 -ml-3">
          <ArrowLeft className="h-4 w-4" /> К каталогу
        </Button>

        <div className="mt-6 overflow-hidden rounded-3xl border border-border/50 bg-surface/70">
          <div className={`h-44 w-full bg-linear-to-r ${streamer.accent}`} style={{ backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.05), transparent), url(${streamer.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" }} />

          <div className={`relative px-6 pb-6 md:px-10 md:pb-10 ${boosted ? "shadow-glow" : ""}`}>
            <div className="relative -mt-14 flex flex-col md:flex-row md:items-end gap-6">
              <div className="relative shrink-0">
                <img
                  src={streamer.avatar_url ?? ""}
                  alt={streamer.display_name}
                  className={`h-28 w-28 rounded-full bg-surface-2 object-cover ring-4 ${boosted ? "ring-blast/60" : "ring-border"}`}
                />
                {streamer.is_live && (
                  <span className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-live ring-4 ring-background animate-pulse-live" />
                )}
              </div>

              <div className="flex-1 min-w-0 pt-3 md:pt-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-display font-bold text-3xl md:text-4xl">{streamer.display_name}</h1>
                  {boosted && <span className="text-3xl text-crown">👑</span>}
                  {streamer.is_live && <LiveIndicator size="md" />}
                </div>
                <div className="mt-1 text-muted-foreground">@{streamer.tiktok_username}</div>
                <p className="mt-3 max-w-3xl text-foreground/90">{streamer.tagline}</p>
                {streamer.bio && <p className="mt-3 text-sm text-muted-foreground max-w-2xl">{streamer.bio}</p>}

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

              <div className="flex md:flex-col gap-3 shrink-0 pt-3 md:pt-0">
                <a href={`https://www.tiktok.com/@${streamer.tiktok_username}/live`} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" className="bg-gradient-blast text-blast-foreground hover:opacity-90 shadow-glow font-bold gap-2 w-full">
                    <ExternalLink className="h-4 w-4" /> Перейти на стрим
                  </Button>
                </a>
                <Button size="lg" variant={subscribed ? "secondary" : "outline"} className="gap-2 w-full" onClick={handleSubscription} disabled={subscriptionLoading}>
                  <Bell className="h-4 w-4" /> {subscriptionLoading ? "Обновляю…" : subscribed ? "Подписка активна" : "Подписаться"}
                </Button>
                <Link to="/boost" search={{ streamerId: streamer.id }}>
                  <Button size="lg" variant="outline" className="gap-2 w-full border-cosmic/40 hover:bg-cosmic/10">
                    <Zap className="h-4 w-4 text-cosmic" /> Запустить буст
                  </Button>
                </Link>
                <a href="#promotion-services">
                  <Button size="lg" variant="outline" className="gap-2 w-full border-blast/40 hover:bg-blast/10">
                    <Sparkles className="h-4 w-4 text-blast" /> Поддержать продвижением
                  </Button>
                </a>
                {telegramHref ? (
                  <a href={telegramHref} target="_blank" rel="noopener noreferrer">
                    <Button size="lg" variant="outline" className="gap-2 w-full border-border/60">
                      <Send className="h-4 w-4 text-cosmic" /> Telegram: {telegramChannel}
                    </Button>
                  </a>
                ) : (
                  <Button size="lg" variant="outline" className="gap-2 w-full border-border/60" disabled>
                    <Send className="h-4 w-4 text-cosmic" /> Telegram не указан
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<Eye className="h-5 w-5" />} label="Зрителей сейчас" value={streamer.is_live ? formatNumber(streamer.viewer_count) : "—"} accent="live" />
          <StatCard icon={<Users className="h-5 w-5" />} label="Подписчиков" value={formatNumber(streamer.followers_count)} />
          <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Подписки в платформе" value={formatNumber(streamer.subscription_count)} />
          <StatCard icon={<Zap className="h-5 w-5" />} label="Сумма бустов" value={formatNumber(streamer.total_boost_amount)} accent="blast" />
          <StatCard icon={<Sparkles className="h-5 w-5" />} label="Лайков в эфире" value={formatNumber(streamer.total_likes)} accent="blast" />
          <StatCard icon={<Wallet className="h-5 w-5" />} label="Подарков" value={formatNumber(streamer.total_gifts)} />
          <StatCard icon={<Bell className="h-5 w-5" />} label="Сообщений в чате" value={formatNumber(streamer.total_messages ?? 0)} />
          <StatCard icon={<Play className="h-5 w-5" />} label="Пик зрителей" value={formatNumber(streamer.peak_viewer_count ?? 0)} accent="live" />
        </div>

        <section id="promotion-services" className="mt-6 rounded-3xl border border-border/50 bg-surface/60 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/30 px-3 py-1 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-blast" /> Поддержка эфира
              </div>
              <h2 className="mt-3 font-display text-2xl font-bold">Услуги продвижения TikTok</h2>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Выбери, что именно хочешь усилить: эфир, видео, профиль или активность в комментариях.
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
              Все основные варианты собраны прямо на странице стримера.
            </div>
          </div>

          <div className="mt-5 space-y-6">
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
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-bold">{activePromotionGroup.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{activePromotionGroup.description}</p>
                  </div>
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
                            <h3 className="mt-3 font-display text-lg font-bold leading-tight">{service.name}</h3>
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
                            <Sparkles className="h-4 w-4" /> Выбрать услугу
                          </Button>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Публичный профиль</div>
                <h2 className="mt-2 font-display text-2xl font-bold">О стримере</h2>
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
                  {streamer.bio || "Стример ещё не заполнил расширенное описание, но страница уже готова принимать подписчиков, посты и короткий видеоконтент."}
                </p>
              </div>

              <div className="rounded-2xl border border-border/50 bg-background/30 p-5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Что увидит зритель</div>
                <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                  <div className="rounded-xl border border-border/40 bg-surface/60 px-4 py-3">Публичный username, аватар, баннер и текущее live-состояние.</div>
                  <div className="rounded-xl border border-border/40 bg-surface/60 px-4 py-3">Анонсы, новости и посты между эфирами прямо на странице стримера.</div>
                  <div className="rounded-xl border border-border/40 bg-surface/60 px-4 py-3">Короткие видео, тизеры и отдельный hero-блок для главного ролика.</div>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-border/50 bg-surface/60">
            <div className="relative min-h-80 bg-surface-2">
              {featuredVideoCover ? (
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `linear-gradient(180deg, rgba(8,10,16,0.08), rgba(8,10,16,0.88)), url(${featuredVideoCover})` }}
                />
              ) : (
                <div className={`absolute inset-0 bg-linear-to-br ${streamer.accent}`} />
              )}
              <div className="relative flex h-full min-h-80 flex-col justify-end p-6">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/80">
                  <Play className="h-3.5 w-3.5" /> Главный тизер
                </div>
                <h2 className="mt-4 max-w-lg font-display text-3xl font-bold text-white">{streamer.display_name} показывает страницу не только для live, но и между эфирами.</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">Используй этот блок как главный ролик: анонс следующего эфира, лучший фрагмент или короткое знакомство со стримером.</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <a href={`https://www.tiktok.com/@${streamer.tiktok_username}/live`} target="_blank" rel="noopener noreferrer">
                    <Button className="gap-2 bg-white text-black hover:bg-white/90">
                      <ExternalLink className="h-4 w-4" /> Открыть TikTok LIVE
                    </Button>
                  </a>
                  {featuredVideoCover && (
                    <Button variant="outline" className="gap-2 border-white/20 bg-black/20 text-white hover:bg-black/30">
                      <Play className="h-4 w-4" /> Главный ролик подключён
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display font-bold text-2xl">Контент стримера</h2>
            <p className="mt-2 text-sm text-muted-foreground">Платформа должна жить между эфирами, поэтому здесь посты, анонсы и сигналы для подписчиков.</p>
            <div className="mt-5 space-y-3">
              {streamer.posts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/50 bg-background/20 p-5 text-sm text-muted-foreground">
                  Пока нет опубликованных постов. Как только стример добавит анонс или новость в студии, они появятся здесь.
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
            <div className="rounded-3xl border border-border/50 bg-surface/60 p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display font-bold text-xl">Тарифы NovaBoost</h2>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="rounded-full border border-border/50 bg-background/30 px-3 py-1 text-xs text-muted-foreground">
                    План: {membershipLoading ? "обновляю…" : membershipState.planKey}
                  </div>
                  <CurrencySwitcher inline />
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {SUBSCRIPTION_PLANS.map((plan) => {
                  const activePlan = membershipState.planKey === plan.key;
                  return (
                    <div key={plan.key} className={`rounded-2xl border p-4 ${activePlan ? "border-crown/40 bg-crown/5" : "border-border/50 bg-background/30"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-display text-lg font-bold">{plan.title}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{plan.description}</div>
                        </div>
                        <div className="text-right">
                          {plan.price === 0 ? (
                            <div className="font-display text-xl font-bold">Без оплаты</div>
                          ) : (
                            <LocalizedPrice
                              amount={plan.price}
                              preference={currencyPreference}
                              primaryClassName="font-display text-xl font-bold"
                              secondaryClassName="text-xs text-muted-foreground"
                              align="right"
                            />
                          )}
                          <div className="text-xs text-muted-foreground">30 дней</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {plan.perks.map((perk) => (
                          <span key={perk} className="rounded-full border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground">{perk}</span>
                        ))}
                      </div>
                      <Button className="mt-4 w-full" variant={activePlan ? "secondary" : "outline"} disabled={membershipLoading || activePlan} onClick={() => void handlePlanUpgrade(plan.key)}>
                        {activePlan ? "Текущий тариф" : `Активировать ${plan.title}`}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-border/50 bg-surface/60 p-6">
              <h2 className="font-display font-bold text-xl">Сигналы платформы</h2>
              <p className="mt-3 text-sm text-muted-foreground">{streamer.next_event}</p>
              <p className="mt-3 text-sm text-muted-foreground">{streamer.support_goal}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <MiniStat label="Лайки" value={formatNumber(streamer.total_likes)} />
                <MiniStat label="Подарки" value={formatNumber(streamer.total_gifts)} />
                <MiniStat label="Сообщения" value={formatNumber(streamer.total_messages ?? 0)} />
                <MiniStat label="Пик онлайна" value={formatNumber(streamer.peak_viewer_count ?? 0)} />
              </div>
            </div>

            <div className="rounded-3xl border border-border/50 bg-surface/60 p-6">
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

            <div className="rounded-3xl border border-border/50 bg-surface/60 p-6">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-blast" />
                <h2 className="font-display font-bold text-xl">Поддержка стримера</h2>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {streamer.donation_link_title ?? "Стример пока не активировал donation link внутри платформы."}
              </p>
              {streamer.donation_link_slug ? (
                <Link to="/support/$slug" params={{ slug: streamer.donation_link_slug }}>
                  <Button className="mt-4 w-full gap-2 bg-gradient-blast text-blast-foreground">
                    <Wallet className="h-4 w-4" /> Поддержать через NovaBoost Live
                  </Button>
                </Link>
              ) : (
                <Button className="mt-4 w-full" variant="outline" disabled>
                  Donation link не настроен
                </Button>
              )}
              <div className="mt-4 space-y-2">
                {streamer.recent_donations.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/50 bg-background/20 px-4 py-3 text-sm text-muted-foreground">
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
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-border/50 bg-surface/60 p-6">
          <h2 className="font-display font-bold text-2xl">Короткие видео и тизеры</h2>
          <p className="mt-2 text-sm text-muted-foreground">Здесь собираются несколько видео стримера: тизеры, клипы и обложки главных моментов.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {streamer.videos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/50 bg-background/20 p-5 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                Пока нет добавленных видео. После заполнения медиатеки здесь появится витрина роликов стримера.
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
