import Link from "next/link";
import { requireUser } from "@/server/auth";
import { navSectionsFor } from "@/config/navigation";

/**
 * `/forms` index — lists the form groups the current role may access, derived
 * from the navigation registry (`lib/navigation.tsx`).
 */
export default async function FormsIndexPage() {
  const user = await requireUser();
  const sections = navSectionsFor(user.role);

  return (
    <div className="px-4 lg:px-6 space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Forms</h2>
        <p className="text-sm text-muted-foreground">
          The OBE form catalog, grouped by PDCA phase and filtered to your role.
        </p>
      </div>

      {sections.map((section) => (
        <section key={section.label} className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            {section.label}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((item) => {
              const children = item.children ?? [];
              if (children.length > 0) {
                return children.map((child) => (
                  <FormLink
                    key={child.url}
                    href={child.url}
                    title={child.title}
                  />
                ));
              }
              return (
                <FormLink key={item.url} href={item.url} title={item.title} />
              );
            })}
          </div>
        </section>
      ))}

      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No forms are available for your role yet.
        </p>
      ) : null}
    </div>
  );
}

function FormLink({ href, title }: { href: string; title: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border bg-card p-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {title}
    </Link>
  );
}
