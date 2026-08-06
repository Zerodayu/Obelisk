import Image from "next/image";
import { cn } from "@/lib/utils";
import { app } from "@/utils/app-info";

/**
 * Obelisk brand mark. Renders the themed SVG from `public/metadata/` and swaps
 * to the dark variant via the Tailwind `dark:` variant (class strategy), so it
 * follows the active theme with no client-side JS or hydration flash.
 */
export function ObeliskLogo({ className }: { className?: string }) {
  return (
    <>
      <Image
        src={app.logo.light}
        alt={`${app.title} logo`}
        width={300}
        height={300}
        className={cn("size-5 dark:hidden", className)}
      />
      <Image
        src={app.logo.dark}
        alt={`${app.title} logo`}
        width={300}
        height={300}
        className={cn("hidden size-5 dark:block", className)}
      />
    </>
  );
}
