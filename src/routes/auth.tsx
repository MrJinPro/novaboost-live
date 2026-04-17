import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Header } from "@/components/Header";
import { Logo } from "@/components/Logo";
import { PlatformDisclaimer } from "@/components/PlatformDisclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Crown, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { mockStreamers } from "@/lib/mock-platform";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Вход и регистрация — NovaBoost Live" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [role, setRole] = useState<"viewer" | "streamer">("viewer");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tiktokUsername, setTiktokUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralQuery, setReferralQuery] = useState("");
  const [referralStreamer, setReferralStreamer] = useState<(typeof mockStreamers)[number] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/profile" });
  }, [user, navigate]);

  const referralMatches = referralQuery
    ? mockStreamers.filter((s) =>
        `${s.display_name} ${s.tiktok_username}`.toLowerCase().includes(referralQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (mode === "signup") {
        if (!email || !username || !displayName || !tiktokUsername || !password) {
          toast.error("Заполни email, имя, отображаемое имя, TikTok username и пароль");
          setSubmitting(false);
          return;
        }

        if (password.length < 6) {
          toast.error("Пароль должен быть не короче 6 символов");
          setSubmitting(false);
          return;
        }

        if (password !== confirmPassword) {
          toast.error("Пароли не совпадают");
          setSubmitting(false);
          return;
        }

        await signUp({ role, email, username, displayName, tiktokUsername, password });
        toast.success(
          role === "streamer"
            ? "Профиль стримера создан. Дальше подключим автотрекинг и кабинет роста."
            : `Профиль зрителя создан${referralStreamer ? `, любимый стример: ${referralStreamer.display_name}` : ""}.`
        );
      } else {
        if (!email || !tiktokUsername || !password) {
          toast.error("Для входа укажи email, TikTok username и пароль");
          setSubmitting(false);
          return;
        }

        await signIn({ role, email, tiktokUsername, password });
        toast.success(role === "streamer" ? "Вход в кабинет стримера выполнен" : "Вход выполнен");
      }
      setSubmitting(false);
      navigate({ to: "/profile" });
    } catch (error) {
      setSubmitting(false);
      toast.error(error instanceof Error ? error.message : "Не удалось выполнить вход");
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-12 max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex"><Logo size="lg" showText={false} /></div>
          <h1 className="mt-4 font-display font-bold text-3xl">
            {mode === "signup"
              ? role === "viewer" ? "Регистрация зрителя TikTok LIVE" : "Регистрация стримера TikTok LIVE"
              : role === "viewer" ? "Вход для зрителя" : "Вход для стримера"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signup"
              ? role === "viewer"
                ? "Сервис для аудитории TikTok-стримеров: подписки, задания, сигналы и участие в росте эфиров."
                : "Сторонняя платформа для TikTok-стримеров: рост, бусты, контент, Telegram и автоматический live-tracking."
              : role === "viewer"
                ? "Войди в свой профиль зрителя, чтобы продолжить участие в активностях вокруг TikTok-эфиров."
                : "Войди в кабинет стримера, чтобы управлять страницей и ростом вокруг TikTok LIVE."}
          </p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setMode("signup")} className={`rounded-2xl border p-3 text-sm font-semibold ${mode === "signup" ? "border-blast bg-blast/5 text-foreground" : "border-border/50 bg-surface/40 text-muted-foreground"}`}>
            Регистрация
          </button>
          <button type="button" onClick={() => setMode("signin")} className={`rounded-2xl border p-3 text-sm font-semibold ${mode === "signin" ? "border-cosmic bg-cosmic/10 text-foreground" : "border-border/50 bg-surface/40 text-muted-foreground"}`}>
            Вход
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setRole("viewer")} className={`rounded-2xl border p-4 text-left ${role === "viewer" ? "border-blast bg-blast/5 shadow-glow" : "border-border/50 bg-surface/40"}`}>
            <Users className="h-5 w-5 text-blast" />
            <div className="mt-3 font-display font-bold">Я зритель</div>
            <div className="mt-1 text-xs text-muted-foreground">Задания, подписки, очки, сигналы.</div>
          </button>
          <button type="button" onClick={() => setRole("streamer")} className={`rounded-2xl border p-4 text-left ${role === "streamer" ? "border-cosmic bg-cosmic/10 shadow-glow-cosmic" : "border-border/50 bg-surface/40"}`}>
            <Crown className="h-5 w-5 text-cosmic" />
            <div className="mt-3 font-display font-bold">Я стример</div>
            <div className="mt-1 text-xs text-muted-foreground">Профиль, буст, контент, автотрекинг live.</div>
          </button>
        </div>

        <div className="mb-4">
          <PlatformDisclaimer compact />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border/50 bg-surface/60 p-6">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1.5 bg-background" />
          </div>

          {mode === "signup" && (
            <>
              <div>
                <Label htmlFor="username">Внутренний username</Label>
                <Input id="username" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="nova_user" className="mt-1.5 bg-background" />
              </div>
              <div>
                <Label htmlFor="displayName">Отображаемое имя</Label>
                <Input id="displayName" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Например, Алина Luna" className="mt-1.5 bg-background" />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="tiktokUsername">TikTok username</Label>
            <Input id="tiktokUsername" required value={tiktokUsername} onChange={(e) => setTiktokUsername(e.target.value)} placeholder={mode === "signin" ? "Нужен для входа в существующий профиль" : "Введите вручную, без автоподстановки"} className="mt-1.5 bg-background" />
          </div>

          <div>
            <Label htmlFor="password">Пароль</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signin" ? "Введите пароль профиля" : "Минимум 6 символов"} className="mt-1.5 bg-background" />
          </div>

          {mode === "signup" && (
            <div>
              <Label htmlFor="confirmPassword">Повтори пароль</Label>
              <Input id="confirmPassword" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Повторите пароль" className="mt-1.5 bg-background" />
            </div>
          )}

          {mode === "signup" && role === "viewer" && (
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

          {mode === "signup" && role === "streamer" && (
            <div className="rounded-xl border border-cosmic/30 bg-cosmic/10 p-4 text-sm text-muted-foreground">
              После регистрации стримера backend должен добавить аккаунт в пул отслеживания и автоматически подключаться к новым live-сессиям без ручной кнопки подключиться.
            </div>
          )}

          {mode === "signin" && (
            <div className="rounded-xl border border-border/50 bg-background/30 p-4 text-sm text-muted-foreground">
              В текущем mock-режиме вход выполняется по email, роли аккаунта, TikTok username и паролю, которые были указаны при регистрации. Следующим этапом это уйдёт в нормальный backend-auth.
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full bg-gradient-blast text-blast-foreground font-bold shadow-glow">
            {submitting ? "Подождите…" : mode === "signup" ? role === "viewer" ? "Создать профиль зрителя" : "Создать профиль стримера" : role === "viewer" ? "Войти как зритель" : "Войти как стример"}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← На главную</Link>
        </div>
      </div>
    </div>
  );
}
