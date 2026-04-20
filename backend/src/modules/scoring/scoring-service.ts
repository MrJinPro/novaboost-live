export type PriorityScoreInput = {
  activeBoost: number;
  liveViewers: number;
  engagementRate: number;
  referralStrength: number;
  retentionSignal: number;
  platformSignal: number;
};

export type ViewerRewardInput = {
  type: "viewer_joined" | "chat_message" | "like_received" | "gift_received";
  likeCount?: number;
  giftCount?: number;
  giftDiamondCount?: number;
  progressionMultiplier?: number;
};

export type ViewerRewardResult = {
  profilePoints: number;
  teamPoints: number;
};

export type TeamFeature =
  | "team-badge"
  | "bonus-task-queue"
  | "priority-giveaways"
  | "team-votes"
  | "captain-nomination"
  | "future-donation-multiplier";

export type TeamMembershipProgress = {
  commentCount: number;
  likeCount: number;
  giftCount: number;
  totalGiftDiamonds: number;
  teamPoints: number;
};

export type ViewerLevelDefinition = {
  level: number;
  minPoints: number;
  title: string;
};

export type ProgressionPlanKey = "free" | "supporter" | "boost" | "legend";

export type ViewerProgressionSnapshot = {
  currentLevel: number;
  currentLevelMinPoints: number;
  nextLevel: number | null;
  nextLevelMinPoints: number | null;
  currentPoints: number;
  pointsIntoLevel: number;
  pointsRequiredForNextLevel: number | null;
  pointsRemainingToNextLevel: number | null;
  maxLevelReached: boolean;
};

export type AchievementDefinition = {
  key: string;
  title: string;
  description: string;
  profilePoints: number;
  teamPoints: number;
  isUnlocked(progress: TeamMembershipProgress): boolean;
};

const TEAM_LEVELS: Array<{ level: number; minPoints: number; features: TeamFeature[] }> = [
  { level: 1, minPoints: 0, features: ["team-badge"] },
  { level: 2, minPoints: 50, features: ["team-badge", "bonus-task-queue"] },
  { level: 3, minPoints: 150, features: ["team-badge", "bonus-task-queue", "priority-giveaways"] },
  { level: 4, minPoints: 350, features: ["team-badge", "bonus-task-queue", "priority-giveaways", "team-votes"] },
  { level: 5, minPoints: 700, features: ["team-badge", "bonus-task-queue", "priority-giveaways", "team-votes", "captain-nomination"] },
  { level: 6, minPoints: 1200, features: ["team-badge", "bonus-task-queue", "priority-giveaways", "team-votes", "captain-nomination", "future-donation-multiplier"] },
];

const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    key: "first_comment",
    title: "Первый голос",
    description: "Оставить первый комментарий в команде стримера.",
    profilePoints: 5,
    teamPoints: 5,
    isUnlocked: (progress) => progress.commentCount >= 1,
  },
  {
    key: "chatter_25",
    title: "Чат-мотор",
    description: "Написать 25 комментариев у одного стримера.",
    profilePoints: 25,
    teamPoints: 20,
    isUnlocked: (progress) => progress.commentCount >= 25,
  },
  {
    key: "chatter_100",
    title: "Голос команды",
    description: "Написать 100 комментариев у одного стримера.",
    profilePoints: 80,
    teamPoints: 60,
    isUnlocked: (progress) => progress.commentCount >= 100,
  },
  {
    key: "like_squad_50",
    title: "Разогрев чата",
    description: "Отправить 50 лайков в поддержку команды.",
    profilePoints: 15,
    teamPoints: 10,
    isUnlocked: (progress) => progress.likeCount >= 50,
  },
  {
    key: "like_squad_250",
    title: "Лайк-шторм",
    description: "Отправить 250 лайков у одного стримера.",
    profilePoints: 45,
    teamPoints: 30,
    isUnlocked: (progress) => progress.likeCount >= 250,
  },
  {
    key: "gift_supporter_100",
    title: "Донат-поддержка",
    description: "Подарить эквивалент 100 diamonds у одного стримера.",
    profilePoints: 50,
    teamPoints: 40,
    isUnlocked: (progress) => progress.totalGiftDiamonds >= 100,
  },
  {
    key: "team_core_100",
    title: "Ядро команды",
    description: "Набрать 100 командных очков у одного стримера.",
    profilePoints: 30,
    teamPoints: 25,
    isUnlocked: (progress) => progress.teamPoints >= 100,
  },
  {
    key: "team_elite_500",
    title: "Элита команды",
    description: "Набрать 500 командных очков у одного стримера.",
    profilePoints: 100,
    teamPoints: 80,
    isUnlocked: (progress) => progress.teamPoints >= 500,
  },
];

const MAX_VIEWER_LEVEL = 50;

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

const VIEWER_LEVELS: ViewerLevelDefinition[] = Array.from({ length: MAX_VIEWER_LEVEL }, (_, index) => {
  const level = index + 1;
  return {
    level,
    minPoints: level === 1 ? 0 : VIEWER_LEVEL_THRESHOLDS[level - 1],
    title: getViewerLevelTitle(level),
  };
});

const PROGRESSION_PLANS: Record<ProgressionPlanKey, { multiplier: number; label: string; status: "active" | "future" }> = {
  free: { multiplier: 1, label: "Base progression", status: "active" },
  supporter: { multiplier: 1.15, label: "Paid supporter progression boost", status: "future" },
  boost: { multiplier: 1.35, label: "Paid boost progression plan", status: "future" },
  legend: { multiplier: 1.75, label: "Top-tier paid progression plan", status: "future" },
};

