import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { PlatformDisclaimer } from "@/components/PlatformDisclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import type { StreamerPost } from "@/lib/mock-platform";
import { loadStreamerStudioData, publishStreamerPost, saveStreamerStudioPage } from "@/lib/streamer-studio-data";
import { toast } from "sonner";
import { Bell, ExternalLink, ImagePlus, LayoutPanelTop, PencilLine, Send, Sparkles } from "lucide-react";

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
  };
}

function StreamerStudioPage() {
  const { user, loading } = useAuth();
  const [pageDraft, setPageDraft] = useState(createInitialStudioDraft);
  const [posts, setPosts] = useState<StreamerPost[]>([]);
  const [publicPageId, setPublicPageId] = useState<string | null>(null);
  const [studioLoading, setStudioLoading] = useState(false);
  const [savingPage, setSavingPage] = useState(false);
  const [publishingPost, setPublishingPost] = useState(false);
  const [postType, setPostType] = useState<StreamerPost["type"]>("announcement");
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");

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
        const data = await loadStreamerStudioData(user);
        if (!active) {
          return;
        }
        setPageDraft(data.pageDraft);
        setPosts(data.posts);
        setPublicPageId(data.streamerId);
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

  const previewTags = pageDraft.tags.split(",").map((tag) => tag.trim()).filter(Boolean);

  const savePage = async () => {
    setSavingPage(true);
    try {
      const result = await saveStreamerStudioPage(user, pageDraft);
      setPublicPageId(result.streamerId);
      toast.success("Настройки публичной страницы сохранены в Supabase.");
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
      });
      setPublicPageId(result.streamerId);
      setPosts((current) => [result.post, ...current]);
      setPostTitle("");
      setPostBody("");
      setPostType("announcement");
      toast.success("Пост опубликован и сохранён в Supabase.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось опубликовать пост");
    } finally {
      setPublishingPost(false);
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
            {studioLoading && <p className="mt-3 text-xs text-muted-foreground">Подтягиваю сохранённые посты и настройки из Supabase…</p>}

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
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={publishPost} disabled={publishingPost || studioLoading} className="bg-gradient-blast text-blast-foreground font-bold">{publishingPost ? "Публикую…" : "Опубликовать пост"}</Button>
              <Button variant="outline" className="gap-2"><Send className="h-4 w-4" /> Отправить в Telegram позже</Button>
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