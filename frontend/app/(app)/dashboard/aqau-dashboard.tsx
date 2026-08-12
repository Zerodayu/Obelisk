import { CohortTrendLines } from "@/components/charts/attainment-charts";
import {
  GapAnalysisBars,
  RootCauseDonut,
} from "@/components/charts/cqi-charts";
import {
  ClusterCompositionDonut,
  FormStatusDonut,
} from "@/components/charts/governance-charts";
import { StudentYearLevelBars } from "@/components/charts/plan-charts";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

/**
 * AQAU dashboard — institution-wide QA oversight. Receives filings, tracks
 * cohorts, and confirms graduation-cluster compilation. Chart inputs mirror
 * the backend schema; sample data until rollup endpoints land.
 */
export function AqauDashboard() {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Institution-wide filing queue</FrameTitle>
            <FrameDescription>
              Form submissions by status across all programs.
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
            <FrameTitle>Cohort tracking oversight</FrameTitle>
            <FrameDescription>
              Longitudinal PLO/CLO attainment by cohort.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <CohortTrendLines />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Graduation-cluster composition</FrameTitle>
            <FrameDescription>
              Archived student statuses in tracked clusters.
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
            <FrameTitle>Student distribution by year level</FrameTitle>
            <FrameDescription>
              Active program students across Y1-Y4.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <StudentYearLevelBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Systemic gap monitoring</FrameTitle>
            <FrameDescription>
              Attained vs target with gap rows per PLO.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <GapAnalysisBars />
            </div>
          </FramePanel>
        </Frame>
        <Frame className="w-full">
          <FrameHeader>
            <FrameTitle>Root-cause distribution</FrameTitle>
            <FrameDescription>
              Repeated 6-category root-cause analysis across gaps.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <div className="h-72">
              <RootCauseDonut />
            </div>
          </FramePanel>
        </Frame>
      </div>
    </section>
  );
}
