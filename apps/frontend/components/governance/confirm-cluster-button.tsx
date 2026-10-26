"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { toast, toastError } from "@/components/ui/toast";
import { confirmClusterAction } from "@/server/actions/archive";

/**
 * AQAU/system_admin confirm action for an `open` graduation cluster. Captures
 * the newest PEO attainment snapshot server-side, then refreshes the page so
 * the Confirmed timestamp and lifecycle status update.
 */
export function ConfirmClusterButton({ clusterId }: { clusterId: string }) {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	async function handleConfirm() {
		setPending(true);
		try {
			const result = await confirmClusterAction(clusterId);
			if (!result.ok) {
				toastError({
					title: "Confirm failed",
					description: result.error,
					status: result.status,
					scope: "archive:confirm",
				});
				return;
			}
			toast.success({
				title: "Cluster confirmed",
				description: "PEO attainment captured — ready to compile.",
			});
			router.refresh();
		} finally {
			setPending(false);
		}
	}

	return (
		<Button disabled={pending} onClick={handleConfirm}>
			{pending ? "Confirming…" : "Confirm cluster"}
		</Button>
	);
}
