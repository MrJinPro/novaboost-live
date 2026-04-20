import { deserializeMessage } from "tiktok-live-connector/dist/lib/utilities.js";
import { EulerSigner } from "tiktok-live-connector/dist/lib/web/lib/tiktok-signer.js";
import type { FetchSignedWebSocketParams } from "tiktok-live-connector/dist/types/client.js";
import type { ProtoMessageFetchResult } from "tiktok-live-connector/dist/types/tiktok-schema.js";
import { WebcastFetchPlatform } from "@eulerstream/euler-api-sdk";

import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import { TikTokSignKeyPool, isTikTokSignRateLimitError } from "./tiktok-sign-key-pool.js";

const DEFAULT_SIGN_SERVER_BASE_URL = "https://tiktok.eulerstream.com";
const DEFAULT_SIGN_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

type SigningProviderName = "custom-http" | "euler";

type CacheEntry = {
  expiresAt: number;
  result: ProtoMessageFetchResult;
};

type TikTokSigningProvider = {
  name: SigningProviderName;
  fetchSignedWebSocket(params: FetchSignedWebSocketParams): Promise<ProtoMessageFetchResult>;
  getDiagnostics(): Record<string, unknown>;
};

function isJsonContentType(contentType: string | null) {
  return typeof contentType === "string" && contentType.toLowerCase().includes("application/json");
}

function normalizeFetchUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

class CustomHttpTikTokSigningProvider implements TikTokSigningProvider {
  readonly name = "custom-http" as const;
  private readonly recentFailures: Array<{
    occurredAt: string;
    target: string;
    error: string;
  }> = [];
  private lastSuccessAt: string | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly env: BackendEnv,
  ) {}

  getDiagnostics() {
    return {
      provider: this.name,
      lastSuccessAt: this.lastSuccessAt,
      endpoint: this.env.TIKTOK_SIGN_FETCH_URL ?? null,
      recentFailures: this.recentFailures.slice(0, 10),
    };
  }

  async fetchSignedWebSocket(params: FetchSignedWebSocketParams): Promise<ProtoMessageFetchResult> {
    if (!this.env.TIKTOK_SIGN_FETCH_URL) {
      throw new Error("TIKTOK_SIGN_FETCH_URL is not configured for custom-http signing provider.");
    }

    const target = params.roomId ?? params.uniqueId ?? "unknown";

    try {
      const response = await fetch(normalizeFetchUrl(this.env.TIKTOK_SIGN_FETCH_URL), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.env.TIKTOK_SIGN_FETCH_AUTH_TOKEN
            ? { Authorization: `Bearer ${this.env.TIKTOK_SIGN_FETCH_AUTH_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({
          roomId: params.roomId ?? null,
          uniqueId: params.uniqueId ?? null,
          sessionId: params.sessionId ?? null,
          ttTargetIdc: params.ttTargetIdc ?? null,
          useMobile: params.useMobile ?? false,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Custom signer returned status ${response.status}. Payload: ${body}`);
      }

      const contentType = response.headers.get("content-type");
      const result = isJsonContentType(contentType)
        ? await response.json() as ProtoMessageFetchResult
        : deserializeMessage("ProtoMessageFetchResult", Buffer.from(await response.arrayBuffer()));

      this.lastSuccessAt = new Date().toISOString();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.recentFailures.unshift({
        occurredAt: new Date().toISOString(),
        target,
        error: message,
      });

      if (this.recentFailures.length > 10) {
        this.recentFailures.length = 10;
      }

      this.logger.warn("TikTok custom signing failed", {
        roomId: params.roomId,
        uniqueId: params.uniqueId,
        endpoint: this.env.TIKTOK_SIGN_FETCH_URL,
        error: message,
      });
      throw error;
    }
  }
}

class EulerTikTokSigningProvider implements TikTokSigningProvider {
  readonly name = "euler" as const;

  constructor(
    private readonly logger: Logger,
    private readonly env: BackendEnv,
    private readonly signKeyPool: TikTokSignKeyPool,
    private readonly recordFailure: (params: FetchSignedWebSocketParams, error: string) => void,
    private readonly recordSuccess: () => void,
  ) {}

  getDiagnostics() {
    return {
      provider: this.name,
      keyPool: this.signKeyPool.getDiagnostics(),
      upstreamBaseUrl: this.env.TIKTOK_SIGN_SERVER_BASE_URL ?? DEFAULT_SIGN_SERVER_BASE_URL,
    };
  }

