const SIGN_KEY_RATE_LIMIT_COOLDOWN_MS = 12 * 60 * 60_000;

function normalizeKey(value: string) {
  return value.trim();
}

export function isTikTokSignRateLimitError(error?: string | null) {
  if (!error) {
    return false;
  }

  return /rate_limit_account_day|too many connections started|you have reached the rate limit/i.test(error);
}

export class TikTokSignKeyPool {
  private readonly keys: string[];
  private readonly cooldownByKey = new Map<string, number>();
  private nextIndex = 0;

  constructor(keys: string[]) {
    this.keys = [...new Set(keys.map(normalizeKey).filter(Boolean))];
  }

  getKey() {
    if (this.keys.length === 0) {
      return undefined;
    }

    const now = Date.now();
    const availableKeys = this.keys.filter((key) => (this.cooldownByKey.get(key) ?? 0) <= now);
    const candidateKeys = availableKeys.length > 0 ? availableKeys : this.keys;
    const selectedKey = candidateKeys[this.nextIndex % candidateKeys.length];

    this.nextIndex = (this.nextIndex + 1) % Math.max(1, candidateKeys.length);
    return selectedKey;
  }

  reportFailure(key: string | undefined, error?: string | null) {
    if (!key || !isTikTokSignRateLimitError(error)) {
      return;
    }

    this.cooldownByKey.set(key, Date.now() + SIGN_KEY_RATE_LIMIT_COOLDOWN_MS);
  }

  getDiagnostics() {
    const now = Date.now();
    return {
      configuredKeys: this.keys.length,
      coolingDownKeys: this.keys.filter((key) => (this.cooldownByKey.get(key) ?? 0) > now).length,
    };
  }
}