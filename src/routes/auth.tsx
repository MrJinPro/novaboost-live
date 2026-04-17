import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Header } from "@/components/Header";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";
import { toast } from "sonner";
import type { StreamerCardData } from "@/components/StreamerCard";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Вход — NovaBoost Live" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [referralQuery, setReferralQuery] = useState("");
  const [referralStreamer, setReferralStreamer] = useState<StreamerCardData | null>(null);
  const [streamers, setStreamers] = useState<StreamerCardData[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/profile" });
  }, [user, navigate]);

  useEffect(() => {
    if (mode === "signup") {
      supabase.from("streamers").select("*").then(({ data }) => data && setStreamers(data as StreamerCardData[]));
    }
  }, [mode]);

  const referralMatches = referralQuery
    ? streamers.filter((s) =>
        `${s.display_name} ${s.tiktok_username}`.toLowerCase().includes(referralQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { username, display_name: username },
        },
      });
      if (error) {
        toast.error(error.message);
        setSubmitting(false);
        return;
      }
      if (data.user && referralStreamer) {
        // ждём, пока триггер создаст профиль
        await new Promise((r) => setTimeout(r, 600));
        await supabase.from("referrals").insert({ viewer_id: data.user.id, streamer_id: referralStreamer.id });
        await supabase.from("profiles").update({ referred_streamer_id: referralStreamer.id }).eq("id", data.user.id);
      }
      toast.success("Аккаунт создан! Добро пожаловать в NovaBoost ⚡");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
        setSubmitting(false);
        return;
      }
      toast.success("С возвращением!");
    }
    setSubmitting(false);
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-12 max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex"><Logo size="lg" showText={false} /></div>
          <h1 className="mt-4 font-display font-bold text-3xl">
            {mode === "signin" ? "С возвращением" : "Создать аккаунт"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signin" ? "Войди в NovaBoost Live" : "Присоединяйся к движку трафика"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border/50 bg-surface/60 p-6">
          {mode === "signup" && (
            <div>
              <Label htmlFor="username">Имя пользователя</Label>
              <Input id="username" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="nova_user" className="mt-1.5 bg-background" />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1.5 bg-background" />
          </div>
          <div>
            <Label htmlFor="password">Пароль</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Минимум 6 символов" className="mt-1.5 bg-background" />
          </div>

          {mode === "signup" && (
            <div>
              <Label>Реферальный стример (необязательно)</Label>
              {referralStreamer ? (
                <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-cosmic/40 bg-cosmic/10 p-2">
                  <img src={referralStreamer.avatar_url ?? ""} className="h-8 w-8 rounded-full" alt="" />
                  <span className="flex-1 text-sm font-semibold">{referralStreamer.display_name}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setReferralStreamer(null); setReferralQuery(""); }}>Убрать</Button>
                </div>
              ) : (
                <div className="mt-1.5 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={referralQuery}
                    onChange={(e) => setReferralQuery(e.target.value)}
                    placeholder="Найти стримера…"
                    className="pl-9 bg-background"
                  />
                  {referralMatches.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-popover shadow-card overflow-hidden">
                      {referralMatches.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => { setReferralStreamer(s); setReferralQuery(""); }}
                          className="flex items-center gap-2 w-full p-2 hover:bg-surface text-left"
                        >
                          <img src={s.avatar_url ?? ""} className="h-7 w-7 rounded-full" alt="" />
                          <div className="text-sm">
                            <div className="font-semibold">{s.display_name}</div>
                            <div className="text-xs text-muted-foreground">@{s.tiktok_username}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full bg-gradient-blast text-blast-foreground font-bold shadow-glow">
            {submitting ? "Подождите…" : mode === "signin" ? "Войти" : "Создать аккаунт"}
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            {mode === "signin" ? "Нет аккаунта?" : "Уже есть аккаунт?"}{" "}
            <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="text-blast hover:underline font-semibold">
              {mode === "signin" ? "Создать" : "Войти"}
            </button>
          </div>
        </form>

        <div className="mt-4 text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← На главную</Link>
        </div>
      </div>
    </div>
  );
}
