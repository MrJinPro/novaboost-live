import { Link } from "@tanstack/react-router";
import { Eye, Users, ExternalLink, ChevronRight } from "lucide-react";
import { LiveIndicator } from "./LiveIndicator";
import { BoostBadge, NeedsBoostBadge } from "./BoostBadge";
import { AppAvatar } from "./AppAvatar";
import { formatNumber } from "@/lib/format";
import type { StreamerCardData } from "@/lib/mock-platform";
import { getStreamerPublicRouteParam } from "@/lib/streamer-public-route";

interface StreamerCardProps {
  streamer: StreamerCardData;
  variant?: "default" | "featured" | "compact";
}

export function StreamerCard({ streamer, variant = "default" }: StreamerCardProps) {
  const boosted = streamer.total_boost_amount > 0;
  const isRegistered = streamer.is_registered ?? true;
  const platformSubscriberCount = streamer.subscription_count ?? 0;
  const publicRouteParam = getStreamerPublicRouteParam({ id: streamer.id, tiktokUsername: streamer.tiktok_username });
  const tiktokLiveUrl = `https://www.tiktok.com/@${streamer.tiktok_username}/live`;

  if (variant === "compact") {
    return (
      <Link
        to="/streamer/$id"
        params={{ id: publicRouteParam }}
        className="group flex items-center gap-3 rounded-xl border border-border/50 bg-surface/60 p-3 transition-all hover:border-blast/40 hover:bg-surface"
      >
        <div className="relative shrink-0">
          <AppAvatar
            src={streamer.avatar_url ?? ""}
            name={streamer.display_name}
            className="h-12 w-12 rounded-full bg-surface-2 object-cover ring-2 ring-border"
          />
          {streamer.is_live && (
            <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-live ring-2 ring-background" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-sm">{streamer.display_name}</span>
            {boosted && <span className="text-crown">👑</span>}
          </div>
          <div className="text-xs text-muted-foreground truncate">@{streamer.tiktok_username}</div>
          {!isRegistered && <div className="mt-1 text-[10px] text-amber-300">Не зарегистрирован в NovaBoost Live</div>}
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {streamer.is_live ? (
            <div className="flex items-center gap-1 text-[oklch(0.85_0.15_25)] font-bold">
              <Eye className="h-3 w-3" />
              {formatNumber(streamer.viewer_count)}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {formatNumber(platformSubscriberCount)}
            </div>
          )}
        </div>
      </Link>
    );
  }

  const featured = variant === "featured";
  const cardBodyClass = `group relative overflow-hidden rounded-2xl border bg-surface/70 p-5 transition-all ${
    boosted
      ? "border-blast/50 shadow-glow animate-glow-breathe"
      : "border-border/50"
  } ${featured ? "min-h-70" : ""}`;

  const cardContent = (
    <>
      {boosted && (
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-[oklch(0.72_0.20_45/0.08)] via-transparent to-[oklch(0.66_0.24_5/0.08)]" />
      )}

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <AppAvatar
              src={streamer.avatar_url ?? ""}
              name={streamer.display_name}
              className={`rounded-full bg-surface-2 object-cover ring-2 ${
                boosted ? "ring-blast/60" : "ring-border"
              } ${featured ? "h-16 w-16" : "h-14 w-14"}`}
            />
            {streamer.is_live && (
              <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-live ring-2 ring-background animate-pulse-live" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-display font-bold truncate">{streamer.display_name}</h3>
              {boosted && <span className="text-crown text-lg">👑</span>}
            </div>
            <div className="text-xs text-muted-foreground">@{streamer.tiktok_username}</div>
            {!isRegistered && (
              <div className="mt-1 inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">
                Стример ещё не зарегистрирован
              </div>
            )}
          </div>
        </div>

        {streamer.is_live && <LiveIndicator />}
      </div>

      {streamer.bio && (
        <p className="relative mt-3 text-sm text-muted-foreground line-clamp-2">
          {streamer.bio}
        </p>
      )}

      {!isRegistered && (
        <p className="relative mt-3 text-xs leading-5 text-muted-foreground">
          Пока мы отслеживаем только live-статус этого TikTok-аккаунта. Пригласите стримера зарегистрироваться, чтобы открыть страницу, бонусы и бусты NovaBoost Live.
        </p>
      )}

      <div className="relative mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs">
          {streamer.is_live ? (
            <span className="inline-flex items-center gap-1 font-bold text-[oklch(0.85_0.15_25)]">
              <Eye className="h-3.5 w-3.5" />
              {formatNumber(streamer.viewer_count)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {formatNumber(platformSubscriberCount)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {boosted && <BoostBadge amount={streamer.total_boost_amount} variant="compact" />}
          {streamer.needs_boost && !boosted && <NeedsBoostBadge />}
        </div>
      </div>
    </>
  );

  // LIVE card: div wrapper (not a Link) so we can have two action buttons inside
  if (streamer.is_live) {
    return (
      <div className={cardBodyClass}>
        {cardContent}

        <div className="relative mt-4 grid grid-cols-2 gap-2">
          <a
            href={tiktokLiveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl bg-live/15 border border-live/30 px-3 py-2.5 text-xs font-semibold text-live transition-colors hover:bg-live/25 hover:border-live/50"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            В эфир
          </a>
          <Link
            to="/streamer/$id"
            params={{ id: publicRouteParam }}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-2/80 border border-border/50 px-3 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface-2 hover:border-cosmic/40"
          >
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            Открыть
          </Link>
        </div>
      </div>
    );
  }

  // Offline card: full card is a Link
  return (
    <Link
      to="/streamer/$id"
      params={{ id: publicRouteParam }}
      className={`${cardBodyClass} hover:-translate-y-0.5 ${boosted ? "" : "hover:border-cosmic/40"}`}
    >
      {cardContent}
      <div className="relative mt-3 flex items-center justify-end gap-1 text-[11px] text-muted-foreground/60">
        <span>профиль, статистика, бусты</span>
        <ChevronRight className="h-3 w-3" />
      </div>
    </Link>
  );
}
