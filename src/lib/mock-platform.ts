export type AppRole = "viewer" | "streamer" | "admin";
export type SubscriptionPlanKey = "free" | "supporter" | "superfan" | "legend";
export type PostReactionType = "nova" | "flare" | "pulse" | "crown";

export type StreamerSocialLinks = {
  telegram: string;
  instagram: string;
  facebook: string;
  twitter: string;
};

export type StreamerMembershipSettings = {
  paidEnabled: boolean;
  highlightedPlanKey: Exclude<SubscriptionPlanKey, "free">;
};

export interface AppUser {
  id: string;
  role: AppRole;
  email: string;
  username: string;
  displayName: string;
  tiktokUsername: string;
}

export interface StreamerCardData {
  id: string;
  display_name: string;
  tiktok_username: string;
  avatar_url: string | null;
  bio: string | null;
  is_live: boolean;
  viewer_count: number;
  like_count?: number;
  gift_count?: number;
  message_count?: number;
  peak_viewer_count?: number;
  followers_count: number;
  subscription_count?: number;
  needs_boost: boolean;
  total_boost_amount: number;
}

export interface StreamerPost {
  id: string;
  type: "news" | "announcement" | "clip";
  title: string;
  body: string;
  createdAt: string;
  requiredPlan: SubscriptionPlanKey;
  blurPreview: boolean;
  expiresAt: string | null;
}

const POST_DEFAULTS = {
  requiredPlan: "free" as SubscriptionPlanKey,
  blurPreview: false,
  expiresAt: null,
} satisfies Pick<StreamerPost, "requiredPlan" | "blurPreview" | "expiresAt">;

export interface StreamerVideo {
  id: string;
  title: string;
  duration: string;
  cover: string;
}

export interface StreamerStudioDraft {
  bannerUrl: string;
  logoUrl: string;
  headline: string;
  bio: string;
  telegramChannel: string;
  accent: string;
  tags: string;
  featuredVideoUrl: string;
  donationOverlayVariant: DonationOverlayVariant;
  donationSoundUrl: string;
  donationGifUrl: string;
  donationOverlayAccessKey: string;
  donationOverlayDisplayMode: DonationOverlayDisplayMode;
  donationOverlayDisplayCurrency: "USD" | "RUB" | "KZT" | "MDL";
  donationGoalTitle: string;
  donationGoalTarget: string;
  donationGoalCurrency: "USD" | "RUB" | "KZT" | "MDL";
  membershipPaidEnabled: boolean;
  membershipHighlightedPlanKey: Exclude<SubscriptionPlanKey, "free">;
}

export interface DonationWidgetEntry {
  donorName: string;
  amount: number;
  currency: "USD" | "RUB" | "KZT" | "MDL";
  donationCount: number;
}

export interface DonationGoalProgress {
  title: string;
  currentAmount: number;
  targetAmount: number;
  currency: "USD" | "RUB" | "KZT" | "MDL";
  progressPercent: number;
}

export type DonationOverlayVariant = "supernova" | "epic-burst" | "nova-ring";
export type DonationOverlayDisplayMode = "original" | "preferred";
export type DonationWidgetType = "latest" | "top-day" | "top-all-time" | "goal";

export interface DonationOverlaySettings {
  variant: DonationOverlayVariant;
  soundUrl: string;
  gifUrl: string;
  accessKey: string;
  displayMode: DonationOverlayDisplayMode;
  displayCurrency: "USD" | "RUB" | "KZT" | "MDL";
  goalTitle: string;
  goalTarget: number;
  goalCurrency: "USD" | "RUB" | "KZT" | "MDL";
}

export interface DonationEventSummary {
  id: string;
  donorName: string;
  amount: number;
  message: string | null;
  createdAt: string;
}

