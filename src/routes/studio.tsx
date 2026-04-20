import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { HowItWorksLink } from "@/components/HowItWorksLink";
import { HelpTooltip } from "@/components/HelpTooltip";
import { PlatformDisclaimer } from "@/components/PlatformDisclaimer";
import { ProjectHelpPanel } from "@/components/ProjectHelpPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import type { DonationOverlayDisplayMode, DonationOverlayVariant } from "@/lib/mock-platform";
import type { StreamerPost } from "@/lib/mock-platform";
import { createDonationLinkDraft, getSubscriptionPlanLabel, loadManagedDonationLink, saveManagedDonationLink, SUBSCRIPTION_PLANS } from "@/lib/monetization-data";
import { loadStreamerStudioData, publishStreamerPost, saveStreamerDonationOverlaySettings, saveStreamerStudioPage } from "@/lib/streamer-studio-data";
import { deactivateStreamerCodeWordTask, loadStreamerCodeWordTasks, publishStreamerCodeWordTask, type StreamerCodeWordTask } from "@/lib/tasks-data";
import { calculateCodeWordReward, validateCodeWord } from "@/lib/viewer-levels";
import { toast } from "sonner";
import { Bell, Copy, ExternalLink, ImagePlus, LayoutPanelTop, PencilLine, Send, Sparkles, ShieldCheck, Wallet } from "lucide-react";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "Студия стримера — NovaBoost Live" },
      { name: "description", content: "Настрой публичную страницу стримера, публикуй посты и подготавливай контент для аудитории TikTok LIVE." },
    ],
  }),
  component: StreamerStudioPage,
});

function createInitialStudioDraft() {
  return {
    bannerUrl: "",
    logoUrl: "",
    headline: "Публичная страница стримера",
    bio: "Расскажи, зачем зрителю подписываться на тебя внутри платформы и что происходит на твоих эфирах.",
    telegramChannel: "",
    accent: "from-cosmic/80 via-magenta/30 to-blast/70",
    tags: "",
    featuredVideoUrl: "",
    donationOverlayVariant: "supernova" as DonationOverlayVariant,
    donationSoundUrl: "",
    donationGifUrl: "",
    donationOverlayAccessKey: "",
    donationOverlayDisplayMode: "original" as DonationOverlayDisplayMode,
    donationOverlayDisplayCurrency: "USD" as const,
    donationGoalTitle: "Цель донатов",
    donationGoalTarget: "100",
    donationGoalCurrency: "USD" as const,
  };
}

const DONATION_OVERLAY_VARIANTS: Array<{ key: DonationOverlayVariant; title: string; description: string }> = [
  { key: "supernova", title: "Supernova", description: "Главный космический взрыв NovaBoost с мощной суммой в центре." },
  { key: "epic-burst", title: "Epic Burst", description: "Короткий неоновый burst с быстрым входом и частицами." },
  { key: "nova-ring", title: "Nova Ring", description: "Чистый sci-fi ринг с импульсом и читаемым текстом." },
];

const DONATION_DISPLAY_CURRENCIES = ["USD", "MDL", "RUB", "KZT"] as const;

const STORAGE_EVENT_KEY = "novaboost:donation-overlay-event";

const DONATION_WIDGET_LINKS = [
  { key: "latest", label: "Последний донат", description: "Крупный donor card с суммой и сообщением." },
  { key: "topDay", label: "Топ дня", description: "Рейтинг донатеров за текущие сутки." },
  { key: "topAllTime", label: "Топ за всё время", description: "Постоянный leaderboard лучших донатеров канала." },
  { key: "goal", label: "Цель по донатам", description: "Прогресс-бар со сбором на конкретную цель." },
] as const;

type OverlayPreviewTab = "alert" | "latest" | "topDay" | "topAllTime" | "goal";

function buildOverlayPreviewUrl(url: string, params?: Record<string, string>) {
  const nextUrl = new URL(url);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      nextUrl.searchParams.set(key, value);
    }
  }

  return nextUrl.toString();
}

function toLocalDateTimeValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function StreamerStudioPage() {
  const { user, loading } = useAuth();
  const [pageDraft, setPageDraft] = useState(createInitialStudioDraft);
  const [posts, setPosts] = useState<StreamerPost[]>([]);
  const [publicPageId, setPublicPageId] = useState<string | null>(null);
  const [studioLoading, setStudioLoading] = useState(false);
  const [savingPage, setSavingPage] = useState(false);
  const [publishingPost, setPublishingPost] = useState(false);
  const [codeTasks, setCodeTasks] = useState<StreamerCodeWordTask[]>([]);
  const [publishingCodeTask, setPublishingCodeTask] = useState(false);
  const [deactivatingTaskId, setDeactivatingTaskId] = useState<string | null>(null);
  const [postType, setPostType] = useState<StreamerPost["type"]>("announcement");
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postRequiredPlan, setPostRequiredPlan] = useState<StreamerPost["requiredPlan"]>("free");
  const [postBlurPreview, setPostBlurPreview] = useState(false);
  const [postExpiresAt, setPostExpiresAt] = useState("");
  const [codeTaskTitle, setCodeTaskTitle] = useState("Кодовое слово эфира");
  const [codeTaskDescription, setCodeTaskDescription] = useState("Узнай кодовое слово на эфире, введи его в приложении и получи очки.");
  const [codeTaskWord, setCodeTaskWord] = useState("");
  const [donationLinkDraft, setDonationLinkDraft] = useState(() => createDonationLinkDraft("", ""));
  const [savingDonationLink, setSavingDonationLink] = useState(false);
  const [appOrigin, setAppOrigin] = useState("");
  const [overlayPreviewTab, setOverlayPreviewTab] = useState<OverlayPreviewTab>("alert");

  if (loading) {
    return <div className="min-h-screen"><Header /><div className="container mx-auto px-4 py-16 text-center text-muted-foreground">Загрузка…</div></div>;
  }

  if (!user || !user.isStreamer) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="container mx-auto max-w-3xl px-4 py-16">
          <div className="rounded-3xl border border-border/50 bg-surface/60 p-6 sm:p-8 text-center">
            <h1 className="font-display text-2xl font-bold sm:text-3xl">Студия доступна только стримерам</h1>
            <p className="mt-3 text-muted-foreground">Сначала войди как стример TikTok LIVE, чтобы настраивать публичную страницу и публиковать посты.</p>
            <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap sm:justify-center">
              <Link to="/auth"><Button className="w-full bg-gradient-blast text-blast-foreground font-bold sm:w-auto">Войти как стример</Button></Link>
              <Link to="/"><Button variant="outline" className="w-full sm:w-auto">На главную</Button></Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    let active = true;

    const syncStudio = async () => {
      setStudioLoading(true);
      try {
        setDonationLinkDraft(createDonationLinkDraft(user.tiktokUsername, user.displayName));
        const data = await loadStreamerStudioData(user);
        if (!active) {
          return;
        }
        setPageDraft(data.pageDraft);
        setPosts(data.posts);
        setPublicPageId(data.streamerId);
        const nextCodeTasks = await loadStreamerCodeWordTasks(user);
        if (!active) {
          return;
        }
        setCodeTasks(nextCodeTasks);
        const existingDonationLink = await loadManagedDonationLink(user);
        if (!active) {
          return;
        }
        setDonationLinkDraft(
          existingDonationLink
            ? {
                slug: existingDonationLink.slug,
                title: existingDonationLink.title,
                description: existingDonationLink.description ?? "",
                minimumAmount: existingDonationLink.minimum_amount,
                isActive: existingDonationLink.is_active,
              }
            : createDonationLinkDraft(user.tiktokUsername, user.displayName),
        );
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Не удалось загрузить данные студии");
        }
      } finally {
        if (active) {
          setStudioLoading(false);
        }
      }
    };

    void syncStudio();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAppOrigin(window.location.origin);
    }
  }, []);

  const previewTags = pageDraft.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  const donationPreviewUrl = donationLinkDraft.slug && pageDraft.donationOverlayAccessKey
    ? `${appOrigin}/overlay/donation/${donationLinkDraft.slug}?key=${pageDraft.donationOverlayAccessKey}`
    : "";
  const donationWidgetUrls = donationLinkDraft.slug && pageDraft.donationOverlayAccessKey
    ? {
        latest: `${appOrigin}/overlay/widget/${donationLinkDraft.slug}/latest?key=${pageDraft.donationOverlayAccessKey}`,
        topDay: `${appOrigin}/overlay/widget/${donationLinkDraft.slug}/top-day?key=${pageDraft.donationOverlayAccessKey}`,
        topAllTime: `${appOrigin}/overlay/widget/${donationLinkDraft.slug}/top-all-time?key=${pageDraft.donationOverlayAccessKey}`,
        goal: `${appOrigin}/overlay/widget/${donationLinkDraft.slug}/goal?key=${pageDraft.donationOverlayAccessKey}`,
      }
    : null;
  const donationAlertPreviewUrl = donationPreviewUrl
    ? buildOverlayPreviewUrl(donationPreviewUrl, {
        username: user.displayName || "NovaFan",
        amount: "25",
        currency: pageDraft.donationOverlayDisplayMode === "preferred" ? pageDraft.donationOverlayDisplayCurrency : "USD",
        message: "Спасибо за поддержку эфира. Это live preview alert overlay.",
      })
    : "";
  const overlayPreviewItems = [
    {
      key: "alert" as const,
      label: "Alert overlay",
      description: "Тестовый donation alert. Анимация скрывается автоматически, как в OBS.",
      url: donationAlertPreviewUrl,
      minHeightClass: "min-h-[320px]",
    },
    {
      key: "latest" as const,
      label: "Последний донат",
      description: "Карточка последнего доната с именем, суммой и сообщением.",
      url: donationWidgetUrls?.latest ?? "",
      minHeightClass: "min-h-[260px]",
    },
    {
      key: "topDay" as const,
      label: "Топ дня",
      description: "Ежедневный рейтинг активных донатеров.",
      url: donationWidgetUrls?.topDay ?? "",
      minHeightClass: "min-h-[300px]",
    },
    {
      key: "topAllTime" as const,
      label: "Топ за всё время",
      description: "Постоянный leaderboard донатов канала.",
      url: donationWidgetUrls?.topAllTime ?? "",
      minHeightClass: "min-h-[300px]",
    },
    {
      key: "goal" as const,
      label: "Цель по донатам",
      description: "Goal widget показывает, на что собираем и сколько уже набрали.",
      url: donationWidgetUrls?.goal ?? "",
      minHeightClass: "min-h-[300px]",
    },
  ].filter((item) => item.url);
  const activeOverlayPreview = overlayPreviewItems.find((item) => item.key === overlayPreviewTab) ?? overlayPreviewItems[0] ?? null;
  const normalizedDraftCodeWord = codeTaskWord.trim().toUpperCase();
  const codeTaskReward = calculateCodeWordReward(normalizedDraftCodeWord);

  const savePage = async () => {
    setSavingPage(true);
    try {
      const result = await saveStreamerStudioPage(user, pageDraft);
      setPublicPageId(result.streamerId);
      toast.success("Настройки публичной страницы сохранены.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить настройки страницы");
    } finally {
      setSavingPage(false);
    }
  };

  const publishPost = async () => {
    if (!postTitle.trim() || !postBody.trim()) {
      toast.error("Для публикации поста нужны заголовок и текст");
      return;
    }

    setPublishingPost(true);
    try {
      const result = await publishStreamerPost(user, {
        type: postType,
        title: postTitle,
        body: postBody,
        requiredPlan: postRequiredPlan,
        blurPreview: postBlurPreview,
        expiresAt: postExpiresAt ? new Date(postExpiresAt).toISOString() : null,
      });
      setPublicPageId(result.streamerId);
      setPosts((current) => [result.post, ...current]);
      setPostTitle("");
      setPostBody("");
      setPostType("announcement");
      setPostRequiredPlan("free");
      setPostBlurPreview(false);
      setPostExpiresAt("");
      toast.success("Пост опубликован.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось опубликовать пост");
    } finally {
      setPublishingPost(false);
    }
  };

  const publishCodeTask = async () => {
    if (!codeTaskTitle.trim() || !codeTaskWord.trim()) {
      toast.error("Для кодового слова нужны заголовок и само слово");
      return;
    }

    try {
      validateCodeWord(codeTaskWord);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Проверь кодовое слово");
      return;
    }

    setPublishingCodeTask(true);
    try {
      const createdTask = await publishStreamerCodeWordTask(user, {
        title: codeTaskTitle,
        description: codeTaskDescription,
        code: codeTaskWord,
      });
      setCodeTasks((current) => [createdTask, ...current.map((task) => ({ ...task, active: false }))]);
      setCodeTaskWord("");
      toast.success(`Кодовое слово ${createdTask.code} опубликовано.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось опубликовать кодовое слово");
    } finally {
      setPublishingCodeTask(false);
    }
  };

  const deactivateCodeTask = async (taskId: string) => {
    setDeactivatingTaskId(taskId);
    try {
      await deactivateStreamerCodeWordTask(user, taskId);
      setCodeTasks((current) => current.map((task) => task.id === taskId ? { ...task, active: false } : task));
      toast.success("Кодовое слово отключено.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отключить кодовое слово");
    } finally {
      setDeactivatingTaskId(null);
    }
  };

  const saveDonationLink = async () => {
    if (!donationLinkDraft.slug.trim() || !donationLinkDraft.title.trim()) {
      toast.error("Для страницы поддержки нужны короткий адрес и заголовок");
      return;
    }

    setSavingDonationLink(true);
    try {
      const savedLink = await saveManagedDonationLink(user, donationLinkDraft);
      const savedOverlay = await saveStreamerDonationOverlaySettings(user, {
        variant: pageDraft.donationOverlayVariant,
        soundUrl: pageDraft.donationSoundUrl.trim(),
        gifUrl: pageDraft.donationGifUrl.trim(),
        accessKey: pageDraft.donationOverlayAccessKey,
        displayMode: pageDraft.donationOverlayDisplayMode,
        displayCurrency: pageDraft.donationOverlayDisplayCurrency,
        goalTitle: pageDraft.donationGoalTitle,
        goalTarget: Number(pageDraft.donationGoalTarget) || 100,
        goalCurrency: pageDraft.donationGoalCurrency,
      });
      setPageDraft((current) => ({
        ...current,
        donationOverlayAccessKey: savedOverlay.accessKey,
        donationOverlayDisplayMode: savedOverlay.displayMode,
        donationOverlayDisplayCurrency: savedOverlay.displayCurrency,
        donationGoalTitle: savedOverlay.goalTitle,
        donationGoalTarget: String(savedOverlay.goalTarget),
        donationGoalCurrency: savedOverlay.goalCurrency,
      }));
      setDonationLinkDraft({
        slug: savedLink.slug,
        title: savedLink.title,
        description: savedLink.description ?? "",
        minimumAmount: savedLink.minimum_amount,
        isActive: savedLink.is_active,
      });
      toast.success("Страница поддержки сохранена.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить страницу поддержки");
    } finally {
      setSavingDonationLink(false);
    }
  };

  const copyDonationOverlayUrl = async () => {
    if (!donationPreviewUrl) {
      toast.error("Сначала задай короткий адрес страницы поддержки.");
      return;
    }

    try {
      await navigator.clipboard.writeText(donationPreviewUrl);
      toast.success("OBS overlay URL скопирован.");
    } catch {
      toast.error("Не удалось скопировать ссылку в буфер обмена.");
    }
  };

  const copyUrl = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`${label} скопирован.`);
    } catch {
      toast.error("Не удалось скопировать ссылку в буфер обмена.");
    }
  };

  const sendDonationOverlayTest = () => {
    if (!donationLinkDraft.slug) {
      toast.error("Сначала задай короткий адрес страницы поддержки.");
      return;
    }

    const event = {
      slug: donationLinkDraft.slug,
      payload: {
        username: user.displayName || "NovaFan",
        amount: "25",
        currency: "USD",
        message: "Ты зажёг новую звезду на стриме",
      },
    };

    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        const channel = new BroadcastChannel(`novaboost:donation-overlay:${donationLinkDraft.slug}`);
        channel.postMessage(event);
        channel.close();
      }

      localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify(event));
      localStorage.removeItem(STORAGE_EVENT_KEY);
      toast.success("Тест отправлен в открытую страницу OBS overlay.");
    } catch {
      toast.error("Не удалось отправить тест в overlay. Проверь, что страница OBS уже открыта.");
    }
  };

  const pageSettingsSection = (
    <section className="rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <LayoutPanelTop className="h-5 w-5 text-cosmic" />
        <h2 className="font-display text-xl font-bold sm:text-2xl">Настройка публичной страницы</h2>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label="Баннер страницы">
          <div className="rounded-2xl border border-border/50 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
            Баннер теперь загружается в настройках профиля как файл. Здесь он только используется в превью публичной страницы.
          </div>
        </Field>
        <Field label="Логотип или аватар">
          <div className="rounded-2xl border border-border/50 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
            Аватар стримера тоже загружается в настройках профиля. Прямая вставка image URL больше не используется.
          </div>
        </Field>
      </div>

      <div className="mt-4 grid gap-3 sm:flex sm:flex-wrap">
        <Link to="/profile">
          <Button variant="outline" className="w-full gap-2 sm:w-auto"><ImagePlus className="h-4 w-4" /> Открыть настройки профиля</Button>
        </Link>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Главный слоган">
          <Input value={pageDraft.headline} onChange={(e) => setPageDraft((current) => ({ ...current, headline: e.target.value }))} placeholder="Короткая фраза над лентой" />
        </Field>
        <Field label="Telegram-канал">
          <Input value={pageDraft.telegramChannel} onChange={(e) => setPageDraft((current) => ({ ...current, telegramChannel: e.target.value }))} placeholder="@channel_name" />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Описание страницы">
          <Textarea value={pageDraft.bio} onChange={(e) => setPageDraft((current) => ({ ...current, bio: e.target.value }))} placeholder="Объясни, зачем зрителю подписываться на тебя внутри платформы" className="min-h-28 bg-background" />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Accent / фон страницы">
          <Input value={pageDraft.accent} onChange={(e) => setPageDraft((current) => ({ ...current, accent: e.target.value }))} placeholder="from-cosmic/80 via-magenta/30 to-blast/70" />
        </Field>
        <Field label="Теги страницы">
          <Input value={pageDraft.tags} onChange={(e) => setPageDraft((current) => ({ ...current, tags: e.target.value }))} placeholder="live, анонсы, комьюнити" />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Превью видео / тизер">
          <Input value={pageDraft.featuredVideoUrl} onChange={(e) => setPageDraft((current) => ({ ...current, featuredVideoUrl: e.target.value }))} placeholder="Ссылка на превью или обложку" />
        </Field>
      </div>

      <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
        <Button onClick={savePage} disabled={savingPage || studioLoading} className="w-full bg-gradient-cosmic font-bold text-foreground sm:w-auto">{savingPage ? "Сохраняю…" : "Сохранить настройки страницы"}</Button>
        <Button variant="outline" className="w-full gap-2 sm:w-auto"><ImagePlus className="h-4 w-4" /> Загрузить медиа позже</Button>
      </div>
    </section>
  );

  const postsComposerSection = (
    <section className="rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <PencilLine className="h-5 w-5 text-blast" />
        <h2 className="font-display text-xl font-bold sm:text-2xl">Публикация постов</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Именно здесь публикуются новости, анонсы и короткий контент, который потом виден на публичной странице стримера и может идти в Telegram-контур.
      </p>
      {studioLoading && <p className="mt-3 text-xs text-muted-foreground">Загружаю сохранённые посты и настройки…</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        {(["announcement", "news", "clip"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setPostType(type)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${postType === type ? "border-blast bg-blast/10 text-foreground" : "border-border/50 bg-background/30 text-muted-foreground"}`}
          >
            {type === "announcement" ? "Анонс" : type === "news" ? "Новость" : "Клип"}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <Field label="Заголовок поста">
          <Input value={postTitle} onChange={(e) => setPostTitle(e.target.value)} placeholder="Например: Через час стартую эфир" />
        </Field>
        <Field label="Текст поста">
          <Textarea value={postBody} onChange={(e) => setPostBody(e.target.value)} placeholder="Расскажи, что увидит аудитория, какой будет сигнал или зачем заходить на эфир" className="min-h-28 bg-background" />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Доступ к посту">
            <select
              value={postRequiredPlan}
              onChange={(e) => setPostRequiredPlan(e.target.value as StreamerPost["requiredPlan"])}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {SUBSCRIPTION_PLANS.filter((plan) => pageDraft.membershipPaidEnabled || plan.key === "free").map((plan) => (
                <option key={plan.key} value={plan.key}>{getSubscriptionPlanLabel(plan.key)}</option>
              ))}
            </select>
          </Field>
          <Field label="Срок жизни поста">
            <Input type="datetime-local" value={postExpiresAt} onChange={(e) => setPostExpiresAt(e.target.value)} />
          </Field>
        </div>
        <button
          type="button"
          onClick={() => setPostBlurPreview((current) => !current)}
          className={`rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${postBlurPreview ? "border-crown/50 bg-crown/10 text-foreground" : "border-border/50 bg-background/30 text-muted-foreground"}`}
        >
          <div className="font-medium">Blur preview для обычных зрителей</div>
          <div className="mt-1 text-xs">Если включено, free-зритель увидит только превью и CTA на тариф.</div>
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap">
        <Button onClick={publishPost} disabled={publishingPost || studioLoading} className="w-full bg-gradient-blast text-blast-foreground font-bold sm:w-auto">{publishingPost ? "Публикую…" : "Опубликовать пост"}</Button>
        <Button variant="outline" className="w-full gap-2 sm:w-auto"><Send className="h-4 w-4" /> Отправить в Telegram позже</Button>
      </div>
    </section>
  );

  const codeWordSection = (
    <section className="rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-crown" />
        <h2 className="font-display text-xl font-bold sm:text-2xl">Кодовое слово эфира</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Стример задаёт слово до эфира или прямо во время лайва. Зритель узнаёт его на трансляции, вводит в приложении и получает очки один раз.
      </p>

      <div className="mt-5 space-y-4">
        <Field label="Заголовок задания" hint="Это название задания, которое увидит зритель в разделе задач и в связанной активности стримера.">
          <Input value={codeTaskTitle} onChange={(e) => setCodeTaskTitle(e.target.value)} placeholder="Например: Кодовое слово сегодняшнего эфира" />
        </Field>
        <Field label="Описание для зрителя" hint="Объясни, где искать кодовое слово и за что именно зритель получит очки, чтобы задание было понятно без лишних вопросов.">
          <Textarea value={codeTaskDescription} onChange={(e) => setCodeTaskDescription(e.target.value)} placeholder="Где искать слово и что получит зритель" className="min-h-24 bg-background" />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Кодовое слово" hint="Это слово зритель услышит или увидит на эфире, а затем введёт в приложении для получения очков один раз.">
            <Input value={codeTaskWord} onChange={(e) => setCodeTaskWord(e.target.value.toUpperCase())} placeholder="Например: NOVA" />
          </Field>
          <Field label="Очки за ввод" hint="Награда считается автоматически: 1 символ = 10 очков, минимум 4 символа, только одно слово без пробелов.">
            <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground">
              {codeTaskReward > 0 ? `${codeTaskReward} очков` : "Введите кодовое слово"}
            </div>
          </Field>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap">
        <Button onClick={publishCodeTask} disabled={publishingCodeTask || studioLoading} className="w-full bg-gradient-blast text-blast-foreground font-bold sm:w-auto">
          {publishingCodeTask ? "Публикую код…" : "Опубликовать кодовое слово"}
        </Button>
      </div>
    </section>
  );

  const codeHistorySection = (
    <section className="rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold sm:text-2xl">Активные и прошлые кодовые слова</h2>
      <div className="mt-5 space-y-3">
        {codeTasks.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/50 bg-background/20 p-4 text-sm text-muted-foreground">
            Пока ни одного кодового слова не опубликовано.
          </div>
        )}
        {codeTasks.map((task) => (
          <article key={task.id} className={`rounded-2xl border p-4 ${task.active ? "border-crown/40 bg-crown/5" : "border-border/50 bg-background/30"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold">{task.title}</h3>
                <div className="mt-1 text-xs text-muted-foreground">{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(task.created_at))}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${task.active ? "bg-crown/15 text-crown" : "bg-surface text-muted-foreground"}`}>{task.active ? "Активно" : "Отключено"}</span>
                <span className="rounded-full bg-blast/15 px-3 py-1 text-xs font-semibold text-blast">+{task.reward_points} очков</span>
              </div>
            </div>
            {task.description && <p className="mt-3 text-sm text-muted-foreground">{task.description}</p>}
            <div className="mt-3 rounded-xl border border-border/50 bg-surface/60 px-4 py-3 font-mono text-sm tracking-[0.2em] text-foreground">{task.code}</div>
            {task.auto_disable_on_live_end && (
              <div className="mt-3 text-xs text-crown">Этот код привязан к текущему live и отключится после завершения эфира.</div>
            )}
            {task.active && (
              <Button variant="outline" className="mt-4" disabled={deactivatingTaskId === task.id} onClick={() => deactivateCodeTask(task.id)}>
                {deactivatingTaskId === task.id ? "Отключаю…" : "Отключить кодовое слово"}
              </Button>
            )}
          </article>
        ))}
      </div>
    </section>
  );

  const donationSection = (
    <section className="rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-cosmic" />
        <h2 className="font-display text-xl font-bold sm:text-2xl">Страница поддержки и OBS</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Здесь живут публичная ссылка для зрителей, alert-анимация и весь комплект donation widget overlays для OBS.
      </p>

      <div className="mt-5 space-y-4">
        <Field label="Короткий адрес страницы" hint="Это slug публичной support-страницы стримера. Его можно будет давать зрителям как короткую ссылку внутри NovaBoost Live.">
          <Input value={donationLinkDraft.slug} onChange={(e) => setDonationLinkDraft((current) => ({ ...current, slug: e.target.value }))} placeholder="alina-luna-support" />
        </Field>
        <Field label="Заголовок страницы поддержки" hint="Этот заголовок увидит зритель на отдельной странице поддержки, когда откроет donation link стримера.">
          <Input value={donationLinkDraft.title} onChange={(e) => setDonationLinkDraft((current) => ({ ...current, title: e.target.value }))} placeholder="Поддержать эфир" />
        </Field>
        <Field label="Описание" hint="Коротко объясни, зачем зрителю поддерживать именно этот эфир, стрим или цель. Это часть продуктовой страницы, а не просто техническое поле.">
          <Textarea value={donationLinkDraft.description} onChange={(e) => setDonationLinkDraft((current) => ({ ...current, description: e.target.value }))} className="min-h-24 bg-background" placeholder="Короткое описание, зачем поддерживать именно этот эфир" />
        </Field>
        <Field label="Минимальная сумма" hint="Минимальный ожидаемый донат для этой страницы. Даже пока оплата не активна, значение помогает формировать будущий support-flow и UX быстрых сумм.">
          <Input type="number" min={10} value={String(donationLinkDraft.minimumAmount)} onChange={(e) => setDonationLinkDraft((current) => ({ ...current, minimumAmount: Number(e.target.value) || 10 }))} />
        </Field>
        <button
          type="button"
          onClick={() => setDonationLinkDraft((current) => ({ ...current, isActive: !current.isActive }))}
          className={`rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${donationLinkDraft.isActive ? "border-blast/40 bg-blast/10 text-foreground" : "border-border/50 bg-background/30 text-muted-foreground"}`}
        >
          <div className="font-medium">{donationLinkDraft.isActive ? "Ссылка активна" : "Ссылка отключена"}</div>
          <div className="mt-1 text-xs">Отключённая ссылка перестаёт быть доступной публично.</div>
        </button>

        <div className="rounded-2xl border border-border/50 bg-background/20 p-4">
          <div className="font-medium text-foreground">OBS donation overlay</div>
          <p className="mt-1 text-xs text-muted-foreground">Здесь формируется отдельная приватная OBS-ссылка стримера. В постоянный URL не зашиваются тестовые сумма и текст, они отправляются отдельно как payload.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {DONATION_OVERLAY_VARIANTS.map((variant) => (
              <button
                key={variant.key}
                type="button"
                onClick={() => setPageDraft((current) => ({ ...current, donationOverlayVariant: variant.key }))}
                className={`rounded-2xl border p-4 text-left transition-colors ${pageDraft.donationOverlayVariant === variant.key ? "border-blast bg-blast/10 text-foreground" : "border-border/50 bg-background/30 text-muted-foreground"}`}
              >
                <div className="font-display text-lg font-bold">{variant.title}</div>
                <div className="mt-2 text-xs leading-5">{variant.description}</div>
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Sound URL">
              <Input value={pageDraft.donationSoundUrl} onChange={(e) => setPageDraft((current) => ({ ...current, donationSoundUrl: e.target.value }))} placeholder="https://.../donation.mp3" />
            </Field>
            <Field label="GIF URL / overlay sticker">
              <Input value={pageDraft.donationGifUrl} onChange={(e) => setPageDraft((current) => ({ ...current, donationGifUrl: e.target.value }))} placeholder="https://.../nova.gif" />
            </Field>
          </div>
          <div className="mt-4 rounded-xl border border-border/50 bg-background/30 p-4 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">Валюта алерта в OBS</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {([
                { value: "original", label: "Показывать как отправили" },
                { value: "preferred", label: "Показывать в валюте стримера" },
              ] as Array<{ value: DonationOverlayDisplayMode; label: string }>).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPageDraft((current) => ({ ...current, donationOverlayDisplayMode: option.value }))}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${pageDraft.donationOverlayDisplayMode === option.value ? "border-blast bg-blast/10 text-foreground" : "border-border/50 bg-background/30 text-muted-foreground"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {pageDraft.donationOverlayDisplayMode === "preferred" && (
              <div className="mt-3">
                <Field label="Валюта стримера по умолчанию">
                  <select
                    value={pageDraft.donationOverlayDisplayCurrency}
                    onChange={(e) => setPageDraft((current) => ({ ...current, donationOverlayDisplayCurrency: e.target.value as typeof DONATION_DISPLAY_CURRENCIES[number] }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {DONATION_DISPLAY_CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>{currency}</option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.55),rgba(2,6,23,0.28))] p-4 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium text-foreground">Настройка цели по донатам</div>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                  Эти поля управляют именно widget overlay "Цель по донатам": на что собираем, какую сумму нужно набрать и в какой валюте показывать прогресс.
                </p>
              </div>
              <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-emerald-100/80">
                Goal widget settings
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[1.6fr_0.7fr_0.7fr]">
              <Field label="На что собираем" hint="Это название donation goal для widget overlay. Например: новый микрофон, камера, поездка, оформление студии или другой понятный зрителю сбор.">
                <Input value={pageDraft.donationGoalTitle} onChange={(e) => setPageDraft((current) => ({ ...current, donationGoalTitle: e.target.value }))} placeholder="Например: Новый микрофон для стрима" />
              </Field>
              <Field label="Сколько нужно собрать" hint="Целевая сумма для progress-bar в donation goal widget. Она нужна именно для визуального прогресса цели, а не для минимального доната.">
                <Input type="number" min={1} value={pageDraft.donationGoalTarget} onChange={(e) => setPageDraft((current) => ({ ...current, donationGoalTarget: e.target.value }))} />
              </Field>
              <Field label="Валюта цели" hint="Эта валюта используется для отображения progress goal в widget overlay, чтобы зритель видел понятную для стримера цель.">
                <select
                  value={pageDraft.donationGoalCurrency}
                  onChange={(e) => setPageDraft((current) => ({ ...current, donationGoalCurrency: e.target.value as typeof DONATION_DISPLAY_CURRENCIES[number] }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {DONATION_DISPLAY_CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-foreground/90">На что: {pageDraft.donationGoalTitle || "Цель донатов"}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-foreground/90">Цель: {pageDraft.donationGoalTarget || "100"} {pageDraft.donationGoalCurrency}</span>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-border/50 bg-background/30 p-3 text-xs text-muted-foreground">
            Переменные для alert payload: `username`, `amount`, `currency`, `message`.
          </div>
          {!pageDraft.donationOverlayAccessKey && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              Сохрани страницу поддержки один раз, чтобы сгенерировать приватный OBS key.
            </div>
          )}
          {donationPreviewUrl && (
            <div className="mt-4 rounded-xl border border-border/50 bg-background/30 p-3 text-xs text-muted-foreground break-all">
              {donationPreviewUrl}
            </div>
          )}
          {donationWidgetUrls && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {DONATION_WIDGET_LINKS.map((widget) => (
                <div key={widget.key} className="rounded-2xl border border-border/50 bg-background/30 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-xs font-medium text-foreground">{widget.label}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Widget overlay</div>
                      <div className="mt-2 max-w-xs text-[11px] leading-5 text-muted-foreground">{widget.description}</div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-full gap-1.5 px-2.5 text-xs sm:w-auto"
                      onClick={() => void copyUrl(donationWidgetUrls[widget.key], widget.label)}
                    >
                      <Copy className="h-3.5 w-3.5" /> Копия
                    </Button>
                  </div>
                  <div className="mt-3 break-all rounded-xl border border-border/40 bg-black/20 px-3 py-2 text-[11px] text-muted-foreground">{donationWidgetUrls[widget.key]}</div>
                </div>
              ))}
            </div>
          )}
          {activeOverlayPreview && (
            <div className="mt-6 rounded-2xl border border-border/50 bg-background/20 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-medium text-foreground">Превью overlay на этой странице</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Можно сразу посмотреть каждый donation overlay прямо в студии, без отдельного окна OBS.
                  </p>
                </div>
                <div className="grid gap-2 sm:flex sm:flex-wrap">
                  <Button type="button" variant="outline" size="sm" className="h-8 w-full text-xs sm:w-auto" onClick={() => void copyUrl(activeOverlayPreview.url, activeOverlayPreview.label)}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Скопировать текущий URL
                  </Button>
                  <a href={activeOverlayPreview.url} target="_blank" rel="noreferrer">
                    <Button type="button" variant="outline" size="sm" className="h-8 w-full text-xs sm:w-auto">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Открыть отдельно
                    </Button>
                  </a>
                </div>
              </div>

              <Tabs value={overlayPreviewTab} onValueChange={(value) => setOverlayPreviewTab(value as OverlayPreviewTab)} className="mt-4">
                <TabsList className="h-auto justify-start gap-2 overflow-x-auto rounded-2xl border border-border/40 bg-background/50 p-2 whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {overlayPreviewItems.map((item) => (
                    <TabsTrigger key={item.key} value={item.key}>{item.label}</TabsTrigger>
                  ))}
                </TabsList>

                {overlayPreviewItems.map((item) => (
                  <TabsContent key={item.key} value={item.key} className="mt-4">
                    <OverlayPreviewPanel
                      title={item.label}
                      description={item.description}
                      url={item.url}
                      minHeightClass={item.minHeightClass}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          )}
          <div className="mt-4 grid gap-3 sm:flex sm:flex-wrap">
            <Button type="button" variant="outline" className="w-full gap-2 sm:w-auto" onClick={() => void copyDonationOverlayUrl()}>
              <Copy className="h-4 w-4" /> Скопировать OBS URL
            </Button>
            {donationLinkDraft.slug && (
              <Button type="button" variant="outline" className="w-full gap-2 sm:w-auto" onClick={sendDonationOverlayTest}>
                <ExternalLink className="h-4 w-4" /> Тест анимации
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap">
        <Button onClick={saveDonationLink} disabled={savingDonationLink || studioLoading} className="w-full bg-gradient-cosmic font-bold text-foreground sm:w-auto">
          {savingDonationLink ? "Сохраняю страницу…" : "Сохранить страницу поддержки"}
        </Button>
        {donationLinkDraft.slug && (
          <Link to="/support/$slug" params={{ slug: donationLinkDraft.slug }}>
            <Button variant="outline" className="w-full gap-2 sm:w-auto">
              <ExternalLink className="h-4 w-4" /> Открыть страницу поддержки
            </Button>
          </Link>
        )}
      </div>
    </section>
  );

  const previewSection = (
    <section className="rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-crown" />
        <h2 className="font-display text-xl font-bold sm:text-2xl">Как выглядит страница для зрителя</h2>
      </div>

      <div className="mt-5 overflow-hidden rounded-3xl border border-border/50 bg-background/40">
        <div className={`h-40 w-full bg-linear-to-r ${pageDraft.accent}`} style={{ backgroundImage: pageDraft.bannerUrl ? `linear-gradient(135deg, rgba(255,255,255,0.04), transparent), url(${pageDraft.bannerUrl})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <div className="-mt-10 flex items-end gap-4">
            <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-background bg-surface-2">
              {pageDraft.logoUrl ? <img src={pageDraft.logoUrl} alt={user.displayName} className="h-full w-full object-cover" /> : null}
            </div>
            <div className="pb-2">
              <div className="font-display text-xl font-bold sm:text-2xl">{user.displayName}</div>
              <div className="text-sm text-muted-foreground">@{user.tiktokUsername}</div>
            </div>
          </div>

          <p className="mt-4 text-sm text-foreground/90">{pageDraft.headline}</p>
          <p className="mt-3 text-sm text-muted-foreground">{pageDraft.bio}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {previewTags.map((tag) => (
              <span key={tag} className="rounded-full border border-border/50 bg-surface/60 px-3 py-1 text-xs text-muted-foreground">#{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );

  const postsFeedSection = (
    <section className="rounded-3xl border border-border/50 bg-surface/60 p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold sm:text-2xl">Лента постов на публичной странице</h2>
      <div className="mt-5 space-y-3">
        {posts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/50 bg-background/20 p-4 text-sm text-muted-foreground">
            Здесь появятся публикации после первого сохранённого поста.
          </div>
        )}
        {posts.map((post) => (
          <article key={post.id} className="rounded-2xl border border-border/50 bg-background/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">{post.type}</span>
              <span className="text-xs text-muted-foreground">{post.createdAt}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <span className="rounded-full border border-border/50 px-2.5 py-1">{post.requiredPlan}</span>
              {post.blurPreview && <span className="rounded-full border border-crown/40 px-2.5 py-1 text-crown">blur preview</span>}
              {post.expiresAt && <span className="rounded-full border border-blast/40 px-2.5 py-1 text-blast">до {toLocalDateTimeValue(post.expiresAt).replace("T", " ")}</span>}
            </div>
            <h3 className="mt-3 font-display text-lg font-bold">{post.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{post.body}</p>
          </article>
        ))}
      </div>
    </section>
  );

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-5 md:py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3 w-3 text-blast" /> Студия стримера TikTok LIVE
            </div>
            <h1 className="mt-4 font-display text-3xl font-bold leading-tight sm:text-4xl">Управление публичной страницей</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Здесь стример настраивает свою публичную страницу внутри NovaBoost Live и публикует посты, анонсы и короткий контент для аудитории между эфирами.
            </p>
          </div>
          <div className="grid gap-3 sm:flex sm:flex-wrap">
            <Link to="/profile"><Button variant="outline" className="w-full sm:w-auto">Назад в кабинет</Button></Link>
            {publicPageId && (
              <Link to="/streamer/$id" params={{ id: publicPageId }}>
                <Button className="w-full bg-gradient-blast text-blast-foreground font-bold gap-2 sm:w-auto">
                  <ExternalLink className="h-4 w-4" /> Открыть публичную страницу
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="mt-6">
          <PlatformDisclaimer compact />
        </div>

        <Tabs defaultValue="page" className="mt-6">
          <TabsList className="h-auto justify-start gap-2 overflow-x-auto rounded-2xl border border-border/50 bg-surface/60 p-2 whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsTrigger value="page">Страница</TabsTrigger>
            <TabsTrigger value="content">Контент</TabsTrigger>
            <TabsTrigger value="engagement">Активности</TabsTrigger>
            <TabsTrigger value="donations">Донаты и OBS</TabsTrigger>
          </TabsList>

          <div className="mt-6 flex justify-center">
            <HowItWorksLink />
          </div>

          <TabsContent value="page" className="mt-6">
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              {pageSettingsSection}
              {previewSection}
            </div>
          </TabsContent>

          <TabsContent value="content" className="mt-6">
            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              {postsComposerSection}
              {postsFeedSection}
            </div>
          </TabsContent>

          <TabsContent value="engagement" className="mt-6">
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              {codeWordSection}
              {codeHistorySection}
            </div>
          </TabsContent>

          <TabsContent value="donations" className="mt-6">
            {donationSection}
          </TabsContent>
        </Tabs>

        <div className="mt-10">
          <ProjectHelpPanel
            badge="Подсказки для стримера"
            title="Что за что отвечает в студии"
            description="Студия - это центр управления твоим присутствием внутри NovaBoost Live. Подсказки ниже помогают быстро понять назначение основных вкладок."
            items={[
              {
                key: "page",
                title: "Вкладка “Страница”",
                body: "Здесь ты оформляешь публичную страницу внутри NovaBoost Live: баннер, логотип, headline, bio, ссылку на Telegram и общее позиционирование стримера для аудитории между эфирами.",
              },
              {
                key: "content",
                title: "Вкладка “Контент”",
                body: "Здесь создаются посты, анонсы и другие публикации, которые помогают удерживать зрителя даже тогда, когда ты не в прямом эфире.",
              },
              {
                key: "engagement",
                title: "Вкладка “Активности”",
                body: "Этот раздел нужен для вовлечения зрителей: задания, кодовые слова, reward points и сценарии, которые побуждают аудиторию возвращаться и участвовать в росте канала.",
              },
              {
                key: "donations",
                title: "Вкладка “Донаты и OBS”",
                body: "Здесь настраиваются donation links, overlay-сцены и OBS-виджеты. Это визуальный и интерактивный слой поддержки стримера внутри NovaBoost Live.",
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 flex items-center gap-2">{label}{hint ? <HelpTooltip text={hint} /> : null}</Label>
      {children}
    </div>
  );
}

function OverlayPreviewPanel({
  title,
  description,
  url,
  minHeightClass,
}: {
  title: string;
  description: string;
  url: string;
  minHeightClass: string;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const previewUrl = buildOverlayPreviewUrl(url, { preview: String(reloadKey) });

  return (
    <div className="overflow-hidden rounded-3xl border border-border/50 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.12),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.9))] p-4 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div>
          <div className="font-display text-xl font-bold text-white">{title}</div>
          <div className="mt-1 max-w-2xl text-sm text-slate-300">{description}</div>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-8 w-full border-white/15 bg-white/5 text-xs text-white hover:bg-white/10 sm:w-auto" onClick={() => setReloadKey((current) => current + 1)}>
          Перезапустить preview
        </Button>
      </div>

      <div className={`mt-4 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.9),rgba(30,41,59,0.75))] ${minHeightClass}`}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-slate-400">
          <span>OBS Scene Preview</span>
          <span>Transparent overlay</span>
        </div>
        <div className="relative h-full min-h-55 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.14),transparent_24%),linear-gradient(180deg,#0f172a,#111827_52%,#030712)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(255,255,255,0.03)_100%)]" />
          <iframe title={title} src={previewUrl} className="relative z-10 h-full min-h-55 w-full bg-transparent" loading="lazy" />
        </div>
      </div>
    </div>
  );
}