import { Info, ChevronDown } from "lucide-react";

type HowItWorksLinkProps = {
  targetId?: string;
  className?: string;
};

export function HowItWorksLink({ targetId = "how-it-works", className = "" }: HowItWorksLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className={`inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/30 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground ${className}`}
    >
      <Info className="h-3.5 w-3.5 text-cosmic" />
      Как это работает
      <ChevronDown className="h-3.5 w-3.5" />
    </a>
  );
}