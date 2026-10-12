"use client";

import { useEffect, useState } from "react";

import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";

/* NOTE: there is no consent API for the tracker — the browser (or an extension)
 * simply blocks it, so consent is read off the script's outcome, never stored */
type TrackerState = "pending" | "granted" | "blocked";

const domain = process.env.NEXT_PUBLIC_UMAMI_DOMAIN;
const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

export function UmamiConsentDrawer() {
	const [tracker, setTracker] = useState<TrackerState>("pending");

	useEffect(() => {
		if (!domain || !websiteId) return;

		let state: TrackerState = "pending";

		const load = () => {
			const script = document.createElement("script");
			script.src = `https://${domain}/script.js`;
			script.dataset.websiteId = websiteId;
			script.dataset.umamiLoaded = "true";
			script.async = true;
			script.onload = () => {
				state = "granted";
				setTracker("granted");
			};
			script.onerror = () => {
				state = "blocked";
				setTracker("blocked");
			};
			document.head.appendChild(script);
		};

		load();

		// NOTE: retry on return so a user who allows the blocked request in their browser gets it on the spot
		const onVisible = () => {
			if (document.visibilityState !== "visible" || state !== "blocked") return;
			document.querySelector("script[data-umami-loaded]")?.remove();
			load();
		};
		document.addEventListener("visibilitychange", onVisible);

		return () => {
			document.removeEventListener("visibilitychange", onVisible);
			// NOTE: the root layout never unmounts, but this keeps StrictMode's double-mount down to one tag
			document.querySelector("script[data-umami-loaded]")?.remove();
		};
	}, []);

	if (tracker !== "blocked") return null;

	return (
		<Drawer open showSwipeHandle disablePointerDismissal>
			<DrawerContent>
				<DrawerHeader className="py-6">
					<DrawerTitle>Analytics is blocked</DrawerTitle>
					<DrawerDescription>
						<blockquote>
							Your browser is blocking Umami, our privacy-friendly analytics.
							Nothing personal is collected and every feature still works —
							allow it for this site in your browser settings only if you'd like
							to help us improve the platform.
						</blockquote>
					</DrawerDescription>
				</DrawerHeader>
			</DrawerContent>
		</Drawer>
	);
}
