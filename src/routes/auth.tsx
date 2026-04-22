import { createFileRoute, useLocation, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Header } from "@/components/Header";
import { Logo } from "@/components/Logo";
import { PlatformDisclaimer } from "@/components/PlatformDisclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStreamerDirectory } from "@/hooks/use-streamer-directory";
import type { StreamerCardData } from "@/lib/mock-platform";
import { normalizeTikTokUsername } from "@/lib/tiktok-profile-data";
import { Eye, EyeOff, Search } from "lucide-react";
import { toast } from "sonner";

function getAuthMeta(search: string) {
  const params = new URLSearchParams(search);
  const referralId = params.get("ref")?.trim() ?? "";
  const referralName = params.get("refName")?.trim() ?? "";
  const referralUsername = normalizeTikTokUsername(params.get("refUsername") ?? "");
  const inviteTikTokUsername = normalizeTikTokUsername(params.get("tiktok") ?? "");
  const appUrl = (import.meta.env.VITE_APP_URL || "https://live.novaboost.cloud").replace(/\/$/, "");
  const canonicalUrl = `${appUrl}/auth${search || ""}`;

  if (referralId) {
    const inviterLabel = referralName || (referralUsername ? `@${referralUsername}` : "друг из NovaBoost Live");
    const title = `Конкурс NovaBoost Live: присоединяйся по приглашению ${inviterLabel}`;
    const description = "Присоединяйся к конкурсу NovaBoost Live, регистрируйся, приглашай друзей, стримеров и зрителей. До 15 мая идёт гонка приглашений, а лидер получит TikTok-подарок «Ныряющий Кит» на 2150 diamonds.";

    return {
      title,
      description,
      canonicalUrl,
    };
  }

  if (inviteTikTokUsername) {
    const title = `NovaBoost Live: регистрация для @${inviteTikTokUsername}`;
    const description = "Заверши регистрацию в NovaBoost Live, подключи свой TikTok username и включайся в рост через бусты, Telegram, контент и конкурс приглашений.";

    return {
      title,
      description,
      canonicalUrl,
    };
  }

  return {
    title: "Вход и регистрация — NovaBoost Live",
    description: "Создай аккаунт NovaBoost Live и подключайся к платформе роста для TikTok LIVE: приглашения, бусты, Telegram, контент и активности вокруг эфиров.",
    canonicalUrl,
  };
}

export const Route = createFileRoute("/auth")({
  head: ({ location }) => {
    const meta = getAuthMeta(location.search);

    return {
      meta: [
        { title: meta.title },
        { name: "description", content: meta.description },
        { property: "og:title", content: meta.title },
        { property: "og:description", content: meta.description },
        { property: "og:url", content: meta.canonicalUrl },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: meta.title },
        { name: "twitter:description", content: meta.description },
      ],
    };
  },
  component: AuthPage,
});

