interface PlatformDisclaimerProps {
  compact?: boolean;
}

export function PlatformDisclaimer({ compact = false }: PlatformDisclaimerProps) {
  return (
    <div className={`rounded-2xl border border-border/50 bg-surface/50 text-muted-foreground ${compact ? "p-3 text-xs" : "p-4 text-sm"}`}>
      <p>
        NovaBoost Live - независимый сторонний сервис для TikTok-стримеров и их аудитории.
      </p>
      <p className="mt-1">
        Платформа не связана с TikTok, не представляет TikTok и не выдаёт себя за официальный продукт TikTok.
      </p>
    </div>
  );
}