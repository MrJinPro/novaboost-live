import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Crown, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import type { StreamerCardData } from "@/lib/mock-platform";
import { loadMyPromotionOrders, type PromotionOrderSummary } from "@/lib/promotion-orders-data";
import { loadStreamerDirectory } from "@/lib/streamers-directory-data";
import { createBoost } from "@/lib/boost-data";
import { createTikTokPromotionOrder, loadTikTokPromotionServices, type TikTokPromotionService } from "@/lib/prmotion-data";

const searchSchema = z.object({
  streamerId: z.string().optional(),
});

export const Route = createFileRoute("/boost")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Запустить буст — NovaBoost Live" },
      { name: "description", content: "Продвигай стримера: больше зрителей, корона в топе и приоритетные уведомления." },
    ],
  }),
  component: BoostPage,
});

const TIERS = [
  { amount: 500, label: "Старт", desc: "Приоритет на 30 минут", color: "border-border" },
  { amount: 1500, label: "Импульс", desc: "Приоритет на 1 час + корона", color: "border-cosmic/40" },
  { amount: 5000, label: "Сверхновая", desc: "Топ списка + анимация · 2 часа", color: "border-blast/60 shadow-glow" },
];

function BoostPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [streamers, setStreamers] = useState<StreamerCardData[]>([]);
  const [selected, setSelected] = useState<string>(search.streamerId ?? "");
  const [tier, setTier] = useState<number>(1500);
  const [submitting, setSubmitting] = useState(false);
  const [promotionServices, setPromotionServices] = useState<TikTokPromotionService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [targetLink, setTargetLink] = useState("");
  const [promotionQuantity, setPromotionQuantity] = useState("100");
  const [promotionSubmitting, setPromotionSubmitting] = useState(false);
  const [promotionOrders, setPromotionOrders] = useState<PromotionOrderSummary[]>([]);

  useEffect(() => {
    let active = true;

    const syncStreamers = async () => {
      try {
        const data = await loadStreamerDirectory();
        if (active) {
          setStreamers(data);
        }
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Не удалось загрузить список стримеров");
        }
      }
    };

    void syncStreamers();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!user) {
      setPromotionOrders([]);
      return;
    }

    const syncOrders = async () => {
      try {
        const data = await loadMyPromotionOrders(user.id);
        if (active) {
          setPromotionOrders(data);
        }
      } catch {
        if (active) {
          setPromotionOrders([]);
        }
      }
    };

    void syncOrders();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;

    const syncServices = async () => {
      setServicesLoading(true);
      try {
        const data = await loadTikTokPromotionServices();
        if (!active) {
          return;
        }
        setPromotionServices(data);
        if (data[0]) {
          setSelectedServiceId(String(data[0].id));
          setPromotionQuantity(String(data[0].min));
        }
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Не удалось загрузить каталог TikTok услуг");
        }
      } finally {
        if (active) {
          setServicesLoading(false);
        }
      }
    };

    void syncServices();

    return () => {
      active = false;
    };
  }, []);

  const streamer = streamers.find((s) => s.id === selected);
  const selectedPromotionService = promotionServices.find((service) => String(service.id) === selectedServiceId) ?? null;

  const handleBoost = async () => {
    if (!user) {
      toast.error("Войди, чтобы запустить буст");
      navigate({ to: "/auth" });
      return;
    }
    if (!selected) {
      toast.error("Выбери стримера");
      return;
    }
    setSubmitting(true);
    try {
      await createBoost(user, selected, tier);
      toast.success(`Буст ${tier} ⚡ запущен! ${streamer?.display_name} поднимается в топ`);
      navigate({ to: "/streamer/$id", params: { id: selected } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось запустить буст");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePromotionOrder = async () => {
    const quantity = Number(promotionQuantity);

    if (!user) {
      toast.error("Войди, чтобы заказать TikTok услугу");
      navigate({ to: "/auth" });
      return;
    }

    if (user.role !== "streamer") {
      toast.error("Каталог TikTok услуг сейчас доступен только стримерам");
      return;
    }

    if (!selectedPromotionService) {
      toast.error("Выбери услугу продвижения");
      return;
    }

    if (!targetLink.trim()) {
      toast.error("Укажи ссылку на TikTok live, видео или профиль");
      return;
    }

    if (!Number.isFinite(quantity) || quantity < selectedPromotionService.min || quantity > selectedPromotionService.max) {
      toast.error(`Количество должно быть в диапазоне ${selectedPromotionService.min}-${selectedPromotionService.max}`);
      return;
    }

    setPromotionSubmitting(true);
    try {
      const result = await createTikTokPromotionOrder({
        requesterUserId: user.id,
        streamerId: selected || null,
        serviceId: selectedPromotionService.id,
        link: targetLink.trim(),
        quantity,
      });
      setPromotionOrders((current) => [
        {
          id: result.orderId,
          serviceName: result.service.name,
          quantity: result.quantity,
          quotedAmount: result.quotedAmount,
          currency: result.currency,
          status: result.status,
          targetLink: result.link,
          failureReason: null,
          createdAt: new Intl.DateTimeFormat("ru-RU", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date()),
        },
        ...current,
      ].slice(0, 8));
      toast.success(`Заказ принят: ${result.service.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось создать заказ услуги");
    } finally {
      setPromotionSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })} className="gap-1.5 -ml-3">
          <ArrowLeft className="h-4 w-4" /> Назад
        </Button>

        <div className="mt-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-gradient-blast px-3 py-1 text-xs font-bold text-blast-foreground shadow-glow">
            <Crown className="h-3.5 w-3.5" /> BOOST
          </div>
          <h1 className="mt-3 font-display font-bold text-3xl md:text-4xl">Запустить буст</h1>
          <p className="mt-2 text-muted-foreground">
            Подними стримера в топ списка, добавь корону 👑 и привлеки больше зрителей.
          </p>
        </div>

        <section className="mt-8">
          <h2 className="font-display font-bold text-lg mb-3">1. Выбери стримера</h2>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-foreground"
          >
            <option value="">— Выбрать стримера —</option>
            {streamers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name} (@{s.tiktok_username}) {s.is_live ? "🔴" : ""}
              </option>
            ))}
          </select>
        </section>

        <section className="mt-8">
          <h2 className="font-display font-bold text-lg mb-3">2. Выбери уровень</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {TIERS.map((t) => {
              const active = tier === t.amount;
              return (
                <button
                  key={t.amount}
                  onClick={() => setTier(t.amount)}
                  className={`relative rounded-2xl border-2 bg-surface/60 p-5 text-left transition-all ${
                    active ? "border-blast bg-blast/5 shadow-glow" : t.color + " hover:border-foreground/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Zap className={`h-5 w-5 ${active ? "text-blast" : "text-muted-foreground"}`} />
                    <span className="font-display font-bold">{t.label}</span>
                  </div>
                  <div className={`mt-2 font-display font-bold text-2xl ${active ? "text-gradient-blast" : ""}`}>
                    {t.amount} ⚡
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{t.desc}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-border/50 bg-surface/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Итого к запуску</div>
              <div className="font-display font-bold text-3xl text-gradient-blast">{tier} ⚡</div>
            </div>
            <Button
              size="lg"
              disabled={!selected || submitting}
              onClick={handleBoost}
              className="bg-gradient-blast text-blast-foreground font-bold shadow-glow gap-2 disabled:opacity-50"
            >
              <Zap className="h-5 w-5" />
              {submitting ? "Запускаем…" : "Запустить буст"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            ⚡ — внутренние очки буста. Запуск уже сохраняется в Supabase, а реальные платежи подключим следующим шагом.
          </p>
        </section>

        {!user && (
          <div className="mt-4 rounded-xl border border-border/50 bg-surface/40 p-4 text-sm">
            Чтобы запустить буст, <Link to="/auth" className="text-blast underline">войди или зарегистрируйся</Link>.
          </div>
        )}

        <section className="mt-10 rounded-3xl border border-border/50 bg-surface/60 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/30 px-3 py-1 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-cosmic" /> TikTok Growth
              </div>
              <h2 className="mt-3 font-display text-2xl font-bold">TikTok услуги для стримера</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Здесь собраны только TikTok услуги без монет и coin-механик. Подходят для лайков, просмотров, репостов, подписчиков и похожих TikTok-сценариев роста.
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
              Доступ: {user?.role === "streamer" ? "стример" : "только для стримеров"}
            </div>
          </div>

          {servicesLoading ? (
            <div className="mt-5 text-sm text-muted-foreground">Загружаю каталог TikTok услуг…</div>
          ) : promotionServices.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-border/50 bg-background/20 p-5 text-sm text-muted-foreground">
              Каталог пока недоступен. Обычно это значит, что backend не запущен или не настроен поставщик услуг.
            </div>
          ) : (
            <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-3">
                {promotionServices.map((service) => {
                  const active = String(service.id) === selectedServiceId;
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => {
                        setSelectedServiceId(String(service.id));
                        setPromotionQuantity(String(service.min));
                      }}
                      className={`w-full rounded-2xl border p-4 text-left transition-colors ${active ? "border-blast bg-blast/10" : "border-border/50 bg-background/20 hover:border-foreground/30"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-foreground">{service.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{service.category} · {service.type}</div>
                        </div>
                        <div className="text-right text-sm">
                          <div className="font-display font-bold">{service.rate} ₽</div>
                          <div className="text-xs text-muted-foreground">за 1000</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {service.tags.length > 0 ? service.tags.map((tag) => (
                          <span key={tag} className="rounded-full border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground">{tag}</span>
                        )) : (
                          <span className="rounded-full border border-border/50 px-2.5 py-1 text-[11px] text-muted-foreground">tiktok</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-3xl border border-border/50 bg-background/20 p-5">
                {selectedPromotionService ? (
                  <>
                    <h3 className="font-display text-xl font-bold">Оформить TikTok заказ</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Услуга: {selectedPromotionService.name}. Диапазон: {selectedPromotionService.min}-{selectedPromotionService.max}.
                    </p>

                    <div className="mt-5 space-y-4">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium">Ссылка TikTok</label>
                        <input
                          value={targetLink}
                          onChange={(e) => setTargetLink(e.target.value)}
                          placeholder="https://www.tiktok.com/@username/live или ссылка на видео"
                          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-foreground"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm font-medium">Количество</label>
                        <input
                          type="number"
                          min={selectedPromotionService.min}
                          max={selectedPromotionService.max}
                          value={promotionQuantity}
                          onChange={(e) => setPromotionQuantity(e.target.value)}
                          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-foreground"
                        />
                      </div>

                      <div className="rounded-2xl border border-border/50 bg-surface/40 p-4 text-sm text-muted-foreground">
                        Расчётная закупочная ставка: {selectedPromotionService.rate} ₽ за 1000.
                        Пользователь оформляет заказ внутри NovaBoost Live, а обработка уходит на серверный контур без внешних переходов.
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <Button onClick={handlePromotionOrder} disabled={promotionSubmitting || user?.role !== "streamer"} className="bg-gradient-cosmic font-bold text-foreground">
                        {promotionSubmitting ? "Отправляю заказ…" : "Создать заказ услуги"}
                      </Button>
                      {!user && (
                        <Link to="/auth"><Button variant="outline">Войти как стример</Button></Link>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-border/50 bg-background/20 p-5">
            <h3 className="font-display text-xl font-bold">Последние заказы</h3>
            <div className="mt-4 space-y-3">
              {promotionOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/50 bg-background/20 p-4 text-sm text-muted-foreground">
                  Здесь появятся последние оформленные заказы из внутренней базы NovaBoost Live.
                </div>
              ) : (
                promotionOrders.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-border/50 bg-surface/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{order.serviceName}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{order.createdAt}</div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${order.status === "submitted" ? "bg-cosmic/10 text-cosmic" : order.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-background/40 text-muted-foreground"}`}>
                        {order.status}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-muted-foreground">{order.quantity} единиц · {order.quotedAmount} {order.currency}</div>
                    <div className="mt-2 truncate text-xs text-muted-foreground">{order.targetLink}</div>
                    {order.failureReason && <div className="mt-2 text-xs text-destructive">{order.failureReason}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
