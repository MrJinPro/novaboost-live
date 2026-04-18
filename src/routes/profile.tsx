import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Award, Crown, ExternalLink, LogOut, Sparkles, Trophy } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { loadViewerProfileData, type ViewerProfileData } from "@/lib/user-profile-data";
import { getOwnedStreamerPublicPage } from "@/lib/streamer-studio-data";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("sb-auth-token");
    if (!stored) {
      // мягкая проверка: на клиенте редиректим, если сессии нет
    }
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { user, loading, signOut } = useAuth();
  const [viewerProfile, setViewerProfile] = useState<ViewerProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [publicPageId, setPublicPageId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!user || user.role !== "viewer") {
      setViewerProfile(null);
      return;
    }

    const syncProfile = async () => {
      setProfileLoading(true);
      try {
        const data = await loadViewerProfileData(user);
        if (active) {
          setViewerProfile(data);
        }
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Не удалось загрузить профиль зрителя");
        }
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    };

    void syncProfile();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;

    if (!user || user.role !== "streamer") {
      setPublicPageId(null);
      return;
    }

    const syncPublicPage = async () => {
      try {
        const page = await getOwnedStreamerPublicPage(user.id);
        if (active) {
          setPublicPageId(page?.id ?? null);
        }
      } catch {
        if (active) {
          setPublicPageId(null);
        }
      }
    };

    void syncPublicPage();

    return () => {
      active = false;
    };
  }, [user]);

  if (loading) {
    return <div className="min-h-screen"><Header /><div className="container mx-auto px-4 py-16 text-center text-muted-foreground">Загрузка…</div></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen"><Header />
        <div className="container mx-auto px-4 py-16 text-center max-w-md">
          <h1 className="font-display text-2xl font-bold">Нужна авторизация</h1>
          <p className="mt-2 text-muted-foreground">Чтобы увидеть профиль, войди или создай аккаунт.</p>
          <Link to="/auth"><Button className="mt-4 bg-gradient-blast text-blast-foreground font-bold shadow-glow">Войти</Button></Link>
        </div>
      </div>
    );
  }

  const points = viewerProfile?.points ?? 0;
  const level = viewerProfile?.level ?? 1;
  const progress = points % 100;
  const favoriteStreamers = viewerProfile?.subscriptions ?? [];
  const isStreamer = user.role === "streamer";

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="rounded-3xl border border-border/50 bg-surface/60 p-6 md:p-8">
          <div className="flex flex-col sm:flex-row gap-5 items-start">
            <div className="h-20 w-20 rounded-full bg-gradient-cosmic shrink-0 flex items-center justify-center text-2xl font-display font-bold shadow-glow-cosmic">
              {(user.displayName ?? user.username ?? "?").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-bold text-2xl md:text-3xl">{user.displayName}</h1>
              <div className="text-muted-foreground text-sm">@{user.username} · TikTok: @{user.tiktokUsername}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-gradient-cosmic px-3 py-1 text-sm font-bold shadow-glow-cosmic">
                  <Sparkles className="h-4 w-4" /> {isStreamer ? "Стримерский кабинет" : `Уровень ${level}`}
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-3 py-1 text-sm text-muted-foreground">
                  {isStreamer ? <Crown className="h-4 w-4 text-crown" /> : <Award className="h-4 w-4 text-blast" />}
                  {isStreamer ? "Автотрекинг: запланирован" : `Серия активности: ${viewerProfile?.streakDays ?? 0} дней`}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={signOut} className="gap-2">
              <LogOut className="h-4 w-4" /> Выйти
            </Button>
          </div>

          {!isStreamer && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">До уровня {level + 1}</span>
                <span className="font-bold">{progress}/100</span>
              </div>
              <div className="h-3 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-gradient-blast transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <StatBox icon={<Trophy className="h-5 w-5" />} label={isStreamer ? "Подписчиков" : "Очков"} value={formatNumber(isStreamer ? 1240 : points)} accent="blast" />
          <StatBox icon={<Award className="h-5 w-5" />} label={isStreamer ? "Эфиров в трекинге" : "Заданий"} value={String(isStreamer ? 8 : viewerProfile?.completedTasks ?? 0)} />
          <StatBox icon={<Sparkles className="h-5 w-5" />} label={isStreamer ? "Telegram-связки" : "Бустов"} value={String(isStreamer ? 1 : viewerProfile?.boostsJoined ?? 0)} accent="cosmic" />
        </div>

        {!isStreamer && favoriteStreamers.length > 0 && (
          <div className="mt-6 rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display font-bold text-xl">Подписки на стримеров</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {favoriteStreamers.map((streamer) => (
                <Link key={streamer!.id} to="/streamer/$id" params={{ id: streamer!.id }} className="rounded-2xl border border-border/50 bg-background/30 p-4 hover:border-blast/40 transition-colors">
                  <div className="font-semibold">{streamer!.display_name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">@{streamer!.tiktok_username}</div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!isStreamer && !profileLoading && favoriteStreamers.length === 0 && (
          <div className="mt-6 rounded-3xl border border-border/50 bg-surface/60 p-6 text-sm text-muted-foreground">
            У тебя пока нет подписок внутри платформы. Открой каталог стримеров и подпишись на интересных тебе авторов.
          </div>
        )}

        {isStreamer && (
          <div className="mt-6 rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display font-bold text-xl">Что будет в кабинете стримера</h2>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p>Отслеживание live-статуса и запуск stream-worker без ручного подключения к каждому эфиру.</p>
              <p>Контентный слой: посты, короткие видео, анонсы и оформление страницы.</p>
              <p>Инструменты роста: бусты, сигналы нужен буст, Telegram-канал и внутренняя аналитика активности.</p>
            </div>
            <div className="mt-5">
              <div className="flex flex-wrap gap-3">
                <Link to="/studio">
                  <Button className="bg-gradient-cosmic text-foreground font-bold">Настроить публичную страницу</Button>
                </Link>
                <Link to="/services">
                  <Button variant="outline">Услуги продвижения</Button>
                </Link>
                {publicPageId && (
                  <Link to="/streamer/$id" params={{ id: publicPageId }}>
                    <Button variant="outline" className="gap-2">
                      <ExternalLink className="h-4 w-4" /> Открыть публичную страницу
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        <div className={`mt-6 grid gap-3 ${isStreamer ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <Link to="/tasks"><Button variant="outline" className="w-full gap-2"><Trophy className="h-4 w-4" /> К заданиям</Button></Link>
          <Link to="/boost"><Button className="w-full gap-2 bg-gradient-blast text-blast-foreground font-bold"><Sparkles className="h-4 w-4" /> Запустить буст</Button></Link>
          {isStreamer && <Link to="/studio"><Button variant="outline" className="w-full gap-2">Студия стримера</Button></Link>}
        </div>
      </div>
    </div>
  );
}

function StatBox({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: "blast" | "cosmic" }) {
  const c = accent === "blast" ? "text-blast" : accent === "cosmic" ? "text-cosmic" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border/50 bg-surface/60 p-4">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 ${c}`}>{icon}</div>
      <div className={`mt-3 font-display font-bold text-2xl ${c}`}>{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}
