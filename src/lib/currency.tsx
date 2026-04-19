import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type SupportedCurrency = "USD" | "RUB" | "KZT" | "MDL";
export type CurrencyMode = "auto" | SupportedCurrency;

type CurrencyApiPayload = {
  countryCode: string | null;
  currency: SupportedCurrency;
  source: "default" | "browser" | "geo-header";
};

export type CurrencyPreference = {
  locale: string;
  countryCode: string | null;
  geoCurrency: SupportedCurrency;
  localCurrency: SupportedCurrency;
  primaryCurrency: SupportedCurrency;
  secondaryCurrency: SupportedCurrency | null;
  mode: CurrencyMode;
  source: "default" | "browser" | "geo-header" | "manual";
  orderCurrency: "USD" | "RUB";
  setCurrencyMode: (mode: CurrencyMode) => void;
};

const USD_RATES: Record<SupportedCurrency, number> = {
  USD: 1,
  RUB: 92,
  KZT: 510,
  MDL: 17.7,
};

const COUNTRY_TO_CURRENCY: Record<string, SupportedCurrency> = {
  RU: "RUB",
  KZ: "KZT",
  MD: "MDL",
};

const CURRENCY_TO_LOCALE: Record<SupportedCurrency, string> = {
  USD: "en-US",
  RUB: "ru-RU",
  KZT: "kk-KZ",
  MDL: "ro-MD",
};

const STORAGE_KEY = "nova-currency-mode";

const DEFAULT_CONTEXT: CurrencyPreference = {
  locale: "en-US",
  countryCode: null,
  geoCurrency: "USD",
  localCurrency: "USD",
  primaryCurrency: "USD",
  secondaryCurrency: null,
  mode: "auto",
  source: "default",
  orderCurrency: "USD",
  setCurrencyMode: () => undefined,
};

const CurrencyContext = createContext<CurrencyPreference>(DEFAULT_CONTEXT);

export function resolveSupportedCurrency(value?: string | null): SupportedCurrency {
  switch (value) {
    case "RUB":
    case "KZT":
    case "MDL":
    case "USD":
      return value;
    default:
      return "USD";
  }
}

function inferCountryCode(locale: string) {
  try {
    const region = new Intl.Locale(locale).region;
    if (region) {
      return region.toUpperCase();
    }
  } catch {
    // Ignore Intl.Locale parsing failures and continue with regex fallback.
  }

  const match = locale.match(/[-_]([A-Za-z]{2})$/);
  return match ? match[1].toUpperCase() : null;
}

function detectBrowserCurrencyPreference() {
  const locale = typeof navigator !== "undefined"
    ? navigator.languages?.[0] ?? navigator.language ?? "en-US"
    : "en-US";
  const countryCode = inferCountryCode(locale);

  return {
    locale,
    countryCode,
    currency: countryCode ? (COUNTRY_TO_CURRENCY[countryCode] ?? "USD") : "USD",
  };
}

function getSecondaryCurrency(primaryCurrency: SupportedCurrency, geoCurrency: SupportedCurrency) {
  if (primaryCurrency === geoCurrency) {
    return null;
  }

  return geoCurrency;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(DEFAULT_CONTEXT.locale);
  const [countryCode, setCountryCode] = useState<string | null>(DEFAULT_CONTEXT.countryCode);
  const [geoCurrency, setGeoCurrency] = useState<SupportedCurrency>(DEFAULT_CONTEXT.geoCurrency);
  const [source, setSource] = useState<CurrencyPreference["source"]>(DEFAULT_CONTEXT.source);
  const [mode, setMode] = useState<CurrencyMode>(DEFAULT_CONTEXT.mode);

  useEffect(() => {
    const browserPreference = detectBrowserCurrencyPreference();
    setLocale(browserPreference.locale);

    const storedMode = typeof window !== "undefined"
      ? window.localStorage.getItem(STORAGE_KEY)
      : null;
    const nextMode = storedMode === "auto" || storedMode === "USD" || storedMode === "RUB" || storedMode === "KZT" || storedMode === "MDL"
      ? storedMode
      : "auto";
    setMode(nextMode);

    void fetch("/api/currency-preference", { headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`currency geo request failed: ${response.status}`);
        }

        const payload = await response.json() as CurrencyApiPayload;
        setCountryCode(payload.countryCode ?? browserPreference.countryCode);
        setGeoCurrency(resolveSupportedCurrency(payload.currency));
        setSource(payload.source);
      })
      .catch(() => {
        setCountryCode(browserPreference.countryCode);
        setGeoCurrency(browserPreference.currency);
        setSource("browser");
      });
  }, []);

  const contextValue = useMemo<CurrencyPreference>(() => {
    const primaryCurrency = mode === "auto" ? "USD" : mode;
    const secondaryCurrency = getSecondaryCurrency(primaryCurrency, geoCurrency);

    return {
      locale,
      countryCode,
      geoCurrency,
      localCurrency: mode === "auto" ? geoCurrency : mode,
      primaryCurrency,
      secondaryCurrency,
      mode,
      source: mode === "auto" ? source : "manual",
      orderCurrency: primaryCurrency === "RUB" ? "RUB" : "USD",
      setCurrencyMode: (nextMode) => {
        setMode(nextMode);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, nextMode);
        }
      },
    };
  }, [countryCode, geoCurrency, locale, mode, source]);

  return <CurrencyContext.Provider value={contextValue}>{children}</CurrencyContext.Provider>;
}

export function useCurrencyPreference() {
  return useContext(CurrencyContext);
}

export function convertCurrency(amount: number, from: SupportedCurrency, to: SupportedCurrency) {
  if (!Number.isFinite(amount)) {
    return 0;
  }

  const amountInUsd = amount / USD_RATES[from];
  return amountInUsd * USD_RATES[to];
}

export function formatCurrencyAmount(amount: number, currency: SupportedCurrency, locale?: string) {
  return new Intl.NumberFormat(locale ?? CURRENCY_TO_LOCALE[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatEditableAmount(amount: number) {
  if (!Number.isFinite(amount)) {
    return "";
  }

  return amount
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d*[1-9])0$/, "$1");
}

export function getLocalizedMoney(
  amount: number,
  options: {
    baseCurrency?: SupportedCurrency;
    preference: CurrencyPreference;
  },
) {
  const baseCurrency = options.baseCurrency ?? "RUB";
  const primaryAmount = convertCurrency(amount, baseCurrency, options.preference.primaryCurrency);
  const secondaryCurrency = options.preference.secondaryCurrency;
  const secondaryAmount = secondaryCurrency ? convertCurrency(amount, baseCurrency, secondaryCurrency) : null;

  return {
    primary: formatCurrencyAmount(primaryAmount, options.preference.primaryCurrency, options.preference.locale),
    secondary: secondaryCurrency && secondaryAmount !== null
      ? formatCurrencyAmount(secondaryAmount, secondaryCurrency, options.preference.locale)
      : null,
    countryCode: options.preference.countryCode,
    localCurrency: options.preference.localCurrency,
    primaryCurrency: options.preference.primaryCurrency,
    secondaryCurrency,
  };
}
