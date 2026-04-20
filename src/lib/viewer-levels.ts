const VIEWER_LEVEL_THRESHOLDS = [
  1,
  8,
  18,
  34,
  56,
  90,
  140,
  220,
  340,
  530,
  820,
  1260,
  1920,
  2480,
  4340,
  6420,
  9280,
  13500,
  19400,
  27800,
  39600,
  54600,
  75800,
  105000,
  144000,
  196000,
  265000,
  357000,
  578000,
  637000,
  845000,
  1120000,
  1470000,
  1920000,
  2500000,
  3230000,
  4180000,
  5430000,
  6890000,
  8780000,
  11200000,
  14100000,
  17800000,
  22300000,
  28000000,
  37500000,
  47500000,
  65700000,
  75000000,
  97500000,
] as const;

export type ViewerProgression = {
  level: number;
  currentLevelMinPoints: number;
  nextLevel: number | null;
  nextLevelMinPoints: number | null;
  pointsIntoLevel: number;
  pointsRequiredForNextLevel: number | null;
  pointsRemainingToNextLevel: number | null;
  progressPercent: number;
  maxLevelReached: boolean;
};

export function getViewerLevel(points: number) {
  const safePoints = Math.max(0, Math.floor(points));
  let resolvedLevel = 1;

  for (let index = 0; index < VIEWER_LEVEL_THRESHOLDS.length; index += 1) {
    if (safePoints >= VIEWER_LEVEL_THRESHOLDS[index]) {
      resolvedLevel = index + 1;
    }
  }

  return resolvedLevel;
}

export function getViewerProgression(points: number): ViewerProgression {
  const safePoints = Math.max(0, Math.floor(points));
  const level = getViewerLevel(safePoints);
  const nextLevel = level < VIEWER_LEVEL_THRESHOLDS.length ? level + 1 : null;
  const currentLevelMinPoints = level <= 1 ? 0 : VIEWER_LEVEL_THRESHOLDS[level - 1];
  const nextLevelMinPoints = nextLevel ? VIEWER_LEVEL_THRESHOLDS[nextLevel - 1] : null;
  const pointsIntoLevel = Math.max(0, safePoints - currentLevelMinPoints);
  const pointsRequiredForNextLevel = nextLevelMinPoints === null ? null : Math.max(0, nextLevelMinPoints - currentLevelMinPoints);
  const pointsRemainingToNextLevel = nextLevelMinPoints === null ? null : Math.max(0, nextLevelMinPoints - safePoints);
  const progressPercent = pointsRequiredForNextLevel && pointsRequiredForNextLevel > 0
    ? Math.min(100, Math.max(0, Math.round((pointsIntoLevel / pointsRequiredForNextLevel) * 100)))
    : 100;

  return {
    level,
    currentLevelMinPoints,
    nextLevel,
    nextLevelMinPoints,
    pointsIntoLevel,
    pointsRequiredForNextLevel,
    pointsRemainingToNextLevel,
    progressPercent,
    maxLevelReached: nextLevel === null,
  };
}

export function calculateCodeWordReward(codeWord: string) {
  const normalizedCodeWord = codeWord.trim().toUpperCase();
  if (!normalizedCodeWord) {
    return 0;
  }

  return normalizedCodeWord.length * 10;
}

export function validateCodeWord(codeWord: string) {
  const normalizedCodeWord = codeWord.trim().toUpperCase();

  if (normalizedCodeWord.length < 4) {
    throw new Error("Кодовое слово должно содержать минимум 4 символа.");
  }

  if (/\s/.test(normalizedCodeWord)) {
    throw new Error("Кодовое слово должно состоять из одного слова без пробелов.");
  }

  return normalizedCodeWord;
}

export function getViewerLevelThresholds() {
  return VIEWER_LEVEL_THRESHOLDS;
}