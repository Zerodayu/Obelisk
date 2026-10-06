"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TABS = [
  { title: "PLOs", url: "/plo-management" },
  { title: "CLO–PLO Connections", url: "/plo-management/connections" },
] as const;

/**
 * Segmented sub-nav shared by both `/plo-management` screens. The workspace
 * sidebar only links the parent route, so the two views switch in-page here.
 */
export function PloManagementNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="PLO management views"
      className="flex w-fit items-center gap-1 rounded-2xl border bg-muted p-1"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.url;
        return (
          <Link
            key={tab.url}
            href={tab.url}
            aria-current={active ? "page" : undefined}
            className={cn(
              buttonVariants({
                variant: active ? "secondary" : "ghost",
                size: "sm",
              }),
              "rounded-xl",
            )}
          >
            {tab.title}
          </Link>
        );
      })}
    </nav>
  );
}
