import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { formatCurrencyAmount } from "@/lib/currency";
import { loadDonationGoalProgress, loadDonationOverlayBySlug, loadDonationWidgetEntries, loadLatestDonationOverlayEvent } from "@/lib/monetization-data";
import type { DonationGoalProgress, DonationWidgetEntry, DonationWidgetType } from "@/lib/mock-platform";

const stringFromSearch = z.union([z.string(), z.number()]).transform((value) => String(value));
const widgetSchema = z.enum(["latest", "top-day", "top-all-time", "goal"]);

const searchSchema = z.object({
  key: stringFromSearch.optional(),
});

export const Route = createFileRoute("/overlay/widget/$slug/$widget")({
  validateSearch: searchSchema,
  component: DonationWidgetOverlayRoute,
});

function DonationWidgetOverlayRoute() {
  const { slug, widget } = Route.useParams();
  const search = Route.useSearch();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [streamerId, setStreamerId] = useState<string | null>(null);
  const [widgetEntries, setWidgetEntries] = useState<DonationWidgetEntry[]>([]);
  const [latestDonation, setLatestDonation] = useState<{ donorName: string; amount: number; currency: string; message: string } | null>(null);
  const [goalProgress, setGoalProgress] = useState<DonationGoalProgress | null>(null);
  const [title, setTitle] = useState("NovaBoost Widget");

  const widgetType = useMemo(() => widgetSchema.parse(widget) as DonationWidgetType, [widget]);

  useEffect(() => {
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";

    return () => {
      document.body.style.background = "";
      document.documentElement.style.background = "";
    };
  }, []);

  useEffect(() => {
    let active = true;

    void loadDonationOverlayBySlug(slug, search.key)
      .then((data) => {
        if (!active || !data) {
          setIsAuthorized(false);
          setStreamerId(null);
          return;
        }

        setIsAuthorized(true);
        setStreamerId(data.streamer_id);
      })
      .catch(() => {
        if (active) {
          setIsAuthorized(false);
          setStreamerId(null);
        }
      });

    return () => {
      active = false;
    };
  }, [search.key, slug]);

  useEffect(() => {
    if (!isAuthorized || !streamerId) {
      return;
    }

    let active = true;

    const refresh = async () => {
      const overlay = await loadDonationOverlayBySlug(slug, search.key);
      if (!overlay || !active) {
        return;
      }

      switch (widgetType) {
        case "latest": {
          const latest = await loadLatestDonationOverlayEvent(streamerId);
          if (!active) {
            return;
          }
          setTitle("Последний донат");
          setLatestDonation(latest ? {
            donorName: latest.donorName,
            amount: latest.amount,
            currency: latest.currency,
            message: latest.message,
          } : null);
          break;
        }
        case "top-day": {
          const entries = await loadDonationWidgetEntries(streamerId, "top-day", overlay.overlay.displayCurrency);
          if (!active) {
            return;
          }
          setTitle("Топ дня");
          setWidgetEntries(entries);
          break;
        }
        case "top-all-time": {
          const entries = await loadDonationWidgetEntries(streamerId, "top-all-time", overlay.overlay.displayCurrency);
          if (!active) {
            return;
          }
          setTitle("Топ донатов");
          setWidgetEntries(entries);
          break;
        }
        case "goal": {
          const goal = await loadDonationGoalProgress(streamerId);
          if (!active) {
            return;
          }
          setTitle(goal.title);
          setGoalProgress(goal);
          break;
        }
      }
    };

    void refresh().catch(() => undefined);
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isAuthorized, search.key, slug, streamerId, widgetType]);

  if (!isAuthorized) {
    return <div className="fixed inset-0 bg-transparent" />;
  }

  const topRows = widgetEntries.slice(0, 5);
  const latestAmount = latestDonation
    ? formatCurrencyAmount(latestDonation.amount, latestDonation.currency as "USD" | "RUB" | "KZT" | "MDL")
    : null;
  const goalPercent = Math.max(0, Math.min(goalProgress?.progressPercent ?? 0, 100));
  const remainingGoalAmount = goalProgress
    ? Math.max(goalProgress.targetAmount - goalProgress.currentAmount, 0)
    : 0;

  return (
    <div className="fixed inset-0 bg-transparent p-6 text-white">
      {widgetType === "latest" && (
        <div className="ml-auto flex max-w-2xl items-stretch overflow-hidden rounded-4xl border border-cyan-300/30 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.24),transparent_35%),linear-gradient(135deg,rgba(8,15,30,0.94),rgba(15,23,42,0.78))] shadow-[0_30px_90px_rgba(6,182,212,0.22)] backdrop-blur-xl">
          <div className="w-3 bg-[linear-gradient(180deg,#67e8f9,#22d3ee,#0f172a)]" />
          <div className="flex-1 p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.45em] text-cyan-200/80">Nova Boost Alert</div>
                <div className="mt-3 font-display text-4xl font-bold text-white">{latestDonation?.donorName ?? "Пока пусто"}</div>
                <div className="mt-2 text-sm text-slate-300">{title}</div>
              </div>
              <div className="rounded-3xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-4 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-100/70">Сумма</div>
                <div className="mt-2 font-display text-3xl font-bold text-white">{latestAmount ?? "Ждём"}</div>
              </div>
            </div>
            <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 px-5 py-4 text-base text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              {latestDonation?.message || "Последний донат появится здесь автоматически, без перезагрузки OBS."}
            </div>
          </div>
        </div>
      )}

      {(widgetType === "top-day" || widgetType === "top-all-time") && (
        <div className="ml-auto max-w-xl overflow-hidden rounded-4xl border border-fuchsia-300/20 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.22),transparent_38%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(3,7,18,0.84))] p-5 shadow-[0_28px_90px_rgba(168,85,247,0.18)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.38em] text-fuchsia-200/80">Nova Boost Ranking</div>
              <div className="mt-2 font-display text-3xl font-bold text-white">{title}</div>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.28em] text-slate-300">
              {widgetType === "top-day" ? "24h" : "All Time"}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {topRows.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 px-5 py-6 text-sm text-slate-300">
                Пока нет донатов для рейтинга.
              </div>
            ) : topRows.map((entry, index) => (
              <div key={`${entry.donorName}-${index}`} className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="absolute inset-y-0 left-0 w-1 rounded-full bg-[linear-gradient(180deg,#f59e0b,#ec4899,#8b5cf6)]" />
                <div className="flex items-center justify-between gap-4 pl-3">
                  <div className="flex items-center gap-4">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-sm font-bold ${index === 0 ? "border-amber-300/40 bg-amber-300/10 text-amber-100" : index === 1 ? "border-slate-300/30 bg-slate-300/10 text-slate-100" : index === 2 ? "border-orange-300/30 bg-orange-300/10 text-orange-100" : "border-white/10 bg-white/5 text-slate-200"}`}>
                      #{index + 1}
                    </div>
                    <div>
                      <div className="font-display text-2xl font-bold text-white">{entry.donorName}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-300">{entry.donationCount} донат{entry.donationCount === 1 ? "" : entry.donationCount < 5 ? "а" : "ов"}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-fuchsia-200/70">Объём</div>
                    <div className="mt-1 font-display text-2xl font-bold text-white">{formatCurrencyAmount(entry.amount, entry.currency)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {widgetType === "goal" && (
        <div className="ml-auto max-w-2xl overflow-hidden rounded-4xl border border-emerald-300/25 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_36%),linear-gradient(135deg,rgba(6,18,23,0.94),rgba(15,23,42,0.82))] p-6 shadow-[0_28px_90px_rgba(16,185,129,0.18)] backdrop-blur-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.38em] text-emerald-200/80">Nova Boost Goal</div>
              <div className="mt-2 font-display text-3xl font-bold text-white">{title}</div>
              <div className="mt-2 text-sm text-slate-300">Прогресс обновляется автоматически по новым подтверждённым донатам.</div>
            </div>
            <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-right">
              <div className="text-[10px] uppercase tracking-[0.3em] text-emerald-100/70">Выполнено</div>
              <div className="mt-1 font-display text-3xl font-bold text-white">{goalProgress ? `${goalPercent.toFixed(1)}%` : "0%"}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.25em] text-slate-300">Собрано</div>
                  <div className="mt-2 font-display text-4xl font-bold text-white">{goalProgress ? formatCurrencyAmount(goalProgress.currentAmount, goalProgress.currency) : "0"}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-[0.25em] text-slate-300">Цель</div>
                  <div className="mt-2 text-lg font-semibold text-emerald-100">{goalProgress ? formatCurrencyAmount(goalProgress.targetAmount, goalProgress.currency) : "0"}</div>
                </div>
              </div>
              <div className="mt-5 h-5 overflow-hidden rounded-full bg-white/10 p-1">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,#34d399,#22d3ee,#60a5fa)] transition-[width] duration-700" style={{ width: `${goalPercent}%` }} />
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="text-xs uppercase tracking-[0.25em] text-slate-300">Осталось</div>
              <div className="mt-2 font-display text-3xl font-bold text-white">{goalProgress ? formatCurrencyAmount(remainingGoalAmount, goalProgress.currency) : "0"}</div>
              <div className="mt-3 text-sm text-slate-300">{goalProgress ? `${goalPercent.toFixed(1)}% выполнено` : "Цель появится после настройки в студии."}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
