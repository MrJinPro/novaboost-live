import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { PlatformDisclaimer } from "@/components/PlatformDisclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import type { DonationOverlayVariant } from "@/lib/mock-platform";
import type { StreamerPost } from "@/lib/mock-platform";
import { createDonationLinkDraft, getSubscriptionPlanLabel, loadManagedDonationLink, saveManagedDonationLink, SUBSCRIPTION_PLANS } from "@/lib/monetization-data";
import { loadStreamerStudioData, publishStreamerPost, saveStreamerDonationOverlaySettings, saveStreamerStudioPage } from "@/lib/streamer-studio-data";
import { deactivateStreamerCodeWordTask, loadStreamerCodeWordTasks, publishStreamerCodeWordTask, type StreamerCodeWordTask } from "@/lib/tasks-data";
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
  };
}

const DONATION_OVERLAY_VARIANTS: Array<{ key: DonationOverlayVariant; title: string; description: string }> = [
  { key: "supernova", title: "Supernova", description: "Главный космический взрыв NovaBoost с мощной суммой в центре." },
  { key: "epic-burst", title: "Epic Burst", description: "Короткий неоновый burst с быстрым входом и частицами." },
  { key: "nova-ring", title: "Nova Ring", description: "Чистый sci-fi ринг с импульсом и читаемым текстом." },
];

