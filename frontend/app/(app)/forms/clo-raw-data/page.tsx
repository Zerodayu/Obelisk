import { ClassRecordUpload } from "@/components/forms/class-record-upload";
import { ACADEMIC_ROLES } from "@/lib/roles";
import { requireRole } from "@/server/auth";

/**
 * `/forms/clo-raw-data` — primary data-capture form. Faculty author per-student
 * CLO scores (or import a class-record sheet); chairs/deans review. Restricted
 * to academic roles; the backend enforces per-user class-section scope.
 */
export default async function CloRawDataPage() {
  await requireRole(ACADEMIC_ROLES);
  return (
    <div className="px-4 lg:px-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          Per-Student CLO Raw Data
        </h2>
        <p className="text-sm text-muted-foreground">
          Enter or import per-student scores for your class section. At-risk
          flags are computed server-side (any CLO &lt; 70%).
        </p>
      </div>
      <ClassRecordUpload />
    </div>
  );
}
