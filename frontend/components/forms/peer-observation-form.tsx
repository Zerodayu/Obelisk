"use client";

import { useCallback, useState } from "react";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { FormSelect } from "@/components/ui/form-select";
import { Input } from "@/components/ui/input";
import { ProgramSelect } from "@/components/ui/program-select";
import { TermSelect } from "@/components/ui/term-select";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/components/ui/toast";
import type { CheckFormCode } from "@/server/actions/check";
import {
  getCheckForm,
  initCheckForm,
  saveCheckForm,
} from "@/server/actions/check";

const FORM_CODE: CheckFormCode = "peer_observation";

interface Payload {
  id: string;
  status: string;
  header: {
    facultyObserved?: string;
    course?: string;
    observer?: string;
    observationDate?: string;
    timeStart?: string;
    timeEnd?: string;
    sectionYear?: string;
    semesterAyu?: string;
    studentCountPresent?: number;
  };
  criteria: {
    obeSyllabusAlignment?: string;
    bloomsLevel?: string;
    cloAssessmentMapping?: string;
    rubricUse?: string;
    formativeFeedback?: string;
    activeExperientialLearning?: string;
    studentEngagement?: string;
  };
  strengths: string | null;
  areasForImprovement: string | null;
  cqiImplications: string | null;
}

const CRITERIA_OPTIONS: Record<string, { value: string; label: string }[]> = {
  obeSyllabusAlignment: [
    { value: "fully_aligned", label: "Fully Aligned" },
    { value: "partially_aligned", label: "Partially Aligned" },
    { value: "not_aligned", label: "Not Aligned" },
  ],
  bloomsLevel: [
    { value: "appropriate", label: "Appropriate" },
    { value: "below", label: "Below Expected" },
    { value: "above", label: "Above Expected" },
  ],
  cloAssessmentMapping: [
    { value: "clearly_evident", label: "Clearly Evident" },
    { value: "partially_evident", label: "Partially Evident" },
    { value: "not_evident", label: "Not Evident" },
  ],
  rubricUse: [
    { value: "used_aligned", label: "Used & Aligned" },
    { value: "used_not_aligned", label: "Used, Not Aligned" },
    { value: "no_rubric", label: "No Rubric Used" },
  ],
  formativeFeedback: [
    { value: "specific_clo_ref", label: "Specific & CLO-Referenced" },
    { value: "general_only", label: "General Only" },
    { value: "not_observed", label: "Not Observed" },
  ],
  activeExperientialLearning: [
    { value: "yes", label: "Yes" },
    { value: "partially", label: "Partially" },
    { value: "no", label: "No" },
  ],
  studentEngagement: [
    { value: "high", label: "High" },
    { value: "moderate", label: "Moderate" },
    { value: "low", label: "Low" },
  ],
};

const CRITERIA_LABELS: Record<string, string> = {
  obeSyllabusAlignment: "OBE Syllabus Alignment",
  bloomsLevel: "Bloom's Taxonomy Level",
  cloAssessmentMapping: "CLO-Assessment Mapping",
  rubricUse: "Rubric Use",
  formativeFeedback: "Formative Feedback",
  activeExperientialLearning: "Active/Experiential Learning",
  studentEngagement: "Student Engagement",
};

