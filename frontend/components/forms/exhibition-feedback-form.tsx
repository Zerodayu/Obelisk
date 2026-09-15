"use client";

import { useCallback, useState } from "react";
import { toast, toastError } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FramePanel,
} from "@/components/reui/frame";
import {
  initCheckForm,
  getCheckForm,
  saveCheckForm,
} from "@/server/actions/check";
import type { CheckFormCode } from "@/server/actions/check";

const FORM_CODE: CheckFormCode = "exhibition_feedback";

interface GuestRow {
  id?: string;
  guestName: string;
  guestAffiliation?: string;
  ploRatings: Record<string, number>;
  overallComments?: string;
}

interface Payload {
  id: string;
  status: string;
  header: {
    exhibitionTitle?: string;
    exhibitionDate?: string;
    venueMode?: string;
    program?: string;
    studentExhibitorsCount?: number;
    guestsCount?: number;
  };
  guests: GuestRow[];
  qualitativeFeedback: string | null;
}

export default function ExhibitionFeedbackForm() {
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [guestRatings, setGuestRatings] = useState<Record<number, string>>({});

  const handleInit = useCallback(async () => {
    setLoading(true);
    try {
      const result = await initCheckForm(FORM_CODE, { programId, termId });
      if (result.ok) {
        const data = await getCheckForm<Payload>(FORM_CODE, result.data.id);
        if (data.ok) {
          setPayload(data.data);
          const ratingsInit: Record<number, string> = {};
          data.data.guests?.forEach((g, i) => {
            ratingsInit[i] = JSON.stringify(g.ploRatings ?? {}, null, 2);
          });
          setGuestRatings(ratingsInit);
        } else {
          toastError({
            title: "Load failed",
            description: data.error,
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
      const guests = payload.guests.map((g, i) => ({
        ...g,
        ploRatings: JSON.parse(guestRatings[i] || "{}"),
      }));
      await saveCheckForm(FORM_CODE, payload.id, {
        guests,
        header: payload.header,
        qualitativeFeedback: payload.qualitativeFeedback,
      });
      toast.create({ title: "Saved successfully", type: "success" });
    } catch {
      toastError({
        title: "Save failed",
        description: "Failed to save form.",
        scope: "check:save",
      });
    } finally {
      setSaving(false);
    }
  }, [payload, guestRatings]);

  function updateHeader<K extends keyof Payload["header"]>(
    key: K,
    value: Payload["header"][K],
  ) {
    setPayload((prev) => {
      if (!prev) return prev;
      return { ...prev, header: { ...prev.header, [key]: value } };
    });
  }

  function addGuestRow() {
    setPayload((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        guests: [
          ...prev.guests,
          {
            guestName: "",
            guestAffiliation: "",
            ploRatings: {},
            overallComments: "",
          },
        ],
      };
    });
    setGuestRatings((prev) => {
      const next = { ...prev };
      const keys = Object.keys(next).map(Number);
      next[Math.max(...keys, -1) + 1] = "{}";
      return next;
    });
  }

  function removeGuestRow(idx: number) {
    setPayload((prev) => {
      if (!prev) return prev;
      return { ...prev, guests: prev.guests.filter((_, i) => i !== idx) };
    });
    setGuestRatings((prev) => {
      const next: Record<number, string> = {};
      const entries = Object.entries(prev).filter(([k]) => Number(k) !== idx);
      entries.forEach(([k, v], i) => {
        next[i] = v;
      });
      return next;
    });
  }

  function updateGuestRating(idx: number, value: string) {
    setGuestRatings((prev) => ({ ...prev, [idx]: value }));
  }

  if (!payload) {
    return (
      <Frame>
        <FrameHeader>
          <FrameTitle>Exhibition Feedback</FrameTitle>
          <FrameDescription>
            F11 — Load an existing form instance.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Program ID</FieldLabel>
              <Input
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                placeholder="program ID"
              />
            </Field>
            <Field>
              <FieldLabel>Term ID</FieldLabel>
              <Input
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
                placeholder="term ID"
              />
            </Field>
          </div>
          <Button
            className="mt-4"
            onClick={handleInit}
            disabled={loading || !programId || !termId}
          >
            {loading ? "Loading…" : "Load Form"}
          </Button>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <div className="space-y-6">
      <Frame>
        <FrameHeader>
          <FrameTitle>Exhibition Feedback</FrameTitle>
          <FrameDescription>F11</FrameDescription>
        </FrameHeader>
        <FramePanel>
          <div className="grid grid-cols-3 gap-4">
            <Field>
              <FieldLabel>Exhibition Title</FieldLabel>
              <Input
                value={payload.header.exhibitionTitle ?? ""}
                onChange={(e) =>
                  updateHeader("exhibitionTitle", e.target.value)
                }
              />
            </Field>
            <Field>
              <FieldLabel>Exhibition Date</FieldLabel>
              <Input
                type="date"
                value={payload.header.exhibitionDate ?? ""}
                onChange={(e) => updateHeader("exhibitionDate", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Venue / Mode</FieldLabel>
              <Input
                value={payload.header.venueMode ?? ""}
                onChange={(e) => updateHeader("venueMode", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Field>
              <FieldLabel>Program</FieldLabel>
              <Input
                value={payload.header.program ?? ""}
                onChange={(e) => updateHeader("program", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Student Exhibitors</FieldLabel>
              <Input
                type="number"
                min="0"
                value={payload.header.studentExhibitorsCount ?? ""}
                onChange={(e) =>
                  updateHeader(
                    "studentExhibitorsCount",
                    Number(e.target.value) || undefined,
                  )
                }
              />
            </Field>
            <Field>
              <FieldLabel>Guests Count</FieldLabel>
              <Input
                type="number"
                min="0"
                value={payload.header.guestsCount ?? ""}
                onChange={(e) =>
                  updateHeader(
                    "guestsCount",
                    Number(e.target.value) || undefined,
                  )
                }
              />
            </Field>
          </div>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Guest Register</FrameTitle>
          <FrameDescription>
            Add each guest and their PLO ratings as JSON.
          </FrameDescription>
        </FrameHeader>
        <FramePanel>
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Guest Name</th>
                <th className="px-3 py-2 text-left font-medium">Affiliation</th>
                <th className="px-3 py-2 text-left font-medium">
                  PLO Ratings (JSON)
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  Overall Comments
                </th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {payload.guests.map((g, i) => (
                <tr key={i} className="border-b">
                  <td className="px-3 py-2">
                    <Input
                      value={g.guestName}
                      onChange={(e) => {
                        const rows = [...payload.guests];
                        rows[i] = { ...rows[i], guestName: e.target.value };
                        setPayload({ ...payload, guests: rows });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={g.guestAffiliation ?? ""}
                      onChange={(e) => {
                        const rows = [...payload.guests];
                        rows[i] = {
                          ...rows[i],
                          guestAffiliation: e.target.value,
                        };
                        setPayload({ ...payload, guests: rows });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={guestRatings[i] ?? "{}"}
                      onChange={(e) => updateGuestRating(i, e.target.value)}
                      placeholder='{"PLO1": 8, "PLO2": 7}'
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={g.overallComments ?? ""}
                      onChange={(e) => {
                        const rows = [...payload.guests];
                        rows[i] = {
                          ...rows[i],
                          overallComments: e.target.value,
                        };
                        setPayload({ ...payload, guests: rows });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeGuestRow(i)}
                      className="text-destructive"
                    >
                      ✕
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            variant="outline"
            size="sm"
            onClick={addGuestRow}
            className="mt-2"
          >
            + Add Row
          </Button>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Qualitative Feedback</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <Textarea
            rows={5}
            value={payload.qualitativeFeedback ?? ""}
            onChange={(e) =>
              setPayload({
                ...payload,
                qualitativeFeedback: e.target.value || null,
              })
            }
            placeholder="General qualitative feedback from guests…"
          />
        </FramePanel>
      </Frame>

      <div className="flex items-center gap-3">
        <Badge
          variant={payload.status === "submitted" ? "default" : "secondary"}
        >
          {payload.status}
        </Badge>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
