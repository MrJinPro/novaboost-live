export type TikTokPromotionService = {
  id: number;
  name: string;
  category: string;
  type: string;
  rate: number;
  min: number;
  max: number;
  tags: string[];
  subcategory?: string;
  shortDescription?: string;
  summaryBullets?: string[];
  targetType?: "live" | "video" | "profile" | "comment";
  targetLabel?: string;
  targetPlaceholder?: string;
  targetHelp?: string;
};

export type PromotionServiceGroup = {
  key: string;
  title: string;
  description: string;
  services: TikTokPromotionService[];
};

const FALLBACK_TIKTOK_PROMOTION_SERVICES: TikTokPromotionService[] = [
  {
    id: 910015,
    name: "Зрители на 15 мин",
    category: "Услуги для стримов TikTok",
    type: "live_viewers",
    rate: 0.34,
    min: 50,
    max: 100000,
    tags: ["live", "viewers", "fast-start"],
    subcategory: "Эфир",
    shortDescription: "Короткий стартовый пакет зрителей для уже запущенного эфира.",
    summaryBullets: ["Без докрутки", "База 100 000", "Быстрый старт"],
    targetType: "live",
    targetLabel: "Ссылка на стрим",
    targetPlaceholder: "https://www.tiktok.com/@username/live",
    targetHelp: "Укажи именно ссылку на активный эфир TikTok, а не на профиль.",
  },
  {
    id: 910030,
    name: "Зрители на 30 мин",
    category: "Услуги для стримов TikTok",
    type: "live_viewers",
    rate: 0.43,
    min: 50,
    max: 100000,
    tags: ["live", "viewers", "fast-start"],
    subcategory: "Эфир",
    shortDescription: "Пакет зрителей для трансляции примерно на полчаса.",
    summaryBullets: ["Без докрутки", "База 100 000", "Быстрый старт"],
    targetType: "live",
    targetLabel: "Ссылка на стрим",
    targetPlaceholder: "https://www.tiktok.com/@username/live",
    targetHelp: "Нужна ссылка на прямой эфир TikTok. Профиль или ролик сюда не подходят.",
  },
  {
    id: 910060,
    name: "Зрители на 60 мин",
    category: "Услуги для стримов TikTok",
    type: "live_viewers",
    rate: 0.67,
    min: 50,
    max: 100000,
    tags: ["live", "viewers", "fast-start"],
    subcategory: "Эфир",
    shortDescription: "Зрители для часа стрима с плавным стартом.",
    summaryBullets: ["Без докрутки", "База 100 000", "Быстрый старт"],
    targetType: "live",
    targetLabel: "Ссылка на стрим",
    targetPlaceholder: "https://www.tiktok.com/@username/live",
    targetHelp: "Указывай ссылку на уже начавшийся эфир TikTok.",
  },
  {
    id: 910090,
    name: "Зрители на 90 мин",
    category: "Услуги для стримов TikTok",
    type: "live_viewers",
    rate: 1.05,
    min: 50,
    max: 100000,
    tags: ["live", "viewers", "fast-start"],
    subcategory: "Эфир",
    shortDescription: "Пакет зрителей для более длинного прямого эфира.",
    summaryBullets: ["Без докрутки", "База 100 000", "Быстрый старт"],
    targetType: "live",
    targetLabel: "Ссылка на стрим",
    targetPlaceholder: "https://www.tiktok.com/@username/live",
    targetHelp: "Для этой услуги нужна ссылка на прямой эфир TikTok.",
  },
  {
    id: 910120,
    name: "Зрители на 120 мин",
    category: "Услуги для стримов TikTok",
    type: "live_viewers",
    rate: 1.33,
    min: 50,
    max: 100000,
    tags: ["live", "viewers", "fast-start"],
    subcategory: "Эфир",
    shortDescription: "Продолжительная поддержка онлайна примерно на два часа.",
    summaryBullets: ["Без докрутки", "База 100 000", "Быстрый старт"],
    targetType: "live",
    targetLabel: "Ссылка на стрим",
    targetPlaceholder: "https://www.tiktok.com/@username/live",
    targetHelp: "Укажи ссылку на активный стрим TikTok.",
  },
  {
    id: 910180,
    name: "Зрители на 180 мин",
    category: "Услуги для стримов TikTok",
    type: "live_viewers",
    rate: 1.98,
    min: 50,
    max: 100000,
    tags: ["live", "viewers", "fast-start"],
    subcategory: "Эфир",
    shortDescription: "Подходит для длинного лайва с удержанием интереса аудитории.",
    summaryBullets: ["Без докрутки", "База 100 000", "Быстрый старт"],
    targetType: "live",
    targetLabel: "Ссылка на стрим",
    targetPlaceholder: "https://www.tiktok.com/@username/live",
    targetHelp: "Нужна ссылка на эфир TikTok, который уже идёт.",
  },
  {
    id: 910240,
    name: "Зрители на 240 мин",
    category: "Услуги для стримов TikTok",
    type: "live_viewers",
    rate: 2.66,
    min: 50,
    max: 100000,
    tags: ["live", "viewers", "fast-start"],
    subcategory: "Эфир",
    shortDescription: "Максимально длинный пакет зрителей для многочасовой трансляции.",
    summaryBullets: ["Без докрутки", "База 100 000", "Быстрый старт"],
    targetType: "live",
    targetLabel: "Ссылка на стрим",
    targetPlaceholder: "https://www.tiktok.com/@username/live",
    targetHelp: "Для этой услуги требуется ссылка на прямой эфир TikTok.",
  },
  {
    id: 920001,
    name: "Лайки в TikTok LIVE",
    category: "Поддержка активности TikTok",
    type: "live_likes",
    rate: 0.02,
    min: 100,
    max: 30000,
    tags: ["live", "likes"],
    subcategory: "Эфир",
    shortDescription: "Усиливает активность внутри прямой трансляции.",
    summaryBullets: ["Живые", "База 30 000", "Высокое качество"],
    targetType: "live",
    targetLabel: "Ссылка на стрим",
    targetPlaceholder: "https://www.tiktok.com/@username/live",
    targetHelp: "Нужна ссылка на текущий прямой эфир TikTok.",
  },
  {
    id: 920004,
    name: "Репосты TikTok LIVE",
    category: "Поддержка активности TikTok",
    type: "live_shares",
    rate: 0.05,
    min: 50,
    max: 5000,
    tags: ["live", "shares", "fast-start"],
    subcategory: "Эфир",
    shortDescription: "Поддержка распространения прямого эфира через репосты.",
    summaryBullets: ["Быстрый старт", "Для эфира", "Живые"],
    targetType: "live",
    targetLabel: "Ссылка на стрим",
    targetPlaceholder: "https://www.tiktok.com/@username/live",
    targetHelp: "Укажи ссылку на эфир TikTok, который нужно продвинуть.",
  },
  {
    id: 930001,
    name: "Просмотры TikTok видео",
    category: "Охват роликов TikTok",
    type: "video_views",
    rate: 0.01,
    min: 100,
    max: 200000,
    tags: ["views", "video", "fast-start"],
    subcategory: "Видео",
    shortDescription: "Базовый охват для ролика или клипа TikTok.",
    summaryBullets: ["Гарантия", "База 2 млрд", "Высокое качество"],
    targetType: "video",
    targetLabel: "Ссылка на видео",
    targetPlaceholder: "https://www.tiktok.com/@username/video/1234567890",
    targetHelp: "Нужна ссылка на конкретное видео TikTok, а не на стрим и не на профиль.",
  },
  {
    id: 930002,
    name: "Лайки TikTok видео",
    category: "Охват роликов TikTok",
    type: "video_likes",
    rate: 0.02,
    min: 50,
    max: 30000,
    tags: ["likes", "video"],
    subcategory: "Видео",
    shortDescription: "Поднимает социальное доказательство у отдельного ролика.",
    summaryBullets: ["Живые", "База 30 000", "Высокое качество"],
    targetType: "video",
    targetLabel: "Ссылка на видео",
    targetPlaceholder: "https://www.tiktok.com/@username/video/1234567890",
    targetHelp: "Для лайков на видео укажи ссылку именно на ролик TikTok.",
  },
  {
    id: 920002,
    name: "Репосты TikTok видео",
    category: "Охват роликов TikTok",
    type: "video_shares",
    rate: 0.03,
    min: 50,
    max: 10000,
    tags: ["shares", "views"],
    subcategory: "Видео",
    shortDescription: "Помогает ролику быстрее разойтись по аудитории.",
    summaryBullets: ["База 10 000", "Живые", "Быстрый старт"],
    targetType: "video",
    targetLabel: "Ссылка на видео",
    targetPlaceholder: "https://www.tiktok.com/@username/video/1234567890",
    targetHelp: "Для репостов нужна ссылка на конкретный TikTok-ролик.",
  },
  {
    id: 930003,
    name: "Комментарии TikTok",
    category: "Охват роликов TikTok",
    type: "video_comments",
    rate: 0.48,
    min: 10,
    max: 10000,
    tags: ["comments", "video"],
    subcategory: "Видео",
    shortDescription: "Добавляет активность в обсуждение конкретного видео.",
    summaryBullets: ["Рандомные", "От 10", "Хорошее качество"],
    targetType: "video",
    targetLabel: "Ссылка на видео",
    targetPlaceholder: "https://www.tiktok.com/@username/video/1234567890",
    targetHelp: "Для комментариев укажи ссылку на ролик TikTok, где нужна активность.",
  },
  {
    id: 920003,
    name: "Сохранения",
    category: "Охват роликов TikTok",
    type: "saves",
    rate: 0.01,
    min: 50,
    max: 10000,
    tags: ["views", "engagement"],
    subcategory: "Видео",
    shortDescription: "Усиливает сигналы интереса к ролику через сохранения.",
    summaryBullets: ["База 10 000", "Хорошее качество", "Быстрый старт"],
    targetType: "video",
    targetLabel: "Ссылка на видео",
    targetPlaceholder: "https://www.tiktok.com/@username/video/1234567890",
    targetHelp: "Нужна ссылка на видео TikTok, которое продвигается.",
  },
  {
    id: 930004,
    name: "Лайки на комментарии",
    category: "Активность в комментариях TikTok",
    type: "comment_likes",
    rate: 0.18,
    min: 50,
    max: 5000,
    tags: ["comments", "likes"],
    subcategory: "Комментарии",
    shortDescription: "Поднимает заметность отдельного комментария под роликом.",
    summaryBullets: ["Хорошее качество", "Минимум 50", "Старт 0-6 часов"],
    targetType: "comment",
    targetLabel: "Ссылка на комментарий",
    targetPlaceholder: "Ссылка на конкретный комментарий TikTok",
    targetHelp: "Нужна ссылка не на видео целиком, а на сам комментарий внутри TikTok.",
  },
  {
    id: 930005,
    name: "Подписчики TikTok",
    category: "Рост профиля TikTok",
    type: "followers",
    rate: 0.24,
    min: 100,
    max: 30000,
    tags: ["followers", "profile"],
    subcategory: "Профиль",
    shortDescription: "Помогает ускорить рост подписчиков на профиль стримера.",
    summaryBullets: ["Живые", "База 30 000", "Быстрый старт"],
    targetType: "profile",
    targetLabel: "Ссылка на профиль",
    targetPlaceholder: "https://www.tiktok.com/@username",
    targetHelp: "Для подписчиков нужна ссылка на профиль TikTok, а не на ролик и не на эфир.",
  },
  {
    id: 930006,
    name: "Пакет для топа",
    category: "Рост профиля TikTok",
    type: "top_package",
    rate: 408.76,
    min: 1,
    max: 100,
    tags: ["profile", "views", "followers", "likes"],
    subcategory: "Профиль",
    shortDescription: "Комбинированный пакет для быстрого визуального усиления профиля.",
    summaryBullets: ["Для вывода в рекомендации", ">10 000 просмотров", ">700 подписчиков"],
    targetType: "profile",
    targetLabel: "Ссылка на профиль",
    targetPlaceholder: "https://www.tiktok.com/@username",
    targetHelp: "Для комплексного пакета укажи ссылку на профиль TikTok.",
  },
  {
    id: 930007,
    name: "Жалобы",
    category: "Модерация TikTok",
    type: "reports",
    rate: 7.6,
    min: 1,
    max: 500,
    tags: ["moderation", "video"],
    subcategory: "Модерация",
    shortDescription: "Отдельная модерационная услуга для конкретного объекта TikTok.",
    summaryBullets: ["Хорошее качество", "Старт 0-3 часов"],
    targetType: "video",
    targetLabel: "Ссылка на видео",
    targetPlaceholder: "https://www.tiktok.com/@username/video/1234567890",
    targetHelp: "Для жалоб укажи ссылку на видео TikTok, к которому относится услуга.",
  },
  {
    id: 930008,
    name: "Неинтересно",
    category: "Модерация TikTok",
    type: "not_interested",
    rate: 0.11,
    min: 50,
    max: 20000,
    tags: ["moderation", "video"],
    subcategory: "Модерация",
    shortDescription: "Сигнал Неинтересно для отдельного ролика TikTok.",
    summaryBullets: ["Реакция Неинтересно", "Минимальный заказ 50", "Старт 0-3 часов"],
    targetType: "video",
    targetLabel: "Ссылка на видео",
    targetPlaceholder: "https://www.tiktok.com/@username/video/1234567890",
    targetHelp: "Для этой услуги нужна ссылка на ролик TikTok.",
  },
];

