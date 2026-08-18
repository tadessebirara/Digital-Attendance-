/**
 * useGeolocation — enterprise-grade browser geolocation hook.
 *
 * Strategy:
 *   • Uses watchPosition (never getCurrentPosition) so the browser keeps
 *     refining the fix over time.
 *   • Keeps only the best (lowest) accuracy seen so far.
 *   • Stops automatically when accuracy ≤ TARGET_ACCURACY_M or after
 *     TIMEOUT_MS, whichever comes first.
 *   • Exposes a cancel() function so the caller can stop early.
 *   • Always calls clearWatch() on unmount / cancel / stop — no leaks.
 *   • Never fakes or manipulates coordinates; always reports real browser values.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── Constants ────────────────────────────────────────────────────────────────
const TARGET_ACCURACY_M = 15;   // stop early if we reach this
const TIMEOUT_MS        = 30_000; // hard stop after 30 s

// ── Types ─────────────────────────────────────────────────────────────────────

export type GeoPhase =
  | "idle"       // not started
  | "locating"   // first fix not yet received
  | "improving"  // received at least one fix, still refining
  | "done"       // stopped (target reached or timeout) with a valid fix
  | "error";     // permission denied / unavailable / no fix at all

export interface GeoFix {
  latitude:  number;
  longitude: number;
  /** Actual accuracy in metres as reported by the browser — never faked. */
  accuracy:  number;
}

export interface GeolocationState {
  phase:       GeoPhase;
  /** The best fix seen so far (lowest accuracy). Null until first fix arrives. */
  bestFix:     GeoFix | null;
  /** The most recent fix (may be worse than bestFix). Null until first fix. */
  currentFix:  GeoFix | null;
  /** Human-readable error message, set only when phase === "error". */
  errorMsg:    string | null;
  /** Seconds elapsed since start (0–30). Useful for a progress bar. */
  elapsedSec:  number;
}

export interface UseGeolocationReturn extends GeolocationState {
  /** Start or restart the watch. Cancels any in-progress watch first. */
  start:  () => void;
  /** Cancel an in-progress watch immediately. Keeps bestFix intact. */
  cancel: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGeolocation(): UseGeolocationReturn {
  const [state, setState] = useState<GeolocationState>({
    phase:      "idle",
    bestFix:    null,
    currentFix: null,
    errorMsg:   null,
    elapsedSec: 0,
  });

  // Refs — never cause re-renders
  const watchIdRef   = useRef<number | null>(null);
  const timerRef     = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const bestAccRef   = useRef<number>(Infinity);
  const startTimeRef = useRef<number>(0);

  // ── Cleanup helper ───────────────────────────────────────────────────────
  const clearAll = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timerRef.current)    { clearTimeout(timerRef.current);    timerRef.current    = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  // Always clean up on unmount
  useEffect(() => () => clearAll(), [clearAll]);

  // ── Stop helper — finalize with done or error ────────────────────────────
  const stop = useCallback((
    phase: "done" | "error",
    errorMsg?: string,
  ) => {
    clearAll();
    setState(prev => ({ ...prev, phase, errorMsg: errorMsg ?? null }));
  }, [clearAll]);

  // ── Start ────────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        phase:    "error",
        errorMsg: "This browser does not support geolocation.",
      }));
      return;
    }

    // Cancel any existing watch before starting a new one
    clearAll();

    bestAccRef.current   = Infinity;
    startTimeRef.current = Date.now();

    setState({
      phase:      "locating",
      bestFix:    null,
      currentFix: null,
      errorMsg:   null,
      elapsedSec: 0,
    });

    // ── Elapsed-second ticker (for progress UI) ──────────────────────────
    intervalRef.current = setInterval(() => {
      const sec = Math.min(
        Math.floor((Date.now() - startTimeRef.current) / 1000),
        30,
      );
      setState(prev => ({ ...prev, elapsedSec: sec }));
    }, 500);

    // ── watchPosition — the core ─────────────────────────────────────────
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy;
        const fix: GeoFix = {
          latitude:  pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:  acc,
        };

        setState(prev => {
          const isBetter = acc < bestAccRef.current;
          if (isBetter) bestAccRef.current = acc;

          return {
            ...prev,
            phase:      "improving",
            currentFix: fix,
            bestFix:    isBetter ? fix : prev.bestFix,
            // Surface an HTTPS warning if the first fix is coarse (IP-based).
            // This only shows when accuracy > 500m AND we haven't improved yet.
            errorMsg: (isBetter && acc > 500 && prev.bestFix == null)
              ? "Your browser is using IP-based location (±" + Math.round(acc) + " m). " +
                "For real GPS accuracy, open this page over HTTPS or use the mobile app. " +
                "The map pin has been placed at your approximate location — drag it to fine-tune."
              : (isBetter && acc <= 500) ? null   // clear warning once GPS improves
              : prev.errorMsg,
          };
        });

        // Target reached — stop early
        if (acc <= TARGET_ACCURACY_M) {
          stop("done");
        }
      },
      (err) => {
        if (err.code === 1 /* PERMISSION_DENIED */) {
          stop("error",
            "Location permission denied. Click the lock icon in the address bar and allow Location access, then try again.");
        } else if (err.code === 2 /* POSITION_UNAVAILABLE */) {
          if (bestAccRef.current < Infinity) {
            // We already have some fix — use it
            stop("done");
          } else {
            stop("error",
              "Location unavailable. Make sure GPS/Location is enabled on your device.");
          }
        } else {
          // TIMEOUT (code 3) from watchPosition options
          if (bestAccRef.current < Infinity) {
            stop("done");
          } else {
            stop("error",
              "We couldn't obtain a location. The best available location has been selected.");
          }
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge:         0,
        timeout:            30_000,
      },
    );

    // ── Hard 30-second cap ───────────────────────────────────────────────
    timerRef.current = setTimeout(() => {
      if (watchIdRef.current != null) {
        if (bestAccRef.current < Infinity) {
          stop("done");
        } else {
          stop("error",
            "We couldn't obtain a more accurate location. Try the search box or click the map to place the pin manually.");
        }
      }
    }, TIMEOUT_MS);
  }, [clearAll, stop]);

  // ── Cancel (user-initiated) ──────────────────────────────────────────────
  const cancel = useCallback(() => {
    clearAll();
    setState(prev => ({
      ...prev,
      // If we have a fix keep it; just move to done so the UI shows it
      phase:    prev.bestFix ? "done" : "idle",
      errorMsg: null,
    }));
  }, [clearAll]);

  return { ...state, start, cancel };
}
