import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Trophy, Crown, Users } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { Link } from "@tanstack/react-router";
import { mockStreamers, mockViewerStandings } from "@/lib/mock-platform";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Рейтинг — NovaBoost Live" },
      { name: "description", content: "Топ стримеров и зрителей NovaBoost Live по подписчикам, бустам и очкам." },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const streamers = [...mockStreamers].sort((a, b) => b.total_boost_amount - a.total_boost_amount).slice(0, 10);
  const viewers = mockViewerStandings;

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-2">
          <Trophy className="h-7 w-7 text-amber" />
          <h1 className="font-display font-bold text-3xl md:text-4xl">Рейтинг</h1>
        </div>
        <p className="mt-2 text-muted-foreground">Топ стримеров и активных зрителей</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Стримеры */}
          <section className="rounded-2xl border border-border/50 bg-surface/60 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="h-5 w-5 text-crown" />
              <h2 className="font-display font-bold text-xl">Топ стримеров</h2>
            </div>
            <div className="space-y-2">
              {streamers.map((s, idx) => (
                <Link key={s.id} to="/streamer/$id" params={{ id: s.id }} className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface-2 transition-colors">
                  <RankBadge rank={idx + 1} />
                  <img src={s.avatar_url ?? ""} className="h-10 w-10 rounded-full bg-surface-2" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 truncate">
                      <span className="font-semibold truncate">{s.display_name}</span>
                      {s.total_boost_amount > 0 && <span>👑</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatNumber(s.followers_count)} подписчиков</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-blast">{formatNumber(s.total_boost_amount)} ⚡</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Зрители */}
          <section className="rounded-2xl border border-border/50 bg-surface/60 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-cosmic" />
              <h2 className="font-display font-bold text-xl">Топ зрителей</h2>
            </div>
            {viewers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Пока никто не набрал очки. Стань первым!</p>
            ) : (
              <div className="space-y-2">
                {viewers.map((v, idx) => (
                  <div key={v.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface-2 transition-colors">
                    <RankBadge rank={idx + 1} />
                    <div className="h-10 w-10 rounded-full bg-gradient-cosmic flex items-center justify-center font-bold">
                      {(v.display_name ?? v.username).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{v.display_name ?? v.username}</div>
                      <div className="text-xs text-muted-foreground">Уровень {v.level}</div>
                    </div>
                    <div className="text-right font-bold text-cosmic">{formatNumber(v.points)} ⚡</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const styles =
    rank === 1 ? "bg-gradient-blast text-blast-foreground shadow-glow" :
    rank === 2 ? "bg-surface-2 text-foreground border border-border" :
    rank === 3 ? "bg-amber/20 text-amber border border-amber/40" :
    "bg-surface text-muted-foreground border border-border";
  return <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${styles}`}>{rank}</div>;
}
