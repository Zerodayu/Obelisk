"use client";

import { createListCollection } from "@ark-ui/react";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { AcademicProgram } from "@/lib/store/atoms/academic";

/**
 * Program picker for the onboarding role request — shown only for the
 * program-scoped roles (`PROGRAM_REQUIRED_ROLES` in `lib/roles.ts`).
 * Options come from the `program` table via `GET /academic/programs`, so a
 * new program appears here without a code change.
 */
interface SelectProgramProps {
	/** Programs to pick from (`listPrograms()` server action). */
	programs: AcademicProgram[];
	value?: string;
	onValueChange?: (value: string) => void;
	className?: string;
	placeholder?: string;
	disabled?: boolean;
}

export const SelectProgram = ({
	programs,
	value,
	onValueChange,
	className,
	placeholder = "Select a program",
	disabled,
}: SelectProgramProps) => {
	const collection = createListCollection({
		items: programs.map((program) => ({
			// Lead with the code (BSIT, BSMC — how the institution refers to them),
			// fall back to the full name when a row has no code.
			label: program.code || program.name,
			value: program.id,
		})),
	});

	return (
		<Select
			collection={collection}
			disabled={disabled}
			onValueChange={(details) => onValueChange?.(details.value[0])}
			value={value ? [value] : []}
		>
			<SelectTrigger className={className}>
				<SelectValue placeholder={placeholder} />
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
