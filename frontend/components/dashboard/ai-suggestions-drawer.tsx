"use client";

import { useAtomValue } from "jotai";
import { Bot, RefreshCw, SparklesIcon } from "lucide-react";
import { Fragment, useCallback, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toastError } from "@/components/ui/toast";
import { canAccess } from "@/lib/role-access";
import { userAtom } from "@/lib/store/atoms/user";
import {
  type AiRecommendation,
  generateAiRecommendationAction,
  getLatestAiRecommendationAction,
} from "@/server/actions/ai";

/**
 * Floating AI suggestions drawer for dashboards. Opens a bottom-sheet drawer
 * with the latest persisted AI CQI recommendation (`ai_recommendation`,
 * backend `src/v1/ai` → python-server `/analytics/institutional-summary`).
 *
 * The recommendation text is Markdown (LLM output — the python-server's debug
 * stub while `IS_DEBUG_MODE=True`). It is rendered by the minimal converter
 * below into plain HTML elements, styled by the `typeset` classes — no
 * markdown library (see `renderMarkdown`). The "key gaps" block is pure
 * computed rollup data, independent of the LLM.
 */

type DrawerState =
  | { phase: "loading" }
  | { phase: "ready"; recommendation: AiRecommendation | null }
  | { phase: "error"; message: string };

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending review",
  acknowledged: "Acknowledged",
  actioned: "Actioned",
  dismissed: "Dismissed",
};

function scopeLabel(recommendation: AiRecommendation): string | null {
  if (recommendation.period) return recommendation.period.label;
  if (recommendation.term) {
    return `${recommendation.term.schoolYear} ${recommendation.term.semester}`;
  }
  return null;
}

// --- Minimal Markdown → React rendering ------------------------------------
// NOTE: intentionally hand-rolled — no markdown dependency (project decision).
// Covers the subset the python-server's CQI prompt guarantees: `#`–`####`
// headings, paragraphs, `-`/`*` bullets, `1.` ordered lists, `> ` quotes, and
// inline `**bold**` / `*italic*` / `_italic_`. Unknown syntax falls through as
// plain text; `typeset` styles the resulting elements. No raw HTML passes
// through (everything is built as React elements).

type InlineNode = string | { marker: "strong" | "em"; content: string };

const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g;

function parseInline(text: string): InlineNode[] {
  return text
    .split(INLINE_PATTERN)
    .filter((part) => part !== "" && part !== undefined)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return { marker: "strong" as const, content: part.slice(2, -2) };
      }
      if (
        (part.startsWith("*") && part.endsWith("*")) ||
        (part.startsWith("_") && part.endsWith("_"))
      ) {
        if (part.length > 2) {
          return { marker: "em" as const, content: part.slice(1, -1) };
        }
      }
      return part;
    });
}

function renderInline(text: string, keyBase: string): React.ReactNode {
  return parseInline(text).map((node, index) => {
    const key = `${keyBase}-${index}`;
    if (typeof node === "string") return <Fragment key={key}>{node}</Fragment>;
    const content = renderInline(node.content, key);
    if (node.marker === "strong") return <strong key={key}>{content}</strong>;
    return <em key={key}>{content}</em>;
  });
}

function renderMarkdown(markdown: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = markdown.split(/\r?\n/);
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const nextKey = () => `md-${key++}`;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    paragraph = [];
    if (!text) return;
    const nodeKey = nextKey();
    nodes.push(<p key={nodeKey}>{renderInline(text, nodeKey)}</p>);
  };

  const flushList = () => {
    if (!list) return;
    const { ordered, items } = list;
    const nodeKey = nextKey();
    const children = items.map((item, index) => {
      const itemKey = `${nodeKey}-${index}`;
      return <li key={itemKey}>{renderInline(item, itemKey)}</li>;
    });
    list = null;
    nodes.push(
      ordered ? (
        <ol key={nodeKey}>{children}</ol>
      ) : (
        <ul key={nodeKey}>{children}</ul>
      ),
    );
  };

  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const nodeKey = nextKey();
      const content = renderInline(heading[2], nodeKey);
      const level = heading[1].length;
      if (level === 1) nodes.push(<h1 key={nodeKey}>{content}</h1>);
      else if (level === 2) nodes.push(<h2 key={nodeKey}>{content}</h2>);
      else nodes.push(<h3 key={nodeKey}>{content}</h3>);
      continue;
    }

    const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
    const bullet = !ordered ? /^[-*+]\s+(.*)$/.exec(line) : null;
    if (ordered || bullet) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push((ordered ?? bullet)?.[1] ?? "");
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      const nodeKey = nextKey();
      nodes.push(
        <blockquote key={nodeKey}>
          {renderInline(quote[1], nodeKey)}
        </blockquote>,
      );
      continue;
    }

    flushList();
    paragraph.push(line);
  }
  flush();

  return nodes;
}

// --- Drawer ----------------------------------------------------------------

