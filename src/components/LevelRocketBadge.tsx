import { useEffect, useState } from "react";
import { Rocket, Sparkles } from "lucide-react";

type AtlasCell = {
  col: number;
  row: number;
};

type LevelRocketBadgeProps = {
  level: number;
  size?: "sm" | "md" | "lg";
  showMilestone?: boolean;
  atlasSrc?: string;
  className?: string;
};

const ATLAS_COLS = 12;
const ATLAS_ROWS = 6;
const DEFAULT_ATLAS_SRC = "/level-rocket-atlas.png";

const ROCKET_ROW_LAYOUT = [
  { row: 0, startCol: 0 },
  { row: 1, startCol: 1 },
  { row: 2, startCol: 1 },
  { row: 3, startCol: 1 },
  { row: 4, startCol: 1 },
] as const;

const STAR_CELL_BY_LEVEL: Partial<Record<10 | 20 | 30 | 40 | 50, AtlasCell>> = {
  10: { col: 11, row: 0 },
  20: { col: 0, row: 1 },
  30: { col: 0, row: 2 },
  40: { col: 0, row: 3 },
  50: { col: 11, row: 5 },
};

const atlasAvailabilityCache = new Map<string, boolean>();

function clampLevel(level: number) {
  return Math.max(1, Math.min(50, Math.floor(level)));
}

function getLevelSpriteCell(level: number): AtlasCell {
  const safeLevel = clampLevel(level);
  const tierIndex = Math.min(ROCKET_ROW_LAYOUT.length - 1, Math.floor((safeLevel - 1) / 10));
  const indexInTier = (safeLevel - 1) % 10;
  const layout = ROCKET_ROW_LAYOUT[tierIndex];

  return {
    col: layout.startCol + indexInTier,
    row: layout.row,
  };
}

function getMilestoneStarCell(level: number) {
  const safeLevel = clampLevel(level);
  if (safeLevel % 10 !== 0) {
    return null;
  }

  return STAR_CELL_BY_LEVEL[safeLevel as 10 | 20 | 30 | 40 | 50] ?? null;
}