  async fetchSignedWebSocket(params: FetchSignedWebSocketParams): Promise<ProtoMessageFetchResult> {
    const key = this.signKeyPool.getKey();
    const signer = new EulerSigner({
      apiKey: key,
      basePath: this.env.TIKTOK_SIGN_SERVER_BASE_URL ?? DEFAULT_SIGN_SERVER_BASE_URL,
      baseOptions: {
        headers: {
          "User-Agent": "NovaBoostLive signer-gateway",
        },
        validateStatus: () => true,
      },
    });

    try {
      const response = await signer.webcast.fetchWebcastURL(
        "ttlive-node",
        params.roomId,
        params.uniqueId,
        undefined,
        params.sessionId,
        DEFAULT_SIGN_USER_AGENT,
        params.ttTargetIdc,
        true,
        undefined,
        params.useMobile ? WebcastFetchPlatform.Mobile : WebcastFetchPlatform.Web,
        { responseType: "arraybuffer" },
      );

      if (response.status === 429) {
        const payload = JSON.parse(Buffer.from(response.data as ArrayBuffer).toString("utf-8"));
        const label = typeof payload?.limit_label === "string" ? `(${payload.limit_label}) ` : "";
        const message = `${label}Too many connections started, try again later.`;
        this.signKeyPool.reportFailure(key, message);
        this.recordFailure(params, payload?.message ? `${message} ${payload.message}` : message);
        throw new Error(payload?.message ? `${message} ${payload.message}` : message);
      }

      if (response.status !== 200) {
        const payload = Buffer.from(response.data as ArrayBuffer).toString("utf-8");
        const message = `Unexpected sign server status ${response.status}. Payload: ${payload}`;
        this.recordFailure(params, message);
        throw new Error(message);
      }

      const result = deserializeMessage("ProtoMessageFetchResult", Buffer.from(response.data as ArrayBuffer));
      this.recordSuccess();
      return result;
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const message = rawMessage.trim() || "Unknown internal signer failure";

      if (isTikTokSignRateLimitError(message)) {
        this.signKeyPool.reportFailure(key, message);
      }

      this.recordFailure(params, message);
      this.logger.warn("TikTok Euler signing failed", {
        roomId: params.roomId,
        uniqueId: params.uniqueId,
        error: message,
      });
      throw error;
    }
  }
}

export class TikTokSigningService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<ProtoMessageFetchResult>>();
  private readonly recentFailures: Array<{
    occurredAt: string;
    target: string;
    error: string;
  }> = [];
  private lastSuccessAt: string | null = null;
  private readonly provider: TikTokSigningProvider;

  constructor(
    private readonly logger: Logger,
    private readonly env: BackendEnv,
    private readonly signKeyPool: TikTokSignKeyPool,
  ) {
    this.provider = this.createProvider();
  }

  getDiagnostics() {
    return {
      provider: this.provider.name,
      lastSuccessAt: this.lastSuccessAt,
      cacheEntries: this.cache.size,
      inFlightRequests: this.inFlight.size,
      recentFailures: this.recentFailures.slice(0, 10),
      ...this.provider.getDiagnostics(),
    };
  }

  async fetchSignedWebSocket(params: FetchSignedWebSocketParams) {
    const cacheKey = this.buildCacheKey(params);
    const now = Date.now();
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      return cached.result;
    }

    const existingRequest = this.inFlight.get(cacheKey);
    if (existingRequest) {
      return existingRequest;
    }

    const request = this.fetchSignedWebSocketInternal(params)
      .finally(() => {
        this.inFlight.delete(cacheKey);
      });

    this.inFlight.set(cacheKey, request);
    const result = await request;

    if (this.env.TIKTOK_SIGN_CACHE_TTL_MS > 0) {
      this.cache.set(cacheKey, {
        result,
        expiresAt: now + this.env.TIKTOK_SIGN_CACHE_TTL_MS,
      });
    }

    return result;
  }

  private buildCacheKey(params: FetchSignedWebSocketParams) {
    return JSON.stringify({
      roomId: params.roomId ?? null,
      uniqueId: params.uniqueId ?? null,
      sessionId: params.sessionId ?? null,
      ttTargetIdc: params.ttTargetIdc ?? null,
      useMobile: params.useMobile ?? false,
    });
  }

  private async fetchSignedWebSocketInternal(params: FetchSignedWebSocketParams) {
    return this.provider.fetchSignedWebSocket(params);
  }

  private createProvider(): TikTokSigningProvider {
    if (this.env.TIKTOK_SIGN_PROVIDER === "custom-http") {
      return new CustomHttpTikTokSigningProvider(this.logger, this.env);
    }

    if (this.env.TIKTOK_SIGN_PROVIDER === "euler") {
      return new EulerTikTokSigningProvider(this.logger, this.env, this.signKeyPool, this.recordFailure.bind(this), this.recordSuccess.bind(this));
    }

    if (this.env.TIKTOK_SIGN_FETCH_URL) {
      return new CustomHttpTikTokSigningProvider(this.logger, this.env);
    }

    return new EulerTikTokSigningProvider(this.logger, this.env, this.signKeyPool, this.recordFailure.bind(this), this.recordSuccess.bind(this));
  }

  private recordSuccess() {
    this.lastSuccessAt = new Date().toISOString();
  }

  private recordFailure(params: FetchSignedWebSocketParams, error: string) {
    this.recentFailures.unshift({
      occurredAt: new Date().toISOString(),
      target: params.roomId ?? params.uniqueId ?? "unknown",
      error,
    });

    if (this.recentFailures.length > 10) {
      this.recentFailures.length = 10;
    }
  }
}