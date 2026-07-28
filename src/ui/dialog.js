// ─── useDialog: make an overlay behave like a dialog ─────────────────────────
//
// Every modal in this app was a <div> with `position:fixed` and a dark
// background. That is a picture of a dialog, not a dialog, and a live probe of
// all four of the main ones (session 17) found the same four failures in each:
//
//   | overlay              | role/aria-modal | focus enters | Tab escapes at | Esc |
//   |----------------------|-----------------|--------------|----------------|-----|
//   | ProfileModal         | no              | NO           | step 0         | no  |
//   | Exercise Library     | no              | NO           | step 0         | no  |
//   | Builder smart-build  | no              | yes (autoFocus)| step 11      | no  |
//   | Calendar add-class   | no              | yes (autoFocus)| step 7       | no  |
//
// "Tab escapes at step 0" is the one with teeth. Opening the profile modal left
// focus on the trigger button BEHIND the overlay, so the coach's first Tab
// landed on "Resume building" — a Dashboard control they cannot see, cannot
// know is focused, and can activate with Enter. There were 17 such controls
// behind the profile modal and 50 behind the add-class modal. A keyboard user
// could not tell the modal was modal, and a screen-reader user was never told a
// dialog had opened at all.
//
// This is deliberately a HOOK returning props, not a <Modal> component. The
// seven live overlays have seven quite different inline-styled shells (one is
// full-bleed on mobile, one is 88vh, one scrolls its backdrop) and rewriting
// them into a common component would be a large diff whose risk has nothing to
// do with the defect being fixed. Spreading four props and a ref onto the panel
// each site already has is the small change that does the whole job.
//
// ── Three things that are easy to get wrong here ─────────────────────────────
//
// 1. `onClose` IS A NEW FUNCTION EVERY RENDER. Every call site passes an inline
//    arrow (`onClose={()=>setShowSmart(false)}`). Putting it in the dependency
//    array would re-run the effect on every render, and since the cleanup
//    restores focus to the opener, the modal would yank focus out of itself
//    mid-typing. It is held in a ref and the effect runs exactly once.
//
// 2. autoFocus MUST WIN. Two of these modals `autoFocus` their first input, and
//    that is a better landing spot than the one this hook would pick. React
//    applies autoFocus during commit, so by the time a passive effect runs the
//    input already holds focus — hence "only move focus if it is not already
//    inside", never an unconditional focus().
//
// 3. DIALOGS NEST. The Exercise Library's "Reset to Defaults?" confirm renders
//    INSIDE the library modal. Two independent Escape listeners would close
//    both at once — cancelling the confirm would also throw away the library
//    screen. A module-level stack means only the topmost dialog reacts.

import { useEffect, useRef } from "react";

// `offsetParent` is null for anything `position:fixed`, which is most of a
// modal, so visibility is measured by box size instead.
const FOCUSABLE = [
  "a[href]", "area[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])", "[contenteditable]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusablesIn(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(
    (el) => !el.closest("[inert]") &&
            (el.offsetWidth > 0 || el.offsetHeight > 0) &&
            getComputedStyle(el).visibility !== "hidden");
}

// Topmost-wins. Push order is mount order, and a nested dialog always mounts
// after its parent, so the last entry is the one the user is looking at.
const _open = [];

export function useDialog(onClose, label) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;               // always current, never a dependency

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    // Where focus came from, so it can be given back. Restoring focus is the
    // half of this that is invisible when it works: without it, closing a modal
    // drops focus onto <body> and the next Tab restarts from the top of the page.
    const opener = document.activeElement;
    _open.push(node);

    if (!node.contains(document.activeElement)) {
      const first = focusablesIn(node)[0];
      (first || node).focus();
    }

    const onKey = (e) => {
      if (_open[_open.length - 1] !== node) return;   // a nested dialog owns the keys

      if (e.key === "Escape") {
        e.preventDefault();
        // Capture-phase + stopPropagation so Escape cannot also reach the
        // screen underneath — the Class Runner binds its own keyboard shortcuts.
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;

      // Recomputed per keystroke on purpose: these panels add and remove
      // controls as the coach types (search results, the library's edit mode).
      const list = focusablesIn(node);
      if (!list.length) { e.preventDefault(); node.focus(); return; }
      const first = list[0], last = list[list.length - 1];
      const active = document.activeElement;

      if (!node.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      const i = _open.indexOf(node);
      if (i >= 0) _open.splice(i, 1);
      // Only if the opener is still on the page — a modal whose trigger was
      // unmounted (the Builder re-renders its toolbar) must not throw here.
      if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
    };
  }, []);

  // `tabIndex: -1` makes the panel itself a focus target for the "no focusable
  // children" case; it does NOT put the panel in the tab order.
  return { ref, role: "dialog", "aria-modal": "true", "aria-label": label, tabIndex: -1 };
}
