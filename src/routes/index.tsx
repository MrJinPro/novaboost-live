import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { PlatformDisclaimer } from "@/components/PlatformDisclaimer";
import { ProjectHelpPanel } from "@/components/ProjectHelpPanel";
import { StreamerCard } from "@/components/StreamerCard";
import { Logo } from "@/components/Logo";
import { LiveIndicator } from "@/components/LiveIndicator";
import { BoostBadge } from "@/components/BoostBadge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Crown, Eye, Flame, Send, Sparkles, Trophy, Zap } from "lucide-react";
import { formatNumber } from "@/lib/format";
import type { StreamerCardData } from "@/lib/mock-platform";
import { loadStreamerDirectory } from "@/lib/streamers-directory-data";
import { loadHomeActivityFeed, type HomeActivityItem } from "@/lib/home-activity-data";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NovaBoost Live — Главная" },
      { name: "description", content: "Реальное время: какие стримы сейчас в эфире, кому нужен буст и кто продвигается прямо сейчас." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [streamers, setStreamers] = useState<StreamerCardData[]>([]);
  const [activityFeed, setActivityFeed] = useState<HomeActivityItem[]>([]);

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
          toast.error(error instanceof Error ? error.message : "Не удалось обновить главную витрину стримеров");
        }
      }
    };

    const syncActivity = async () => {
      try {
        const data = await loadStreamerDirectory();
        const activity = await loadHomeActivityFeed(data);
        if (active) {
          setActivityFeed(activity);
        }
      } catch {
        if (active) {
          setActivityFeed([]);
        }
      }
    };

    void syncStreamers();
    void syncActivity();

    return () => {
      active = false;
    };
  }, []);

  const live = streamers.filter((s) => s.is_live);
  const boosted = streamers.filter((s) => s.total_boost_amount > 0);
  const needsBoost = streamers.filter((s) => s.needs_boost && s.is_live).slice(0, 4);
  const top = [...streamers].sort((a, b) => (b.subscription_count ?? 0) - (a.subscription_count ?? 0)).slice(0, 5);
  const totalLiveViewers = live.reduce((acc, s) => acc + s.viewer_count, 0);

  return (
    <div className="min-h-screen">
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,oklch(0.72_0.20_45/0.18),transparent_50%),radial-gradient(circle_at_70%_60%,oklch(0.58_0.21_285/0.18),transparent_50%)]" />
        <div className="container mx-auto relative px-4 py-10 md:py-20">
          <div className="grid items-center gap-8 md:grid-cols-[1.2fr_1fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                <Sparkles className="h-3 w-3 text-blast" />
                Реальное время · Платформа для TikTok LIVE-стримеров
              </div>
              <h1 className="mt-5 max-w-3xl font-display text-3xl font-bold leading-[1.02] tracking-tight sm:text-4xl md:text-6xl">
                Платформа роста для{" "}
                <span className="text-gradient-nova">TikTok LIVE-стримеров</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                NovaBoost Live - сторонний сервис для TikTok-стримеров и их аудитории: отслеживание эфиров, рост через бусты и сигналы, удержание через контент, Telegram и геймификацию.
              </p>
              <div className="mt-5 max-w-2xl">
                <PlatformDisclaimer compact />
              </div>
              <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap">
                <Link to="/streamers">
                  <Button size="lg" className="w-full bg-gradient-blast font-bold text-blast-foreground shadow-glow hover:opacity-90 sm:w-auto gap-2">
                    Смотреть стримы
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/boost">
                  <Button size="lg" variant="outline" className="w-full border-cosmic/40 gap-2 hover:bg-cosmic/10 sm:w-auto">
                    <Zap className="h-4 w-4 text-cosmic" />
                    Запустить буст
                  </Button>
                </Link>
                <Link to="/auth">
                  <Button size="lg" variant="outline" className="w-full border-border/60 gap-2 hover:bg-surface sm:w-auto">
                    <Crown className="h-4 w-4 text-crown" />
                    Я стример
                  </Button>
                </Link>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-4 text-sm sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-3">
                <Stat label="В эфире" value={live.length} accent="live" />
                <Stat label="Зрителей сейчас" value={formatNumber(totalLiveViewers)} accent="blast" />
                <Stat label="Активных бустов" value={boosted.length} accent="cosmic" />
              </div>
            </div>

            <div className="hidden md:flex justify-center animate-float-slow">
              <Logo size="xl" showText={false} />
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-10">
        <ProjectHelpPanel
          title="Что здесь можно делать"
          description="Этот блок объясняет продукт простыми словами: что именно делает NovaBoost Live, чем отличаются очки, бусты, каталог и инструменты стримера."
          items={[
            {
              key: "project",
              title: "Что такое NovaBoost Live",
              body: "Это отдельная платформа вокруг TikTok LIVE. Она помогает стримерам и зрителям взаимодействовать между эфирами: находить друг друга, поддерживать рост, публиковать контент и участвовать в активностях.",
            },
            {
              key: "catalog",
              title: "Что показывает каталог стримеров",
              body: "Каталог показывает, кто сейчас в эфире, кому нужен буст, кто уже продвигается и какие стримеры заметнее внутри самой экосистемы NovaBoost Live.",
            },
            {
              key: "boost",
              title: "Что дают viewer points и бусты",
              body: "Зрители получают очки за активность и могут тратить их на бусты. Буст поднимает стримера выше внутри NovaBoost Live, но не обещает внешний трафик или метрики TikTok сам по себе.",
            },
          ]}
        />
      </section>

      {/* BENTO GRID */}
      <section className="container mx-auto px-4 py-10">
        <div className="grid gap-4 md:grid-cols-12">
            {/* 🔴 СЕЙЧАС В ЭФИРЕ — самый крупный блок */}
            <BentoBlock className="md:col-span-8 md:row-span-2">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[oklch(0.66_0.27_25/0.18)]">
                    <Eye className="h-5 w-5 text-[oklch(0.85_0.15_25)]" />
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-xl">Сейчас в эфире</h2>
                    <p className="text-xs text-muted-foreground">{live.length} стримеров онлайн</p>
                  </div>
                </div>
                <Link to="/streamers" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  Все <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {live.slice(0, 4).map((s) => (
                  <StreamerCard key={s.id} streamer={s} />
                ))}
              </div>
            </BentoBlock>

            {/* 👑 ПРОДВИГАЕМЫЕ */}
            <BentoBlock className="md:col-span-4" accent="blast">
              <BlockHeader icon={<Crown className="h-5 w-5 text-crown" />} title="Продвигаемые" subtitle="Стримеры с активным бустом" />
              <div className="space-y-2 mt-4">
                {boosted.slice(0, 4).map((s) => (
                  <StreamerCard key={s.id} streamer={s} variant="compact" />
                ))}
                {boosted.length === 0 && (
                  <EmptyState text="Пока никто не продвигается" />
                )}
              </div>
            </BentoBlock>

            {/* 🔥 НУЖЕН БУСТ */}
            <BentoBlock className="md:col-span-4" accent="magenta">
              <BlockHeader icon={<Flame className="h-5 w-5 text-magenta" />} title="Нужен буст" subtitle="Помоги им набрать аудиторию" />
              <div className="space-y-2 mt-4">
                {needsBoost.map((s) => (
                  <StreamerCard key={s.id} streamer={s} variant="compact" />
                ))}
                {needsBoost.length === 0 && <EmptyState text="Все обеспечены аудиторией ✨" />}
              </div>
            </BentoBlock>

            {/* 🏆 ТОП СТРИМЕРОВ */}
            <BentoBlock className="md:col-span-4">
              <BlockHeader icon={<Trophy className="h-5 w-5 text-amber" />} title="Топ стримеров" subtitle="По подпискам внутри платформы" />
              <div className="mt-4 space-y-2">
                {top.map((s, idx) => (
                  <Link
                    key={s.id}
                    to="/streamer/$id"
                    params={{ id: s.id }}
                    className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-2"
                  >
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
                      idx === 0 ? "bg-gradient-blast text-blast-foreground" :
                      idx === 1 ? "bg-surface-2 text-foreground" :
                      "bg-surface text-muted-foreground"
                    }`}>
                      {idx + 1}
                    </div>
                    <img src={s.avatar_url ?? ""} alt="" className="h-8 w-8 rounded-full bg-surface-2" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{s.display_name}</div>
                      <div className="text-[10px] text-muted-foreground">{formatNumber(s.subscription_count ?? 0)} подписчиков в платформе</div>
                    </div>
                  </Link>
                ))}
              </div>
            </BentoBlock>

            {/* CTA — стать стримером */}
            <BentoBlock className="md:col-span-4 relative overflow-hidden" accent="cosmic">
              <div className="absolute inset-0 bg-gradient-cosmic opacity-10" />
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cosmic/20">
                  <Zap className="h-5 w-5 text-cosmic" />
                </div>
                <h3 className="mt-3 font-display font-bold text-lg">Ты стример?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Зарегистрируй TikTok username один раз, а дальше система сама начнёт отслеживать твои эфиры и собирать сигналы роста.
                </p>
                <Link to="/auth">
                  <Button size="sm" className="mt-4 bg-gradient-cosmic text-foreground hover:opacity-90 font-bold gap-2 shadow-glow-cosmic">
                    Подключиться
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </BentoBlock>

            {/* Лента активности */}
            <BentoBlock className="md:col-span-8">
              <BlockHeader icon={<Sparkles className="h-5 w-5 text-blast" />} title="Лента активности" subtitle="Что происходит в реальном времени" />
              <div className="mt-4 space-y-2">
                {activityFeed.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-surface/40 px-3 py-2.5 text-sm">
                    {item.tone === "boost" ? <BoostBadge amount={1500} variant="compact" /> : item.tone === "live" ? <LiveIndicator /> : <Send className="h-4 w-4 text-cosmic" />}
                    <span className="flex-1">
                      <span className="font-semibold">{item.title}</span>
                      <span className="text-muted-foreground"> · {item.body}</span>
                    </span>
                  </div>
                ))}
                {activityFeed.length === 0 && <EmptyState text="Пока нет свежих публичных событий в ленте" />}
              </div>
            </BentoBlock>

            <BentoBlock className="md:col-span-6" accent="cosmic">
              <BlockHeader icon={<Send className="h-5 w-5 text-cosmic" />} title="Telegram-контур" subtitle="Второй интерфейс платформы" />
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <p>Сигналы о старте эфира, кодовые слова, быстрые заходы в рейд и анонсы контента должны жить не только в web.</p>
                <p>Frontend уже проектируется так, чтобы Telegram был частью продукта, а не дополнительной кнопкой потом.</p>
              </div>
            </BentoBlock>

            <BentoBlock className="md:col-span-6" accent="magenta">
              <BlockHeader icon={<Sparkles className="h-5 w-5 text-magenta" />} title="Между эфирами тоже жизнь" subtitle="Контентный слой стримера" />
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p>У стримера внутри платформы будут посты, короткие видео, анонсы и кастомное оформление страницы.</p>
                <p>Это удерживает аудиторию между эфирами и делает NovaBoost Live мини-соцсетью вокруг стримов.</p>
              </div>
            </BentoBlock>
          </div>
      </section>

    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent: "live" | "blast" | "cosmic" }) {
  const colors = {
    live: "text-[oklch(0.85_0.15_25)]",
    blast: "text-blast",
    cosmic: "text-cosmic",
  };
  return (
    <div className="min-w-0 rounded-2xl border border-border/40 bg-surface/30 px-3 py-3 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
      <div className={`font-display text-2xl font-bold ${colors[accent]}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground sm:text-xs">{label}</div>
    </div>
  );
}

function BentoBlock({ children, className = "", accent }: { children: React.ReactNode; className?: string; accent?: "blast" | "cosmic" | "magenta" }) {
  const accentBorder = {
    blast: "border-blast/30 hover:border-blast/50",
    cosmic: "border-cosmic/30 hover:border-cosmic/50",
    magenta: "border-magenta/30 hover:border-magenta/50",
  };
  return (
    <div className={`rounded-2xl border bg-surface/60 p-4 backdrop-blur transition-colors sm:p-5 ${accent ? accentBorder[accent] : "border-border/50 hover:border-border"} ${className}`}>
      {children}
    </div>
  );
}

function BlockHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2">{icon}</div>
      <div>
        <h2 className="font-display font-bold">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground py-3 text-center">{text}</div>;
}
