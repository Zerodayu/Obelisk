"use client";

import { CommandIcon, FolderIcon } from "lucide-react";
import Link from "next/link";
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
import type { ApiUser } from "@/lib/api";

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
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href="/dashboard" aria-label="Obelisk dashboard" />}
            >
              <CommandIcon className="size-5!" />
              <span className="text-base font-semibold">Obelisk</span>
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
