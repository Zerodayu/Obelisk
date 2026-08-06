"use client";

import { FolderIcon } from "lucide-react";
import Link from "next/link";
import { ObeliskLogo } from "@/components/branding/obelisk-logo";
import { NavSecondary } from "@/components/layout/nav-secondary";
import { NavUser } from "@/components/layout/nav-user";
import { SidebarNav } from "@/components/layout/nav-workspace";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { ApiUser } from "@/lib/api-client";
import { roleLabel } from "@/lib/roles";
import { app } from "@/utils/app-info";

/**
 * Role-aware application sidebar. Nav content (workspace + form catalog +
 * secondary) is derived from the authenticated user's role via
 * `lib/navigation.tsx` — see that registry to add or gate routes.
 */
export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: ApiUser }) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="hover:bg-sidebar active:bg-sidebar"
              render={
                <Link href="/dashboard" aria-label={`${app.title} dashboard`} />
              }
            >
              <ObeliskLogo className="size-9" />
              <div className="grid flex-1 leading-tight">
                <span className="text-base font-bold">{app.title}</span>
                <span className="truncate font-mono font-bold text-xs text-foreground/70">
                  — {roleLabel(user.role)}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarNav role={user.role} />
        <NavSecondary
          items={[{ title: "Get Help", url: "#", icon: <FolderIcon /> }]}
          className="mt-auto"
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
