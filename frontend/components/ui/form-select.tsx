"use client";

import { createListCollection } from "@ark-ui/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FormSelectOption {
  value: string;
  label: string;
}

interface FormSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: FormSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Lightweight static-option select built on the Ark UI Select primitive.
 * Wraps the common `createListCollection` + `Select` pattern used in form
 * tables so each call-site stays concise.
 */
export function FormSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
}: FormSelectProps) {
  const collection = createListCollection({
    items: options,
    itemToValue: (item) => item.value,
    itemToString: (item) => item.label,
  });

  return (
    <Select
      value={value ? [value] : undefined}
      onValueChange={(details) => onValueChange?.(details.value[0] ?? "")}
      disabled={disabled}
      collection={collection}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} item={opt}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
