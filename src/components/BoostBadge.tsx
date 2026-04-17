import { Crown, Flame } from "lucide-react";
import { formatNumber } from "@/lib/format";

interface BoostBadgeProps {
  amount: number;
  variant?: "default" | "compact";
}

export function BoostBadge({ amount, variant = "default" }: BoostBadgeProps) {
  if (variant === "compact") {
    return (
      <div className="inline-flex items-center gap-1 rounded-full bg-gradient-blast px-2 py-0.5 text-[10px] font-bold text-blast-foreground shadow-glow">
        <Crown className="h-3 w-3" />
        {formatNumber(amount)}
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-blast px-3 py-1 text-xs font-bold text-blast-foreground shadow-glow">
      <Crown className="h-3.5 w-3.5" />
      <span>Продвигается</span>
      <span className="opacity-80">·</span>
      <span>{formatNumber(amount)} ⚡</span>
    </div>
  );
}

export function NeedsBoostBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-[oklch(0.66_0.24_5/0.18)] border border-[oklch(0.66_0.24_5/0.4)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[oklch(0.78_0.18_5)]">
      <Flame className="h-3 w-3" />
      Нужен буст
    </div>
  );
}