export function AiSuggestionsDrawer() {
  const user = useAtomValue(userAtom);
  const canGenerate = canAccess(user?.role, "generateAiInsights");

  const [state, setState] = useState<DrawerState>({ phase: "loading" });
  const [hasLoaded, setHasLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const result = await getLatestAiRecommendationAction();
    if (result.ok) {
      setState({ phase: "ready", recommendation: result.data });
    } else {
      setState({ phase: "error", message: result.error });
    }
    setHasLoaded(true);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      // Fetch on first open; `hasLoaded` keeps reopening cheap and stable.
      if (open && !hasLoaded && !generating) void load();
    },
    [hasLoaded, generating, load],
  );

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    const result = await generateAiRecommendationAction();
    setGenerating(false);
    if (result.ok) {
      setState({ phase: "ready", recommendation: result.data });
      return;
    }
    // NOTE: no HTTP status crosses the ActionResult boundary, so the toast
    // dedupes on the flow scope instead of a status code.
    toastError({
      scope: "ai-insights-generate",
      title: "Could not generate AI insights",
      description: result.error,
    });
  }, []);

  return (
    <Drawer swipeDirection="right" onOpenChange={handleOpenChange}>
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
            CQI insights generated from your persisted assessment data.
          </DrawerDescription>
        </DrawerHeader>
        <ScrollArea className="m-4 flex-1 overflow-y-auto rounded-lg bg-input/40">
          <div className="w-full typeset typeset-docs p-6 items-center justify-center">
            {state.phase === "loading" ? <LoadingBlock /> : null}
            {state.phase === "error" ? (
              <ErrorBlock message={state.message} onRetry={load} />
            ) : null}
            {state.phase === "ready" ? (
              <ReadyBlock
                recommendation={state.recommendation}
                canGenerate={canGenerate}
                generating={generating}
                onGenerate={handleGenerate}
              />
            ) : null}
          </div>
        </ScrollArea>
        <DrawerFooter className="flex-row justify-center gap-2">
          {canGenerate && state.phase === "ready" ? (
            <Button
              variant="secondary"
              onClick={handleGenerate}
              disabled={generating}
            >
              <RefreshCw className={generating ? "animate-spin" : undefined} />
              {generating ? "Generating…" : "Regenerate"}
            </Button>
          ) : null}
          <DrawerClose render={<Button className="flex-1">Close</Button>} />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

const LoadingBlock = () => (
  <div className="space-y-3" aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading AI insights…</span>
    <Skeleton className="h-5 w-1/3" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-5/6" />
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-4 w-2/3" />
  </div>
);

const ErrorBlock = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => Promise<void>;
}) => (
  <div className="space-y-4 flex flex-col w-full text-sm not-typeset">
    <p className="text-muted-foreground self-center">{message}</p>
    <Button variant="secondary" onClick={onRetry}>
      Try again
    </Button>
  </div>
);

const EmptyBlock = ({
  canGenerate,
  generating,
  onGenerate,
}: {
  canGenerate: boolean;
  generating: boolean;
  onGenerate: () => Promise<void>;
}) => (
  <div className="space-y-4 text-sm not-typeset">
    <p className="text-muted-foreground">
      No AI insight has been generated yet.
    </p>
    <p className="text-muted-foreground">
      {canGenerate
        ? "Generate one to analyse the persisted class records and surface the critical CLO gaps."
        : "Ask a VPAA or system administrator to generate one."}
    </p>
    {canGenerate ? (
      <Button variant="secondary" onClick={onGenerate} disabled={generating}>
        <RefreshCw className={generating ? "animate-spin" : undefined} />
        {generating ? "Generating…" : "Generate insight"}
      </Button>
    ) : null}
  </div>
);

const ReadyBlock = ({
  recommendation,
  canGenerate,
  generating,
  onGenerate,
}: {
  recommendation: AiRecommendation | null;
  canGenerate: boolean;
  generating: boolean;
  onGenerate: () => Promise<void>;
}) => {
  if (!recommendation) {
    return (
      <EmptyBlock
        canGenerate={canGenerate}
        generating={generating}
        onGenerate={onGenerate}
      />
    );
  }

  const label = scopeLabel(recommendation);
  const gaps = recommendation.worstPerformingClos;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 not-typeset">
        {label ? (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {label}
          </span>
        ) : null}
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {STATUS_LABELS[recommendation.status] ?? recommendation.status}
        </span>
        <span className="text-xs text-muted-foreground">
          Generated {new Date(recommendation.generatedAt).toLocaleString()}
        </span>
      </div>

      {renderMarkdown(recommendation.recommendationText)}

      {gaps.length > 0 ? (
        <>
          <h2>Key gaps (computed)</h2>
          <table>
            <thead>
              <tr>
                <th>Level</th>
                <th>Unit</th>
                <th>CLO</th>
                <th>Mean</th>
                <th>Records</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((gap) => (
                <tr key={`${gap.groupName}-${gap.key}-${gap.cloCode}`}>
                  <td>{gap.groupName}</td>
                  <td>{gap.key}</td>
                  <td>{gap.cloCode}</td>
                  <td>{gap.meanAttainmentPct}%</td>
                  <td>{gap.recordCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <p>
        <em>
          AI-generated suggestions — validate against institutional policy
          before acting. Gap figures are computed from persisted attainment data
          (70% institutional floor).
        </em>
      </p>
    </div>
  );
};
