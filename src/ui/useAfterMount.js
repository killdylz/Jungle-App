// ─── useAfterMount: a persist-on-change effect that does NOT persist on mount ──
//
// The pattern this replaces is everywhere in this app and reads as obviously
// correct:
//
//   const [gymBranding, setGymBranding] = useState(() => store.getGymBranding());
//   useEffect(() => { store.saveGymBranding(gymBranding); }, [gymBranding]);
//
// "Initialise from storage, persist on change." Locally it is harmless — the
// mount pass writes back exactly what it just read. Against Supabase it is a
// data-loss bug, and a racy one.
//
// `store.connect()` runs during the App root's render, so `_synced()` is already
// true by the time effects run. On a FRESH DEVICE — a new browser, a cleared
// profile, the studio's second iPad — localStorage is empty, so the initialisers
// return the DEFAULTS: skin `"canopy"`, branding `{}`. The mount pass then
// pushes those defaults to `brand_profiles` for the whole gym. `hydrateAll()`
// fires its SELECT from a sibling effect at roughly the same moment, so whether
// it reads the studio's real branding or the defaults that just overwrote it
// depends on which request the network happens to finish first.
//
// The gym's logo, name, colours and chosen skin are what is at stake, and the
// failure is intermittent — the worst possible shape to debug from a bug report.
//
// The I3 guards in store.js do not cover this. `_blobStale` re-pushes local when
// the last write FAILED; here the write SUCCEEDS. That is the whole problem.
//
// The fix already existed in this repo, in exactly one place. CalendarScreen has
// carried it since F5 with a comment naming this hazard — "Skip the initial
// mount so we never push stale/empty local over server data before hydrate
// reconciles" — as a hand-rolled ref. Six other effects had the same shape and
// no guard, because an effect that writes on mount renders nothing, announces
// nothing and is reachable by no click: every sweep this repo has run looks at
// markup, so none of them could see it.
//
// Skipping the mount write is safe by construction: the state was initialised
// FROM storage, so the write it skips is the one that would have written the
// value back unchanged.
//
// Use a plain `useEffect` when the effect must also do something on mount that
// is not a write — the skin effect in App.jsx applies CSS variables and injects
// fonts, and those DO belong on mount, so it stays split in two.
//
// ── Why this counts VALUES and not mounts ────────────────────────────────────
//
// The obvious implementation is a "have I mounted yet" ref:
//
//   const mounted = useRef(false);
//   useEffect(() => {
//     if (!mounted.current) { mounted.current = true; return; }
//     fn();
//   }, deps);
//
// That is what CalendarScreen carried, and it is WRONG under `<StrictMode>`,
// which this app renders inside (src/main.jsx). StrictMode deliberately mounts,
// unmounts and remounts in development to surface effects that are not
// idempotent. The ref belongs to the fiber and survives that cycle, so the
// second pass reads `mounted.current === true` and performs exactly the write
// the guard exists to prevent. It was written, run, and caught by
// e2e/mountWrites.spec.js failing on all four keys.
//
// The failure mode that makes is worse than no guard: StrictMode is
// development-only, so the naive version works in production and fails in dev —
// a guard whose correctness cannot be observed by the tests that run against it.
//
// So the question asked here is "has this value actually CHANGED since first
// render?", not "how many times have I run?". A remount replays the same deps,
// so it is skipped either way, and the hook behaves the same in dev and prod.
//
// `armed` latches on the first real change, because otherwise a value edited
// from A to B and back to A would compare equal to its initial state and
// silently drop a write the coach had made.

import { useEffect, useRef } from "react";

export function useAfterMount(fn, deps) {
  const initial = useRef(null);
  const armed = useRef(false);
  if (initial.current === null) initial.current = deps;

  useEffect(() => {
    if (!armed.current) {
      const first = initial.current;
      const unchanged = first.length === deps.length &&
                        first.every((d, i) => Object.is(d, deps[i]));
      if (unchanged) return undefined;
      armed.current = true;
    }
    return fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