type CreateOrderInput = {
  requesterUserId?: string | null;
  requesterRole?: "viewer" | "streamer" | "admin";
  streamerId?: string | null;
  serviceId: number;
  link: string;
  quantity: number;
  currency?: "RUB" | "USD";
};

export function getPromotionMarkup(role: "viewer" | "streamer" | "admin") {
  if (role === "streamer") {
    return 0.15;
  }

  if (role === "admin") {
    return 0;
  }

  return 0.3;
}

export function calculateCustomerAmount(role: "viewer" | "streamer" | "admin", rate: number, quantity: number) {
  const supplierAmount = Number(((rate * quantity) / 1000).toFixed(2));
  const customerAmount = Number((supplierAmount * (1 + getPromotionMarkup(role))).toFixed(2));

  return {
    supplierAmount,
    customerAmount,
  };
}

const GROUP_ORDER: Array<{ key: string; title: string; description: string }> = [
  { key: "Эфир", title: "Для эфира", description: "Зрители, лайки и репосты для прямых трансляций TikTok LIVE." },
  { key: "Видео", title: "Для видео", description: "Просмотры, лайки, репосты, комментарии и сохранения для отдельных роликов." },
  { key: "Комментарии", title: "Для комментариев", description: "Услуги для усиления активности внутри комментариев TikTok." },
  { key: "Профиль", title: "Для профиля", description: "Рост подписчиков и пакеты под общий буст профиля стримера." },
  { key: "Модерация", title: "Модерация", description: "Отдельные служебные и чувствительные TikTok-услуги." },
  { key: "Другое", title: "Другое", description: "Остальные услуги каталога TikTok." },
];

