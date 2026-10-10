"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";

const CONSENT_KEY = "umami-consent";

export function UmamiConsentDrawer() {
	const [open, setOpen] = useState(false);
	const [consentGiven, setConsentGiven] = useState(false);

	useEffect(() => {
		const stored = localStorage.getItem(CONSENT_KEY);
		if (stored === "granted") {
			setConsentGiven(true);
			loadUmamiScript();
		} else {
			// Show drawer if not explicitly granted (including "denied" or no value)
			setOpen(true);
		}
	}, []);

	const loadUmamiScript = () => {
		const domain = process.env.NEXT_PUBLIC_UMAMI_DOMAIN;
		const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
		if (!domain || !websiteId) return;

		if (document.querySelector(`script[data-umami-loaded]`)) return;

		const script = document.createElement("script");
		script.src = `https://${domain}/script.js`;
		script.dataset.websiteId = websiteId;
		script.dataset.umamiLoaded = "true";
		script.async = true;
		document.head.appendChild(script);
	};

	const handleAccept = () => {
		localStorage.setItem(CONSENT_KEY, "granted");
		setOpen(false);
		setConsentGiven(true);
		loadUmamiScript();
	};

	const handleDecline = () => {
		// Don't store "denied" - just close drawer, will show again on next page load
		setOpen(false);
		// Don't set consentGiven - so it shows again on next visit
	};

	if (consentGiven) return null;

	return (
		<Drawer
			open={open}
			onOpenChange={setOpen}
			showSwipeHandle
			disablePointerDismissal
		>
			<DrawerContent>
				<DrawerHeader className="py-6">
					<DrawerTitle>We value your privacy</DrawerTitle>
					<DrawerDescription>
						<blockquote>
							helps us improve your experience. No personal data is collected.
							We use Umami to understand how you interact with our platform.
						</blockquote>
					</DrawerDescription>
				</DrawerHeader>
				<DrawerFooter>
					<div className="bg-chart-5/30 flex flex-col gap-2 rounded-4xl p-4">
						<Button className="w-full" onClick={handleAccept}>
							Accept
						</Button>
						<DrawerClose>
							<Button
								variant="ghost"
								className="w-full"
								onClick={handleDecline}
							>
								Decline
							</Button>
						</DrawerClose>
					</div>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

export function UmamiTracker() {
	const domain = process.env.NEXT_PUBLIC_UMAMI_DOMAIN;
	const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

	if (!domain || !websiteId) return null;

	// Only auto-load if consent was already granted
	const stored =
		typeof window !== "undefined"
			? localStorage.getItem(CONSENT_KEY)
			: "granted";

	if (stored === "granted") {
		return (
			<Script
				src={`https://${domain}/script.js`}
				strategy="afterInteractive"
				data-website-id={websiteId}
			/>
		);
	}

	return null;
}

export function resetUmamiConsent() {
	if (typeof window !== "undefined") {
		localStorage.removeItem(CONSENT_KEY);
		// Remove Umami script if present
		const script = document.querySelector("script[data-umami-loaded]");
		if (script) script.remove();
		// Reload to re-show banner
		window.location.reload();
	}
}
