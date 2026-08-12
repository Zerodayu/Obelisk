import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { FaviconSync } from "@/components/branding/favicon";
import { ThemeProvider } from "@/components/theme/theme-provider";
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
 * light→dark flash on every load. Mirrors `theme-provider.tsx` (storageKey
 * "theme", values light/dark/system, class strategy).
 */
const THEME_INIT_SCRIPT = `(function () {
  try {
    var root = document.documentElement;
    var stored = localStorage.getItem("theme");
    var theme =
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : "system";
    var resolved =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
  } catch (e) {}
})();`;

export const metadata: Metadata = {
  title: app.legalTitle,
  description: app.description,
  icons: {
    icon: [
      {
        url: app.logo.light,
        type: "image/svg+xml",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: app.logo.dark,
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
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
        <ThemeProvider>
          <FaviconSync />
          <TooltipProvider>
            <body className="min-h-full flex flex-col">{children}</body>
          </TooltipProvider>
        </ThemeProvider>
      </StoreProvider>
    </html>
  );
}
