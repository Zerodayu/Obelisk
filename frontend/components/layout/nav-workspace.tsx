"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  type NavItem,
  navSectionsFor,
  workspaceNav,
} from "@/config/navigation";
import type { ApiUser } from "@/lib/api-client";

function isRouteActive(pathname: string, url?: string): boolean {
  if (!url) return false;
  return pathname === url || pathname.startsWith(`${url}/`);
}

function WorkspaceLink({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  return (
    <SidebarMenuButton
      tooltip={item.title}
      isActive={isRouteActive(pathname, item.url)}
      render={
        item.url ? <Link href={item.url} aria-label={item.title} /> : undefined
      }
    >
      {item.icon ? <item.icon /> : null}
      <span>{item.title}</span>
    </SidebarMenuButton>
  );
}

function FormCollapsible({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const childrenActive = (item.children ?? []).some((child) =>
    isRouteActive(pathname, child.url),
  );
  const parentActive = isRouteActive(pathname, item.url) || childrenActive;

  return (
    <Collapsible.Root defaultOpen>
      <Collapsible.Trigger className="group/collapsible">
        <SidebarMenuButton tooltip={item.title} isActive={parentActive}>
          {item.icon ? <item.icon /> : null}
          <span>{item.title}</span>
          <ChevronIcon className="ml-auto transition-transform data-open:rotate-90" />
        </SidebarMenuButton>
      </Collapsible.Trigger>
      <Collapsible.Panel>
        <SidebarMenuSub>
          {(item.children ?? []).map((child) => (
            <SidebarMenuSubItem key={child.title}>
              <SidebarMenuSubButton
                isActive={isRouteActive(pathname, child.url)}
                render={<Link href={child.url} aria-label={child.title} />}
              >
                <span>{child.title}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/**
 * Registry-driven sidebar navigation. Renders the workspace destinations plus
 * the role-filtered forms catalog from `lib/navigation.tsx`.
 */
export function SidebarNav({ role }: { role: ApiUser["role"] }) {
  const workspace = workspaceNav(role);
  const sections = navSectionsFor(role);
  const pathname = usePathname();

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {workspace.map((item) => (
              <SidebarMenuItem key={item.title}>
                <WorkspaceLink item={item} pathname={pathname} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {sections.map((section) => (
        <SidebarGroup key={section.label}>
          <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {section.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.children && item.children.length > 0 ? (
                    <FormCollapsible item={item} pathname={pathname} />
                  ) : (
                    <WorkspaceLink item={item} pathname={pathname} />
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
