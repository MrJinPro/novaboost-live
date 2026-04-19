import { createFileRoute } from "@tanstack/react-router";

const COUNTRY_TO_CURRENCY = {
  RU: "RUB",
  KZ: "KZT",
  MD: "MDL",
} as const;

function resolveCountryHeader(headers: Headers) {
  const candidates = [
    headers.get("cf-ipcountry"),
    headers.get("x-vercel-ip-country"),
    headers.get("cloudfront-viewer-country"),
    headers.get("x-country-code"),
    headers.get("x-geo-country"),
    headers.get("x-country"),
  ];

  for (const candidate of candidates) {
    const normalized = candidate?.trim().toUpperCase();
    if (normalized && /^[A-Z]{2}$/.test(normalized) && normalized !== "XX") {
      return normalized;
    }
  }

  return null;
}

function inferCountryFromLanguage(headers: Headers) {
  const acceptLanguage = headers.get("accept-language") ?? "";
  const match = acceptLanguage.match(/(?:^|,)[a-z]{2,3}[-_]([A-Za-z]{2})/i);
  return match ? match[1].toUpperCase() : null;
}

export const Route = createFileRoute("/api/currency-preference")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const headerCountry = resolveCountryHeader(request.headers);
        const fallbackCountry = inferCountryFromLanguage(request.headers);
        const countryCode = headerCountry ?? fallbackCountry;
        const currency = countryCode ? (COUNTRY_TO_CURRENCY[countryCode as keyof typeof COUNTRY_TO_CURRENCY] ?? "USD") : "USD";

        return Response.json({
          countryCode,
          currency,
          source: headerCountry ? "geo-header" : fallbackCountry ? "browser" : "default",
        });
      },
    },
  },
});