export interface StreamerPageData extends StreamerCardData {
  owner_user_id?: string | null;
  banner_url: string;
  accent: string;
  tagline: string;
  featured_video_url?: string | null;
  subscription_count: number;
  telegram_channel: string;
  social_links?: StreamerSocialLinks;
  membership_settings?: StreamerMembershipSettings;
  next_event: string;
  support_goal: string;
  total_likes: number;
  total_gifts: number;
  total_messages?: number;
  peak_viewer_count?: number;
  current_session_status?: "live" | "ended" | "failed" | null;
  current_session_started_at?: string | null;
  tags: string[];
  perks: string[];
  donation_link_slug?: string | null;
  donation_link_title?: string | null;
  donation_overlay?: DonationOverlaySettings | null;
  recent_donations: DonationEventSummary[];
  recent_live_events?: Array<{
    id: string;
    type: string;
    createdAt: string;
    title: string;
    description: string;
  }>;
  posts: StreamerPost[];
  videos: StreamerVideo[];
}

export interface ViewerTask {
  id: string;
  title: string;
  description: string;
  reward_points: number;
  type: "visit" | "code" | "boost" | "referral";
  code?: string;
}

export interface ActivityItem {
  id: string;
  tone: "live" | "boost" | "social";
  title: string;
  body: string;
}

