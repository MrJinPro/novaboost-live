import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { calculateCustomerAmount, createTikTokPromotionOrder, getPromotionMarkup, loadTikTokPromotionServices, type TikTokPromotionService } from "@/lib/prmotion-data";
import { loadMyPromotionOrders, type PromotionOrderSummary } from "@/lib/promotion-orders-data";
import { loadStreamerDirectory } from "@/lib/streamers-directory-data";
import type { StreamerCardData } from "@/lib/mock-platform";
import { ArrowLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({
  streamerId: z.string().optional(),
});

export const Route = createFileRoute("/services")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Услуги продвижения — NovaBoost Live" },
      { name: "description", content: "Заказ услуг продвижения TikTok внутри NovaBoost Live для стримеров и зрителей." },
    ],
  }),
  component: ServicesPage,
});

function ServicesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const search = Route.useSearch();
  const [streamers, setStreamers] = useState<StreamerCardData[]>([]);
  const [selectedStreamerId, setSelectedStreamerId] = useState(search.streamerId ?? "");
  const [services, setServices] = useState<TikTokPromotionService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [targetLink, setTargetLink] = useState("");
  const [quantity, setQuantity] = useState("100");
  const [submitting, setSubmitting] = useState(false);
  const [orders, setOrders] = useState<PromotionOrderSummary[]>([]);

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

    const syncServices = async () => {
      setServicesLoading(true);
      try {
        const data = await loadTikTokPromotionServices();
        if (!active) {
          return;
        }
        setServices(data);
        if (data[0]) {
          setSelectedServiceId(String(data[0].id));
          setQuantity(String(data[0].min));
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

  useEffect(() => {
    let active = true;

    if (!user) {
      setOrders([]);
      return;
    }

    const syncOrders = async () => {
      try {
        const data = await loadMyPromotionOrders(user.id);
        if (active) {
          setOrders(data);
        }
      } catch {
        if (active) {
          setOrders([]);
        }
      }
    };

    void syncOrders();

    return () => {
      active = false;
    };
  }, [user]);

  const selectedService = services.find((service) => String(service.id) === selectedServiceId) ?? null;
  const role = user?.role === "streamer" || user?.role === "admin" ? user.role : "viewer";
  const parsedQuantity = Number(quantity);
  const pricing = useMemo(() => {
    if (!selectedService || !Number.isFinite(parsedQuantity)) {
      return null;
    }

    return calculateCustomerAmount(role, selectedService.rate, parsedQuantity);
  }, [parsedQuantity, role, selectedService]);

  const handleCreateOrder = async () => {
    if (!user) {
      toast.error("Войди, чтобы оформить услугу продвижения");
      navigate({ to: "/auth" });
      return;
    }

    if (!selectedService) {
      toast.error("Выбери вид услуги");
      return;
    }

    if (!selectedStreamerId) {
      toast.error(user.role === "viewer" ? "Выбери стримера, которого хочешь поддержать" : "Выбери стримера для заказа");
      return;
    }

    if (!targetLink.trim()) {
      toast.error("Укажи ссылку TikTok на эфир, ролик или профиль");
      return;
    }

    if (!Number.isFinite(parsedQuantity) || parsedQuantity < selectedService.min || parsedQuantity > selectedService.max) {
      toast.error(`Количество должно быть в диапазоне ${selectedService.min}-${selectedService.max}`);
      return;
    }

    setSubmitting(true);
    try {
      const result = await createTikTokPromotionOrder({
        requesterUserId: user.id,
        requesterRole: role,
        streamerId: selectedStreamerId,
        serviceId: selectedService.id,
        link: targetLink.trim(),
        quantity: parsedQuantity,
      });

      setOrders((current) => [
        {
          id: result.orderId,
          serviceName: result.service.name,
          quantity: result.quantity,
          quotedAmount: result.customerAmount,
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

      toast.success("Заказ услуги принят.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось оформить услугу продвижения");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto max-w-6xl px-4 py-6">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/profile" })} className="gap-1.5 -ml-3">
          <ArrowLeft className="h-4 w-4" /> В кабинет
        </Button>

        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/30 px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-cosmic" /> Продвижение TikTok
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold md:text-4xl">Услуги продвижения</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Здесь стример может продвигать свои TikTok-активности, а зритель может поддержать любимого стримера реальным продвижением. Всё оформляется внутри NovaBoost Live.
            </p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
            Наценка платформы: {role === "streamer" ? "15% для стримера" : role === "viewer" ? "30% для зрителя" : "0% для админа"}
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display text-2xl font-bold">Каталог услуг</h2>
            <p className="mt-2 text-sm text-muted-foreground">Только TikTok услуги без монет, coin-механик и непонятных внешних переходов.</p>

            {servicesLoading ? (
              <div className="mt-5 text-sm text-muted-foreground">Загружаю каталог услуг…</div>
            ) : services.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-border/50 bg-background/20 p-5 text-sm text-muted-foreground">
                Каталог пока недоступен. Обычно это значит, что backend не запущен или не настроен поставщик услуг.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {services.map((service) => {
                  const active = String(service.id) === selectedServiceId;
                  const price = calculateCustomerAmount(role, service.rate, service.min);
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => {
                        setSelectedServiceId(String(service.id));
                        setQuantity(String(service.min));
                      }}
                      className={`w-full rounded-2xl border p-4 text-left transition-colors ${active ? "border-blast bg-blast/10" : "border-border/50 bg-background/20 hover:border-foreground/30"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-foreground">{service.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{service.category} · {service.type}</div>
                        </div>
                        <div className="text-right text-sm">
                          <div className="font-display font-bold">{price.customerAmount} ₽</div>
                          <div className="text-xs text-muted-foreground">за минимум {service.min}</div>
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
            )}
          </section>

          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display text-2xl font-bold">Оформить заказ</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {user?.role === "viewer"
                ? "Выбери стримера, которого хочешь поддержать продвижением, и укажи TikTok ссылку на эфир, ролик или профиль."
                : "Выбери стримера и укажи TikTok ссылку на эфир, ролик или профиль для продвижения."}
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Кого продвигаем</label>
                <select value={selectedStreamerId} onChange={(event) => setSelectedStreamerId(event.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-foreground">
                  <option value="">— Выбери стримера —</option>
                  {streamers.map((streamer) => (
                    <option key={streamer.id} value={streamer.id}>{streamer.display_name} (@{streamer.tiktok_username})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Ссылка TikTok</label>
                <input value={targetLink} onChange={(event) => setTargetLink(event.target.value)} placeholder="Ссылка на эфир, видео или профиль TikTok" className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-foreground" />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Количество</label>
                <input type="number" min={selectedService?.min ?? 1} max={selectedService?.max ?? 1_000_000} value={quantity} onChange={(event) => setQuantity(event.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-foreground" />
              </div>

              <div className="rounded-2xl border border-border/50 bg-background/30 p-4 text-sm text-muted-foreground">
                {selectedService && pricing ? (
                  <>
                    <div>Услуга: {selectedService.name}</div>
                    <div className="mt-2">Закупочная стоимость: {pricing.supplierAmount} ₽</div>
                    <div className="mt-1 font-medium text-foreground">Цена для клиента внутри NovaBoost Live: {pricing.customerAmount} ₽</div>
                  </>
                ) : (
                  <div>Выбери услугу, чтобы увидеть итоговую стоимость.</div>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={handleCreateOrder} disabled={submitting || !selectedService} className="bg-gradient-cosmic font-bold text-foreground">
                {submitting ? "Оформляю заказ…" : "Оформить услугу"}
              </Button>
              {!user && <Link to="/auth"><Button variant="outline">Войти</Button></Link>}
            </div>

            <div className="mt-6 border-t border-border/50 pt-6">
              <h3 className="font-display text-xl font-bold">Последние заказы</h3>
              <div className="mt-4 space-y-3">
                {orders.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/50 bg-background/20 p-4 text-sm text-muted-foreground">
                    Здесь появятся последние заказы из внутренней базы NovaBoost Live.
                  </div>
                ) : (
                  orders.map((order) => (
                    <div key={order.id} className="rounded-2xl border border-border/50 bg-background/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{order.serviceName}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{order.createdAt}</div>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs ${order.status === "submitted" ? "bg-cosmic/10 text-cosmic" : order.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-background/40 text-muted-foreground"}`}>
                          {order.status === "submitted" ? "Отправлен" : order.status === "failed" ? "Ошибка" : order.status === "cancelled" ? "Отменён" : "Ожидание"}
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
    </div>
  );
}