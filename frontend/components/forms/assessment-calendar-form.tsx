"use client";

import { useCallback, useState } from "react";

import { toast, toastError } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
} from "@/components/reui/frame";
import { initAssessmentCalendar, saveAssessmentCalendar } from "@/server/actions/plan";

interface CalendarEvent {
  id: string;
  section: string;
  templateKey: string;
  periodWeeks: string;
  activity: string;
  cohortYears: number[];
  responsibleParty: string;
  outputForms: string[];
  isTemplate: boolean;
}

interface AssessmentCalendarPayload {
  formSubmissionId: string;
  generatedAt: string;
  header: Record<string, unknown>;
  events: CalendarEvent[];
}

const SECTIONS = [
  { value: "semester1", label: "Semester 1" },
  { value: "annual_and_semester2", label: "Annual & Sem 2" },
  { value: "program_specific", label: "Program-Specific" },
] as const;

export function AssessmentCalendarForm() {
  const [payload, setPayload] = useState<AssessmentCalendarPayload | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!programId.trim() || !termId.trim()) return;
    setLoading(true);
    try {
      const result = await initAssessmentCalendar({
        programId: programId.trim(),
        termId: termId.trim(),
      });
      if (result.ok) {
        const p = result.data.payload as unknown as AssessmentCalendarPayload;
        setPayload(p);
        setEvents(p.events || []);
        toast.create({ title: "Assessment calendar initialized", type: "success" });
      } else {
        toastError({ title: "Init failed", description: result.error, scope: "acal:generate" });
      }
    } finally {
      setLoading(false);
    }
  }, [programId, termId]);

  const handleSave = useCallback(async () => {
    if (!payload?.formSubmissionId) return;
    setSaving(true);
    try {
      const result = await saveAssessmentCalendar(payload.formSubmissionId, {
        events: events.map((e) => ({
          id: e.isTemplate ? undefined : e.id,
          section: e.section,
          templateKey: e.templateKey,
          periodWeeks: e.periodWeeks,
          activity: e.activity,
          cohortYears: e.cohortYears,
          responsibleParty: e.responsibleParty,
          outputForms: e.outputForms,
        })),
      });
      if (result.ok) {
        toast.create({ title: "Calendar saved", type: "success" });
      } else {
        toastError({ title: "Save failed", description: result.error, scope: "acal:save" });
      }
    } finally {
      setSaving(false);
    }
  }, [payload, events]);

  const addProgramEvent = () => {
    setEvents([
      ...events,
      {
        id: `new-${Date.now()}`,
        section: "program_specific",
        templateKey: "",
        periodWeeks: "",
        activity: "",
        cohortYears: [],
        responsibleParty: "",
        outputForms: [],
        isTemplate: false,
      },
    ]);
  };

  const updateEvent = (idx: number, field: string, value: unknown) => {
    const next = [...events];
    next[idx] = { ...next[idx], [field]: value };
    setEvents(next);
  };

  const removeEvent = (idx: number) => {
    setEvents(events.filter((_, i) => i !== idx));
  };

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Initialize Assessment Calendar</FrameTitle>
          <FrameDescription>
            Set up the assessment calendar with 17 template events and add program-specific items.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel>Program ID</FieldLabel>
              <Input value={programId} onChange={(e) => setProgramId(e.target.value)} placeholder="e.g. prog_cs" />
            </Field>
            <Field>
              <FieldLabel>Term ID</FieldLabel>
              <Input value={termId} onChange={(e) => setTermId(e.target.value)} placeholder="e.g. 2025-2-s1" />
            </Field>
            <div className="flex items-end">
              <Button onClick={handleGenerate} disabled={loading || !programId.trim() || !termId.trim()}>
                {loading ? "Initializing..." : "Initialize"}
              </Button>
            </div>
          </div>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <div className="space-y-4">
      {SECTIONS.map((section) => {
        const sectionEvents = events.filter((e) => e.section === section.value);
        return (
          <Frame key={section.value}>
            <FrameHeader>
              <FrameTitle>{section.label}</FrameTitle>
              <FrameDescription>
                {sectionEvents.filter((e) => e.isTemplate).length} templates · {sectionEvents.filter((e) => !e.isTemplate).length} custom
              </FrameDescription>
            </FrameHeader>
            <FramePanel>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-2">Period</th>
                      <th className="py-2 pr-2">Activity</th>
                      <th className="py-2 pr-2">Cohorts</th>
                      <th className="py-2 pr-2">Responsible</th>
                      <th className="py-2 pr-2">Output Forms</th>
                      <th className="py-2 pr-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {sectionEvents.map((event, idx) => {
                      const globalIdx = events.indexOf(event);
                      return (
                        <tr key={event.id} className="border-b last:border-0">
                          <td className="py-1 pr-2">
                            {event.isTemplate ? (
                              <span className="text-xs text-muted-foreground">{event.periodWeeks}</span>
                            ) : (
                              <Input
                                value={event.periodWeeks}
                                onChange={(e) => updateEvent(globalIdx, "periodWeeks", e.target.value)}
                                className="h-8 w-24 text-xs"
                                placeholder="Weeks"
                              />
                            )}
                          </td>
                          <td className="py-1 pr-2">
                            {event.isTemplate ? (
                              <span className="text-xs">{event.activity}</span>
                            ) : (
                              <Input
                                value={event.activity}
                                onChange={(e) => updateEvent(globalIdx, "activity", e.target.value)}
                                className="h-8 text-xs"
                              />
                            )}
                          </td>
                          <td className="py-1 pr-2">
                            <div className="flex gap-1">
                              {[1, 2, 3, 4].map((y) => (
                                <Badge
                                  key={y}
                                  variant={event.cohortYears.includes(y) ? "info" : "outline"}
                                  className="cursor-pointer text-[0.6rem]"
                                  onClick={() => {
                                    if (event.isTemplate) return;
                                    const yrs = event.cohortYears.includes(y)
                                      ? event.cohortYears.filter((yr) => yr !== y)
                                      : [...event.cohortYears, y];
                                    updateEvent(globalIdx, "cohortYears", yrs);
                                  }}
                                >
                                  Y{y}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="py-1 pr-2">
                            {event.isTemplate ? (
                              <span className="text-xs text-muted-foreground">{event.responsibleParty}</span>
                            ) : (
                              <Input
                                value={event.responsibleParty}
                                onChange={(e) => updateEvent(globalIdx, "responsibleParty", e.target.value)}
                                className="h-8 w-32 text-xs"
                              />
                            )}
                          </td>
                          <td className="py-1 pr-2 text-xs text-muted-foreground">
                            {event.outputForms?.join(", ") || "—"}
                          </td>
                          <td className="py-1 pr-2">
                            {!event.isTemplate && (
                              <Button variant="ghost" size="sm" onClick={() => removeEvent(globalIdx)} className="h-8 px-2 text-destructive">
                                ✕
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </FramePanel>
          </Frame>
        );
      })}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={addProgramEvent}>
          + Add Program Event
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setPayload(null); setEvents([]); }}>
          Re-initialize
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
