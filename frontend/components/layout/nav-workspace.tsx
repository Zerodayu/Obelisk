"use client";

import { Collapsible } from "@base-ui/react/collapsible";

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
import type { ApiUser } from "@/lib/api";
import { type NavItem, navSectionsFor, workspaceNav } from "@/config/navigation";

function WorkspaceLink({ item }: { item: NavItem }) {
  return (
    <SidebarMenuButton
      tooltip={item.title}
      render={
        // biome-ignore lint/a11y/useAnchorContent: base-ui <SidebarMenuButton> render prop injects the visible label as anchor text at runtime.
        item.url ? <a href={item.url} aria-label={item.title} /> : undefined
      }
    >
      {item.icon ? <item.icon /> : null}
      <span>{item.title}</span>
    </SidebarMenuButton>
  );
}

function FormCollapsible({ item }: { item: NavItem }) {
  return (
    <Collapsible.Root defaultOpen>
      <Collapsible.Trigger className="group/collapsible">
        <SidebarMenuButton tooltip={item.title}>
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
                render={
                  // biome-ignore lint/a11y/useAnchorContent: base-ui render prop injects the sub-label as anchor text at runtime.
                  <a href={child.url} aria-label={child.title} />
                }
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

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {workspace.map((item) => (
              <SidebarMenuItem key={item.title}>
                <WorkspaceLink item={item} />
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
                    <FormCollapsible item={item} />
                  ) : (
                    <WorkspaceLink item={item} />
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
