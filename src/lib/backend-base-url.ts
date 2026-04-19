import { Capacitor } from "@capacitor/core";

const NATIVE_BACKEND_FALLBACK = "https://live.novaboost.cloud";

export function getBackendBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_BACKEND_URL || process.env.VITE_BACKEND_URL;
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  if (Capacitor.isNativePlatform()) {
    return NATIVE_BACKEND_FALLBACK;
  }

  if (typeof window !== "undefined") {
    return "";
  }

  return "http://127.0.0.1:4310";
}