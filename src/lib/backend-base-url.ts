export function getBackendBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_BACKEND_URL || process.env.VITE_BACKEND_URL;
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    return "";
  }

  return "http://127.0.0.1:4310";
}