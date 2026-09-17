"use client";

import { Bot, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Floating AI suggestions drawer for dashboards. Opens a bottom-sheet drawer
 * with a typeset-formatted content area ready for AI-generated markdown.
 *
 * Content is currently a placeholder — swap the inner typeset block with
 * real AI suggestions when the backend endpoint lands.
 */
export function AiSuggestionsDrawer() {
  return (
    <Drawer swipeDirection="right">
      <DrawerTrigger
        render={
          <Button variant="secondary">
            <SparklesIcon />
            Ai Insights/Suggestions
          </Button>
        }
      />
      <DrawerContent className="flex w-2xl">
        <DrawerHeader>
          <DrawerTitle className="flex self-center items-center justify-center gap-2">
            <Bot />
            AI Suggestions
          </DrawerTitle>
          <DrawerDescription className="flex items-center justify-center">
            Insights and recommendations based on your current dashboard data.
          </DrawerDescription>
        </DrawerHeader>
        <ScrollArea className="m-4 flex-1 overflow-y-auto rounded-lg bg-input/40">
          <div className="w-full typeset typeset-docs p-6 items-center justify-center">
            <SampleAi />
          </div>
        </ScrollArea>
        <DrawerFooter>
          <DrawerClose render={<Button>Close</Button>} />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

const SampleAi = () => {
  return (
    <span>
      <h1>Dashboard Summary</h1>
      <p>
        AI-powered analysis of your current assessment cycle. All metrics are
        derived from the latest rollup data; flagged items require attention
        before the next deadline.
      </p>

      <h2>Highlights</h2>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Attainment Floor</td>
            <td>12 / 15 CLOs met</td>
            <td>80% compliance — above target</td>
          </tr>
          <tr>
            <td>Pending Reviews</td>
            <td>4 items</td>
            <td>2 CAPA plans + 2 CQI actions overdue</td>
          </tr>
          <tr>
            <td>At-Risk Students</td>
            <td>7 flagged</td>
            <td>CLO scores below 70% threshold</td>
          </tr>
          <tr>
            <td>Upload Status</td>
            <td>3 pending</td>
            <td>Class records awaiting spreadsheet upload</td>
          </tr>
        </tbody>
      </table>

      <h2>CLO Attainment Breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>CLO</th>
            <th>Direct</th>
            <th>Indirect</th>
            <th>Composite</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>CLO-1</td>
            <td>78%</td>
            <td>72%</td>
            <td>76.2%</td>
            <td>Met ✓</td>
          </tr>
          <tr>
            <td>CLO-2</td>
            <td>65%</td>
            <td>58%</td>
            <td>62.9%</td>
            <td>Not Met ✗</td>
          </tr>
          <tr>
            <td>CLO-3</td>
            <td>82%</td>
            <td>80%</td>
            <td>81.4%</td>
            <td>Met ✓</td>
          </tr>
          <tr>
            <td>CLO-4</td>
            <td>71%</td>
            <td>68%</td>
            <td>70.1%</td>
            <td>Met ✓</td>
          </tr>
        </tbody>
      </table>
      <p>
        <em>Composite = Direct × 70% + Indirect × 30%. Floor is ≥ 70%.</em>
      </p>

      <h2>At-Risk Watchlist</h2>
      <table>
        <thead>
          <tr>
            <th>Student</th>
            <th>Section</th>
            <th>CLO</th>
            <th>Score</th>
            <th>Root Cause</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>J. Santos</td>
            <td>BSIT-3A</td>
            <td>CLO-2</td>
            <td>54%</td>
            <td>Assessment Design</td>
          </tr>
          <tr>
            <td>M. Cruz</td>
            <td>BSIT-3A</td>
            <td>CLO-2</td>
            <td>61%</td>
            <td>Student Factors</td>
          </tr>
          <tr>
            <td>A. Reyes</td>
            <td>BSIT-3B</td>
            <td>CLO-4</td>
            <td>66%</td>
            <td>Instruction & Pedagogy</td>
          </tr>
        </tbody>
      </table>
      <p>
        <em>
          Showing 3 of 7 at-risk students. Full list available on the faculty
          dashboard.
        </em>
      </p>

      <h2>Approval Flow Status</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Progress</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>CAR — Term 1, 2025-26</td>
            <td>100%</td>
            <td>Complete</td>
          </tr>
          <tr>
            <td>CQI Action Plan — Q3</td>
            <td>60%</td>
            <td>In progress</td>
          </tr>
          <tr>
            <td>Institutional Report — D1-D5</td>
            <td>30%</td>
            <td>In progress</td>
          </tr>
        </tbody>
      </table>

      <h2>Cohort Trend (Last 4 Terms)</h2>
      <table>
        <thead>
          <tr>
            <th>Term</th>
            <th>T1</th>
            <th>T2</th>
            <th>T3</th>
            <th>T4</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Avg. Attainment</td>
            <td>72%</td>
            <td>75%</td>
            <td>71%</td>
            <td>78%</td>
          </tr>
        </tbody>
      </table>

      <h2>Recommended Actions</h2>
      <ol>
        <li>
          <strong>Escalate CLO-2 gap</strong> — coordinate with the program
          chair on a targeted intervention for the two affected sections.
        </li>
        <li>
          <strong>Follow up on overdue CAPA plans</strong> — nudge assigned
          owners before the end-of-quarter deadline.
        </li>
        <li>
          <strong>Upload class records</strong> — 3 sections still have pending
          spreadsheet uploads for Term 1.
        </li>
        <li>
          <strong>Review at-risk students</strong> — verify that corrective
          feedback has been given to all 7 flagged students.
        </li>
      </ol>

      <h2>AI Insight</h2>
      <blockquote>
        CLO-2 shows a persistent 3-term decline (74% → 71% → 68% → 62.9%). The
        root-cause pattern points to assessment design rather than instruction —
        consider revisiting the rubric alignment with the program's PLO mapping.
      </blockquote>
      <p>
        These suggestions are generated by AI and should be validated against
        institutional policies before acting on them.
      </p>
    </span>
  );
};
