import { Capacitor } from "@capacitor/core";

export async function initializeNativeShell() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  document.documentElement.classList.add("is-native-app");
  document.body.classList.add("is-native-app");

  if (Capacitor.getPlatform() === "android") {
    document.documentElement.classList.add("is-android-app");
    document.body.classList.add("is-android-app");
  }

  const [{ StatusBar, Style }, { Keyboard }] = await Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/keyboard"),
  ]);

  await Promise.allSettled([
    StatusBar.setStyle({ style: Style.Dark }),
    StatusBar.setBackgroundColor({ color: "#0c0814" }),
    StatusBar.setOverlaysWebView({ overlay: false }),
    Keyboard.setResizeMode({ mode: "body" }),
  ]);
}