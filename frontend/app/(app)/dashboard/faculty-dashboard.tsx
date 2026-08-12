import {
  AttainmentFloorBars,
  CloAttainmentBars,
} from "@/components/charts/attainment-charts";
import {
  AtRiskDonut,
  FormStatusDonut,
} from "@/components/charts/governance-charts";
import {
  ComputationRunBars,
  UploadStatusDonut,
} from "@/components/charts/ingest-charts";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

/**
 * Faculty dashboard — scoped to the faculty member's own class sections and
 * courses for the active term (backend `faculty` role). Sample data only; the
 * chart inputs mirror the backend schema and will swap to rollup endpoints.
 */
export function FacultyDashboard() {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>CLO attainment — active class section</FrameTitle>
            <FrameDescription>
              Direct × 70% + Indirect × 30% composite per CLO.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <CloAttainmentBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Attainment vs the ≥70% floor</FrameTitle>
            <FrameDescription>
              Server-flagged CLOs below threshold render red.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <AttainmentFloorBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>At-risk watchlist</FrameTitle>
            <FrameDescription>
              Any student with a CLO score below 70% is auto-flagged.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <AtRiskDonut />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Course assessment report drafts</FrameTitle>
            <FrameDescription>
              Submission status across the term.
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
            <FrameTitle>Class-record upload status</FrameTitle>
            <FrameDescription>
              Queued / completed / failed upload attempts.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <UploadStatusDonut />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Attainment computation runs</FrameTitle>
            <FrameDescription>
              70/30 computation runs per term.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <ComputationRunBars />
            </div>
          </FramePanel>
        </Frame>
      </div>
    </section>
  );
}
