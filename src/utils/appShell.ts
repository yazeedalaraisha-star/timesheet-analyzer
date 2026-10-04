// True inside the Android app (Capacitor WebView). The app gets the black/lime
// glass design with a bottom tab bar; the website keeps its original look.
import { Capacitor } from "@capacitor/core";

const APP_USER_AGENT_MARK = "TimesheetAnalyzerApp";

function detectApp(): boolean {
  try {
    if (typeof navigator !== "undefined" && navigator.userAgent.includes(APP_USER_AGENT_MARK)) return true;
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export const IS_APP = detectApp();

/** Tags <html> so the app-only styles in index.css apply. Call before the first render. */
export function applyAppShell(): void {
  if (!IS_APP) return;
  const root = document.documentElement;
  root.classList.add("app-shell", "dark");
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = "#111111";
}
