import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Header } from "@/components/Header";
import { LiveIndicator } from "@/components/LiveIndicator";
import { BoostBadge } from "@/components/BoostBadge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bell, Eye, ExternalLink, Send, Users, Zap, TrendingUp } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { getStreamerById } from "@/lib/mock-platform";

export const Route = createFileRoute("/streamer/$id")({
  component: StreamerProfile,
});

function StreamerProfile() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [subscribed, setSubscribed] = useState(false);
  const streamer = getStreamerById(id);

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
                <Button size="lg" variant={subscribed ? "secondary" : "outline"} className="gap-2 w-full" onClick={() => setSubscribed((value) => !value)}>
                  <Bell className="h-4 w-4" /> {subscribed ? "Подписка активна" : "Подписаться"}
                </Button>
                <Link to="/boost" search={{ streamerId: streamer.id }}>
                  <Button size="lg" variant="outline" className="gap-2 w-full border-cosmic/40 hover:bg-cosmic/10">
                    <Zap className="h-4 w-4 text-cosmic" /> Запустить буст
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="gap-2 w-full border-border/60">
                  <Send className="h-4 w-4 text-cosmic" /> Telegram: {streamer.telegram_channel}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={<Eye className="h-5 w-5" />} label="Зрителей сейчас" value={streamer.is_live ? formatNumber(streamer.viewer_count) : "—"} accent="live" />
          <StatCard icon={<Users className="h-5 w-5" />} label="Подписчиков" value={formatNumber(streamer.followers_count)} />
          <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Подписки в платформе" value={formatNumber(streamer.subscription_count)} />
          <StatCard icon={<Zap className="h-5 w-5" />} label="Сумма бустов" value={formatNumber(streamer.total_boost_amount)} accent="blast" />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display font-bold text-2xl">Контент стримера</h2>
            <p className="mt-2 text-sm text-muted-foreground">Платформа должна жить между эфирами, поэтому здесь посты, анонсы и сигналы для подписчиков.</p>
            <div className="mt-5 space-y-3">
              {streamer.posts.map((post) => (
                <article key={post.id} className="rounded-2xl border border-border/50 bg-background/30 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">{post.type}</span>
                    <span className="text-xs text-muted-foreground">{post.createdAt}</span>
                  </div>
                  <h3 className="mt-3 font-display font-bold text-lg">{post.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{post.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-3xl border border-border/50 bg-surface/60 p-6">
              <h2 className="font-display font-bold text-xl">Что даёт подписка</h2>
              <div className="mt-4 space-y-2">
                {streamer.perks.map((perk) => (
                  <div key={perk} className="rounded-xl bg-background/30 px-3 py-2 text-sm text-muted-foreground">{perk}</div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-border/50 bg-surface/60 p-6">
              <h2 className="font-display font-bold text-xl">Сигналы платформы</h2>
              <p className="mt-3 text-sm text-muted-foreground">{streamer.next_event}</p>
              <p className="mt-3 text-sm text-muted-foreground">{streamer.support_goal}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <MiniStat label="Лайки" value={formatNumber(streamer.total_likes)} />
                <MiniStat label="Подарки" value={formatNumber(streamer.total_gifts)} />
              </div>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-border/50 bg-surface/60 p-6">
          <h2 className="font-display font-bold text-2xl">Короткие видео и тизеры</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {streamer.videos.map((video) => (
              <div key={video.id} className="overflow-hidden rounded-2xl border border-border/50 bg-background/30">
                <div className="h-36 bg-cover bg-center" style={{ backgroundImage: `url(${video.cover})` }} />
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">{video.title}</h3>
                    <span className="text-xs text-muted-foreground">{video.duration}</span>
                  </div>
                </div>
              </div>
            ))}
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