const streamerPages: StreamerPageData[] = [
  {
    id: "alina-luna",
    display_name: "Алина Luna",
    tiktok_username: "alina.luna.live",
    avatar_url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80",
    banner_url: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&q=80",
    bio: "Ночные эфиры, музыка, общение и быстрые челленджи для зрителей.",
    tagline: "Собираю самую активную ночную аудиторию и люблю живые интерактивы.",
    is_live: true,
    viewer_count: 1480,
    followers_count: 128000,
    needs_boost: true,
    total_boost_amount: 4200,
    subscription_count: 3520,
    telegram_channel: "@luna_signal_room",
    next_event: "Сегодня в 22:30 - музыкальный raid с кодовым словом.",
    support_goal: "Цель эфира: собрать 500 переходов из NovaBoost до полуночи.",
    total_likes: 1840000,
    total_gifts: 12340,
    accent: "from-blast/70 via-magenta/50 to-cosmic/60",
    tags: ["музыка", "ночной эфир", "челлендж", "кодовые слова"],
    perks: ["ранний доступ к анонсам", "закрытые коды", "рейды по сигналу"],
    recent_donations: [],
    posts: [
      {
        ...POST_DEFAULTS,
        id: "post-luna-1",
        type: "announcement",
        title: "Через час стартуем эфир",
        body: "Подготовила новый раунд кодовых слов. Первые участники получат двойные очки платформы.",
        createdAt: "18 апреля, 21:20",
      },
      {
        ...POST_DEFAULTS,
        id: "post-luna-2",
        type: "news",
        title: "Запускаю серию коротких музыкальных баттлов",
        body: "Каждую неделю один большой эфир и два мини-включения. Все анонсы сначала будут в Telegram.",
        createdAt: "18 апреля, 16:40",
      },
    ],
    videos: [
      { id: "vid-luna-1", title: "Подготовка к ночному эфиру", duration: "0:34", cover: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80" },
      { id: "vid-luna-2", title: "Лучший момент прошлой трансляции", duration: "0:28", cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=800&q=80" },
    ],
  },
  {
    id: "max-raid",
    display_name: "Макс Raid",
    tiktok_username: "maxraid.games",
    avatar_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80",
    banner_url: "https://images.unsplash.com/photo-1542751110-97427bbecf20?auto=format&fit=crop&w=1600&q=80",
    bio: "Геймерские прямые эфиры, разбор тактик и совместные рейды.",
    tagline: "Поднимаю активность стрима через командные задачи и боевые заходы аудитории.",
    is_live: true,
    viewer_count: 2630,
    followers_count: 210000,
    needs_boost: false,
    total_boost_amount: 6800,
    subscription_count: 4890,
    telegram_channel: "@maxraid_alerts",
    next_event: "Завтра в 19:00 - большой рейд на новый формат турнира.",
    support_goal: "Нужно удержать 2000+ зрителей в первые 15 минут.",
    total_likes: 2550000,
    total_gifts: 24110,
    accent: "from-cosmic/80 via-cosmic/30 to-blast/60",
    tags: ["игры", "рейды", "турнир", "командная активность"],
    perks: ["ранний заход на рейд", "таблица лучших зрителей", "личные сигналы"],
    recent_donations: [],
    posts: [
      {
        ...POST_DEFAULTS,
        id: "post-max-1",
        type: "news",
        title: "Открываю набор на командный буст",
        body: "Будем тестировать модель, где зрители получают бонусные очки за удержание рейда до финала.",
        createdAt: "18 апреля, 18:10",
      },
      {
        ...POST_DEFAULTS,
        id: "post-max-2",
        type: "clip",
        title: "Короткий фрагмент вчерашнего клатча",
        body: "Самый сильный момент эфира уже загружен в ленту. Через платформу можно собрать реакцию аудитории до старта следующего стрима.",
        createdAt: "17 апреля, 23:45",
      },
    ],
    videos: [
      { id: "vid-max-1", title: "Лучший клатч недели", duration: "0:21", cover: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80" },
      { id: "vid-max-2", title: "Анонс нового турнира", duration: "0:41", cover: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80" },
    ],
  },
  {
    id: "mira-craft",
    display_name: "Mira Craft",
    tiktok_username: "miracraft.art",
    avatar_url: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=300&q=80",
    banner_url: "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=1600&q=80",
    bio: "Арт-стримы, скетчи вживую и уютное сообщество вокруг творчества.",
    tagline: "Хочу, чтобы зрители возвращались не только на эфир, но и за атмосферой между эфирами.",
    is_live: false,
    viewer_count: 0,
    followers_count: 96000,
    needs_boost: true,
    total_boost_amount: 900,
    subscription_count: 2210,
    telegram_channel: "@mira_sketch_club",
    next_event: "Сегодня в 20:00 - анонс новой серии арт-эфиров.",
    support_goal: "Набрать лист ожидания на следующий совместный челлендж.",
    total_likes: 920000,
    total_gifts: 5320,
    accent: "from-amber/70 via-blast/30 to-background",
    tags: ["арт", "скетчи", "уют", "анонсы"],
    perks: ["ранние скетчи", "закрытые референсы", "анонсы заранее"],
    recent_donations: [],
    posts: [
      {
        ...POST_DEFAULTS,
        id: "post-mira-1",
        type: "announcement",
        title: "Через час выложу тему следующего арт-челленджа",
        body: "Подписчики платформы увидят тему раньше всех и смогут предложить детали для следующего эфира.",
        createdAt: "18 апреля, 19:05",
      },
    ],
    videos: [
      { id: "vid-mira-1", title: "Скоростной скетч за 30 секунд", duration: "0:30", cover: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=800&q=80" },
    ],
  },
  {
    id: "den-urban",
    display_name: "Ден Urban",
    tiktok_username: "den.urban.moves",
    avatar_url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&q=80",
    banner_url: "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1600&q=80",
    bio: "Street-контент, разговорные эфиры и городские сюжеты вживую.",
    tagline: "Хочу, чтобы люди заходили не на уведомление, а на чувство, что там всегда что-то происходит.",
    is_live: true,
    viewer_count: 820,
    followers_count: 74000,
    needs_boost: true,
    total_boost_amount: 0,
    subscription_count: 980,
    telegram_channel: "@urban_den_live",
    next_event: "Сегодня в 23:00 - городской ночной маршрут.",
    support_goal: "Собрать 150 качественных переходов на вечерний стрим.",
    total_likes: 610000,
    total_gifts: 2180,
    accent: "from-background via-surface-2 to-cosmic/40",
    tags: ["город", "лайв", "ночной маршрут", "разговорный эфир"],
    perks: ["приватные анонсы", "городские маршруты", "внутренние активности"],
    recent_donations: [],
    posts: [
      {
        ...POST_DEFAULTS,
        id: "post-den-1",
        type: "news",
        title: "Тестирую формат коротких включений между большими эфирами",
        body: "Нужно понять, как аудитория реагирует на быстрые сигналы и моментальные заходы в эфир.",
        createdAt: "18 апреля, 14:25",
      },
    ],
    videos: [
      { id: "vid-den-1", title: "Анонс ночного маршрута", duration: "0:17", cover: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=800&q=80" },
    ],
  },
];

export const mockStreamerPages = streamerPages;
export const mockStreamers: StreamerCardData[] = streamerPages.map(({ posts, videos, tags, perks, accent, banner_url, tagline, subscription_count, telegram_channel, next_event, support_goal, total_likes, total_gifts, ...streamer }) => streamer);

export const mockActivityFeed: ActivityItem[] = [
  { id: "activity-1", tone: "live", title: "Макс Raid вышел в эфир", body: "Система подняла приоритет и отправила сигнал активным зрителям." },
  { id: "activity-2", tone: "boost", title: "Алина Luna получила новый буст", body: "Boost-кампания подняла её в верхний слот главной страницы." },
  { id: "activity-3", tone: "social", title: "Mira Craft опубликовала анонс", body: "Контентный слой работает между эфирами и удерживает аудиторию в платформе." },
];

export const mockTasks: ViewerTask[] = [
  { id: "task-visit", title: "Зайти на прямой эфир", description: "Перейди на live-страницу стримера после сигнала платформы.", reward_points: 35, type: "visit" },
  { id: "task-code", title: "Ввести кодовое слово", description: "Сегодняшнее кодовое слово для теста frontend: NOVA.", reward_points: 50, type: "code", code: "NOVA" },
  { id: "task-boost", title: "Поддержать буст", description: "Подтверди участие в буст-волне и получи очки за вклад в разгон эфира.", reward_points: 40, type: "boost" },
  { id: "task-referral", title: "Выбрать любимого стримера", description: "Привяжи себя к стримеру и включись в реферальную механику роста.", reward_points: 25, type: "referral" },
];

export const mockViewerStandings = [
  { id: "viewer-1", username: "novafox", display_name: "NovaFox", points: 1260, level: 13 },
  { id: "viewer-2", username: "lunahelp", display_name: "LunaHelp", points: 1120, level: 12 },
  { id: "viewer-3", username: "raidpilot", display_name: "RaidPilot", points: 980, level: 10 },
  { id: "viewer-4", username: "chatflow", display_name: "ChatFlow", points: 840, level: 9 },
];

export const mockViewerProfile = {
  points: 840,
  level: 9,
  completedTasks: 12,
  boostsJoined: 7,
  subscriptions: ["alina-luna", "mira-craft"],
  streakDays: 5,
  telegramConnected: true,
};

export function getStreamerById(id: string) {
  return mockStreamerPages.find((streamer) => streamer.id === id) ?? null;
}

export function getStreamerByTikTokUsername(tiktokUsername: string) {
  return mockStreamerPages.find((streamer) => streamer.tiktok_username.toLowerCase() === tiktokUsername.toLowerCase()) ?? null;
}

export function createStudioDraft(tiktokUsername: string, displayName: string) {
  const streamer = getStreamerByTikTokUsername(tiktokUsername);

  if (streamer) {
    return {
      streamer,
      draft: {
        bannerUrl: streamer.banner_url,
        logoUrl: streamer.avatar_url ?? "",
        headline: streamer.tagline,
        bio: streamer.bio ?? "",
        telegramChannel: streamer.telegram_channel,
        accent: streamer.accent,
        tags: streamer.tags.join(", "),
        featuredVideoUrl: streamer.videos[0]?.cover ?? "",
      } satisfies StreamerStudioDraft,
    };
  }

  return {
    streamer: null,
    draft: {
      bannerUrl: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1600&q=80",
      logoUrl: "",
      headline: `Публичная страница ${displayName}`,
      bio: "Расскажи, зачем зрителю подписываться на тебя внутри платформы и что происходит на твоих эфирах.",
      telegramChannel: "@your_channel",
      accent: "from-cosmic/80 via-magenta/30 to-blast/70",
      tags: "live, комьюнити, анонсы",
      featuredVideoUrl: "",
    } satisfies StreamerStudioDraft,
  };
}
