type TikTokProfileLookupResult = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  followersCount: number | null;
  secUid: string | null;
  source: "universal-data" | "next-data" | "meta-tags";
};

type TikTokProfileLookupOptions = {
  requestTimeoutMs?: number;
  sessionId?: string;
  msToken?: string;
  cookieHeader?: string;
};

const TIKTOK_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9,ru;q=0.8",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  referer: "https://www.tiktok.com/",
} as const;

export async function lookupTikTokProfile(username: string, options: TikTokProfileLookupOptions = {}): Promise<TikTokProfileLookupResult> {
  const normalizedUsername = normalizeTikTokUsername(username);
  if (!normalizedUsername) {
    throw new Error("TikTok username is required.");
  }

  const controller = new AbortController();
  const timeoutMs = options.requestTimeoutMs ?? 10_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://www.tiktok.com/@${encodeURIComponent(normalizedUsername)}`, {
      headers: buildTikTokHeaders(options),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`TikTok profile request failed with status ${response.status}.`);
    }

    const html = await response.text();
    const fromUniversal = tryExtractFromUniversalData(html, normalizedUsername);
    if (fromUniversal) {
      return fromUniversal;
    }

    const fromNextData = tryExtractFromNextData(html, normalizedUsername);
    if (fromNextData) {
      return fromNextData;
    }

    const fromMeta = tryExtractFromMetaTags(html, normalizedUsername);
    if (fromMeta) {
      return fromMeta;
    }

    throw new Error("TikTok profile details were not found in the public page response.");
  } finally {
    clearTimeout(timeout);
  }
}

function buildTikTokHeaders(options: TikTokProfileLookupOptions) {
  const cookieHeader = mergeCookieHeader(options);

  return {
    ...TIKTOK_HEADERS,
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
  };
}

function mergeCookieHeader(options: TikTokProfileLookupOptions) {
  const cookieParts = new Map<string, string>();

  for (const chunk of (options.cookieHeader ?? "").split(";")) {
    const trimmed = chunk.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    cookieParts.set(trimmed.slice(0, separatorIndex).trim(), trimmed.slice(separatorIndex + 1).trim());
  }

  if (options.sessionId?.trim() && !cookieParts.has("sessionid")) {
    cookieParts.set("sessionid", options.sessionId.trim());
  }

  if (options.msToken?.trim() && !cookieParts.has("msToken")) {
    cookieParts.set("msToken", options.msToken.trim());
  }

  return Array.from(cookieParts.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
}

function tryExtractFromUniversalData(html: string, username: string) {
  const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i);
  const payload = safeJsonParse(match?.[1]);
  const candidate = findTikTokProfileCandidate(payload, username);

  return candidate ? buildLookupResult(candidate, username, "universal-data") : null;
}

function tryExtractFromNextData(html: string, username: string) {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  const payload = safeJsonParse(match?.[1]);
  const candidate = findTikTokProfileCandidate(payload, username);

  return candidate ? buildLookupResult(candidate, username, "next-data") : null;
}

function tryExtractFromMetaTags(html: string, username: string) {
  const avatarUrl = findMetaContent(html, "property", "og:image") ?? null;
  const title = findMetaContent(html, "property", "og:title") ?? findMetaContent(html, "name", "title") ?? null;
  const description = findMetaContent(html, "property", "og:description") ?? findMetaContent(html, "name", "description") ?? null;

  if (!avatarUrl && !title && !description) {
    return null;
  }

  return {
    username,
    displayName: cleanupMetaTitle(title, username),
    avatarUrl,
    bio: cleanupText(description),
    followersCount: null,
    secUid: null,
    source: "meta-tags",
  } satisfies TikTokProfileLookupResult;
}

function findMetaContent(html: string, attributeName: "property" | "name", attributeValue: string) {
  const escapedValue = escapeRegExp(attributeValue);
  const directPattern = new RegExp(`<meta[^>]+${attributeName}=["']${escapedValue}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const reversedPattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attributeName}=["']${escapedValue}["'][^>]*>`, "i");

  return decodeHtmlEntities(html.match(directPattern)?.[1] ?? html.match(reversedPattern)?.[1] ?? "").trim() || null;
}

function findTikTokProfileCandidate(root: unknown, username: string): Record<string, unknown> | null {
  const normalizedUsername = normalizeTikTokUsername(username);
  return findTikTokProfileCandidateInternal(root, normalizedUsername, 0);
}

