import logo from "@/assets/novaboost-logo.png";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
}

const sizes = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
  xl: "h-32 w-32 md:h-40 md:w-40",
};

export function Logo({ size = "md", showText = true }: LogoProps) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={logo}
        alt="NovaBoost Live"
        className={`${sizes[size]} object-contain drop-shadow-[0_0_18px_oklch(0.72_0.20_45/0.55)]`}
      />
      {showText && (
        <div className="leading-none">
          <div className="font-display font-bold text-lg tracking-tight">
            <span className="text-foreground">Nova</span>
            <span className="text-gradient-blast">Boost</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-0.5">
            Платформа живых эфиров
          </div>
        </div>
      )}
    </div>
  );
}
