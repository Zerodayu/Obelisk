"use client";

import { createListCollection } from "@ark-ui/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AcademicDepartment } from "@/lib/store/atoms/academic";

/**
 * Department picker for the onboarding role request — shown only for `dean`
 * (`REQUESTED_SCOPE` in `lib/roles.ts`), since a dean oversees every program
 * under the department rather than a single one. Options come from the
 * `department` table via `GET /academic/departments`.
 */
interface SelectDepartmentProps {
  /** Departments to pick from (`listDepartments()` server action). */
  departments: AcademicDepartment[];
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const SelectDepartment = ({
  departments,
  value,
  onValueChange,
  className,
  placeholder = "Select a department",
  disabled,
}: SelectDepartmentProps) => {
  const collection = createListCollection({
    items: departments.map((department) => ({
      // Departments are read by their name (CITE …); fall back to the code.
      label: department.name || department.code,
      value: department.id,
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