const STORAGE_EVENT_KEY = "novaboost:donation-overlay-event";

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
  const [codeTaskReward, setCodeTaskReward] = useState("50");
  const [donationLinkDraft, setDonationLinkDraft] = useState(() => createDonationLinkDraft("", ""));
  const [savingDonationLink, setSavingDonationLink] = useState(false);
  const [appOrigin, setAppOrigin] = useState("");

  if (loading) {
    return <div className="min-h-screen"><Header /><div className="container mx-auto px-4 py-16 text-center text-muted-foreground">Загрузка…</div></div>;
  }

  if (!user || user.role !== "streamer") {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="container mx-auto max-w-3xl px-4 py-16">
          <div className="rounded-3xl border border-border/50 bg-surface/60 p-8 text-center">
            <h1 className="font-display text-3xl font-bold">Студия доступна только стримерам</h1>
            <p className="mt-3 text-muted-foreground">Сначала войди как стример TikTok LIVE, чтобы настраивать публичную страницу и публиковать посты.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/auth"><Button className="bg-gradient-blast text-blast-foreground font-bold">Войти как стример</Button></Link>
              <Link to="/"><Button variant="outline">На главную</Button></Link>
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
  const donationPreviewUrl = donationLinkDraft.slug
    ? `${appOrigin}/overlay/donation/${donationLinkDraft.slug}?username=${encodeURIComponent(user.displayName || "NovaFan")}&amount=25&currency=USD&message=${encodeURIComponent("Ты зажёг новую звезду на стриме")}`
    : "";

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
    const rewardPoints = Number(codeTaskReward);

    if (!codeTaskTitle.trim() || !codeTaskWord.trim()) {
      toast.error("Для кодового слова нужны заголовок и само слово");
      return;
    }

    if (!Number.isFinite(rewardPoints) || rewardPoints < 1) {
      toast.error("Укажи корректное количество очков");
      return;
    }

    setPublishingCodeTask(true);
    try {
      const createdTask = await publishStreamerCodeWordTask(user, {
        title: codeTaskTitle,
        description: codeTaskDescription,
        code: codeTaskWord,
        rewardPoints,
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
      await saveStreamerDonationOverlaySettings(user, {
        variant: pageDraft.donationOverlayVariant,
        soundUrl: pageDraft.donationSoundUrl.trim(),
        gifUrl: pageDraft.donationGifUrl.trim(),
      });
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

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3 w-3 text-blast" /> Студия стримера TikTok LIVE
            </div>
            <h1 className="mt-4 font-display text-4xl font-bold">Управление публичной страницей</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Здесь стример настраивает свою публичную страницу внутри NovaBoost Live и публикует посты, анонсы и короткий контент для аудитории между эфирами.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/profile"><Button variant="outline">Назад в кабинет</Button></Link>
            {publicPageId && (
              <Link to="/streamer/$id" params={{ id: publicPageId }}>
                <Button className="bg-gradient-blast text-blast-foreground font-bold gap-2">
                  <ExternalLink className="h-4 w-4" /> Открыть публичную страницу
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="mt-6">
          <PlatformDisclaimer compact />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <div className="flex items-center gap-2">
              <LayoutPanelTop className="h-5 w-5 text-cosmic" />
              <h2 className="font-display text-2xl font-bold">Настройка публичной страницы</h2>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="Баннер страницы">
                <Input value={pageDraft.bannerUrl} onChange={(e) => setPageDraft((current) => ({ ...current, bannerUrl: e.target.value }))} placeholder="Ссылка на баннер" />
              </Field>
              <Field label="Логотип или аватар">
                <Input value={pageDraft.logoUrl} onChange={(e) => setPageDraft((current) => ({ ...current, logoUrl: e.target.value }))} placeholder="Ссылка на логотип" />
              </Field>
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

            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={savePage} disabled={savingPage || studioLoading} className="bg-gradient-cosmic font-bold text-foreground">{savingPage ? "Сохраняю…" : "Сохранить настройки страницы"}</Button>
              <Button variant="outline" className="gap-2"><ImagePlus className="h-4 w-4" /> Загрузить медиа позже</Button>
            </div>
          </section>

          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <div className="flex items-center gap-2">
              <PencilLine className="h-5 w-5 text-blast" />
              <h2 className="font-display text-2xl font-bold">Публикация постов</h2>
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
                    {SUBSCRIPTION_PLANS.map((plan) => (
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

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={publishPost} disabled={publishingPost || studioLoading} className="bg-gradient-blast text-blast-foreground font-bold">{publishingPost ? "Публикую…" : "Опубликовать пост"}</Button>
              <Button variant="outline" className="gap-2"><Send className="h-4 w-4" /> Отправить в Telegram позже</Button>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-crown" />
              <h2 className="font-display text-2xl font-bold">Кодовое слово эфира</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Стример задаёт слово до эфира или прямо во время лайва. Зритель узнаёт его на трансляции, вводит в приложении и получает очки один раз.
            </p>

            <div className="mt-5 space-y-4">
              <Field label="Заголовок задания">
                <Input value={codeTaskTitle} onChange={(e) => setCodeTaskTitle(e.target.value)} placeholder="Например: Кодовое слово сегодняшнего эфира" />
              </Field>
              <Field label="Описание для зрителя">
                <Textarea value={codeTaskDescription} onChange={(e) => setCodeTaskDescription(e.target.value)} placeholder="Где искать слово и что получит зритель" className="min-h-24 bg-background" />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Кодовое слово">
                  <Input value={codeTaskWord} onChange={(e) => setCodeTaskWord(e.target.value.toUpperCase())} placeholder="Например: NOVA" />
                </Field>
                <Field label="Очки за ввод">
                  <Input value={codeTaskReward} onChange={(e) => setCodeTaskReward(e.target.value)} inputMode="numeric" placeholder="50" />
                </Field>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={publishCodeTask} disabled={publishingCodeTask || studioLoading} className="bg-gradient-blast text-blast-foreground font-bold">
                {publishingCodeTask ? "Публикую код…" : "Опубликовать кодовое слово"}
              </Button>
            </div>
          </section>

          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display text-2xl font-bold">Активные и прошлые кодовые слова</h2>
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

          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-cosmic" />
              <h2 className="font-display text-2xl font-bold">Страница поддержки внутри платформы</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Это ссылка NovaBoost Live, которую можно дать зрителям на эфире. После доната событие появится в блоке последних поддержек на публичной странице.
            </p>

            <div className="mt-5 space-y-4">
              <Field label="Короткий адрес страницы">
                <Input value={donationLinkDraft.slug} onChange={(e) => setDonationLinkDraft((current) => ({ ...current, slug: e.target.value }))} placeholder="alina-luna-support" />
              </Field>
              <Field label="Заголовок страницы поддержки">
                <Input value={donationLinkDraft.title} onChange={(e) => setDonationLinkDraft((current) => ({ ...current, title: e.target.value }))} placeholder="Поддержать эфир" />
              </Field>
              <Field label="Описание">
                <Textarea value={donationLinkDraft.description} onChange={(e) => setDonationLinkDraft((current) => ({ ...current, description: e.target.value }))} className="min-h-24 bg-background" placeholder="Короткое описание, зачем поддерживать именно этот эфир" />
              </Field>
              <Field label="Минимальная сумма">
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
                <p className="mt-1 text-xs text-muted-foreground">Выбери один из 3 шаблонов. По умолчанию используется анимация NovaBoost, а при желании можно добавить свой `sound URL` и `GIF URL`.</p>
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
                <div className="mt-4 rounded-xl border border-border/50 bg-background/30 p-3 text-xs text-muted-foreground">
                  Переменные для alert payload: `username`, `amount`, `currency`, `message`.
                </div>
                {donationPreviewUrl && (
                  <div className="mt-4 rounded-xl border border-border/50 bg-background/30 p-3 text-xs text-muted-foreground break-all">
                    {donationPreviewUrl}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button type="button" variant="outline" className="gap-2" onClick={() => void copyDonationOverlayUrl()}>
                    <Copy className="h-4 w-4" /> Скопировать OBS URL
                  </Button>
                  {donationLinkDraft.slug && (
                    <Button type="button" variant="outline" className="gap-2" onClick={sendDonationOverlayTest}>
                      <ExternalLink className="h-4 w-4" /> Тест анимации
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={saveDonationLink} disabled={savingDonationLink || studioLoading} className="bg-gradient-cosmic font-bold text-foreground">
                {savingDonationLink ? "Сохраняю страницу…" : "Сохранить страницу поддержки"}
              </Button>
              {donationLinkDraft.slug && (
                <Link to="/support/$slug" params={{ slug: donationLinkDraft.slug }}>
                  <Button variant="outline" className="gap-2">
                    <ExternalLink className="h-4 w-4" /> Открыть страницу поддержки
                  </Button>
                </Link>
              )}
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-crown" />
              <h2 className="font-display text-2xl font-bold">Как выглядит страница для зрителя</h2>
            </div>

            <div className="mt-5 overflow-hidden rounded-3xl border border-border/50 bg-background/40">
              <div className={`h-40 w-full bg-linear-to-r ${pageDraft.accent}`} style={{ backgroundImage: pageDraft.bannerUrl ? `linear-gradient(135deg, rgba(255,255,255,0.04), transparent), url(${pageDraft.bannerUrl})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />
              <div className="px-5 pb-5">
                <div className="-mt-10 flex items-end gap-4">
                  <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-background bg-surface-2">
                    {pageDraft.logoUrl ? <img src={pageDraft.logoUrl} alt={user.displayName} className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="pb-2">
                    <div className="font-display text-2xl font-bold">{user.displayName}</div>
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

          <section className="rounded-3xl border border-border/50 bg-surface/60 p-6">
            <h2 className="font-display text-2xl font-bold">Лента постов на публичной странице</h2>
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
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}