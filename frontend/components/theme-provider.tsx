"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeContextType = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getStoredTheme(storageKey: string): Theme | null {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {}
  return null;
}

function disableTransitions() {
  const style = document.createElement("style");
  style.textContent =
    "*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}";
  document.head.appendChild(style);
  return () => {
    window.getComputedStyle(document.body);
    setTimeout(() => document.head.removeChild(style), 1);
  };
}

function applyTheme(
  theme: ResolvedTheme,
  attribute: string | string[],
  enableColorScheme: boolean,
) {
  const root = document.documentElement;
  if (attribute === "class") {
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  } else if (typeof attribute === "string") {
    root.setAttribute(attribute, theme);
  } else {
    attribute.forEach((a) => {
      if (a === "class") {
        root.classList.remove("light", "dark");
        root.classList.add(theme);
      } else {
        root.setAttribute(a, theme);
      }
    });
  }
  if (enableColorScheme) {
    root.style.colorScheme = theme;
  }
}

type ThemeProviderProps = {
  children: ReactNode;
  storageKey?: string;
  defaultTheme?: Theme;
  attribute?: string | string[];
  enableSystem?: boolean;
  enableColorScheme?: boolean;
  disableTransitionOnChange?: boolean;
  themes?: string[];
};

export function ThemeProvider({
  children,
  storageKey = "theme",
  defaultTheme = "system",
  attribute = "class",
  enableSystem = true,
  enableColorScheme = true,
  disableTransitionOnChange = false,
  themes = ["light", "dark"],
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(
    () => getStoredTheme(storageKey) || defaultTheme,
  );

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    theme === "system" ? getSystemTheme() : theme,
  );

  const mql = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : window.matchMedia("(prefers-color-scheme: dark)"),
    [],
  );

  useEffect(() => {
    const handler = () => {
      if (theme === "system") {
        const resolved = getSystemTheme();
        setResolvedTheme(resolved);
        applyTheme(resolved, attribute, enableColorScheme);
      }
    };
    mql?.addEventListener("change", handler);
    return () => mql?.removeEventListener("change", handler);
  }, [theme, attribute, mql, enableColorScheme]);

  useEffect(() => {
    const cleanupTransitions = disableTransitionOnChange
      ? disableTransitions()
      : undefined;
    const resolved = theme === "system" ? getSystemTheme() : theme;
    setResolvedTheme(resolved);
    applyTheme(resolved, attribute, enableColorScheme);
    return cleanupTransitions;
  }, [theme, attribute, enableColorScheme, disableTransitionOnChange]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      try {
        localStorage.setItem(storageKey, newTheme);
      } catch {}
    },
    [storageKey],
  );

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
