import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { Variant } from "material-shadcn";
import { Theme } from "@/components/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StoreProvider } from "@/lib/store";
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
 * Applies the persisted/system theme to <html> before first paint to prevent a
 * light→dark flash on every load. Mirrors the material-shadcn `<Theme>`
 * provider (storageKey "material-shadcn-theme", JSON {seed, variant,
 * colorMode}, .dark class strategy). Falls back to the legacy "theme" key
 * (light/dark/system) for existing visitors.
 */
const THEME_INIT_SCRIPT = `(function () {
  try {
    var root = document.documentElement;
    var stored = null;
    try {
      var ms = JSON.parse(localStorage.getItem("material-shadcn-theme"));
      if (ms && (ms.colorMode === "light" || ms.colorMode === "dark" || ms.colorMode === "system")) {
        stored = ms.colorMode;
      }
    } catch (e) {}
    if (!stored) {
      var legacy = localStorage.getItem("theme");
      stored = legacy === "light" || legacy === "dark" || legacy === "system" ? legacy : "system";
    }
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
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme-init script, no user input */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <StoreProvider>
        <Theme
          seed="#5a1f4c"
          variant={Variant.VIBRANT}
          colorMode="system"
          storageKey={"obelisk-theme"}
        >
          <TooltipProvider>
            <body className="min-h-full flex flex-col">{children}</body>
          </TooltipProvider>
        </Theme>
      </StoreProvider>
    </html>
  );
}
