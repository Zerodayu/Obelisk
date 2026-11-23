"use client";

import { createListCollection } from "@ark-ui/react";
import { useMemo } from "react";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";

/** Roles a new account may apply for (system_admin is the approver, never self-assigned). */
const SELF_SELECTABLE_ROLES = [
	"faculty",
	"program_chair",
	"dean",
	"aqau",
	"vpaa",
] as const;

interface SelectRoleProps {
	value?: string;
	onValueChange?: (value: string) => void;
	className?: string;
	/** Override the role list (e.g. edit screens that must show every role). */
	roles?: readonly UserRole[];
}

export const SelectRole = ({
	value,
	onValueChange,
	className,
	roles,
}: SelectRoleProps) => {
	const collection = useMemo(
		() =>
			createListCollection({
				items: (roles ?? SELF_SELECTABLE_ROLES).map((role) => ({
					label: ROLE_LABELS[role],
					value: role as string,
				})),
			}),
		[roles],
	);

	return (
		<Select
			collection={collection}
			onValueChange={(details) => onValueChange?.(details.value[0])}
			value={value ? [value] : []}
		>
			<SelectTrigger className={className}>
				<SelectValue placeholder="Select a role" />
			</SelectTrigger>

			<SelectContent>
				{collection.items.map((item) => (
					<SelectItem item={item} key={item.value}>
						{item.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
};
