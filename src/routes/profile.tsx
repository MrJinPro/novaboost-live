import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Award, LogOut, Sparkles, Trophy } from "lucide-react";
import { formatNumber } from "@/lib/format";

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

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  points: number;
  level: number;
}

function ProfilePage() {
  const { user, loading, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [boostsCount, setBoostsCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => setProfile(data as Profile | null));
    supabase.from("task_completions").select("id", { count: "exact", head: true }).eq("user_id", user.id).then(({ count }) => setCompletedCount(count ?? 0));
    supabase.from("boosts").select("id", { count: "exact", head: true }).eq("user_id", user.id).then(({ count }) => setBoostsCount(count ?? 0));
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

  const points = profile?.points ?? 0;
  const level = profile?.level ?? 1;
  const progress = points % 100;

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="rounded-3xl border border-border/50 bg-surface/60 p-6 md:p-8">
          <div className="flex flex-col sm:flex-row gap-5 items-start">
            <div className="h-20 w-20 rounded-full bg-gradient-cosmic shrink-0 flex items-center justify-center text-2xl font-display font-bold shadow-glow-cosmic">
              {(profile?.display_name ?? profile?.username ?? "?").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-bold text-2xl md:text-3xl">{profile?.display_name ?? profile?.username}</h1>
              <div className="text-muted-foreground text-sm">@{profile?.username}</div>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-cosmic px-3 py-1 text-sm font-bold shadow-glow-cosmic">
                <Sparkles className="h-4 w-4" /> Уровень {level}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={signOut} className="gap-2">
              <LogOut className="h-4 w-4" /> Выйти
            </Button>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">До уровня {level + 1}</span>
              <span className="font-bold">{progress}/100</span>
            </div>
            <div className="h-3 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-gradient-blast transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <StatBox icon={<Trophy className="h-5 w-5" />} label="Очков" value={formatNumber(points)} accent="blast" />
          <StatBox icon={<Award className="h-5 w-5" />} label="Заданий" value={String(completedCount)} />
          <StatBox icon={<Sparkles className="h-5 w-5" />} label="Бустов" value={String(boostsCount)} accent="cosmic" />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link to="/tasks"><Button variant="outline" className="w-full gap-2"><Trophy className="h-4 w-4" /> К заданиям</Button></Link>
          <Link to="/boost"><Button className="w-full gap-2 bg-gradient-blast text-blast-foreground font-bold"><Sparkles className="h-4 w-4" /> Запустить буст</Button></Link>
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