export class ScoringService {
  calculatePriorityScore(input: PriorityScoreInput) {
    return (
      input.activeBoost +
      input.liveViewers * 0.2 +
      input.engagementRate * 20 +
      input.referralStrength * 10 +
      input.retentionSignal * 15 +
      input.platformSignal
    );
  }

  getViewerReward(input: ViewerRewardInput): ViewerRewardResult {
    const progressionMultiplier = Math.max(1, input.progressionMultiplier ?? 1);

    switch (input.type) {
      case "viewer_joined":
        return {
          profilePoints: applyProgressionMultiplier(1, progressionMultiplier),
          teamPoints: 1,
        };
      case "chat_message":
        return {
          profilePoints: applyProgressionMultiplier(2, progressionMultiplier),
          teamPoints: 1,
        };
      case "like_received": {
        const likes = Math.max(1, input.likeCount ?? 1);
        return {
          profilePoints: applyProgressionMultiplier(Math.max(1, Math.floor(likes / 10)), progressionMultiplier),
          teamPoints: Math.max(1, Math.floor(likes / 25)),
        };
      }
      case "gift_received": {
        const giftUnits = Math.max(1, input.giftCount ?? 1);
        const diamonds = Math.max(0, input.giftDiamondCount ?? 0);
        return {
          profilePoints: applyProgressionMultiplier(10 + giftUnits * 2 + Math.floor(diamonds / 5), progressionMultiplier),
          teamPoints: 5 + giftUnits + Math.floor(diamonds / 10),
        };
      }
    }
  }

  getViewerLevel(points: number) {
    let level = 1;

    for (const config of VIEWER_LEVELS) {
      if (points >= config.minPoints) {
        level = config.level;
      }
    }

    return level;
  }

  getViewerProgression(points: number): ViewerProgressionSnapshot {
    const safePoints = Math.max(0, points);
    const currentLevel = this.getViewerLevel(safePoints);
    const currentConfig = VIEWER_LEVELS[currentLevel - 1] ?? VIEWER_LEVELS[0];
    const nextConfig = VIEWER_LEVELS[currentLevel] ?? null;

    return {
      currentLevel,
      currentLevelMinPoints: currentConfig.minPoints,
      nextLevel: nextConfig?.level ?? null,
      nextLevelMinPoints: nextConfig?.minPoints ?? null,
      currentPoints: safePoints,
      pointsIntoLevel: safePoints - currentConfig.minPoints,
      pointsRequiredForNextLevel: nextConfig ? nextConfig.minPoints - currentConfig.minPoints : null,
      pointsRemainingToNextLevel: nextConfig ? Math.max(0, nextConfig.minPoints - safePoints) : null,
      maxLevelReached: currentLevel >= MAX_VIEWER_LEVEL,
    };
  }

  getViewerLevelDefinitions() {
    return VIEWER_LEVELS;
  }

  getProgressionPlan(planKey: ProgressionPlanKey = "free") {
    return PROGRESSION_PLANS[planKey];
  }

  getTeamLevel(teamPoints: number) {
    return TEAM_LEVELS.reduce((level, config) => (teamPoints >= config.minPoints ? config.level : level), 1);
  }

  getTeamFeatures(teamLevel: number) {
    let matchedFeatures = TEAM_LEVELS[0].features;

    for (const config of TEAM_LEVELS) {
      if (teamLevel >= config.level) {
        matchedFeatures = config.features;
      }
    }

    return matchedFeatures;
  }

  getAchievementDefinitions() {
    return ACHIEVEMENT_DEFINITIONS;
  }

  getHealth() {
    return {
      service: "scoring",
      status: "active",
      formula: "boost + live + engagement + referral + retention + platform_signal",
      viewerProgression: {
        maxLevel: MAX_VIEWER_LEVEL,
        totalPointsToMaxLevel: VIEWER_LEVELS[VIEWER_LEVELS.length - 1]?.minPoints ?? 0,
        sampleMilestones: VIEWER_LEVELS.filter((level) => [1, 5, 10, 20, 30, 40, 50].includes(level.level)),
        futurePaidAcceleration: Object.entries(PROGRESSION_PLANS).map(([plan, config]) => ({
          plan,
          multiplier: config.multiplier,
          status: config.status,
        })),
      },
      liveRewards: {
        join: { profilePoints: 1, teamPoints: 1 },
        chat: { profilePoints: 2, teamPoints: 1 },
        like: "1 profile point per 10 likes, 1 team point per 25 likes",
        gift: "10 + gift units * 2 + diamonds/5 profile points",
      },
      teamLevels: TEAM_LEVELS.map((level) => ({
        level: level.level,
        minPoints: level.minPoints,
        features: level.features,
      })),
      achievements: ACHIEVEMENT_DEFINITIONS.map((achievement) => achievement.key),
    };
  }
}

function getViewerLevelTitle(level: number) {
  if (level >= 50) {
    return "Nova Sovereign";
  }

  if (level >= 45) {
    return "Galaxy Commander";
  }

  if (level >= 40) {
    return "Star Architect";
  }

  if (level >= 35) {
    return "Orbit Master";
  }

  if (level >= 30) {
    return "Constellation Captain";
  }

  if (level >= 25) {
    return "Meteor Vanguard";
  }

  if (level >= 20) {
    return "Pulse Raider";
  }

  if (level >= 15) {
    return "Signal Runner";
  }

  if (level >= 10) {
    return "Crew Core";
  }

  if (level >= 5) {
    return "Rising Supporter";
  }

  return "New Recruit";
}

function applyProgressionMultiplier(points: number, multiplier: number) {
  return Math.max(1, Math.round(points * multiplier));
}