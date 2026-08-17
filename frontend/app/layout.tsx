import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { generateTheme, tokensToCssVars, Variant } from "material-shadcn";
import { Theme } from "@/components/theme";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StoreProvider } from "@/lib/store";
import { THEME_STORAGE_KEY } from "@/lib/theme-constants";
import { cn } from "@/lib/utils";
import { app } from "@/utils/app-info";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * The material-shadcn theme (seed/variant/contrast are fixed in the layout —
 * no UI changes them), generated once on the server and rendered into a
 * `<style>` in <head> so the FIRST paint already uses the real themed palette
 * (both modes), not the plain globals.css fallback colors. The tiny inline
 * script below only has to flip the `.dark`/`.light` class + colorScheme
 * before paint to pick which palette applies. After hydration the
 * material-shadcn `<Theme>` provider re-applies identical values (idempotent).
 */
const theme = generateTheme({
  seed: "#5a1f4c",
  variant: Variant.VIBRANT,
  contrast: 0,
});

const LIGHT_VARS = tokensToCssVars(theme.light);
const DARK_VARS = tokensToCssVars(theme.dark);

function varsToCss(selector: string, vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([key, value]) => `${key}:${value};`)
    .join("");
  return `${selector}{${body}}`;
}

// `html:root` / `html.dark` out-specify globals.css's `:root` / `.dark` (both
// (0,1,0)) regardless of stylesheet order, so our tokens always win pre-paint.
const THEME_CSS = `${varsToCss("html:root", LIGHT_VARS)}${varsToCss("html.dark", DARK_VARS)}`;

/**
 * Resolves the persisted/system mode and applies the `.dark`/`.light` class +
 * `colorScheme` to <html> before first paint so the browser paints the correct
 * pre-rendered palette above. Reads THEME_STORAGE_KEY (JSON {seed, variant,
 * colorMode}) and falls back to the legacy "theme" key (light/dark/system).
 */
const THEME_INIT_SCRIPT = `(function () {
  try {
    var stored = null;
    try {
      var ms = JSON.parse(localStorage.getItem("${THEME_STORAGE_KEY}"));
      if (ms && (ms.colorMode === "light" || ms.colorMode === "dark" || ms.colorMode === "system")) {
        stored = ms.colorMode;
      }
    } catch (e) {}
    if (!stored) {
      var legacy = localStorage.getItem("theme");
      stored = legacy === "light" || legacy === "dark" || legacy === "system" ? legacy : "system";
    }
    var root = document.documentElement;
    var resolved =
      stored === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : stored;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
  } catch (e) {}
})();`;

export const metadata: Metadata = {
  title: app.legalTitle,
  description: app.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        inter.variable,
      )}
    >
      <head>
        {/* Themed tokens for both modes, present in the first HTML paint. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static generated CSS vars, no user input */}
        <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme-init script, no user input */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <Theme
        seed="#5a1f4c"
        variant={Variant.VIBRANT}
        colorMode="system"
        storageKey={THEME_STORAGE_KEY}
      >
        <StoreProvider>
          <TooltipProvider>
            <Toaster />
            <body className="min-h-full flex flex-col">{children}</body>
          </TooltipProvider>
        </StoreProvider>
      </Theme>
    </html>
  );
}
