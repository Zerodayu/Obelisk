import { RoleRequestsPanel } from "@/components/auth/role-requests-panel";
import {
  AuditActivityBars,
  ClusterCompositionDonut,
  ClusterStatusDonut,
  ExportFormatBars,
  FormStatusDonut,
  FormTypeStageBars,
  RecommendationDonut,
  UserRoleBars,
} from "@/components/charts/governance-charts";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

/**
 * System Admin dashboard — full platform visibility plus admin operations
 * (role assignment, user provisioning, archival confirmation). Chart inputs
 * mirror the backend schema; sample data until rollup endpoints land.
 */
export function SystemAdminDashboard() {
  return (
    <section className="space-y-6">
      <RoleRequestsPanel />
      <div className="grid gap-4 sm:grid-cols-2">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>System-wide audit activity</FrameTitle>
            <FrameDescription>Audit-log events per module.</FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <AuditActivityBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Submission volume by status</FrameTitle>
            <FrameDescription>
              All form submissions across the platform.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <FormStatusDonut />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Graduation-cluster confirmation</FrameTitle>
            <FrameDescription>
              Archived cluster composition by student status.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <ClusterCompositionDonut />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>AI recommendation review</FrameTitle>
            <FrameDescription>
              Status of system-generated recommendations awaiting review.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <RecommendationDonut />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Report exports by format</FrameTitle>
            <FrameDescription>
              PDF / Excel / Word exports across the platform.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <ExportFormatBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Form catalog by PDCA stage</FrameTitle>
            <FrameDescription>
              The 28 WIN-OBE form types across PLAN/DO/CHECK/ACT.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <FormTypeStageBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Platform users by role</FrameTitle>
            <FrameDescription>
              User distribution across the approval chain.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <UserRoleBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Graduation-cluster lifecycle</FrameTitle>
            <FrameDescription>
              Open / compiling / archived clusters.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <ClusterStatusDonut />
            </div>
          </FramePanel>
        </Frame>
      </div>
    </section>
  );
}
