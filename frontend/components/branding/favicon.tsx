"use client";

import { useEffect } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { app } from "@/utils/app-info";

const LIGHT_ICON = app.logo.light;
const DARK_ICON = app.logo.dark;

export function FaviconSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const links = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'),
    );
    const themed = links.filter(
      (link) => link.href.endsWith(LIGHT_ICON) || link.href.endsWith(DARK_ICON),
    );
    if (themed.length === 0) return;

    const isDark = resolvedTheme === "dark";
    themed.forEach((link) => {
      link.media = `(prefers-color-scheme: ${isDark ? "dark" : "light"})`;
    });

    const active = themed.find((link) =>
      link.href.endsWith(isDark ? DARK_ICON : LIGHT_ICON),
    );
    const inactive = themed.find((link) => link !== active);
    if (active && inactive) {
      inactive.after(active);
    }
  }, [resolvedTheme]);

  return null;
}
