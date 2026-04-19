import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.novaboost.live",
  appName: "NovaBoost Live",
  webDir: "dist/client",
  bundledWebRuntime: false,
  android: {
    backgroundColor: "#0c0814",
    allowMixedContent: true,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: "#0c0814",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;