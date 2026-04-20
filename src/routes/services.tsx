import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Header } from "@/components/Header";
import { CurrencySwitcher } from "@/components/CurrencySwitcher";
import { HelpTooltip } from "@/components/HelpTooltip";
import { HowItWorksLink } from "@/components/HowItWorksLink";
import { LocalizedPrice } from "@/components/LocalizedPrice";
import { usePaymentComingSoonSurvey } from "@/components/PaymentComingSoonDialog";
import { ProjectHelpPanel } from "@/components/ProjectHelpPanel";
import { Button } from "@/components/ui/button";
import { useStreamerDirectory } from "@/hooks/use-streamer-directory";
import { useAuth } from "@/lib/auth-context";
import { getLocalizedMoney, resolveSupportedCurrency, useCurrencyPreference } from "@/lib/currency";
import { calculateCustomerAmount, getPromotionTargetMeta, groupTikTokPromotionServices, loadTikTokPromotionServices, type TikTokPromotionService } from "@/lib/prmotion-data";
import { loadMyPromotionOrders, type PromotionOrderSummary } from "@/lib/promotion-orders-data";
import { ArrowLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getStreamerPublicRouteParam } from "@/lib/streamer-public-route";

const searchSchema = z.object({
  streamerId: z.string().optional(),
  serviceId: z.string().optional(),
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
  const currencyPreference = useCurrencyPreference();
  const search = Route.useSearch();
  const { streamers, error: streamerDirectoryError } = useStreamerDirectory();
  const [selectedStreamerId, setSelectedStreamerId] = useState(search.streamerId ?? "");
  const [services, setServices] = useState<TikTokPromotionService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [activeGroupKey, setActiveGroupKey] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState(search.serviceId ?? "");
  const [targetLink, setTargetLink] = useState("");
  const [quantity, setQuantity] = useState("100");
  const [orders, setOrders] = useState<PromotionOrderSummary[]>([]);
  const { openSurvey, surveyDialog } = usePaymentComingSoonSurvey();

  useEffect(() => {
    if (streamerDirectoryError) {
      toast.error(streamerDirectoryError.message);
    }
  }, [streamerDirectoryError]);

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
        const presetService = data.find((service) => String(service.id) === search.serviceId) ?? data[0];
        if (presetService) {
          setSelectedServiceId(String(presetService.id));
          setQuantity(String(presetService.min));
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
  }, [search.serviceId]);

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
  const selectedStreamer = streamers.find((streamer) => streamer.id === selectedStreamerId) ?? null;
  const groupedServices = useMemo(() => groupTikTokPromotionServices(services), [services]);
  const role = user?.isStreamer ? "streamer" : "viewer";
  const parsedQuantity = Number(quantity);
  const liveTargetSelected = selectedService?.targetType === "live";
  const autoLiveLink = selectedStreamer ? `https://www.tiktok.com/@${selectedStreamer.tiktok_username}/live` : "";
  const activeGroup = groupedServices.find((group) => group.key === activeGroupKey) ?? groupedServices[0] ?? null;

  useEffect(() => {
    if (!groupedServices.length) {
      if (activeGroupKey) {
        setActiveGroupKey("");
      }
      return;
    }

    if (!groupedServices.some((group) => group.key === activeGroupKey)) {
      setActiveGroupKey(groupedServices[0].key);
    }
  }, [activeGroupKey, groupedServices]);

  const pricing = useMemo(() => {
    if (!selectedService || !Number.isFinite(parsedQuantity)) {
      return null;
    }

    return calculateCustomerAmount(role, selectedService.rate, parsedQuantity);
  }, [parsedQuantity, role, selectedService]);
  const pricingMoney = useMemo(
    () => (pricing ? getLocalizedMoney(pricing.customerAmount, { baseCurrency: "RUB", preference: currencyPreference }) : null),
    [currencyPreference, pricing],
  );

  const helpPanel = (
    <ProjectHelpPanel
      badge="Подсказки по услугам"
      title="Что это за раздел и что здесь происходит"
      description="Этот экран нужен, чтобы пользователь понимал разницу между внутренними механиками NovaBoost и будущими платными услугами продвижения."
      items={[
        {
          key: "services-purpose",
          title: "Что такое услуги продвижения",
          body: "Это отдельный раздел для сценариев, где в будущем могут быть реальные платные услуги, связанные с продвижением TikTok-ссылок, профилей, live-эфиров и роликов.",
        },
        {
          key: "difference-boost",
          title: "Чем это отличается от boost",
          body: "Boost - это внутренняя механика NovaBoost Live за viewer points. Услуги продвижения - это отдельный тип продукта, который потенциально связан с оплатой и внешним заказом, поэтому он отделён от boost.",
        },
        {
          key: "payments-status",
          title: "Почему оплата здесь пока не включена",
          body: "Платформа пока собирает обратную связь о предпочтительных способах оплаты. Это нужно, чтобы подключить будущий платёжный шлюз осознанно, а не случайно выбрать неудобный метод для аудитории.",
        },
      ]}
    />
  );

  useEffect(() => {
    if (!liveTargetSelected || !autoLiveLink) {
      return;
    }

    setTargetLink(autoLiveLink);
  }, [autoLiveLink, liveTargetSelected, selectedServiceId]);

  const handleCreateOrder = () => {
    if (!selectedService) {
      toast.error("Выбери вид услуги");
      return;
    }

    if (!selectedStreamerId) {
      toast.error(user.role === "viewer" ? "Выбери стримера, которого хочешь поддержать" : "Выбери стримера для заказа");
      return;
    }

    if (liveTargetSelected && selectedStreamer && !selectedStreamer.is_live) {
      toast.error("Эта услуга требует активный эфир. Дождись, когда стример выйдет в LIVE.");
      return;
    }

    if (!targetLink.trim()) {
      toast.error(`Укажи ${selectedService.targetLabel?.toLowerCase() ?? "ссылку TikTok"}`);
      return;
    }

    if (!Number.isFinite(parsedQuantity) || parsedQuantity < selectedService.min || parsedQuantity > selectedService.max) {
      toast.error(`Количество должно быть в диапазоне ${selectedService.min}-${selectedService.max}`);
      return;
    }

    openSurvey({
      userId: user?.id ?? null,
      entryPoint: "services-page",
      triggerLabel: "promotion-order",
      title: `${selectedService.name} для ${selectedStreamer?.display_name ?? "стримера"}`,
      description: "Оплата услуг продвижения ещё не включена. После клика мы собираем только предпочтительный способ оплаты, чтобы выбрать первый gateway. / Promotion checkout is not live yet. We are only collecting preferred payment methods for launch planning.",
      context: {
        streamerId: selectedStreamerId,
        streamerName: selectedStreamer?.display_name ?? null,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        targetType: selectedService.targetType,
        targetLink: targetLink.trim(),
        quantity: parsedQuantity,
        role,
        orderCurrency: currencyPreference.orderCurrency,
      },
    });
  };

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto max-w-6xl px-4 py-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(selectedStreamerId ? { to: "/streamer/$id", params: { id: getStreamerPublicRouteParam({ id: selectedStreamerId, tiktokUsername: selectedStreamer?.tiktok_username }) } } : { to: "/profile" })}
          className="gap-1.5 -ml-3"
        >
          <ArrowLeft className="h-4 w-4" /> {selectedStreamerId ? "К стримеру" : "В кабинет"}
        </Button>

        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/30 px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-cosmic" /> Продвижение TikTok
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold md:text-4xl">Кабинет услуг TikTok</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Выбери формат продвижения, открой нужную группу и оформи заказ на эфир, видео, профиль или комментарии.
            </p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
            {role === "viewer" ? "Поддержка доступна в пару кликов прямо внутри NovaBoost Live." : "Собери заказ по нужной ссылке и количеству без лишних шагов."}
            <div className="mt-1 text-xs">Основная витрина цен: USD. Локальная валюта: {currencyPreference.localCurrency}{currencyPreference.countryCode ? ` (${currencyPreference.countryCode})` : ""}.</div>
            <div className="mt-3"><CurrencySwitcher inline /></div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display text-2xl font-bold">Каталог услуг</h2>
            <p className="mt-2 text-sm text-muted-foreground">Открой нужный раздел и выбери подходящую услугу без длинной ленты карточек.</p>

            {servicesLoading ? (
              <div className="mt-5 text-sm text-muted-foreground">Загружаю каталог услуг…</div>
            ) : services.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-border/50 bg-background/20 p-5 text-sm text-muted-foreground">
                Каталог временно недоступен. Попробуй обновить страницу чуть позже.
              </div>
            ) : (
              <div className="mt-5 space-y-6">
                <div className="flex flex-wrap gap-2">
                  {groupedServices.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => setActiveGroupKey(group.key)}
                      className={`rounded-full border px-4 py-2 text-sm transition-colors ${group.key === activeGroup?.key ? "border-blast bg-blast/10 text-foreground" : "border-border/50 bg-background/20 text-muted-foreground hover:border-foreground/30"}`}
                    >
                      {group.title} · {group.services.length}
                    </button>
                  ))}
                </div>

                {activeGroup && (
                  <div>
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <div>
                        <h3 className="font-display text-xl font-bold">{activeGroup.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{activeGroup.description}</p>
                      </div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {activeGroup.services.map((service) => {
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
                            className={`rounded-2xl border p-4 text-left transition-all ${active ? "border-blast bg-linear-to-br from-blast/12 via-background/40 to-background/60 shadow-glow" : "border-border/50 bg-background/20 hover:border-foreground/30"}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="rounded-full border border-border/50 bg-background/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground w-fit">
                                  {service.subcategory}
                                </div>
                                <div className="mt-3 font-display text-lg font-bold leading-tight text-foreground">{service.name}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <LocalizedPrice
                                  amount={price.customerAmount}
                                  preference={currencyPreference}
                                  primaryClassName="font-display text-xl font-bold text-blast"
                                  secondaryClassName="text-xs text-muted-foreground"
                                  align="right"
                                />
                                <div className="text-xs text-muted-foreground">от {service.min}</div>
                              </div>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-muted-foreground">{service.shortDescription}</p>
                            {service.summaryBullets && service.summaryBullets.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {service.summaryBullets.slice(0, 2).map((bullet) => (
                                  <span key={bullet} className="rounded-full border border-border/50 px-2 py-1 text-[11px] text-muted-foreground">{bullet}</span>
                                ))}
                              </div>
                            )}
                            <div className="mt-3 text-xs text-muted-foreground">{service.targetLabel}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
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
                <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">Кого продвигаем <HelpTooltip text="Здесь выбирается стример, чью TikTok-ссылку или эфир ты хочешь продвигать внутри будущего paid-сценария." /></label>
                <select value={selectedStreamerId} onChange={(event) => setSelectedStreamerId(event.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-foreground">
                  <option value="">— Выбери стримера —</option>
                  {streamers.map((streamer) => (
                    <option key={streamer.id} value={streamer.id}>{streamer.display_name} (@{streamer.tiktok_username})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">{selectedService?.targetLabel ?? "Ссылка TikTok"} <HelpTooltip text="Сюда вставляется целевая TikTok-ссылка: эфир, видео, профиль или другой target, который нужен выбранной услуге." /></label>
                <input value={targetLink} onChange={(event) => setTargetLink(event.target.value)} placeholder={selectedService?.targetPlaceholder ?? getPromotionTargetMeta(selectedService?.targetType).placeholder} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-foreground" />
                <div className="mt-2 text-xs text-muted-foreground">{selectedService?.targetHelp ?? getPromotionTargetMeta(selectedService?.targetType).help}</div>
                {liveTargetSelected && selectedStreamer && !selectedStreamer.is_live && (
                  <div className="mt-2 rounded-xl border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber-foreground">
                    Стример сейчас не в эфире. Live-услугу можно отправить только когда эфир уже начался.
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">Количество <HelpTooltip text="Это объём услуги. Пока checkout ещё не активен, поле нужно для оценки спроса и ожидаемого чека будущего заказа." /></label>
                <input type="number" min={selectedService?.min ?? 1} max={selectedService?.max ?? 1_000_000} value={quantity} onChange={(event) => setQuantity(event.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-foreground" />
              </div>

              <div className="rounded-2xl border border-border/50 bg-background/30 p-4 text-sm text-muted-foreground">
                {selectedService && pricing ? (
                  <>
                    {selectedStreamer && <div>Стример: {selectedStreamer.display_name}</div>}
                    <div>Услуга: {selectedService.name}</div>
                    <div className="mt-1">Подкатегория: {selectedService.subcategory}</div>
                    <div className="mt-2">Количество: {parsedQuantity}</div>
                    <div className="mt-1 font-medium text-foreground">Итоговая стоимость: {pricingMoney?.primary}</div>
                    {pricingMoney?.secondary && <div className="mt-1 text-xs text-muted-foreground">Локально: {pricingMoney.secondary}</div>}
                  </>
                ) : (
                  <div>Выбери услугу, чтобы увидеть итоговую стоимость.</div>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={handleCreateOrder} disabled={!selectedService || (liveTargetSelected && !!selectedStreamer && !selectedStreamer.is_live)} className="bg-gradient-cosmic font-bold text-foreground">
                Оформить услугу
              </Button>
              {!user && <Link to="/auth"><Button variant="outline">Войти</Button></Link>}
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Онлайн-оплата услуг пока не запущена. По кнопке мы покажем сообщение и спросим, какой способ оплаты удобнее именно тебе.
            </p>

            <div className="mt-6 border-t border-border/50 pt-6">
              <h3 className="font-display text-xl font-bold">Последние заказы</h3>
              <div className="mt-4 space-y-3">
                {orders.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/50 bg-background/20 p-4 text-sm text-muted-foreground">
                    После запуска оплаты здесь появятся последние оформленные заказы.
                  </div>
                ) : (
                  orders.map((order) => (
                    <div key={order.id} className="rounded-2xl border border-border/50 bg-background/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{order.serviceName}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{order.createdAt}</div>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs ${order.status === "submitted" ? "bg-cosmic/10 text-cosmic" : order.status === "completed" ? "bg-emerald-500/10 text-emerald-300" : order.status === "queued" ? "bg-amber/10 text-amber-foreground" : order.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-background/40 text-muted-foreground"}`}>
                          {order.status === "submitted" ? "Отправлен" : order.status === "completed" ? "Выполнен" : order.status === "queued" ? "В очереди" : order.status === "failed" ? "Ошибка" : order.status === "cancelled" ? "Отменён" : "Ожидание"}
                        </span>
                      </div>
                      <div className="mt-3 flex items-start justify-between gap-3 text-sm text-muted-foreground">
                        <div>{order.quantity} единиц</div>
                        <LocalizedPrice
                          amount={order.quotedAmount}
                          baseCurrency={resolveSupportedCurrency(order.currency)}
                          preference={currencyPreference}
                          primaryClassName="font-medium text-foreground"
                          secondaryClassName="text-xs text-muted-foreground"
                          align="right"
                        />
                      </div>
                      <div className="mt-2 truncate text-xs text-muted-foreground">{order.targetLink}</div>
                      {order.failureReason && <div className="mt-2 text-xs text-destructive">{order.failureReason}</div>}
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="mt-8 flex justify-center">
          <HowItWorksLink />
        </div>

        <div className="mt-10">
          {helpPanel}
        </div>
      </div>
      {surveyDialog}
    </div>
  );
}