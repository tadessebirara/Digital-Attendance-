/**
 * LocationAccuracyBadge — shows a colour-coded quality label for a GPS fix.
 *
 * Quality tiers (matches enterprise spec):
 *   Excellent  ≤ 15 m   — green
 *   Good       ≤ 30 m   — blue / teal
 *   Fair       ≤ 75 m   — amber / orange
 *   Poor       ≤ 150 m  — orange / red
 *   Very Poor  > 150 m  — red
 */

import React from "react";

interface Props {
  /** Accuracy in metres as reported by the browser. */
  accuracyM: number;
  /** Extra Tailwind classes for the wrapper span. */
  className?: string;
}

interface Tier {
  label:   string;
  bg:      string;
  text:    string;
  border:  string;
}

function getTier(m: number): Tier {
  if (m <= 15)  return { label: "Excellent", bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" };
  if (m <= 30)  return { label: "Good",      bg: "bg-blue-50 dark:bg-blue-950/30",       text: "text-blue-700 dark:text-blue-300",       border: "border-blue-200 dark:border-blue-800"   };
  if (m <= 75)  return { label: "Fair",      bg: "bg-amber-50 dark:bg-amber-950/30",     text: "text-amber-700 dark:text-amber-300",     border: "border-amber-200 dark:border-amber-800" };
  if (m <= 150) return { label: "Poor",      bg: "bg-orange-50 dark:bg-orange-950/30",   text: "text-orange-700 dark:text-orange-300",   border: "border-orange-200 dark:border-orange-800" };
  return              { label: "Very Poor", bg: "bg-rose-50 dark:bg-rose-950/30",       text: "text-rose-700 dark:text-rose-300",       border: "border-rose-200 dark:border-rose-800"   };
}

export const LocationAccuracyBadge: React.FC<Props> = ({ accuracyM, className = "" }) => {
  const tier = getTier(accuracyM);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide
        ${tier.bg} ${tier.text} ${tier.border} ${className}`}
    >
      ±{Math.round(accuracyM)} m · {tier.label}
    </span>
  );
};

/** Returns just the tier label string (useful for aria-labels etc.). */
export function getAccuracyLabel(m: number): string {
  return getTier(m).label;
}
