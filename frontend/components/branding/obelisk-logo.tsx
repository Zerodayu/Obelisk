import Image from "next/image";
import { cn } from "@/lib/utils";

const LIGHT_LOGO = "/metadata/obelisk-logo.svg";
const DARK_LOGO = "/metadata/obelisk-logo-dark.svg";

/**
 * Obelisk brand mark. Renders the themed SVG from `public/metadata/` and swaps
 * to the dark variant via the Tailwind `dark:` variant (class strategy), so it
 * follows the active theme with no client-side JS or hydration flash.
 */
export function ObeliskLogo({ className }: { className?: string }) {
  return (
    <>
      <Image
        src={LIGHT_LOGO}
        alt="Obelisk logo"
        width={300}
        height={300}
        className={cn("size-5 dark:hidden", className)}
      />
      <Image
        src={DARK_LOGO}
        alt="Obelisk logo"
        width={300}
        height={300}
        className={cn("hidden size-5 dark:block", className)}
      />
    </>
  );
}
