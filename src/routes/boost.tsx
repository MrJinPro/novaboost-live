import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Crown, Zap } from "lucide-react";
import { toast } from "sonner";
import type { StreamerCardData } from "@/lib/mock-platform";
import { createBoost } from "@/lib/boost-data";
import { loadStreamerDirectory } from "@/lib/streamers-directory-data";
import { loadViewerProfileData } from "@/lib/user-profile-data";

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
  { amount: 25, label: "Старт", desc: "Выше в каталоге на 30 минут", color: "border-border" },
  { amount: 60, label: "Импульс", desc: "Приоритет в live-ленте на 1 час", color: "border-cosmic/40" },
  { amount: 120, label: "Сверхновая", desc: "Максимальный приоритет + crown на 2 часа", color: "border-blast/60 shadow-glow" },
];

function BoostPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [streamers, setStreamers] = useState<StreamerCardData[]>([]);
  const [selected, setSelected] = useState<string>(search.streamerId ?? "");
  const [tier, setTier] = useState<number>(60);
  const [availablePoints, setAvailablePoints] = useState(0);
  const [submitting, setSubmitting] = useState(false);

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

    if (!user || user.role !== "viewer") {
      setAvailablePoints(0);
      return;
    }

    const syncViewerProfile = async () => {
      try {
        const data = await loadViewerProfileData(user);
        if (active) {
          setAvailablePoints(data.points);
        }
      } catch {
        if (active) {
          setAvailablePoints(0);
        }
      }
    };

    void syncViewerProfile();

    return () => {
      active = false;
    };
  }, [user]);

  const streamer = streamers.find((s) => s.id === selected);
  const canAffordTier = availablePoints >= tier;

  const handleBoost = async () => {
    if (!user) {
      toast.error("Войди, чтобы поддержать стримера своими очками");
      navigate({ to: "/auth" });
      return;
    }

    if (user.role !== "viewer") {
      toast.error("Буст за очки доступен только зрителям");
      return;
    }

    if (!selected) {
      toast.error("Выбери стримера");
      return;
    }

    if (!canAffordTier) {
      toast.error(`Недостаточно очков. Нужно ${tier} ⚡, у тебя ${availablePoints} ⚡.`);
      return;
    }

    setSubmitting(true);
    try {
      const result = await createBoost(user, selected, tier);
      setAvailablePoints(result.remainingPoints);
      toast.success(`Буст запущен: ${streamer?.display_name ?? "стример"} получил +${tier} ⚡ к приоритету внутри NovaBoost.`);
      navigate({ to: "/streamer/$id", params: { id: selected } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось запустить буст");
    } finally {
      setSubmitting(false);
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
            Трать свои viewer points, чтобы поднять стримера выше в каталоге, live-ленте и рекомендациях NovaBoost.
          </p>
        </div>

        <section className="mt-6 rounded-2xl border border-border/50 bg-surface/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Твои очки зрителя</div>
              <div className="mt-2 font-display text-3xl font-bold text-gradient-blast">{availablePoints} ⚡</div>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Буст не покупает внешний трафик. Он усиливает видимость стримера внутри NovaBoost: выше место в каталоге, заметнее карточка и приоритет в live-подборках.
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
              <div>Что получает стример:</div>
              <div className="mt-2">выше позицию в каталоге</div>
              <div>приоритет в live-ленте</div>
              <div>корону и подсветку карточки</div>
            </div>
          </div>
        </section>

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
              const affordable = availablePoints >= t.amount;
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
                  <div className={`mt-3 text-[11px] ${affordable ? "text-emerald-300" : "text-amber-300"}`}>
                    {affordable ? "Хватает очков" : "Пока не хватает очков"}
                  </div>
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
              disabled={!selected || !canAffordTier || submitting}
              onClick={() => void handleBoost()}
              className="bg-gradient-blast text-blast-foreground font-bold shadow-glow gap-2 disabled:opacity-50"
            >
              <Zap className="h-5 w-5" />
              {submitting ? "Запускаем…" : "Запустить буст"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            ⚡ Чем выше уровень буста, тем сильнее стример поднимается в выдаче NovaBoost на время действия волны.
          </p>
        </section>

        {!user && (
          <div className="mt-4 rounded-xl border border-border/50 bg-surface/40 p-4 text-sm">
            Чтобы запустить буст, <Link to="/auth" className="text-blast underline">войди или зарегистрируйся</Link>.
          </div>
        )}
      </div>
    </div>
  );
}
