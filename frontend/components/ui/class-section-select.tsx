"use client";

import { createListCollection } from "@ark-ui/react";
import { useCallback, useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ClassSection,
  listClassSections,
} from "@/server/actions/academic";

interface ClassSectionSelectProps {
  programId?: string;
  termId?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function ClassSectionSelect({
  programId,
  termId,
  value,
  onValueChange,
  disabled,
  className,
  placeholder = "Select class section",
}: ClassSectionSelectProps) {
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSections = useCallback(async () => {
    if (!programId && !termId) {
      setSections([]);
      return;
    }
    setLoading(true);
    try {
      const result = await listClassSections(programId, termId);
      if (result.ok) setSections(result.data);
    } finally {
      setLoading(false);
    }
  }, [programId, termId]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const collection = createListCollection({
    items: sections,
    itemToValue: (item) => item.id,
    itemToString: (item) => `${item.course.code} — ${item.sectionCode}`,
  });

  return (
    <Select
      value={value ? [value] : undefined}
      onValueChange={(details) => onValueChange?.(details.value[0] ?? "")}
      disabled={disabled || loading}
      collection={collection}
    >
      <SelectTrigger className={className} showClear>
        <SelectValue placeholder={loading ? "Loading..." : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {sections.map((s) => (
          <SelectItem key={s.id} item={s}>
            {s.course.code} — {s.sectionCode}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
