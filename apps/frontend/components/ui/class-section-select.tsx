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
import { api, isApiError } from "@/lib/api-client";
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
  /** When true, fetches all active class sections when both programId and termId are omitted. Default is false. */
  loadAll?: boolean;
}

export function ClassSectionSelect({
  programId,
  termId,
  value,
  onValueChange,
  disabled,
  className,
  placeholder = "Select class section",
  loadAll = false,
}: ClassSectionSelectProps) {
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSections = useCallback(async () => {
    // If not loadAll and no filters provided, do not fetch
    if (!loadAll && !programId && !termId) {
      setSections([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Try server action
      const result = await listClassSections(programId, termId);
      if (result.ok) {
        // If caller passed filters (or server action returned non-empty for loadAll), use result
        if (result.data && (result.data.length > 0 || !loadAll)) {
          setSections(result.data);
          return;
        }
      }

      // 2. Direct browser API client fallback ONLY when loadAll is true
      // (ensures filtered queries never fall back to showing all sections)
      if (loadAll) {
        const directData = await api.get<ClassSection[]>(
          "/academic/class-sections",
        );
        setSections(directData ?? []);
      } else {
        setSections([]);
      }
    } catch (err) {
      // If direct fetch also failed, surface readable error
      const msg = isApiError(err)
        ? err.payload?.error || err.payload?.message || err.message
        : err instanceof Error
          ? err.message
          : "Couldn't load sections";
      setError(msg);
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, [loadAll, programId, termId]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const collection = createListCollection({
    items: sections,
    itemToValue: (item) => item.id,
    itemToString: (item) => `${item.course.code} — ${item.sectionCode}`,
  });

  const displayPlaceholder = error
    ? "Couldn't load sections"
    : loading
      ? "Loading..."
      : placeholder;

  return (
    <Select
      value={value ? [value] : undefined}
      onValueChange={(details) => onValueChange?.(details.value[0] ?? "")}
      disabled={disabled || loading}
      collection={collection}
    >
      <SelectTrigger className={className} showClear>
        <SelectValue placeholder={displayPlaceholder} />
      </SelectTrigger>
      <SelectContent>
        {loading && (
          <div className="p-3 text-center text-xs text-muted-foreground">
            Loading class sections…
          </div>
        )}

        {!loading && error && (
          <div className="p-3 text-center text-xs text-destructive">
            Couldn&apos;t load sections ({error})
          </div>
        )}

        {!loading && !error && sections.length === 0 && (
          <div className="p-3 text-center text-xs text-muted-foreground">
            No class sections found
          </div>
        )}

        {!loading &&
          !error &&
          sections.map((s) => (
            <SelectItem key={s.id} item={s}>
              {s.course.code} — {s.sectionCode}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
