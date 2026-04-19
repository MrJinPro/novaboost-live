import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { AdminApiError, loadAdminStreamerApplications, reviewAdminStreamerApplication, type AdminApplicationStatus, type AdminStreamerApplication } from "@/lib/admin-moderation-data";
import { ArrowUpDown, History, Search, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Админка — NovaBoost Live" },
      { name: "description", content: "Модерация заявок стримеров в NovaBoost Live: просмотр доказательств, подтверждение и отклонение заявок." },
    ],
  }),
  component: AdminPage,
});

const STATUS_LABELS: Record<"all" | AdminApplicationStatus, string> = {
  all: "Все",
  pending: "Ожидают",
  verified: "Подтверждены",
  rejected: "Отклонены",
};

type SortMode = "newest" | "oldest" | "pending-first" | "name";

const SORT_LABELS: Record<SortMode, string> = {
  newest: "Сначала новые",
  oldest: "Сначала старые",
  "pending-first": "Сначала pending",
  name: "По имени стримера",
};

const STATUS_PRIORITY: Record<AdminApplicationStatus, number> = {
  pending: 0,
  verified: 1,
  rejected: 2,
};

function toTimestamp(value: string | null) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isExternalLink(value: string | null) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function AdminPage() {
  const { user, session, loading } = useAuth();
  const [applications, setApplications] = useState<AdminStreamerApplication[]>([]);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | AdminApplicationStatus>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("pending-first");
  const [actionKey, setActionKey] = useState<string | null>(null);

  const syncApplications = async () => {
    if (!session) {
      return;
    }

    setPageLoading(true);
    setPageError(null);
    setAccessDenied(false);

    try {
      const nextApplications = await loadAdminStreamerApplications(session);
      setApplications(nextApplications);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 403) {
        setAccessDenied(true);
        return;
      }

      if (error instanceof AdminApiError && error.status === 401) {
        setPageError("Сессия администратора недействительна. Войди заново.");
        return;
      }

      setPageError(error instanceof Error ? error.message : "Не удалось загрузить заявки стримеров.");
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    void syncApplications();
  }, [session]);

  const stats = useMemo(() => ({
    pending: applications.filter((item) => item.status === "pending").length,
    verified: applications.filter((item) => item.status === "verified").length,
    rejected: applications.filter((item) => item.status === "rejected").length,
  }), [applications]);

  const historyByStreamer = useMemo(() => {
    const map = new Map<string, AdminStreamerApplication[]>();

    for (const application of applications) {
      const current = map.get(application.streamerId) ?? [];
      current.push(application);
      map.set(application.streamerId, current);
    }

    for (const [streamerId, items] of map) {
      map.set(streamerId, [...items].sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt)));
    }

    return map;
  }, [applications]);

  const visibleApplications = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    const filtered = applications.filter((item) => {
      if (activeFilter !== "all" && item.status !== activeFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        item.streamerDisplayName,
        item.streamerTikTokUsername,
        item.submitterDisplayName,
        item.submitterUsername,
        item.evidenceType,
        item.evidenceValue,
        item.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    return [...filtered].sort((left, right) => {
      if (sortMode === "name") {
        return left.streamerDisplayName.localeCompare(right.streamerDisplayName, "ru");
      }

      if (sortMode === "oldest") {
        return toTimestamp(left.createdAt) - toTimestamp(right.createdAt);
      }

      if (sortMode === "pending-first") {
        const statusDiff = STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status];
        if (statusDiff !== 0) {
          return statusDiff;
        }
      }

      return toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
    });
  }, [activeFilter, applications, searchQuery, sortMode]);

  const handleReview = async (application: AdminStreamerApplication, decision: Exclude<AdminApplicationStatus, "pending">) => {
    if (!session) {
      return;
    }

    const nextActionKey = `${application.verificationId}:${decision}`;
    setActionKey(nextActionKey);
    try {
      await reviewAdminStreamerApplication(session, {
        verificationId: application.verificationId,
        decision,
      });
      toast.success(decision === "verified" ? "Заявка подтверждена." : "Заявка отклонена.");
      await syncApplications();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось обновить статус заявки.");
    } finally {
      setActionKey(null);
    }
  };

  if (loading) {
    return <div className="min-h-screen"><Header /><div className="container mx-auto px-4 py-16 text-center text-muted-foreground">Загрузка…</div></div>;
  }

  if (!user || !session) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="container mx-auto max-w-3xl px-4 py-16">
          <div className="rounded-3xl border border-border/50 bg-surface/60 p-8 text-center">
            <h1 className="font-display text-3xl font-bold">Нужна авторизация</h1>
            <p className="mt-3 text-muted-foreground">Для входа в админку сначала открой обычную сессию NovaBoost Live.</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link to="/auth"><Button className="bg-gradient-blast font-bold text-blast-foreground shadow-glow">Войти</Button></Link>
              <Link to="/"><Button variant="outline">На главную</Button></Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="container mx-auto max-w-3xl px-4 py-16">
          <div className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-8 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-amber-200" />
            <h1 className="mt-4 font-display text-3xl font-bold">Доступ запрещён</h1>
            <p className="mt-3 text-muted-foreground">У текущего аккаунта нет admin-роли для модерации заявок стримеров.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-cosmic" /> Moderation Queue
            </div>
            <h1 className="mt-4 font-display text-4xl font-bold">Админка заявок стримеров</h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Здесь можно проверить доказательства стримера, увидеть историю модерации и переключить статус между pending, verified и rejected.
            </p>
          </div>
          <Button variant="outline" onClick={() => void syncApplications()} disabled={pageLoading}>
            {pageLoading ? "Обновляем…" : "Обновить"}
          </Button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <SummaryCard title="Ожидают" value={stats.pending} tone="pending" />
          <SummaryCard title="Подтверждены" value={stats.verified} tone="verified" />
          <SummaryCard title="Отклонены" value={stats.rejected} tone="rejected" />
          <SummaryCard title="Всего" value={applications.length} tone="all" />
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {(["pending", "verified", "rejected", "all"] as const).map((status) => (
            <Button
              key={status}
              type="button"
              variant={activeFilter === status ? "default" : "outline"}
              className={activeFilter === status ? "bg-gradient-blast text-blast-foreground" : undefined}
              onClick={() => setActiveFilter(status)}
            >
              {STATUS_LABELS[status]}
            </Button>
          ))}
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_260px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Поиск по имени, @username, доказательству или комментарию"
              className="pl-10"
            />
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-border/50 bg-surface/60 px-3 py-2 text-sm text-muted-foreground">
            <ArrowUpDown className="h-4 w-4" />
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="w-full bg-transparent text-foreground outline-none"
            >
              {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                <option key={mode} value={mode} className="bg-background text-foreground">
                  {SORT_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          Показано {visibleApplications.length} из {applications.length} заявок.
        </div>

        {pageError && (
          <div className="mt-6 rounded-3xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            {pageError}
          </div>
        )}

        <div className="mt-8 space-y-4">
          {visibleApplications.length === 0 ? (
            <div className="rounded-3xl border border-border/50 bg-surface/60 p-8 text-center text-muted-foreground">
              В этом фильтре заявок пока нет.
            </div>
          ) : (
            visibleApplications.map((application) => (
              <article key={application.verificationId} className="rounded-3xl border border-border/50 bg-surface/60 p-6">
                {historyByStreamer.get(application.streamerId) && (historyByStreamer.get(application.streamerId)?.length ?? 0) > 1 && (
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cosmic/30 bg-cosmic/10 px-3 py-1 text-xs text-cosmic">
                    <History className="h-3.5 w-3.5" />
                    {historyByStreamer.get(application.streamerId)!.length} заявок по этому стримеру
                  </div>
                )}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className={`rounded-full px-3 py-1 text-xs font-semibold ${statusToneClass(application.status)}`}>
                        {STATUS_LABELS[application.status]}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Подана {formatDateTime(application.createdAt)}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {application.streamerAvatarUrl ? (
                        <img src={application.streamerAvatarUrl} alt={application.streamerDisplayName} className="h-14 w-14 rounded-2xl object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
                          <UserRound className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h2 className="truncate font-display text-2xl font-bold">{application.streamerDisplayName}</h2>
                        <p className="truncate text-sm text-muted-foreground">@{application.streamerTikTokUsername}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {application.status !== "verified" && (
                      <Button
                        type="button"
                        className="bg-emerald-500 text-black hover:bg-emerald-400"
                        disabled={actionKey !== null}
                        onClick={() => void handleReview(application, "verified")}
                      >
                        {actionKey === `${application.verificationId}:verified` ? "Подтверждаем…" : "Подтвердить"}
                      </Button>
                    )}
                    {application.status !== "rejected" && (
                      <Button
                        type="button"
                        variant="outline"
                        className="border-destructive/50 text-destructive hover:bg-destructive/10"
                        disabled={actionKey !== null}
                        onClick={() => void handleReview(application, "rejected")}
                      >
                        {actionKey === `${application.verificationId}:rejected` ? "Отклоняем…" : "Отклонить"}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-3">
                  <InfoBlock label="Тип доказательства" value={application.evidenceType || application.verificationMethod || "Не указано"} />
                  <InfoBlock label="Подал" value={application.submitterDisplayName || application.submitterUsername || application.submittedBy || "Неизвестно"} />
                  <InfoBlock label="Рассмотрел" value={application.reviewerDisplayName || application.reviewedBy || "Ещё не рассмотрено"} />
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <section className="rounded-2xl border border-border/50 bg-background/40 p-4">
                    <h3 className="text-sm font-semibold text-foreground">Доказательство</h3>
                    {isExternalLink(application.evidenceValue) ? (
                      <a href={application.evidenceValue ?? "#"} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm text-cosmic underline-offset-4 hover:underline">
                        Открыть ссылку
                      </a>
                    ) : (
                      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{application.evidenceValue || "Стример не добавил ссылку или описание."}</p>
                    )}
                    {application.notes && (
                      <>
                        <h4 className="mt-4 text-sm font-semibold text-foreground">Комментарий стримера</h4>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{application.notes}</p>
                      </>
                    )}
                  </section>

                  <section className="rounded-2xl border border-border/50 bg-background/40 p-4">
                    <h3 className="text-sm font-semibold text-foreground">Профиль стримера</h3>
                    <p className="mt-3 text-sm text-muted-foreground">{application.streamerBio || "Биография пока не заполнена."}</p>
                    <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                      <p>Статус в streamers: <span className="font-medium text-foreground">{application.streamerVerificationStatus}</span></p>
                      <p>Последнее решение: <span className="font-medium text-foreground">{formatDateTime(application.reviewedAt)}</span></p>
                      <p>ID заявки: <span className="font-mono text-xs text-foreground">{application.verificationId}</span></p>
                    </div>
                  </section>
                </div>

                {(historyByStreamer.get(application.streamerId)?.length ?? 0) > 1 && (
                  <section className="mt-4 rounded-2xl border border-border/50 bg-background/40 p-4">
                    <h3 className="text-sm font-semibold text-foreground">История заявок по стримеру</h3>
                    <div className="mt-3 space-y-3">
                      {historyByStreamer.get(application.streamerId)?.map((historyItem) => (
                        <div
                          key={historyItem.verificationId}
                          className={`rounded-2xl border px-4 py-3 text-sm ${historyItem.verificationId === application.verificationId ? "border-cosmic/40 bg-cosmic/10" : "border-border/40 bg-surface/40"}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusToneClass(historyItem.status)}`}>
                                {STATUS_LABELS[historyItem.status]}
                              </div>
                              <span className="text-muted-foreground">{formatDateTime(historyItem.createdAt)}</span>
                            </div>
                            {historyItem.verificationId === application.verificationId && (
                              <span className="text-xs font-medium text-cosmic">Текущая карточка</span>
                            )}
                          </div>
                          <div className="mt-2 grid gap-2 text-muted-foreground md:grid-cols-2">
                            <p>Тип: <span className="text-foreground">{historyItem.evidenceType || historyItem.verificationMethod || "Не указано"}</span></p>
                            <p>Решение: <span className="text-foreground">{formatDateTime(historyItem.reviewedAt)}</span></p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, tone }: { title: string; value: number; tone: "pending" | "verified" | "rejected" | "all" }) {
  return (
    <div className="rounded-3xl border border-border/50 bg-surface/60 p-5">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className={`mt-3 font-display text-4xl font-bold ${summaryToneClass(tone)}`}>{value}</p>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/40 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm text-foreground">{value}</p>
    </div>
  );
}

function statusToneClass(status: AdminApplicationStatus) {
  if (status === "verified") {
    return "bg-emerald-500/15 text-emerald-300";
  }

  if (status === "rejected") {
    return "bg-destructive/15 text-rose-300";
  }

  return "bg-amber-500/15 text-amber-200";
}

function summaryToneClass(tone: "pending" | "verified" | "rejected" | "all") {
  if (tone === "verified") {
    return "text-emerald-300";
  }

  if (tone === "rejected") {
    return "text-rose-300";
  }

  if (tone === "pending") {
    return "text-amber-200";
  }

  return "text-foreground";
}
