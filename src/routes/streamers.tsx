import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { StreamerCard, type StreamerCardData } from "@/components/StreamerCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

export const Route = createFileRoute("/streamers")({
  head: () => ({
    meta: [
      { title: "Стримеры — NovaBoost Live" },
      { name: "description", content: "Каталог TikTok-стримеров на NovaBoost Live. В эфире, продвигаются, нуждаются в бусте." },
    ],
  }),
  component: StreamersPage,
});

type Filter = "all" | "live" | "boosted" | "needs_boost";

function StreamersPage() {
  const [streamers, setStreamers] = useState<StreamerCardData[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    supabase
      .from("streamers")
      .select("*")
      .order("total_boost_amount", { ascending: false })
      .then(({ data }) => data && setStreamers(data as StreamerCardData[]));
  }, []);

  const filtered = streamers.filter((s) => {
    if (query && !`${s.display_name} ${s.tiktok_username}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === "live") return s.is_live;
    if (filter === "boosted") return s.total_boost_amount > 0;
    if (filter === "needs_boost") return s.needs_boost;
    return true;
  });

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "Все" },
    { value: "live", label: "В эфире" },
    { value: "boosted", label: "Продвигаются" },
    { value: "needs_boost", label: "Нужен буст" },
  ];

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <h1 className="font-display font-bold text-3xl md:text-4xl">Каталог стримеров</h1>
        <p className="mt-2 text-muted-foreground">Найди стримера и помоги ему вырасти</p>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по имени или @username"
              className="pl-9 bg-surface border-border"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {filters.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={filter === f.value ? "default" : "outline"}
                onClick={() => setFilter(f.value)}
                className={filter === f.value ? "bg-gradient-blast text-blast-foreground font-bold" : ""}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => <StreamerCard key={s.id} streamer={s} />)}
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">Никого не нашли по этому запросу</div>
        )}
      </div>
    </div>
  );
}
