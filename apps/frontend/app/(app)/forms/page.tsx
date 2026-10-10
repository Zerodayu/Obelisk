import Link from "next/link";

import { navSectionsFor } from "@/config/navigation";
import { requireUser } from "@/server/auth";

/**
 * `/forms` index — lists the form groups the current role **prepares**,
 * derived from the navigation registry (`config/navigation.ts`), which filters
 * on `preparerRoles(code)`. Review-only forms live in the approval inbox.
 */
export default async function FormsIndexPage() {
	const user = await requireUser();
	const sections = navSectionsFor(user.role);

	return (
		<div className="space-y-8 px-4 lg:px-6">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold tracking-tight">Forms</h2>
				<p className="text-muted-foreground text-sm">
					The OBE form catalog, grouped by PDCA phase — the forms your role
					prepares.
				</p>
			</div>

			{sections.map((section) => (
				<section key={section.label} className="space-y-3">
					<h3 className="text-muted-foreground text-sm font-medium">
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
				<p className="text-muted-foreground text-sm">
					Your role does not prepare any forms — review work lives under Pending
					Approvals.
				</p>
			) : null}
		</div>
	);
}

function FormLink({ href, title }: { href: string; title: string }) {
	return (
		<Link
			href={href}
			className="bg-card hover:bg-accent hover:text-accent-foreground rounded-xl border p-4 text-sm font-medium shadow-sm transition-colors"
		>
			{title}
		</Link>
	);
}
