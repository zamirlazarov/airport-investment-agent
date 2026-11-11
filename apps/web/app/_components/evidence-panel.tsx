import type { Confidence, DataWindow } from "@core/types";
import type { Evidence } from "@/lib/evidence";
import { cn } from "@/lib/utils";

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high: "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  medium: "border-amber-600/30 bg-amber-600/10 text-amber-800 dark:text-amber-300",
  low: "border-red-600/30 bg-red-600/10 text-red-800 dark:text-red-300",
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2025-08" → "Aug 2025". Falls back to the input when it is not a year-month. */
function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const name = MONTH_NAMES[Number(month) - 1];
  return year !== undefined && name !== undefined ? `${name} ${year}` : yearMonth;
}

function describeWindow(window: DataWindow): string {
  const parts = [
    `Traffic data: ${formatMonth(window.t100From)} – ${formatMonth(window.t100To)}`,
    `Growth: ${window.growthYears[0]} → ${window.growthYears[1]}`,
  ];
  if (window.faaEffectiveDate !== null) {
    parts.push(`FAA records effective ${window.faaEffectiveDate}`);
  }
  return parts.join(" · ");
}

/**
 * The assumptions, confidence and sources behind one answer, taken from the tool results
 * themselves. Shown under every answer that used a tool, whatever the model wrote.
 */
export function EvidencePanel({ evidence }: { readonly evidence: Evidence }) {
  if (evidence.confidence === null) return null;

  return (
    <section
      aria-label="Assumptions and limits"
      className="space-y-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-foreground">Assumptions and limits</h3>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 font-medium",
            CONFIDENCE_STYLE[evidence.confidence],
          )}
        >
          {evidence.confidence} confidence
        </span>
        <span className="text-muted-foreground">from the data tools, not the model</span>
      </div>

      {evidence.confidenceReasons.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-4 text-foreground">
          {evidence.confidenceReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      {evidence.assumptions.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
          {evidence.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      ) : null}

      {evidence.dataWindow !== null ? (
        <p className="text-muted-foreground">{describeWindow(evidence.dataWindow)}</p>
      ) : null}

      {evidence.sources.length > 0 ? (
        <p className="text-muted-foreground">
          Sources:{" "}
          {evidence.sources.map((source, index) => (
            <span key={source.url}>
              {index > 0 ? ", " : null}
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href={source.url}
                rel="noreferrer"
                target="_blank"
              >
                {source.name}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}