function normalizePromotionService(service: TikTokPromotionService): TikTokPromotionService {
  const haystack = `${service.name} ${service.category} ${service.type} ${service.tags.join(" ")}`.toLowerCase();
  const targetType = service.targetType
    ?? (haystack.includes("comment") || haystack.includes("коммент")
      ? "comment"
      : haystack.includes("follow") || haystack.includes("подпис") || haystack.includes("profile") || haystack.includes("профил")
        ? "profile"
        : haystack.includes("live") || haystack.includes("эфир") || haystack.includes("стрим") || haystack.includes("viewer") || haystack.includes("зрител")
          ? "live"
          : "video");

  const subcategory = service.subcategory
    ?? (targetType === "live"
      ? "Эфир"
      : targetType === "profile"
        ? "Профиль"
        : targetType === "comment"
          ? "Комментарии"
          : haystack.includes("жалоб") || haystack.includes("неинтерес") || haystack.includes("report")
            ? "Модерация"
            : "Видео");

  const targetMeta = getPromotionTargetMeta(targetType);

  return {
    ...service,
    subcategory,
    targetType,
    targetLabel: service.targetLabel ?? targetMeta.label,
    targetPlaceholder: service.targetPlaceholder ?? targetMeta.placeholder,
    targetHelp: service.targetHelp ?? targetMeta.help,
    shortDescription: service.shortDescription ?? buildPromotionDescription(subcategory, service.name),
  };
}