function findTikTokProfileCandidateInternal(value: unknown, username: string, depth: number): Record<string, unknown> | null {
  if (!value || depth > 12) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = findTikTokProfileCandidateInternal(item, username, depth + 1);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const candidateUsername = normalizeTikTokUsername(
    stringOrNull(record.uniqueId)
      ?? stringOrNull(record.unique_id)
      ?? stringOrNull(record.displayId)
      ?? stringOrNull(record.username)
      ?? "",
  );
  const hasAvatar = Boolean(extractAvatarUrl(record));
  const hasBio = Boolean(extractBio(record));
  const hasNickname = Boolean(stringOrNull(record.nickname) ?? stringOrNull(record.nickName) ?? stringOrNull(record.display_name));

  if (candidateUsername === username && (hasAvatar || hasBio || hasNickname)) {
    return record;
  }

  for (const nested of Object.values(record)) {
    const candidate = findTikTokProfileCandidateInternal(nested, username, depth + 1);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function buildLookupResult(candidate: Record<string, unknown>, username: string, source: TikTokProfileLookupResult["source"]) {
  return {
    username,
    displayName: cleanupText(stringOrNull(candidate.nickname) ?? stringOrNull(candidate.nickName) ?? stringOrNull(candidate.display_name)),
    avatarUrl: extractAvatarUrl(candidate),
    bio: extractBio(candidate),
    followersCount: extractFollowersCount(candidate),
    secUid: cleanupText(stringOrNull(candidate.secUid) ?? stringOrNull(candidate.sec_uid)),
    source,
  } satisfies TikTokProfileLookupResult;
}

function extractFollowersCount(candidate: Record<string, unknown>) {
  return (
    extractNumber(candidate, [
      ["followerCount"],
      ["follower_count"],
      ["fans"],
      ["stats", "followerCount"],
      ["stats", "follower_count"],
      ["stats", "fans"],
      ["statsV2", "followerCount"],
      ["statsV2", "follower_count"],
      ["userInfo", "stats", "followerCount"],
      ["userInfo", "stats", "follower_count"],
      ["authorStats", "followerCount"],
      ["authorStats", "follower_count"],
      ["user", "stats", "followerCount"],
      ["user", "stats", "follower_count"],
      ["statsInfo", "followerCount"],
      ["statsInfo", "follower_count"],
    ])
  );
}

function extractAvatarUrl(candidate: Record<string, unknown>) {
  const directUrl = stringOrNull(candidate.profilePictureUrl)
    ?? stringOrNull(candidate.avatarUrl)
    ?? stringOrNull(candidate.avatar_url)
    ?? stringOrNull(candidate.avatar)
    ?? null;
  if (directUrl) {
    return cleanupText(directUrl);
  }

  const fromProfilePicture = extractImageUrl(candidate.profilePicture);
  if (fromProfilePicture) {
    return fromProfilePicture;
  }

  const fromAvatarThumb = extractImageUrl(candidate.avatarThumb);
  if (fromAvatarThumb) {
    return fromAvatarThumb;
  }

  return extractImageUrl(candidate.avatarMedium) ?? extractImageUrl(candidate.avatarLarger) ?? null;
}

function extractBio(candidate: Record<string, unknown>) {
  const directBio = stringOrNull(candidate.bioDescription)
    ?? stringOrNull(candidate.signature)
    ?? stringOrNull(candidate.bio)
    ?? null;
  if (directBio) {
    return cleanupText(directBio);
  }

  const nestedUserDetails = candidate.userDetails;
  if (nestedUserDetails && typeof nestedUserDetails === "object") {
    return cleanupText(
      stringOrNull((nestedUserDetails as Record<string, unknown>).bioDescription)
        ?? stringOrNull((nestedUserDetails as Record<string, unknown>).signature),
    );
  }

  return null;
}

function extractImageUrl(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return cleanupText(value);
  }

  if (Array.isArray(value)) {
    return value.map(extractImageUrl).find(Boolean) ?? null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directUrl = stringOrNull(record.url);
  if (directUrl) {
    return cleanupText(directUrl);
  }

  return extractImageUrl(record.urlList) ?? extractImageUrl(record.urls) ?? null;
}

function extractNumber(root: unknown, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = root;

    for (const segment of path) {
      if (!current || typeof current !== "object") {
        current = null;
        break;
      }

      current = (current as Record<string, unknown>)[segment];
    }

    const normalized = numberOrNull(current);
    if (normalized !== null) {
      return normalized;
    }
  }

  return null;
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const digitsOnly = value.replace(/[^0-9.-]/g, "");
    if (!digitsOnly) {
      return null;
    }

    const parsed = Number(digitsOnly);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function safeJsonParse(raw: string | undefined) {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeTikTokUsername(value: string) {
  return value.trim().replace(/^https?:\/\/www\.tiktok\.com\//i, "").replace(/^@+/, "").replace(/\/live$/i, "").trim().toLowerCase();
}

function cleanupMetaTitle(value: string | null, username: string) {
  const normalized = cleanupText(value);
  if (!normalized) {
    return null;
  }

  return normalized
    .replace(new RegExp(`\s*\(@${escapeRegExp(username)}\)\s*`, "i"), " ")
    .replace(/\s*[|\-]\s*TikTok\s*$/i, "")
    .trim() || null;
}

function cleanupText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const decoded = decodeHtmlEntities(value).trim();
  return decoded.length > 0 ? decoded : null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'");
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
