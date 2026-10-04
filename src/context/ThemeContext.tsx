import React, { createContext, useContext, useEffect, ReactNode } from "react";

// The app ships a single black/lime glass theme, so dark mode is always on.
// Printing temporarily drops it so paper output keeps the light palette.
interface ThemeContextType {
  dark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({ dark: true });

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark");
    const beforePrint = () => root.classList.remove("dark");
    const afterPrint = () => root.classList.add("dark");
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ dark: true }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
