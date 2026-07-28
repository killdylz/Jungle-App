// ─── The gym's catalogue, as every surface should read it (DEC-16) ───────────
//
// `libraryStore.js` holds the pure merge/diff rules; `store.js` holds the
// persistence. This is the three-line seam between them, and it exists as its
// own module for one reason: it used to live inside App.jsx, so App was the only
// file that could see a gym's edits. Every other surface imported
// `WORKOUT_LIBRARY` — the BUILT-IN catalogue — directly.
//
// That is what made DEC-16 a decision rather than a feature. `libraryStore.js`
// has always been able to carry a class type the built-in catalogue lacks (a key
// absent from the base is stored whole), so the storage for a gym-authored type
// was finished. But the Builder's class dropdown, `applyTemplate`,
// `smartPickClass`, the smart-build template list and the App root's initial
// `classChoice` all read the built-in constant, so a gym-authored type would
// have appeared in the Library modal and NOWHERE ELSE. The Library modal even
// shipped a "+ New class type" button, which session 15 deleted precisely
// because it was a control that did nothing.
//
// Dylan answered yes in session 18, so the reads move here and the button comes
// back.
//
// ── Why this is a function call and not a module constant ────────────────────
//
// The merged catalogue cannot be computed once at import time: it depends on
// localStorage, which changes while the app is running (a coach edits the
// library, then opens the Builder). Callers read it per render. `mergeLibrary`
// is pure and shallow — object spreads over ~10 class types — so this is cheap
// enough to call in a render body, and doing so is what makes an edit in the
// Library modal visible in the Builder without any cross-component plumbing.

import { WORKOUT_LIBRARY } from "../data/library.js";
import { mergeLibrary, diffLibrary } from "./libraryStore.js";
import * as store from "./store.js";

// Built-in catalogue + this gym's delta. Falls back to the built-in on any
// storage or parse failure: a coach with a corrupt override still gets a
// working Builder rather than an empty dropdown.
export function getLibrary() {
  try {
    return mergeLibrary(WORKOUT_LIBRARY, store.getLibraryCustom());
  } catch (_) { /* fall through to the built-in */ }
  return WORKOUT_LIBRARY;
}

export function saveLibrary(data) {
  const delta = diffLibrary(WORKOUT_LIBRARY, data);
  // A coach who edits something and then edits it back is not a customised gym.
  // Dropping the row rather than storing an empty delta is what stops them being
  // frozen out of future catalogue improvements for a change they undid.
  if (delta) store.saveLibraryCustom(delta);
  else store.resetLibraryCustom();
}

export function resetLibrary() {
  store.resetLibraryCustom();
}

// The built-in catalogue, unmerged. Only `resetLibrary`'s caller should want
// this — "reset to defaults" means the BUILT-IN defaults, not the gym's current
// state, so reading it through `getLibrary()` there would reset to nothing.
export { WORKOUT_LIBRARY as BUILT_IN_LIBRARY };

// A key for a gym-authored class type. Prefixed so it can never collide with a
// built-in key, which matters because `mergeLibrary` treats a key the built-in
// lacks as gym-owned and stores it WHOLE — a collision would silently turn a
// gym's type into an override of a built-in one.
export function newClassTypeKey(label) {
  const slug = String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `gym-${slug || "class"}-${Date.now().toString(36)}`;
}

// The shape a class type has to have for every consumer to survive it. Written
// once here rather than at the call site, because a gym-authored type missing
// `subTypes` would crash the Builder's dropdown on the next render.
export function makeClassType(label) {
  const name = String(label || "").trim() || "New class";
  return {
    label: name,
    icon: "⭐",
    color: "var(--accent)",
    subTypes: {
      general: { label: "General", warmup: [], main: [], cooldown: [] },
    },
  };
}
