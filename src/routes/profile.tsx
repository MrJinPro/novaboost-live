import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Header } from "@/components/Header";
import { HowItWorksLink } from "@/components/HowItWorksLink";
import { LevelRocketBadge, LevelRocketStrip } from "@/components/LevelRocketBadge";
import { ProjectHelpPanel } from "@/components/ProjectHelpPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Award, BadgeCheck, Camera, Crown, ExternalLink, ImagePlus, LogOut, Save, Send, Sparkles, Trophy, UserRound, Wallpaper, Zap } from "lucide-react";
import { Facebook, Instagram, Twitter } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { SUBSCRIPTION_PLANS, getPaidSubscriptionPlans, getSubscriptionPlanLabel } from "@/lib/monetization-data";
import { loadViewerProfileData, type ViewerProfileData } from "@/lib/user-profile-data";
import { getOwnedStreamerPublicPage } from "@/lib/streamer-studio-data";
import { loadProfileSettings, loadStreamerApplicationState, saveProfileSettings, submitStreamerApplication, uploadProfileMedia, type ProfileSettingsDraft, type StreamerApplicationState } from "@/lib/profile-settings-data";
import { getViewerProgression } from "@/lib/viewer-levels";
import { toast } from "sonner";
import { getStreamerPublicRouteParam } from "@/lib/streamer-public-route";

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
  const { user, session, loading, refreshUser, signOut } = useAuth();
  const [viewerProfile, setViewerProfile] = useState<ViewerProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [applicationLoading, setApplicationLoading] = useState(false);
  const [applicationSubmitting, setApplicationSubmitting] = useState(false);
  const [publicPageId, setPublicPageId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProfileSettingsDraft | null>(null);
  const [streamerApplication, setStreamerApplication] = useState<StreamerApplicationState | null>(null);

  useEffect(() => {
    let active = true;
    if (!user) {
      setSettings(null);
      return;
    }

    const syncSettings = async () => {
      setSettingsLoading(true);
      try {
        const nextSettings = await loadProfileSettings(user);
        if (active) {
          setSettings(nextSettings);
          setPublicPageId(nextSettings.publicPageId);
        }
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Не удалось загрузить настройки профиля");
        }
      } finally {
        if (active) {
          setSettingsLoading(false);
        }
      }
    };

    void syncSettings();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;

    if (!user) {
      setViewerProfile(null);
      return;
    }

    const syncViewerProfile = async () => {
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

    void syncViewerProfile();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;

    if (!user) {
      setStreamerApplication(null);
      return;
    }

    const syncApplication = async () => {
      setApplicationLoading(true);
      try {
        const nextApplication = await loadStreamerApplicationState(user);
        if (active) {
          setStreamerApplication(nextApplication);
        }
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Не удалось загрузить статус заявки стримера");
        }
      } finally {
        if (active) {
          setApplicationLoading(false);
        }
      }
    };

    void syncApplication();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;

    if (!user || !user.isStreamer) {
      return;
    }

    const syncPublicPage = async () => {
      try {
        const page = await getOwnedStreamerPublicPage(user.id);
        if (active && page?.id) {
          setPublicPageId(page.id);
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
        <div className="container mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="font-display text-2xl font-bold">Нужна авторизация</h1>
          <p className="mt-2 text-muted-foreground">Чтобы увидеть профиль, войди или создай аккаунт.</p>
          <Link to="/auth"><Button className="mt-4 bg-gradient-blast font-bold text-blast-foreground shadow-glow">Войти</Button></Link>
        </div>
      </div>
    );
  }

  const isStreamer = user.isStreamer;
  const points = viewerProfile?.points ?? 0;
  const progression = getViewerProgression(points);
  const level = progression.level;
  const favoriteStreamers = viewerProfile?.subscriptions ?? [];
  const avatarPreview = settings?.avatarUrl.trim() ?? "";
  const bannerPreview = settings?.streamerBannerUrl.trim() ?? "";
  const applicationStatus = streamerApplication?.status ?? "none";

  const updateSettings = <K extends keyof ProfileSettingsDraft>(key: K, value: ProfileSettingsDraft[K]) => {
    setSettings((current) => current ? { ...current, [key]: value } : current);
  };

  const handleAvatarUpload = async (file: File | null) => {
    if (!file || !session) {
      return;
    }

    setUploadingAvatar(true);
    try {
      const uploaded = await uploadProfileMedia(session, isStreamer ? "streamer-avatar" : "viewer-avatar", file);
      updateSettings("avatarUrl", uploaded.url);
      toast.success("Аватар загружен локально на backend.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить аватар");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleBannerUpload = async (file: File | null) => {
    if (!file || !session || !isStreamer) {
      return;
    }

    setUploadingBanner(true);
    try {
      const uploaded = await uploadProfileMedia(session, "streamer-banner", file);
      updateSettings("streamerBannerUrl", uploaded.url);
      toast.success("Баннер загружен локально на backend.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить баннер");
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleSave = async () => {
    if (!settings) {
      return;
    }

    setSettingsSaving(true);
    try {
      const result = await saveProfileSettings(user, settings);
      await refreshUser();
      if (result.publicPageId) {
        setPublicPageId(result.publicPageId);
      }
      toast.success(isStreamer ? "Настройки стримера сохранены." : "Настройки профиля сохранены.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить профиль");
    } finally {
      setSettingsSaving(false);
    }
  };

  const updateStreamerApplication = <K extends keyof StreamerApplicationState>(key: K, value: StreamerApplicationState[K]) => {
    setStreamerApplication((current) => current ? { ...current, [key]: value } : current);
  };

  const helpPanel = (
    <ProjectHelpPanel
      badge="Что изменено"
      title={isStreamer ? "Теперь профиль стримера это реальные настройки" : "Теперь профиль зрителя это реальные настройки"}
      description={isStreamer
        ? "Кабинет больше не просто сводка. Здесь настраивается то, что видят зрители в публичной странице и что использует студия."
        : "Профиль зрителя теперь можно нормально привести в порядок: аватар, био, username и TikTok внутри платформы."}
      items={isStreamer
        ? [
            {
              key: "streamer-settings-media",
              title: "Как теперь работают картинки",
              body: "Аватар и баннер загружаются файлами на backend, который сам создаёт локальные папки пользователя. Ввод ссылок на картинки убран из настройки профиля и студии.",
            },
            {
              key: "streamer-settings-sync",
              title: "Что именно синхронизируется",
              body: "Имя, TikTok username, био, баннер, аватар, tagline и Telegram-канал записываются в streamer-профиль и в настройки публичной страницы, чтобы не было расхождения между экранами.",
            },
          ]
        : [
            {
              key: "viewer-settings-basics",
              title: "Что настраивается у зрителя",
              body: "Display name, username, TikTok username, био и локальный аватар платформы. Это базовый профиль зрителя, а не просто карточка статистики.",
            },
            {
              key: "viewer-settings-media",
              title: "Как теперь работает аватар",
              body: "Вместо URL загружается реальный файл. Backend кладёт его в локальную папку пользователя и возвращает готовый URL для платформы.",
            },
          ]}
    />
  );

  const handleSubmitStreamerApplication = async () => {
    if (!streamerApplication) {
      return;
    }

    setApplicationSubmitting(true);
    try {
      await submitStreamerApplication(user, {
        tiktokUsername: streamerApplication.tiktokUsername,
        evidenceType: streamerApplication.evidenceType,
        evidenceValue: streamerApplication.evidenceValue,
        notes: streamerApplication.notes,
      });

      const nextApplication = await loadStreamerApplicationState(user);
      setStreamerApplication(nextApplication);
      toast.success("Заявка на профиль стримера отправлена. После проверки кабинет откроется автоматически.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить заявку на стримера");
    } finally {
      setApplicationSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto max-w-6xl px-4 py-5 md:py-6">
        <div className="rounded-3xl border border-border/50 bg-surface/60 p-4 sm:p-6 md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="relative mx-auto h-24 w-24 shrink-0 overflow-hidden rounded-full border border-border/60 bg-surface-2 sm:mx-0">
                {avatarPreview ? (
                  <img src={avatarPreview} alt={settings?.displayName ?? user.displayName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-cosmic text-3xl font-display font-bold shadow-glow-cosmic">
                    {(settings?.displayName ?? user.displayName ?? user.username).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-center font-display text-xl font-bold sm:text-left md:text-3xl">{settings?.displayName ?? user.displayName}</h1>
                <div className="mt-2 text-center text-sm leading-6 text-muted-foreground sm:text-left">@{settings?.username ?? user.username} · TikTok: @{settings?.tiktokUsername ?? user.tiktokUsername}</div>
                <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <div className="inline-flex items-center gap-2 rounded-full bg-gradient-cosmic px-3 py-1 text-sm font-bold shadow-glow-cosmic">
                    <Sparkles className="h-4 w-4" /> {isStreamer ? "Настройки стримера" : `Уровень ${level}`}
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-3 py-1 text-sm text-muted-foreground">
                    {isStreamer ? <Crown className="h-4 w-4 text-crown" /> : <Award className="h-4 w-4 text-blast" />}
                    {isStreamer ? "Профиль и публичная страница синхронизированы" : `Серия активности: ${viewerProfile?.streakDays ?? 0} дней`}
                  </div>
                </div>
                <p className="mt-3 max-w-2xl text-center text-sm leading-6 text-muted-foreground sm:text-left">
                  {isStreamer
                    ? "Здесь живут реальные аккаунтные настройки стримера: имя, TikTok, аватар, баннер и короткое позиционирование. Всё это уходит в публичную страницу и студию без ручных ссылок на картинки."
                    : "Здесь живут реальные настройки зрителя: имя, username, TikTok, био и локально загружаемый аватар внутри платформы. Если изначально зарегистрировался как зритель, отсюда можно подать заявку на переход к функциям стримера."}
                </p>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button variant="outline" size="sm" onClick={signOut} className="w-full gap-2 sm:w-auto">
                <LogOut className="h-4 w-4" /> Выйти
              </Button>
              <Button onClick={handleSave} disabled={settingsSaving || settingsLoading || !settings} className="w-full gap-2 bg-gradient-cosmic text-foreground sm:w-auto">
                <Save className="h-4 w-4" /> {settingsSaving ? "Сохраняю…" : "Сохранить настройки"}
              </Button>
            </div>
          </div>

          {!isStreamer && (
            <div className="mt-6 rounded-3xl border border-border/50 bg-background/20 p-4 sm:p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <LevelRocketBadge level={level} size="lg" />
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">Rocket tier</div>
                    <div className="mt-1 font-display text-2xl font-bold text-white">Уровень {level}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {progression.nextLevel
                        ? `До следующей ракеты осталось ${formatNumber(progression.pointsRemainingToNextLevel ?? 0)} очков`
                        : "Финальная ракета уже открыта"}
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/40 bg-surface/50 px-4 py-3 text-sm text-muted-foreground">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-fuchsia-200/75">Milestone</div>
                  <div className="mt-1 font-display text-lg font-bold text-white">
                    {level % 10 === 0 ? `Звезда уровня ${level}` : `Следующая звезда на ${Math.ceil(level / 10) * 10}`}
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {progression.nextLevel ? `До уровня ${progression.nextLevel}` : "Максимальный уровень достигнут"}
                  </span>
                  <span className="font-bold">
                    {progression.maxLevelReached
                      ? `${formatNumber(points)} очков`
                      : `${formatNumber(progression.pointsIntoLevel)}/${formatNumber(progression.pointsRequiredForNextLevel ?? 0)}`}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-gradient-nova transition-all" style={{ width: `${progression.progressPercent}%` }} />
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-3 text-[11px] uppercase tracking-[0.28em] text-cyan-200/70">Текущий сектор уровней</div>
                <LevelRocketStrip level={level} />
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <StatBox icon={<Trophy className="h-5 w-5" />} label={isStreamer ? "Подписчиков" : "Очков"} value={formatNumber(isStreamer ? 1240 : points)} accent="blast" />
          <StatBox icon={<Award className="h-5 w-5" />} label={isStreamer ? "Эфиров в трекинге" : "Заданий"} value={String(isStreamer ? 8 : viewerProfile?.completedTasks ?? 0)} />
          <StatBox icon={<Sparkles className="h-5 w-5" />} label={isStreamer ? "Telegram-связки" : "Бустов"} value={String(isStreamer ? 1 : viewerProfile?.boostsJoined ?? 0)} accent="cosmic" />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <UserRound className="h-5 w-5 text-cosmic" />
                <h2 className="font-display text-xl font-bold sm:text-2xl">Базовые настройки аккаунта</h2>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">Общие поля для любого пользователя платформы: имя, username, TikTok, био и аватар.</div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
                <MediaUploadCard
                  title="Аватар профиля"
                  description="Файл уходит на backend и попадает в персональную папку пользователя. Ссылкой картинку вставлять больше не нужно."
                  previewUrl={avatarPreview}
                  placeholder={settings?.displayName ?? user.displayName}
                  icon={<Camera className="h-5 w-5" />}
                  uploading={uploadingAvatar}
                  inputId="profile-avatar-upload"
                  buttonLabel={uploadingAvatar ? "Загружаю…" : "Загрузить аватар"}
                  onFileSelect={handleAvatarUpload}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Отображаемое имя" description="Это имя видно в интерфейсе и на публичной странице, если ты стример.">
                    <Input value={settings?.displayName ?? ""} onChange={(event) => updateSettings("displayName", event.target.value)} disabled={!settings} placeholder="Например, Nova Luna" />
                  </Field>
                  <Field label="Username аккаунта" description="Внутренний username NovaBoost. Без @.">
                    <Input value={settings?.username ?? ""} onChange={(event) => updateSettings("username", event.target.value.replace(/^@+/, ""))} disabled={!settings} placeholder="nova_luna" />
                  </Field>
                  <Field label="TikTok username" description="Нужен для связки с TikTok LIVE и публичной страницей.">
                    <Input value={settings?.tiktokUsername ?? ""} onChange={(event) => updateSettings("tiktokUsername", event.target.value.replace(/^@+/, ""))} disabled={!settings} placeholder="tiktok_username" />
                  </Field>
                  <Field label="Telegram username" description="Необязательное поле для viewer-профиля и внутренних контактов.">
                    <Input value={settings?.telegramUsername ?? ""} onChange={(event) => updateSettings("telegramUsername", event.target.value.replace(/^@+/, ""))} disabled={!settings} placeholder="telegram_username" />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Коротко о себе" description={isStreamer ? "Это био стримера и описание для публичной страницы." : "Короткое описание зрителя внутри платформы."}>
                      <Textarea value={settings?.bio ?? ""} onChange={(event) => updateSettings("bio", event.target.value)} disabled={!settings} placeholder={isStreamer ? "Чем ты интересен зрителю и зачем следить за эфирами" : "Кто ты и чем тебе интересны стримы на платформе"} className="min-h-32" />
                    </Field>
                  </div>
                </div>
              </div>
            </section>

            {isStreamer && (
              <section className="rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <Wallpaper className="h-5 w-5 text-blast" />
                  <h2 className="font-display text-xl font-bold sm:text-2xl">Оформление стримера</h2>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">Блок для публичной страницы: баннер, tagline и Telegram-канал. Всё хранится централизованно и больше не зависит от внешних image URL.</div>

                <div className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                  <MediaUploadCard
                    title="Баннер стримера"
                    description="Загружается локально на backend в отдельную папку стримера внутри аккаунта пользователя."
                    previewUrl={bannerPreview}
                    placeholder="Баннер пока не загружен"
                    icon={<ImagePlus className="h-5 w-5" />}
                    variant="banner"
                    uploading={uploadingBanner}
                    inputId="streamer-banner-upload"
                    buttonLabel={uploadingBanner ? "Загружаю…" : "Загрузить баннер"}
                    onFileSelect={handleBannerUpload}
                  />

                  <div className="grid gap-4">
                    <Field label="Короткий tagline" description="Короткая фраза в верхней части публичной страницы.">
                      <Input value={settings?.streamerTagline ?? ""} onChange={(event) => updateSettings("streamerTagline", event.target.value)} disabled={!settings} placeholder="Например, live-разборы, анонсы и клуб подписчиков" />
                    </Field>
                    <Field label="Telegram" description="Можно указать username или полную ссылку. На публичной странице будет только компактная иконка.">
                      <Input value={settings?.streamerTelegramChannel ?? ""} onChange={(event) => updateSettings("streamerTelegramChannel", event.target.value)} disabled={!settings} placeholder="@novaboost_live" />
                    </Field>
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="Instagram" description="Username или ссылка.">
                        <Input value={settings?.streamerInstagram ?? ""} onChange={(event) => updateSettings("streamerInstagram", event.target.value)} disabled={!settings} placeholder="@creator" />
                      </Field>
                      <Field label="Facebook" description="Username или ссылка.">
                        <Input value={settings?.streamerFacebook ?? ""} onChange={(event) => updateSettings("streamerFacebook", event.target.value)} disabled={!settings} placeholder="creator.page" />
                      </Field>
                      <Field label="X / Twitter" description="Username или ссылка.">
                        <Input value={settings?.streamerTwitter ?? ""} onChange={(event) => updateSettings("streamerTwitter", event.target.value)} disabled={!settings} placeholder="@creator" />
                      </Field>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-background/30 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">Платные Boost-подписки</div>
                          <div className="mt-1 text-xs text-muted-foreground">Если выключены, на публичной странице остаётся только обычная подписка. Если включены, стример сможет помечать посты ценой доступа.</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateSettings("streamerPaidMembershipEnabled", !(settings?.streamerPaidMembershipEnabled ?? false))}
                          className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${(settings?.streamerPaidMembershipEnabled ?? false) ? "border-blast bg-blast/10 text-foreground" : "border-border/50 bg-background/30 text-muted-foreground"}`}
                        >
                          {(settings?.streamerPaidMembershipEnabled ?? false) ? "Включены" : "Выключены"}
                        </button>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        {getPaidSubscriptionPlans().map((plan) => {
                          const active = settings?.streamerHighlightedPlanKey === plan.key;
                          return (
                            <button
                              key={plan.key}
                              type="button"
                              onClick={() => updateSettings("streamerHighlightedPlanKey", plan.key)}
                              className={`rounded-2xl border p-3 text-left transition-colors ${active ? "border-blast bg-blast/10 text-foreground" : "border-border/50 bg-background/20 text-muted-foreground"}`}
                            >
                              <div className="font-display text-base font-bold">{plan.title}</div>
                              <div className="mt-1 text-xs">Доступ к контенту этого уровня</div>
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-3 rounded-xl border border-crown/30 bg-crown/5 px-4 py-3 text-xs leading-5 text-muted-foreground">
                        NovaBoost удерживает 13% комиссии с платной подписки. Остальное остаётся стримеру.
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-background/30 p-4 text-sm text-muted-foreground">
                      Публичная страница, студия и шапка стримера теперь опираются на один источник данных. Баннер и аватар лучше менять здесь, а в студии работать уже с контентом, донатами и публикациями.
                    </div>
                  </div>
                </div>
              </section>
            )}

            {!isStreamer && streamerApplication && (
              <section className="rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 text-blast" />
                  <h2 className="font-display text-xl font-bold sm:text-2xl">Заявка на профиль стримера</h2>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Этот блок нужен только тем, кто зарегистрировался как зритель, а потом захотел получить функции стримера. Отправь заявку и приложи доказательство, что реально стримишь.
                </div>

                <div className="mt-4 rounded-2xl border border-border/50 bg-background/30 p-4 text-sm text-muted-foreground">
                  {applicationLoading && "Загружаю статус заявки…"}
                  {!applicationLoading && applicationStatus === "none" && "Заявки пока нет. Заполни TikTok username и приложи ссылку на профиль, live или запись эфира."}
                  {!applicationLoading && applicationStatus === "pending" && "Заявка уже отправлена и ждёт проверки. После подтверждения для этого аккаунта откроются функции стримера."}
                  {!applicationLoading && applicationStatus === "rejected" && "Прошлая заявка была отклонена. Поправь доказательства и отправь новую версию."}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <Field label="TikTok username" description="Аккаунт, который нужно проверить на наличие стримов.">
                    <Input value={streamerApplication.tiktokUsername} onChange={(event) => updateStreamerApplication("tiktokUsername", event.target.value.replace(/^@+/, ""))} placeholder="tiktok_username" />
                  </Field>
                  <Field label="Тип доказательства" description="Что именно ты прикладываешь модерации.">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: "live-link", label: "LIVE" },
                        { key: "profile-link", label: "Профиль" },
                        { key: "clip-link", label: "Клип" },
                      ].map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => updateStreamerApplication("evidenceType", option.key)}
                          className={`rounded-xl border px-3 py-2 text-sm ${streamerApplication.evidenceType === option.key ? "border-blast bg-blast/10 text-foreground" : "border-border/50 bg-background/30 text-muted-foreground"}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Ссылка или доказательство" description="Например, ссылка на TikTok профиль, live-ссылку, клип или другую публичную точку, где видно, что ты стримишь.">
                      <Input value={streamerApplication.evidenceValue} onChange={(event) => updateStreamerApplication("evidenceValue", event.target.value)} placeholder="https://www.tiktok.com/@username/live" />
                    </Field>
                  </div>
                  <div className="md:col-span-2">
                    <Field label="Комментарий к заявке" description="Коротко опиши, что именно нужно проверить.">
                      <Textarea value={streamerApplication.notes} onChange={(event) => updateStreamerApplication("notes", event.target.value)} placeholder="Стримлю несколько раз в неделю, вот профиль и последняя запись эфира" className="min-h-28" />
                    </Field>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <Button onClick={handleSubmitStreamerApplication} disabled={applicationSubmitting || applicationLoading} className="w-full gap-2 bg-gradient-blast text-blast-foreground sm:w-auto">
                    <Send className="h-4 w-4" /> {applicationSubmitting ? "Отправляю заявку…" : applicationStatus === "rejected" ? "Отправить заново" : "Подать заявку"}
                  </Button>
                  {streamerApplication.submittedAt ? (
                    <div className="self-center text-sm text-muted-foreground">
                      Последняя заявка: {new Date(streamerApplication.submittedAt).toLocaleDateString("ru-RU")}
                    </div>
                  ) : null}
                </div>
              </section>
            )}
          </div>

          <div className="space-y-6">
            <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
              <h2 className="font-display text-xl font-bold">Быстрые действия</h2>
              <div className="mt-4 grid gap-3">
                <Link to="/tasks"><Button variant="outline" className="w-full justify-start gap-2"><Trophy className="h-4 w-4" /> К заданиям</Button></Link>
                <Link to="/boost"><Button className="w-full justify-start gap-2 bg-gradient-blast font-bold text-blast-foreground"><Zap className="h-4 w-4" /> Поддержать boost</Button></Link>
                {isStreamer && <Link to="/studio"><Button variant="outline" className="w-full justify-start gap-2"><Sparkles className="h-4 w-4" /> Открыть студию стримера</Button></Link>}
                {isStreamer && publicPageId && (
                  <Link to="/streamer/$id" params={{ id: getStreamerPublicRouteParam({ id: publicPageId, tiktokUsername: user.tiktokUsername }) }}>
                    <Button variant="outline" className="w-full justify-start gap-2"><ExternalLink className="h-4 w-4" /> Открыть публичную страницу</Button>
                  </Link>
                )}
              </div>
            </section>

            {favoriteStreamers.length > 0 && (
              <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
                <h2 className="font-display text-xl font-bold">Подписки на стримеров</h2>
                <div className="mt-4 grid gap-3">
                  {favoriteStreamers.map((streamer) => (
                    <Link key={streamer.id} to="/streamer/$id" params={{ id: getStreamerPublicRouteParam({ id: streamer.id, tiktokUsername: streamer.tiktok_username }) }} className="rounded-2xl border border-border/50 bg-background/30 p-4 transition-colors hover:border-blast/40">
                      <div className="font-semibold">{streamer.display_name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">@{streamer.tiktok_username}</div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {!profileLoading && favoriteStreamers.length === 0 && (
              <section className="rounded-3xl border border-border/50 bg-surface/60 p-6 text-sm text-muted-foreground">
                У тебя пока нет подписок внутри платформы. Открой каталог стримеров и подпишись на интересных тебе авторов.
              </section>
            )}

            {settingsLoading && (
              <section className="rounded-3xl border border-border/50 bg-surface/60 p-6 text-sm text-muted-foreground">
                Загружаю настройки профиля…
              </section>
            )}
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <HowItWorksLink />
        </div>

        <div className="mt-10">
          {helpPanel}
        </div>
      </div>
    </div>
  );
}

function Field({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
      </div>
      {children}
    </label>
  );
}

function MediaUploadCard({
  title,
  description,
  previewUrl,
  placeholder,
  icon,
  variant = "avatar",
  uploading,
  inputId,
  buttonLabel,
  onFileSelect,
}: {
  title: string;
  description: string;
  previewUrl: string;
  placeholder: string;
  icon: React.ReactNode;
  variant?: "avatar" | "banner";
  uploading: boolean;
  inputId: string;
  buttonLabel: string;
  onFileSelect: (file: File | null) => void;
}) {
  const isBanner = variant === "banner";

  return (
    <div className="rounded-2xl border border-border/50 bg-background/30 p-4">
      <div className="flex items-center gap-2 text-foreground">
        {icon}
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className={`mt-4 overflow-hidden rounded-2xl border border-border/50 bg-surface-2 ${isBanner ? "h-44 w-full" : "mx-auto h-40 w-full max-w-40 sm:mx-0"}`}>
        {previewUrl ? (
          <img src={previewUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-muted-foreground">{placeholder}</div>
        )}
      </div>
      <label htmlFor={inputId} className="mt-4 block">
        <input
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            onFileSelect(file);
            event.currentTarget.value = "";
          }}
        />
        <span className={`inline-flex h-10 w-full items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors ${uploading ? "pointer-events-none opacity-60" : "cursor-pointer hover:bg-accent hover:text-accent-foreground"}`}>
          {buttonLabel}
        </span>
      </label>
    </div>
  );
}

function StatBox({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: "blast" | "cosmic" }) {
  const color = accent === "blast" ? "text-blast" : accent === "cosmic" ? "text-cosmic" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border/50 bg-surface/60 p-4">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 ${color}`}>{icon}</div>
      <div className={`mt-3 font-display text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground sm:text-xs">{label}</div>
    </div>
  );
}
