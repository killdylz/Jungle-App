// ─── One toast, and the app's only undo ──────────────────────────────────────
//
// UI-POLISH §3.1/§3.5. Two things were true before this file:
//
//   1. Saves were SILENT. A coach pressing Done on the plan editor got no
//      acknowledgement at all, so a save and a no-op were indistinguishable —
//      and the way you find out which it was is the next time you open the
//      screen.
//   2. Deletes were IMMEDIATE and there was no undo anywhere in the product. The
//      Exercise Library confirmed deleting ONE exercise while deleting a coach —
//      taking their plans, their movement catalogue and their generation ledger
//      with them — was a single unguarded click. The protection was inverted:
//      the cheapest action was guarded and the most expensive was not.
//
// There were already two ad-hoc toasts in App.jsx (the library's `showToast` and
// the Builder's `distributeToast`). Both were `pointerEvents: "none"` divs on a
// setTimeout, which is fine for "Saved" and structurally incapable of hosting an
// Undo button. Rather than a third, this is the one primitive, and it can carry
// an action.
//
// WHY UNDO RATHER THAN A CONFIRM, mostly. A confirm dialog interrupts every
// time, including the 99 times the coach meant it, and its cost is paid on the
// success path. An undo costs nothing when you meant it and everything back when
// you did not. The exception is the coach delete, which gets BOTH: it is the
// most expensive data in the product — an imported corpus is an LLM pass over a
// real deck — and it is the one deletion a coach cannot reconstruct by hand.
//
// The undo closure holds the PRIOR STATE, captured before the delete. It does
// not re-derive it: `aggregateMovements` rebuilds the catalogue from the plans on
// every recompute, so "restore by recomputing" would quietly drop any manual
// edits on a zero-occurrence row — the exact rows the retention rule in
// aggregateMovements exists to protect.

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { useWindowWidth } from "./primitives.jsx";

// An undoable toast lives much longer than an acknowledgement. 2.5s is enough to
// read "Saved"; it is not enough to notice a mistake, decide, and reach for the
// button — which is the whole point of the mechanism.
const PLAIN_MS = 2500;
const UNDO_MS = 9000;

const ToastContext = createContext({ toast: () => {}, dismissToast: () => {} });

// `toast(message, { undo })`. Returns nothing: a caller that wants to know
// whether the coach undid should put that in the undo callback.
export function useToast() { return useContext(ToastContext); }

export function ToastProvider({ children }) {
  const [current, setCurrent] = useState(null);   // { id, message, undo }
  const timer = useRef(null);
  const vw = useWindowWidth();

  const clear = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  const dismissToast = useCallback(() => { clear(); setCurrent(null); }, [clear]);

  const toast = useCallback((message, opts = {}) => {
    if (!message) return;
    clear();
    // One at a time, newest wins. A stack would need its own layout rules and
    // an answer for "which of these three does Undo apply to", and nothing in
    // this app fires two destructive actions inside nine seconds by design.
    const id = `${Date.now()}-${Math.random()}`;
    setCurrent({ id, message, undo: typeof opts.undo === "function" ? opts.undo : null });
    timer.current = setTimeout(() => setCurrent(null), opts.undo ? UNDO_MS : PLAIN_MS);
  }, [clear]);

  useEffect(() => clear, [clear]);   // never leave a timer behind on unmount

  const compact = vw < 900;         // matches COMPACT_NAV_PX — the bottom bar's band
  const onUndo = () => {
    const fn = current?.undo;
    dismissToast();
    // After the toast is gone, so a throw inside the caller's undo cannot leave
    // a dead toast pinned to the screen.
    if (fn) fn();
  };

  return (
    <ToastContext.Provider value={{ toast, dismissToast }}>
      {children}
      {/*
        aria-live so a change nobody clicked for is still announced (§3.8), and
        role="status" rather than "alert" — an acknowledgement should not
        interrupt what a screen reader is already saying.

        The region is always mounted, even when empty. A live region inserted
        into the DOM at the same moment as its text is frequently NOT announced;
        assistive tech has to be observing the node before the content changes.
      */}
      <div
        data-testid="toast-region"
        role="status"
        aria-live="polite"
        style={{
          position: "fixed", left: 0, right: 0,
          // Clear of the mobile bottom bar (56px + the iOS home indicator), or
          // sitting low on desktop where it cannot cover a screen's own header.
          bottom: compact ? "calc(68px + env(safe-area-inset-bottom, 0px))" : "24px",
          display: "flex", justifyContent: "center",
          padding: "0 12px", zIndex: 900,
          // The empty region must never eat a click meant for the screen.
          pointerEvents: "none",
        }}>
        {current && (
          <div
            data-testid="toast"
            style={{
              pointerEvents: "auto",
              display: "flex", alignItems: "center", gap: "14px",
              maxWidth: "min(520px, 100%)",
              padding: current.undo ? "10px 10px 10px 16px" : "10px 16px",
              background: "var(--card)", color: "var(--text)",
              border: "1px solid var(--border)", borderRadius: "10px",
              boxShadow: "0 6px 24px rgba(0,0,0,0.28)",
              fontSize: "13px", fontWeight: "600", lineHeight: 1.4,
            }}>
            <span style={{ minWidth: 0 }}>{current.message}</span>
            {current.undo && (
              <button
                data-testid="toast-undo"
                onClick={onUndo}
                style={{
                  flexShrink: 0, minHeight: "36px", padding: "0 14px",
                  background: "var(--accent)", color: "var(--on-accent)",
                  border: "none", borderRadius: "7px", cursor: "pointer",
                  fontSize: "12px", fontWeight: "800",
                }}>
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
