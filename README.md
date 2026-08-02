# Jungle

A white-label class operating system for boutique fitness studios. React + Vite + Supabase,
deployed to GitHub Pages.

It is an **experience layer**, not a booking system. Every feature is judged by whether it
improves the life of the **trainer** (plans faster, runs the room without fighting software), the
**owner** (sees who is slipping away, looks premium), or the **member** (walks into a room that
knows them).

```bash
npm install
npm run dev
```

The local build runs with no Supabase credentials: no network, no auth, a fixed PIN (`080921`),
and sync paths that no-op cleanly. That is the build the test suite targets.

## Gates

```bash
npm run lint:crash && npm test && npm run test:e2e && npm run build
```

`lint:crash` must be **0**. It is not the style baseline — the ~215 messages from the full eslint
config are an advisory baseline and are not part of the gate. CI runs the same chain on Linux.

## Where things live

| Path | What it is |
|---|---|
| `SESSION-HANDOFF.md` | What the last **two** sessions shipped, and why. Start here. Older blocks are in `docs/history/HANDOFF-ARCHIVE.md` — keep this file to two. |
| `SESSION-23-PROMPT.md` | The live build prompt: current state, traps, backlog, suggested order. Supersedes every earlier one. |
| `DYLAN-QUEUE.md` | Everything blocked on Dylan — exact dashboard clicks, commands, expected output, undo steps. Delete it when it is empty. |
| `Jungle - Functional, Design & Technical Spec (As-Built).md` | The spec. **§12 is the backlog of record** and supersedes §7c. |
| `docs/` | Audit, legal, GTM, product and UI direction documents. |
| `docs/history/` | Retired session prompts and the handoff archive. **Records, not pointers** — paths and numbers in them were true when written. |
| `e2e/` | Playwright, driving the real UI. The most trustworthy claim in the repo. |
| `src/lib/*.test.js` | Vitest, pinning the arithmetic. |
| `supabase/migrations/` | Applied by hand in the Supabase dashboard, in order. `supabase/SETUP.md` explains. |

## Conventions worth knowing before you change anything

- **Read back the STORED object, not just the rendered one.** Most defects this repo has shipped
  were cases where the two disagreed.
- **Prove a test can fail** — mutate a value, confirm the failure, revert with the inverse
  mutation. Never `git checkout` the file.
- **An honest blank beats a confident wrong guess.** A screen with nothing to say must say so
  rather than show a reassuring zero.
