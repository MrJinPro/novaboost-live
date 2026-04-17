import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { LiveIndicator } from "@/components/LiveIndicator";
import { BoostBadge } from "@/components/BoostBadge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, ExternalLink, Users, Zap, TrendingUp } from "lucide-react";
import { formatNumber } from "@/lib/format";
import type { StreamerCardData } from "@/components/StreamerCard";

export const Route = createFileRoute("/streamer/$id")({
  component: StreamerProfile,
});

function StreamerProfile() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [streamer, setStreamer] = useState<StreamerCardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("streamers").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      setStreamer(data as StreamerCardData | null);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return <div className="min-h-screen"><Header /><div className="container mx-auto px-4 py-16 text-center text-muted-foreground">Загрузка…</div></div>;
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

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-6">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/streamers" })} className="gap-1.5 -ml-3">
          <ArrowLeft className="h-4 w-4" /> К каталогу
        </Button>

        <div className={`mt-6 relative overflow-hidden rounded-3xl border bg-surface/70 p-6 md:p-10 ${boosted ? "border-blast/40 shadow-glow" : "border-border/50"}`}>
          {boosted && <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.72_0.20_45/0.1)] via-transparent to-[oklch(0.66_0.24_5/0.1)] pointer-events-none" />}

          <div className="relative flex flex-col md:flex-row md:items-center gap-6">
            <div className="relative shrink-0">
              <img
                src={streamer.avatar_url ?? ""}
                alt={streamer.display_name}
                className={`h-28 w-28 rounded-full bg-surface-2 object-cover ring-4 ${boosted ? "ring-blast/60" : "ring-border"}`}
              />
              {streamer.is_live && (
                <span className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-[var(--live)] ring-4 ring-background animate-pulse-live" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display font-bold text-3xl md:text-4xl">{streamer.display_name}</h1>
                {boosted && <span className="text-3xl">👑</span>}
                {streamer.is_live && <LiveIndicator size="md" />}
              </div>
              <div className="mt-1 text-muted-foreground">@{streamer.tiktok_username}</div>
              {streamer.bio && <p className="mt-3 text-foreground/90 max-w-xl">{streamer.bio}</p>}

              {boosted && (
                <div className="mt-4">
                  <BoostBadge amount={streamer.total_boost_amount} />
                </div>
              )}
            </div>

            <div className="flex md:flex-col gap-3 shrink-0">
              <Link to="/boost" search={{ streamerId: streamer.id }}>
                <Button size="lg" className="bg-gradient-blast text-blast-foreground hover:opacity-90 shadow-glow font-bold gap-2 w-full">
                  <Zap className="h-5 w-5" /> Запустить буст
                </Button>
              </Link>
              <a href={`https://www.tiktok.com/@${streamer.tiktok_username}/live`} target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="gap-2 w-full">
                  <ExternalLink className="h-4 w-4" /> Открыть в TikTok
                </Button>
              </a>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={<Eye className="h-5 w-5" />} label="Зрителей сейчас" value={streamer.is_live ? formatNumber(streamer.viewer_count) : "—"} accent="live" />
          <StatCard icon={<Users className="h-5 w-5" />} label="Подписчиков" value={formatNumber(streamer.followers_count)} />
          <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Трафик отправлено" value={formatNumber((streamer as any).total_traffic_sent ?? 0)} />
          <StatCard icon={<Zap className="h-5 w-5" />} label="Сумма бустов" value={formatNumber(streamer.total_boost_amount)} accent="blast" />
        </div>
      </div>
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