function buildPromotionDescription(subcategory: string, name: string) {
  if (subcategory === "Эфир") {
    return `Услуга ${name.toLowerCase()} помогает усилить прямой эфир TikTok и повысить заметность трансляции.`;
  }

  if (subcategory === "Профиль") {
    return `Услуга ${name.toLowerCase()} работает на рост доверия и общей силы профиля TikTok.`;
  }

  if (subcategory === "Комментарии") {
    return `Услуга ${name.toLowerCase()} усиливает вовлечение внутри комментариев TikTok.`;
  }

  if (subcategory === "Модерация") {
    return `Услуга ${name.toLowerCase()} относится к отдельным служебным сценариям каталога TikTok.`;
  }

  return `Услуга ${name.toLowerCase()} работает с отдельным роликом TikTok и усиливает его сигналы.`;
}

export function getPromotionTargetMeta(targetType: TikTokPromotionService["targetType"]) {
  switch (targetType) {
    case "live":
      return {
        label: "Ссылка на стрим",
        placeholder: "https://www.tiktok.com/@username/live",
        help: "Нужна ссылка именно на прямой эфир TikTok, а не на профиль и не на видео.",
      };
    case "profile":
      return {
        label: "Ссылка на профиль",
        placeholder: "https://www.tiktok.com/@username",
        help: "Нужна ссылка на профиль TikTok стримера.",
      };
    case "comment":
      return {
        label: "Ссылка на комментарий",
        placeholder: "Ссылка на конкретный комментарий TikTok",
        help: "Нужна ссылка на комментарий внутри TikTok, а не только на общий ролик.",
      };
    default:
      return {
        label: "Ссылка на видео",
        placeholder: "https://www.tiktok.com/@username/video/1234567890",
        help: "Нужна ссылка на конкретное TikTok-видео.",
      };
  }
}