function getAtlasSpriteStyle(cell: AtlasCell, atlasSrc: string) {
  return {
    backgroundImage: `url(${atlasSrc})`,
    backgroundPosition: `${(cell.col / (ATLAS_COLS - 1)) * 100}% ${(cell.row / (ATLAS_ROWS - 1)) * 100}%`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${ATLAS_COLS * 100}% ${ATLAS_ROWS * 100}%`,
  };
}

function getLevelGlow(level: number) {
  if (level >= 50) {
    return "from-fuchsia-400/30 via-cyan-300/15 to-transparent shadow-[0_0_36px_rgba(217,70,239,0.45)]";
  }

  if (level >= 40) {
    return "from-fuchsia-400/20 via-sky-300/15 to-transparent shadow-[0_0_28px_rgba(168,85,247,0.35)]";
  }

  if (level >= 30) {
    return "from-cyan-400/20 via-sky-300/15 to-transparent shadow-[0_0_24px_rgba(34,211,238,0.3)]";
  }

  if (level >= 20) {
    return "from-sky-300/15 via-cosmic/10 to-transparent shadow-[0_0_20px_rgba(59,130,246,0.25)]";
  }

  return "from-amber/15 via-blast/10 to-transparent shadow-[0_0_16px_rgba(251,146,60,0.22)]";
}

function getSizeClasses(size: NonNullable<LevelRocketBadgeProps["size"]>) {
  switch (size) {
    case "sm":
      return {
        shell: "h-12 w-12 rounded-2xl",
        content: "h-9 w-9",
        label: "text-[10px]",
        icon: "h-5 w-5",
        milestone: "h-4 w-4",
      };
    case "md":
      return {
        shell: "h-18 w-18 rounded-[1.4rem]",
        content: "h-14 w-14",
        label: "text-xs",
        icon: "h-7 w-7",
        milestone: "h-5 w-5",
      };
    case "lg":
      return {
        shell: "h-28 w-28 rounded-[2rem]",
        content: "h-22 w-22",
        label: "text-sm",
        icon: "h-10 w-10",
        milestone: "h-6 w-6",
      };
  }
}

export function LevelRocketBadge({ level, size = "md", showMilestone = true, atlasSrc = DEFAULT_ATLAS_SRC, className }: LevelRocketBadgeProps) {
  const safeLevel = clampLevel(level);
  const [atlasAvailable, setAtlasAvailable] = useState(() => atlasAvailabilityCache.get(atlasSrc) ?? false);
  const rocketCell = getLevelSpriteCell(safeLevel);
  const milestoneStarCell = getMilestoneStarCell(safeLevel);
  const sizeClasses = getSizeClasses(size);
  const isMilestone = showMilestone && safeLevel % 10 === 0;

  useEffect(() => {
    const cached = atlasAvailabilityCache.get(atlasSrc);
    if (cached !== undefined) {
      setAtlasAvailable(cached);
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const image = new window.Image();
    image.onload = () => {
      atlasAvailabilityCache.set(atlasSrc, true);
      setAtlasAvailable(true);
    };
    image.onerror = () => {
      atlasAvailabilityCache.set(atlasSrc, false);
      setAtlasAvailable(false);
    };
    image.src = atlasSrc;
  }, [atlasSrc]);

  return (
    <div className={`relative inline-flex shrink-0 items-center justify-center ${sizeClasses.shell} ${className ?? ""}`}>
      <div className={`absolute inset-0 bg-radial-[at_30%_20%] ${getLevelGlow(safeLevel)} opacity-100`} />
      <div className="absolute inset-0 rounded-[inherit] border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.74))]" />
      <div className="absolute inset-px rounded-[inherit] bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(217,70,239,0.16),transparent_35%)]" />

      {isMilestone && (
        <div className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full border border-fuchsia-300/35 bg-[radial-gradient(circle,rgba(244,114,182,0.32),rgba(15,23,42,0.9))] shadow-[0_0_20px_rgba(217,70,239,0.45)]">
          {atlasAvailable && milestoneStarCell ? (
            <div className={`${sizeClasses.milestone} rounded-full bg-contain`} style={getAtlasSpriteStyle(milestoneStarCell, atlasSrc)} />
          ) : (
            <Sparkles className={`${sizeClasses.milestone} text-fuchsia-200`} />
          )}
        </div>
      )}

      <div
        className={`${sizeClasses.content} relative z-10 rounded-[inherit] ${atlasAvailable ? "bg-transparent" : "flex items-center justify-center rounded-full bg-linear-to-br from-cyan-400/25 via-fuchsia-500/15 to-transparent"}`}
        style={atlasAvailable ? getAtlasSpriteStyle(rocketCell, atlasSrc) : undefined}
      >
        {!atlasAvailable && <Rocket className={`${sizeClasses.icon} text-cyan-100`} />}
      </div>

      <div className={`absolute bottom-1 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/10 bg-black/45 px-2 py-0.5 font-display font-bold tracking-[0.08em] text-white/90 ${sizeClasses.label}`}>
        LVL {safeLevel}
      </div>
    </div>
  );
}

export function LevelRocketStrip({ level }: { level: number }) {
  const safeLevel = clampLevel(level);
  const sectorStart = Math.floor((safeLevel - 1) / 10) * 10 + 1;
  const levels = Array.from({ length: 10 }, (_, index) => sectorStart + index).filter((value) => value <= 50);

  return (
    <div className="flex flex-wrap gap-2">
      {levels.map((itemLevel) => {
        const unlocked = itemLevel <= safeLevel;
        const current = itemLevel === safeLevel;
        return (
          <div key={itemLevel} className={`transition-all ${unlocked ? "opacity-100" : "opacity-35 saturate-0"} ${current ? "scale-105" : "scale-100"}`}>
            <LevelRocketBadge level={itemLevel} size="sm" showMilestone={itemLevel % 10 === 0} />
          </div>
        );
      })}
    </div>
  );
}