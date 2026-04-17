import { Link } from "@tanstack/react-router";
import { Eye, Users } from "lucide-react";
import { LiveIndicator } from "./LiveIndicator";
import { BoostBadge, NeedsBoostBadge } from "./BoostBadge";
import { formatNumber } from "@/lib/format";
import type { StreamerCardData } from "@/lib/mock-platform";

interface StreamerCardProps {
  streamer: StreamerCardData;
  variant?: "default" | "featured" | "compact";
}

export function StreamerCard({ streamer, variant = "default" }: StreamerCardProps) {
  const boosted = streamer.total_boost_amount > 0;

  if (variant === "compact") {
    return (
      <Link
        to="/streamer/$id"
        params={{ id: streamer.id }}
        className="group flex items-center gap-3 rounded-xl border border-border/50 bg-surface/60 p-3 transition-all hover:border-blast/40 hover:bg-surface"
      >
        <div className="relative shrink-0">
          <img
            src={streamer.avatar_url ?? ""}
            alt={streamer.display_name}
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
              {formatNumber(streamer.followers_count)}
            </div>
          )}
        </div>
      </Link>
    );
  }

  const featured = variant === "featured";

  return (
    <Link
      to="/streamer/$id"
      params={{ id: streamer.id }}
      className={`group relative overflow-hidden rounded-2xl border bg-surface/70 p-5 transition-all hover:-translate-y-0.5 ${
        boosted
          ? "border-blast/50 shadow-glow animate-glow-breathe"
          : "border-border/50 hover:border-cosmic/40"
      } ${featured ? "min-h-70" : ""}`}
    >
      {boosted && (
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-[oklch(0.72_0.20_45/0.08)] via-transparent to-[oklch(0.66_0.24_5/0.08)]" />
      )}

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={streamer.avatar_url ?? ""}
              alt={streamer.display_name}
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
          </div>
        </div>

        {streamer.is_live && <LiveIndicator />}
      </div>

      {streamer.bio && (
        <p className="relative mt-3 text-sm text-muted-foreground line-clamp-2">
          {streamer.bio}
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
              {formatNumber(streamer.followers_count)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {boosted && <BoostBadge amount={streamer.total_boost_amount} variant="compact" />}
          {streamer.needs_boost && !boosted && <NeedsBoostBadge />}
        </div>
      </div>
    </Link>
  );
}
