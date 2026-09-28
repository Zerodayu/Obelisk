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
import { programsAtom } from "@/lib/store/atoms/academic";

interface ProgramSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function ProgramSelect({
  value,
  onValueChange,
  disabled,
  className,
  placeholder = "Select program",
}: ProgramSelectProps) {
  const programs = useAtomValue(programsAtom);

  const collection = createListCollection({
    items: programs,
    itemToValue: (item) => item.id,
    itemToString: (item) => `${item.code} — ${item.name}`,
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
        {programs.map((p) => (
          <SelectItem key={p.id} item={p}>
            {p.code} — {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
