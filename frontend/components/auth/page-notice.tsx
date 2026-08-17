"use client";

import { useEffect } from "react";
import { toast, toastError } from "@/components/ui/toast";

interface PageNoticeProps {
  /** Stable id so the notice replaces itself (dedupe) across back-navigation. */
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  description?: string;
}

/**
 * Renders nothing and fires a single toast on mount. Replaces the old
 * server-rendered floating banner boxes on auth pages driven by `searchParams`.
 */
export function PageNotice({ id, type, title, description }: PageNoticeProps) {
  useEffect(() => {
    if (type === "error") {
      toastError({ scope: id, title, description });
      return;
    }
    toast[type]({ id, title, description });
  }, [id, type, title, description]);

  return null;
}
