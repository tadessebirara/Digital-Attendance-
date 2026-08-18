/**
 * LocationAccuracyIndicator
 *
 * Full live-status panel rendered inside the office dialog while GPS is
 * acquiring / improving, and as a summary once done.
 *
 * Displays:
 *   • A spinner + phase label while locating / improving
 *   • Live "Current ±Xm · Best ±Ym" accuracy history
 *   • A progress bar (0–30 s)
 *   • A quality badge
 *   • Desktop Wi-Fi/IP warning when accuracy stays > 100 m after the first fix
 *   • Cancel button while active
 *   • Error message when phase === "error"
 */

import React from "react";
import { AlertCircle, CheckCircle, Crosshair, Loader2, X } from "lucide-react";
import type { GeolocationState } from "../../hooks/useGeolocation";
import { LocationAccuracyBadge } from "./LocationAccuracyBadge";

const TIMEOUT_SEC = 30;

interface Props extends GeolocationState {
  onCancel: () => void;
}

function phaseLabel(phase: GeolocationState["phase"], bestAccuracy: number | null): string {
  switch (phase) {
    case "locating":   return "Locating your position…";
    case "improving":
      if (bestAccuracy == null) return "Locating your position…";
      if (bestAccuracy <= 15)   return "Excellent accuracy reached";
      if (bestAccuracy <= 30)   return "Good accuracy — almost done…";
      if (bestAccuracy <= 75)   return "Improving…";
      return "Locating…";
    case "done":       return "Location captured";
    case "error":      return "Location error";
    default:           return "";
  }
}

export const LocationAccuracyIndicator: React.FC<Props> = ({
  phase,
  bestFix,
  currentFix,
  errorMsg,
  elapsedSec,
  onCancel,
}) => {
  if (phase === "idle") return null;

  const isActive    = phase === "locating" || phase === "improving";
  const isDone      = phase === "done";
  const isError     = phase === "error";
  const bestAcc     = bestFix?.accuracy ?? null;
  const currentAcc  = currentFix?.accuracy ?? null;

  // Show desktop Wi-Fi/IP warning is now handled by the hook (errorMsg during improving)

  const progressPct = Math.min((elapsedSec / TIMEOUT_SEC) * 100, 100);

  return (
    <div className="mt-2 rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900/60">

      {/* ── Phase header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isActive && (
            <Loader2 size={15} className="animate-spin shrink-0 text-blue-600 dark:text-blue-400" />
          )}
          {isDone && (
            <CheckCircle size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
          {isError && (
            <AlertCircle size={15} className="shrink-0 text-rose-600 dark:text-rose-400" />
          )}
          <span className={`text-xs font-semibold
            ${isError ? "text-rose-700 dark:text-rose-300"
              : isDone ? "text-emerald-700 dark:text-emerald-300"
              : "text-stone-700 dark:text-slate-200"}`}>
            {phaseLabel(phase, bestAcc)}
          </span>
        </div>

        {/* Cancel button — only while active */}
        {isActive && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-100 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <X size={11} />
            Cancel
          </button>
        )}
      </div>

      {/* ── Error message ────────────────────────────────────────────────── */}
      {isError && errorMsg && (
        <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed">{errorMsg}</p>
      )}

      {/* ── HTTPS / IP-location warning (shown during improving phase) ─── */}
      {isActive && errorMsg && !isError && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertCircle size={13} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">{errorMsg}</p>
        </div>
      )}

      {/* ── Accuracy readout (current + best) ───────────────────────────── */}
      {(bestAcc != null || currentAcc != null) && !isError && (
        <div className="flex items-center gap-4 text-xs">
          {currentAcc != null && (
            <div className="flex flex-col gap-0.5">
              <span className="text-stone-400 dark:text-slate-500 uppercase tracking-wide text-[10px] font-semibold">Current</span>
              <span className="font-bold text-stone-700 dark:text-slate-200">±{Math.round(currentAcc)} m</span>
            </div>
          )}
          {bestAcc != null && (
            <div className="flex flex-col gap-0.5">
              <span className="text-stone-400 dark:text-slate-500 uppercase tracking-wide text-[10px] font-semibold">Best</span>
              <span className="font-bold text-stone-700 dark:text-slate-200">±{Math.round(bestAcc)} m</span>
            </div>
          )}
          {bestAcc != null && (
            <LocationAccuracyBadge accuracyM={bestAcc} className="ml-auto" />
          )}
        </div>
      )}

      {/* ── Progress bar (only while active) ────────────────────────────── */}
      {isActive && (
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full bg-stone-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-[10px] text-stone-400 dark:text-slate-500 text-right">
            {elapsedSec}s / {TIMEOUT_SEC}s
          </p>
        </div>
      )}

      {/* ── Done summary ─────────────────────────────────────────────────── */}
      {isDone && bestFix && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
          <Crosshair size={12} className="shrink-0" />
          <span>
            {bestFix.latitude.toFixed(6)}, {bestFix.longitude.toFixed(6)}
          </span>
        </div>
      )}

    </div>
  );
};
