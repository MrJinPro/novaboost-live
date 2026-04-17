interface LiveIndicatorProps {
  size?: "sm" | "md";
}

export function LiveIndicator({ size = "sm" }: LiveIndicatorProps) {
  const padding = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs";
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full bg-[oklch(0.66_0.27_25/0.15)] border border-[oklch(0.66_0.27_25/0.4)] ${padding} font-bold uppercase tracking-wider`}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--live)] opacity-75 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--live)]" />
      </span>
      <span className="text-[oklch(0.85_0.15_25)]">В эфире</span>
    </div>
  );
}