function AuthPage() {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [accountRole, setAccountRole] = useState<"viewer" | "streamer">("viewer");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tiktokUsername, setTikTokUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [referralQuery, setReferralQuery] = useState("");
  const { streamers: directoryStreamers, error: directoryError } = useStreamerDirectory();
  const [referralStreamer, setReferralStreamer] = useState<StreamerCardData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const searchParams = new URLSearchParams(location.search);
  const confirmationState = searchParams.get("confirmed");
  const emailConfirmed = confirmationState === "signup";
  const inviteTikTokUsername = normalizeTikTokUsername(searchParams.get("tiktok") ?? "");
  const lockedReferralId = searchParams.get("ref")?.trim() ?? "";
  const lockedReferralName = searchParams.get("refName")?.trim() ?? "";
  const lockedReferralUsername = normalizeTikTokUsername(searchParams.get("refUsername") ?? "");
  const isInviteSignup = Boolean(inviteTikTokUsername);

  useEffect(() => {
    if (user && !emailConfirmed) navigate({ to: "/profile" });
  }, [user, navigate, emailConfirmed]);

  useEffect(() => {
    if (emailConfirmed) {
      setMode("signin");
    }
  }, [emailConfirmed]);

  useEffect(() => {
    if (!isInviteSignup) {
      return;
    }

    setMode("signup");
    setAccountRole("streamer");
    setTikTokUsername(inviteTikTokUsername);
  }, [inviteTikTokUsername, isInviteSignup]);

  useEffect(() => {
    if (!mode || !isInviteSignup) {
      return;
    }

    if (!lockedReferralId) {
      return;
    }

    const matchingStreamer = directoryStreamers.find((streamer) => streamer.id === lockedReferralId) ?? null;
    if (matchingStreamer) {
      setReferralStreamer(matchingStreamer);
      setReferralQuery("");
      return;
    }

    setReferralStreamer({
      id: lockedReferralId,
      display_name: lockedReferralName || lockedReferralUsername || "Пригласивший стример",
      tiktok_username: lockedReferralUsername,
      avatar_url: null,
      bio: null,
      is_live: false,
      viewer_count: 0,
      followers_count: 0,
      needs_boost: false,
      total_boost_amount: 0,
    });
    setReferralQuery("");
  }, [directoryStreamers, isInviteSignup, lockedReferralId, lockedReferralName, lockedReferralUsername, mode]);

  useEffect(() => {
    if (directoryError) {
      toast.error(directoryError.message);
    }
  }, [directoryError]);

  const referralMatches = referralQuery
    ? directoryStreamers.filter((s) =>
        `${s.display_name} ${s.tiktok_username}`.toLowerCase().includes(referralQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  const effectiveAccountRole = isInviteSignup ? "streamer" : accountRole;
  const effectiveTikTokUsername = isInviteSignup ? inviteTikTokUsername : tiktokUsername;
  const effectiveReferralStreamerId = lockedReferralId || referralStreamer?.id || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (mode === "signup") {
        if (!email || !password) {
          toast.error("Заполни email и пароль");
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

        const result = await signUp({
          email,
          displayName,
          tiktokUsername: effectiveTikTokUsername,
          password,
          accountRole: effectiveAccountRole,
          referralStreamerId: effectiveReferralStreamerId,
        });
        toast.success(
          result.emailConfirmationRequired
            ? "Аккаунт создан. Подтверди email, затем выполни вход."
            : `Аккаунт создан${referralStreamer ? `, любимый стример: ${referralStreamer.display_name}` : ""}.`
        );

        if (result.emailConfirmationRequired) {
          setMode("signin");
          setSubmitting(false);
          return;
        }
      } else {
        if (!email || !password) {
          toast.error("Для входа укажи email и пароль");
          setSubmitting(false);
          return;
        }

        await signIn({ email, password });
        toast.success("Вход выполнен");
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
              ? "Создание аккаунта NovaBoost Live"
              : "Вход в NovaBoost Live"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signup"
              ? "Выбери тип аккаунта при регистрации: зритель или стример. Вход потом всегда единый по email и паролю."
              : "Для входа нужен только email и пароль. Дополнительные роли и настройки подтягиваются уже внутри профиля."}
          </p>
        </div>

        {isInviteSignup && (
          <div className="mb-4 rounded-2xl border border-cosmic/35 bg-cosmic/10 p-4 text-sm text-muted-foreground">
            Эта ссылка подготовлена для владельца TikTok username <span className="font-semibold text-foreground">@{inviteTikTokUsername}</span>.
            Имя TikTok и пригласивший стример уже зафиксированы в форме и не редактируются.
          </div>
        )}

        {emailConfirmed && (
          <div className="mb-4 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <div className="font-semibold text-foreground">Почта подтверждена</div>
            <p className="mt-1 text-emerald-100/85">
              Email успешно подтверждён. Теперь можно войти в NovaBoost Live и продолжить настройку профиля.
            </p>
            {user && (
              <div className="mt-3">
                <Button type="button" onClick={() => navigate({ to: "/profile" })} className="bg-gradient-blast font-bold text-blast-foreground shadow-glow">
                  Перейти в профиль
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setMode("signup")} className={`rounded-2xl border p-3 text-sm font-semibold ${mode === "signup" ? "border-blast bg-blast/5 text-foreground" : "border-border/50 bg-surface/40 text-muted-foreground"}`}>
            Регистрация
          </button>
          <button type="button" onClick={() => setMode("signin")} className={`rounded-2xl border p-3 text-sm font-semibold ${mode === "signin" ? "border-cosmic bg-cosmic/10 text-foreground" : "border-border/50 bg-surface/40 text-muted-foreground"}`}>
            Вход
          </button>
        </div>

        <div className="mb-4">
          <PlatformDisclaimer compact />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border/50 bg-surface/60 p-6">
          {mode === "signup" && (
            <div>
              <Label>Тип аккаунта</Label>
              <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setAccountRole("viewer")}
                  disabled={isInviteSignup}
                  className={`rounded-2xl border p-3 text-left transition-colors ${accountRole === "viewer" ? "border-blast bg-blast/10 text-foreground" : "border-border/50 bg-background text-muted-foreground"}`}
                >
                  <div className="font-semibold">Я зритель</div>
                  <div className="mt-1 text-xs">Обычный профиль для подписок, заданий и поддержки стримеров.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setAccountRole("streamer")}
                  disabled={isInviteSignup}
                  className={`rounded-2xl border p-3 text-left transition-colors ${accountRole === "streamer" ? "border-cosmic bg-cosmic/10 text-foreground" : "border-border/50 bg-background text-muted-foreground"}`}
                >
                  <div className="font-semibold">Я стример</div>
                  <div className="mt-1 text-xs">Сразу открываем студию, публичную страницу и донат-ссылку по указанному TikTok username.</div>
                </button>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1.5 bg-background" />
          </div>

          {mode === "signup" && (
            <div>
              <Label htmlFor="displayName">Отображаемое имя</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Например, Алина Luna" className="mt-1.5 bg-background" />
            </div>
          )}

          {mode === "signup" && (
            <div>
              <Label htmlFor="tiktokUsername">TikTok username</Label>
              <Input id="tiktokUsername" required value={effectiveTikTokUsername} onChange={(e) => setTikTokUsername(e.target.value.replace(/^@+/, ""))} placeholder="username из TikTok" className="mt-1.5 bg-background" disabled={isInviteSignup} />
              <p className="mt-1.5 text-xs text-muted-foreground">Указывай вручную username из TikTok. По нему платформа попытается сразу подтянуть аватар и bio.</p>
            </div>
          )}

          <div>
            <Label htmlFor="password">Пароль</Label>
            <div className="relative mt-1.5">
              <Input id="password" type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signin" ? "Введите пароль профиля" : "Минимум 6 символов"} className="bg-background pr-11" />
              <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {mode === "signup" && (
            <div>
              <Label htmlFor="confirmPassword">Повтори пароль</Label>
              <div className="relative mt-1.5">
                <Input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Повторите пароль" className="bg-background pr-11" />
                <button type="button" onClick={() => setShowConfirmPassword((current) => !current)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground" aria-label={showConfirmPassword ? "Скрыть пароль" : "Показать пароль"}>
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {mode === "signup" && (
            <div>
              <Label>Реферальный стример (необязательно)</Label>
              {referralStreamer ? (
                <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-cosmic/40 bg-cosmic/10 p-2">
                  <img src={referralStreamer.avatar_url ?? ""} className="h-8 w-8 rounded-full" alt="" />
                  <span className="flex-1 text-sm font-semibold">{referralStreamer.display_name}</span>
                  {!lockedReferralId && <Button type="button" size="sm" variant="ghost" onClick={() => { setReferralStreamer(null); setReferralQuery(""); }}>Убрать</Button>}
                </div>
              ) : lockedReferralId ? (
                <div className="mt-1.5 rounded-lg border border-cosmic/40 bg-cosmic/10 p-3 text-sm text-muted-foreground">
                  Пригласивший стример зафиксирован в ссылке.
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

          {mode === "signup" && (
            <div className="rounded-xl border border-cosmic/30 bg-cosmic/10 p-4 text-sm text-muted-foreground">
              {effectiveAccountRole === "streamer"
                ? "Если регистрируешься как стример, кабинет стримера откроется сразу. Вход потом остаётся единым, без отдельного выбора роли."
                : "Если позже захочешь функции стримера, подашь заявку прямо внутри профиля и после одобрения получишь доступ к студии и донат-ссылке."}
            </div>
          )}

          {mode === "signin" && (
            <div className="rounded-xl border border-border/50 bg-background/30 p-4 text-sm text-muted-foreground">
              Для входа используй только email и пароль. Если у аккаунта уже есть подтверждённый профиль стримера, кабинет подтянется автоматически.
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full bg-gradient-blast text-blast-foreground font-bold shadow-glow">
            {submitting ? "Подождите…" : mode === "signup" ? "Создать аккаунт" : "Войти"}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← На главную</Link>
        </div>
      </div>
    </div>
  );
}
