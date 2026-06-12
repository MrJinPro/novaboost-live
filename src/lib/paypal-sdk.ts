/**
 * Dynamic loader for PayPal JS SDK (modern Universal SDK). Loads once per
 * (clientId, currency) pair and caches the promise. Resolves with the global
 * window.paypal namespace.
 */

type PayPalNamespace = Record<string, unknown> & {
  Buttons: (options: unknown) => { render: (selector: HTMLElement | string) => Promise<void>; close?: () => void };
  CardFields?: (options: unknown) => {
    isEligible: () => boolean;
    NameField: () => { render: (selector: HTMLElement | string) => Promise<void> };
    NumberField: () => { render: (selector: HTMLElement | string) => Promise<void> };
    ExpiryField: () => { render: (selector: HTMLElement | string) => Promise<void> };
    CVVField: () => { render: (selector: HTMLElement | string) => Promise<void> };
    submit: () => Promise<void>;
  };
  Googlepay?: () => {
    config: () => Promise<unknown>;
    confirmOrder: (args: { orderId: string; paymentMethodData: unknown }) => Promise<{ status: string }>;
  };
  Applepay?: () => {
    config: () => Promise<{ isEligible: boolean; merchantCapabilities: string[]; supportedNetworks: string[]; countryCode: string; merchantIdentifier: string }>;
    validateMerchant: (args: { validationUrl: string; displayName?: string }) => Promise<{ merchantSession: unknown }>;
    confirmOrder: (args: { orderId: string; token: unknown; billingContact?: unknown; shippingContact?: unknown }) => Promise<void>;
  };
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
    ApplePaySession?: {
      new (version: number, request: unknown): {
        onvalidatemerchant: ((event: { validationURL: string }) => void) | null;
        onpaymentauthorized: ((event: { payment: { token: unknown; billingContact?: unknown; shippingContact?: unknown } }) => void) | null;
        oncancel: (() => void) | null;
        completeMerchantValidation: (session: unknown) => void;
        completePayment: (status: number) => void;
        begin: () => void;
        readonly STATUS_SUCCESS: number;
        readonly STATUS_FAILURE: number;
      };
      canMakePayments?: () => boolean;
      supportsVersion?: (version: number) => boolean;
      STATUS_SUCCESS: number;
      STATUS_FAILURE: number;
    };
  }
}

const loadCache = new Map<string, Promise<PayPalNamespace>>();

export type LoadPayPalOptions = {
  clientId: string;
  currency?: string;
  intent?: "capture" | "subscription";
  components?: string[];
  enableFunding?: string[];
  disableFunding?: string[];
  vault?: boolean;
};

export function loadPayPalSdk(options: LoadPayPalOptions): Promise<PayPalNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PayPal SDK can only be loaded in the browser"));
  }

  const currency = options.currency ?? "USD";
  const intent = options.intent ?? "capture";
  const components = options.components ?? ["buttons", "card-fields", "googlepay", "applepay"];
  const enableFunding = options.enableFunding;
  const disableFunding = options.disableFunding ?? ["credit"];

  const params = new URLSearchParams({
    "client-id": options.clientId,
    currency,
    intent,
    components: components.join(","),
    "disable-funding": disableFunding.join(","),
  });
  if (enableFunding && enableFunding.length) params.set("enable-funding", enableFunding.join(","));
  if (options.vault) params.set("vault", "true");

  const src = `https://www.paypal.com/sdk/js?${params.toString()}`;
  const cacheKey = src;

  const cached = loadCache.get(cacheKey);
  if (cached) return cached;

  const promise = new Promise<PayPalNamespace>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing && window.paypal) {
      resolve(window.paypal);
      return;
    }
    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.src = src;
      script.async = true;
      script.dataset.namespace = "paypal";
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => {
      if (window.paypal) resolve(window.paypal);
      else reject(new Error("PayPal SDK loaded but window.paypal is missing"));
    });
    script.addEventListener("error", () => {
      loadCache.delete(cacheKey);
      reject(new Error("Failed to load PayPal SDK"));
    });
  });

  loadCache.set(cacheKey, promise);
  return promise;
}

const APPLE_PAY_SCRIPT = "https://applepay.cdn-apple.com/jsapi/v1/apple-pay-sdk.js";
let applePayPromise: Promise<void> | null = null;

export function loadApplePaySdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Apple Pay requires browser"));
  if (applePayPromise) return applePayPromise;
  applePayPromise = new Promise((resolve, reject) => {
    if (window.ApplePaySession) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${APPLE_PAY_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.src = APPLE_PAY_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => {
      applePayPromise = null;
      reject(new Error("Failed to load Apple Pay SDK"));
    });
  });
  return applePayPromise;
}