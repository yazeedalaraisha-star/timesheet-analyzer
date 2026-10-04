import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { IS_APP } from "../utils/appShell";

interface ThemeContextType {
  dark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({ dark: false, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState<boolean>(() => {
    // The Android app ships a single dark black/lime design.
    if (IS_APP) return true;
    try {
      const stored = localStorage.getItem("app_theme");
      if (stored) return stored === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  });

  const toggle = () => {
    if (IS_APP) return;
    const next = !dark;
    setDark(next);
    try { localStorage.setItem("app_theme", next ? "dark" : "light"); } catch {}
  };

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [dark]);

  // In the app, printing drops dark mode so paper output keeps the light palette.
  useEffect(() => {
    if (!IS_APP || !dark) return;
    const root = document.documentElement;
    const beforePrint = () => root.classList.remove("dark");
    const afterPrint = () => root.classList.add("dark");
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