export default function PeerObservationForm() {
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleInit = useCallback(async () => {
    setLoading(true);
    try {
      const result = await initCheckForm(FORM_CODE, { programId, termId });
      if (result.ok) {
        const payloadResult = await getCheckForm<Payload>(
          FORM_CODE,
          result.data.id,
        );
        if (payloadResult.ok) {
          setPayload(payloadResult.data);
          toast.create({ title: "Form initialized", type: "success" });
        } else {
          toastError({
            title: "Load failed",
            description: payloadResult.error,
            scope: "check:load",
          });
        }
      } else {
        toastError({
          title: "Init failed",
          description: result.error,
          scope: "check:init",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [programId, termId]);

  const handleSave = useCallback(async () => {
    if (!payload) return;
    setSaving(true);
    try {
      const result = await saveCheckForm<Payload>(FORM_CODE, payload.id, {
        header: payload.header,
        criteria: payload.criteria,
        strengths: payload.strengths,
        areasForImprovement: payload.areasForImprovement,
        cqiImplications: payload.cqiImplications,
      });
      if (result.ok) {
        setPayload(result.data);
        toast.create({ title: "Saved successfully", type: "success" });
      } else {
        toastError({
          title: "Save failed",
          description: result.error,
          scope: "check:save",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [payload]);

  function updateHeader(field: string, value: string | number | undefined) {
    setPayload((prev) =>
      prev ? { ...prev, header: { ...prev.header, [field]: value } } : prev,
    );
  }

  function updateCriteria(field: string, value: string) {
    setPayload((prev) =>
      prev ? { ...prev, criteria: { ...prev.criteria, [field]: value } } : prev,
    );
  }

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Initialize Peer Observation</FrameTitle>
        </FrameHeader>
        <FramePanel className="space-y-4">
          <Field>
            <FieldLabel>Program</FieldLabel>
            <ProgramSelect value={programId} onValueChange={setProgramId} />
          </Field>
          <Field>
            <FieldLabel>Term</FieldLabel>
            <TermSelect value={termId} onValueChange={setTermId} />
          </Field>
          <Button
            onClick={handleInit}
            disabled={loading || !programId || !termId}
          >
            {loading ? "Initializing..." : "Initialize"}
          </Button>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <div className="space-y-6">
      <Frame>
        <FrameHeader>
          <FrameTitle>Observation Details</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <div className="grid grid-cols-3 gap-4">
            <Field>
              <FieldLabel>Faculty Observed</FieldLabel>
              <Input
                value={payload.header.facultyObserved ?? ""}
                onChange={(e) =>
                  updateHeader("facultyObserved", e.target.value)
                }
              />
            </Field>
            <Field>
              <FieldLabel>Course</FieldLabel>
              <Input
                value={payload.header.course ?? ""}
                onChange={(e) => updateHeader("course", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Observer</FieldLabel>
              <Input
                value={payload.header.observer ?? ""}
                onChange={(e) => updateHeader("observer", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Observation Date</FieldLabel>
              <Input
                type="date"
                value={payload.header.observationDate ?? ""}
                onChange={(e) =>
                  updateHeader("observationDate", e.target.value)
                }
              />
            </Field>
            <Field>
              <FieldLabel>Time Start</FieldLabel>
              <Input
                type="time"
                value={payload.header.timeStart ?? ""}
                onChange={(e) => updateHeader("timeStart", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Time End</FieldLabel>
              <Input
                type="time"
                value={payload.header.timeEnd ?? ""}
                onChange={(e) => updateHeader("timeEnd", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Section/Year</FieldLabel>
              <Input
                value={payload.header.sectionYear ?? ""}
                onChange={(e) => updateHeader("sectionYear", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Semester/AY</FieldLabel>
              <Input
                value={payload.header.semesterAyu ?? ""}
                onChange={(e) => updateHeader("semesterAyu", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Students Present</FieldLabel>
              <Input
                type="number"
                value={payload.header.studentCountPresent ?? ""}
                onChange={(e) =>
                  updateHeader(
                    "studentCountPresent",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              />
            </Field>
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Criteria Assessment</FrameTitle>
        </FrameHeader>
        <FramePanel className="space-y-4">
          {(
            Object.keys(CRITERIA_OPTIONS) as (keyof typeof CRITERIA_OPTIONS)[]
          ).map((key) => (
            <Field key={key}>
              <FieldLabel>{CRITERIA_LABELS[key]}</FieldLabel>
              <FormSelect
                value={
                  (payload.criteria as Record<string, string | undefined>)[
                    key
                  ] ?? ""
                }
                onValueChange={(v) => updateCriteria(key, v)}
                options={CRITERIA_OPTIONS[key]}
                placeholder="Select…"
                className="w-full"
              />
            </Field>
          ))}
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Observation Notes</FrameTitle>
        </FrameHeader>
        <FramePanel className="space-y-4">
          <Field>
            <FieldLabel>Strengths</FieldLabel>
            <Textarea
              rows={3}
              value={payload.strengths ?? ""}
              onChange={(e) =>
                setPayload((prev) =>
                  prev ? { ...prev, strengths: e.target.value || null } : prev,
                )
              }
            />
          </Field>
          <Field>
            <FieldLabel>Areas for Improvement</FieldLabel>
            <Textarea
              rows={3}
              value={payload.areasForImprovement ?? ""}
              onChange={(e) =>
                setPayload((prev) =>
                  prev
                    ? { ...prev, areasForImprovement: e.target.value || null }
                    : prev,
                )
              }
            />
          </Field>
          <Field>
            <FieldLabel>CQI Implications</FieldLabel>
            <Textarea
              rows={3}
              value={payload.cqiImplications ?? ""}
              onChange={(e) =>
                setPayload((prev) =>
                  prev
                    ? { ...prev, cqiImplications: e.target.value || null }
                    : prev,
                )
              }
            />
          </Field>
        </FramePanel>
      </Frame>

      <div className="flex items-center gap-4">
        <Badge>{payload.status}</Badge>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