export function groupTikTokPromotionServices(services: TikTokPromotionService[]): PromotionServiceGroup[] {
  const normalized = services.map(normalizePromotionService);

  return GROUP_ORDER
    .map((group) => ({
      ...group,
      services: normalized.filter((service) => (service.subcategory ?? "Другое") === group.key),
    }))
    .filter((group) => group.services.length > 0);
}

function getBackendBaseUrl() {
  return import.meta.env.VITE_BACKEND_URL || process.env.VITE_BACKEND_URL || "http://127.0.0.1:4310";
}

async function requestJson<TResponse>(path: string, init?: RequestInit) {
  const response = await fetch(`${getBackendBaseUrl()}${path}`, init);
  const data = await response.json() as TResponse & { error?: string };

  if (!response.ok || data.error) {
    throw new Error(data.error || `Backend request failed with status ${response.status}`);
  }

  return data as TResponse;
}

export async function loadTikTokPromotionServices() {
  try {
    const response = await requestJson<{ services: TikTokPromotionService[] }>("/growth/tiktok/services");
    if (response.services.length > 0) {
      return response.services.map(normalizePromotionService);
    }
  } catch {
    // Fallback keeps the catalog visible before the supplier backend is fully configured.
  }

  return FALLBACK_TIKTOK_PROMOTION_SERVICES.map(normalizePromotionService);
}

export async function createTikTokPromotionOrder(input: CreateOrderInput) {
  return requestJson<{
    orderId: string;
    service: TikTokPromotionService;
    quantity: number;
    link: string;
    currency: "RUB" | "USD";
    supplierAmount: number;
    customerAmount: number;
    status: "submitted";
  }>("/growth/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
}