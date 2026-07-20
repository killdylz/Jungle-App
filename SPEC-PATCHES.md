# SPEC-PATCHES — mechanical edits to `Jungle - Functional, Design & Technical Spec (As-Built).md`

> ## ✅ APPLIED 2026-07-20. This file is now history — do not re-apply.
>
> All ten patches are in the spec. **They could not be applied literally**, and that is the thing
> worth knowing if you are comparing the two files: the patches were written on 2026-07-19,
> *before* the pilot-prep pass shipped, so several described a present tense that had since become
> false. Applying them verbatim would have written stale claims into the spec on purpose. Where
> that happened, the *intent* was applied against the code as it actually is:
>
> | # | Written 2026-07-19 | Applied as |
> |---|---|---|
> | 1 | Append the white-label leaks to F6 as an open Gap ("delete the quote once fixed") | The leaks **are** fixed — recorded as resolved, and the b64 attendee view it mentions was deleted, not flagged off |
> | 2 | P7: "fonts load from CDN and no service worker exists" | Both untrue now — the **PWA shipped**. P7 rewritten to be blocked only on the physical soak |
> | 5 | Replace the §11 examples table with a pointer | Done, plus: the U1 pass **shipped**, so the table of offending strings would itself have read as a lie |
> | 6 | Re-rank the "Now" tables | Done, with ✅ marks for what shipped and 0008 recorded as **applied** |
> | 10 | Line count → "~9,450 and shrinking" | The real count is **~8,780**. Used the measured number |
>
> Two things were found while applying, neither of them in the patch list:
> - **The spec was mojibake-corrupted** across §9–§13 — 77 sequences (`â€"` for `—`, `âœ…` for
>   `✅`, `Â§` for `§`, `Â·`, `Ã—`, `ðŸŸ¡`), from an earlier session writing UTF-8 through a
>   CP1252 round-trip. Repaired in the same pass; a scan of every root `.md` is now clean.
> - **The bundle is 606 KB / 170 KB gzip, measured** — it did *not* shrink to the 598 KB claimed
>   in the handoff. Recorded as measured, with the discrepancy noted rather than smoothed over.

_Fable audit, 2026-07-19. Apply as literal replace/insert operations. The Fable verdict doc
stays unedited (dated artifact); where it has aged is recorded here and in TECH-PLAN §1._

1. **§2 F6 (white-label) — append to the Gap paragraph:**
   > "Also violated in-app: the footer `© Dylan Rodrigues` on every screen (App.jsx:9448), the
   > `jungle-app` browser title + Vite favicon (index.html), and runtime Google-Fonts loading —
   > see AUDIT-FINDINGS 1.2. Fixed in the pilot-prep pass." *(delete the quote once fixed)*

2. **§3 P7 row** — replace state `🟡` note with:
   > "Blocked by design today: fonts load from CDN and no service worker exists, so a cold
   > display without network does NOT survive. Becomes ✅ only when the PWA ships AND the
   > physical gym soak test (REGRESSION-PLAN §4) passes."

3. **§4.5/§12 structural-debt items** — reword I7 from "Music quarantine + MusicProvider" to:
   > "I7 — Music: **cut from the sellable product** (licensing + zero argued value to the three
   > lives). Quarantined behind `FLAGS.music` in `src/music/`; `MusicProvider` will not be
   > built. TempoGuide survives as the only rhythm feature. Deleting the quarantine is a
   > post-pilot decision."
   Mark I8's Spotify-token item "resolved by feature removal for v1".

4. **§10 platform table** — delete the Tauri and React Native rows; append:
   > "BLE (N7), if ever needed, forces a wrapper because iOS has no Web Bluetooth — that wrapper
   > is **Capacitor with a BLE plugin around the same build**, never a rewrite. React Native is
   > removed from the roadmap."

5. **§11** — replace the examples table with a pointer:
   > "The complete replacement copy is maintained in `UI-UX-DIRECTION.md` §4 and is the
   > authoritative U1 worklist."

6. **§12 "Now" tables** — re-rank to match WEEK-PLAN: mobile layout (new item, top), PWA (P1),
   U1, D3 cold start, **N4 (moved up from 'Next' — it is now core, see PRODUCT-DIRECTION §5)**,
   I5, M1. Move F4-QR from "Next" to "Deferred — design in LEGAL-AND-SECURITY §4". Add to
   Deferred: "Templates screen + Glossary retired (AUDIT 2.3)".

7. **§13** — mark Q9 settled: "member surface = magic link, no store presence; Capacitor only if
   BLE ever ships (Q10 folds into this — no cheap spike needed, the answer no longer forces a
   rewrite)." Mark Q11 answered: "presets are scaffolding shown only at zero-corpus cold start
   and always editable — Jungle's opinion never overwrites a derived or edited shape."

8. **§14** — replace 14.2's open questions with the resolved framing (gym = organisation,
   Jungle = data intermediary; DPO/breach/DNC specifics) referencing `LEGAL-AND-SECURITY.md`;
   replace 14.4's "does not yet contain" list with pointers to `GTM-SINGAPORE.md` (pricing,
   market, unit economics, first-gym arrangement) and mark each number's confidence tag as
   recorded there. Delete "MHMDA-shaped" in §4.1's consent_records note → "consent ledger,
   PDPA-first; scopes graduated".

9. **§1 table, phase 2 row** — append: "At-risk N3 is now live UI (0008 pending apply);
   'waiting on volume' is the correct description for N2 only."

10. **Global:** update the App.jsx line count wherever stated (~8,090/9,200) to "~9,450 and
    shrinking via the decomposition stages (AUDIT-FINDINGS 3.1)".
