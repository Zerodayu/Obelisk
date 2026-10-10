"use client";

/**
 * Inline anchor shown by a form whose academic context is not set yet — the
 * per-form Program/Term/Class-section selectors were removed in favor of the
 * single dashboard picker (`AcademicContextPicker`), so an empty context
 * disables the form here instead of offering a local dropdown.
 */
export function ContextRequired({
  scope,
  className,
}: {
  scope: "program" | "program-term" | "class-section";
  className?: string;
}) {
  const message =
    scope === "class-section"
      ? "Select a class section in the Academic Context card on the Dashboard."
      : scope === "program-term"
        ? "Select a program and term in the Academic Context card on the Dashboard."
        : "Select a program in the Academic Context card on the Dashboard.";

  return (
    <div
      className={`rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground ${className ?? ""}`}
    >
      {message}
    </div>
  );
}
