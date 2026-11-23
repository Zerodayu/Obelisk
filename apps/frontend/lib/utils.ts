import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** Relative "3h ago" label for a timestamp; falls back to a short date past a week. */
export function timeAgo(iso: string | number): string {
	const seconds = Math.max(
		0,
		Math.round((Date.now() - new Date(iso).getTime()) / 1000),
	);
	const minutes = Math.floor(seconds / 60);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return new Date(iso).toLocaleDateString();
}
