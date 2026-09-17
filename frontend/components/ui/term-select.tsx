"use client";

import { createListCollection } from "@ark-ui/react";
import { useAtomValue } from "jotai";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { termsAtom } from "@/lib/store/atoms/academic";

interface TermSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function TermSelect({
  value,
  onValueChange,
  disabled,
  className,
  placeholder = "Select term",
}: TermSelectProps) {
  const terms = useAtomValue(termsAtom);

  const collection = createListCollection({
    items: terms,
    itemToValue: (item) => item.id,
    itemToString: (item) =>
      `${item.schoolYear} — Sem ${item.semester}${item.isActive ? " (Active)" : ""}`,
  });

  return (
    <Select
      value={value ? [value] : undefined}
      onValueChange={(details) => onValueChange?.(details.value[0] ?? "")}
      disabled={disabled}
      collection={collection}
    >
      <SelectTrigger className={className} showClear>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {terms.map((t) => (
          <SelectItem key={t.id} item={t}>
            {t.schoolYear} — Sem {t.semester}
            {t.isActive ? " (Active)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
