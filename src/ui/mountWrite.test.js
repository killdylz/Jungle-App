import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as espree from "espree";

// ─── No component may push a SYNCED value to the server on mount ─────────────
//
// 🔴 THE DEFECT THIS EXISTS FOR, stated once in `useAfterMount.js` and shipped
// again six more times in a file nobody could reach. The shape reads as
// obviously correct:
//
//   const [energy, setEnergy] = useState(() => store.getDjEnergy());
//   useEffect(() => { store.saveDjEnergy(energy); }, [energy]);
//
// "Initialise from storage, persist on change." Locally it is harmless — the
// mount pass writes back exactly what it just read. Against Supabase it is data
// loss: on a FRESH DEVICE the initialiser returns the DEFAULT, and the mount
// pass pushes that default over whatever the gym actually had, racing the
// hydrate that would have read the real value.
//
// ── WHY A SOURCE SCAN AND NOT A SWEEP ────────────────────────────────────────
//
// `e2e/mountWrites.spec.js` is the sweep for this, and it is a good one: it
// drives the app and asserts that four keys are absent from a fresh store. It
// cannot see the six that were found here, for a reason no assertion of its can
// fix — `MusicHubScreen` sits behind `FLAGS.music`, which is `false`, so both of
// its mount points are dead and the screen never renders. A sweep can only
// measure what it can reach, and a flagged-off screen is unreachable BY
// CONSTRUCTION. This reads the source instead, so it covers code the product
// cannot currently run, which is exactly where a landmine waits.
//
// It is the generalisation CLAUDE.md draws from `rawValues.spec.js`: a sweep
// whose fixture cannot reach the failing state is a sweep that will pass
// forever. Here the fixture cannot exist at all.
//
// ── WHAT IT FLAGS, AND WHY THAT IS NARROWER THAN "A SAVE IN AN EFFECT" ───────
//
// Only writers that actually PUSH. `saveDraftClass` is a plain localStorage
// write with no `_synced()` and no upsert, so `App.jsx`'s
// `useEffect(() => store.saveDraftClass(...), [stages, ...])` is harmless and
// must not be reported — a scanner that cried about it would be argued with once
// and then deleted. Rather than carry an allowlist that rots, the scan DERIVES
// the dangerous set from `store.js` itself: an exported `save*` whose body
// reaches `_bgUpsert`, `_bgUpsertDelta`, `_bgDelete` or `supabase`.
//
// That also means a writer that GAINS a push later is caught the same day,
// without anyone remembering this file exists.
//
// ⚠️ And only effects whose body is NOTHING BUT such calls. `useAfterMount`'s
// header is explicit that a plain `useEffect` is correct when the effect must
// also do something on mount that is not a write — the skin effect applies CSS
// variables and injects fonts, and those DO belong on mount.

const ROOT = new URL("../..", import.meta.url).pathname;

const parse = (src) => espree.parse(src, {
  ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, loc: true, range: true,
});

function walk(node, fn) {
  if (!node || typeof node.type !== "string") return;
  fn(node);
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "range") continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && walk(c, fn));
    else if (v && typeof v.type === "string") walk(v, fn);
  }
}

function sourceFiles(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { sourceFiles(p, out); continue; }
    if (!/\.(js|jsx)$/.test(e)) continue;
    if (/\.test\.jsx?$/.test(e)) continue;      // this file quotes the offender
    out.push(p);
  }
  return out;
}

const PUSHES = /_bgUpsertDelta|_bgUpsert|_bgDelete|supabase/;

// Exported `save*` functions in store.js that reach the network behind the local
// write. Derived, so the set cannot drift away from the thing it describes.
function syncedWriters(storeSrc) {
  const ast = parse(storeSrc);
  const names = new Set();
  walk(ast, (n) => {
    if (n.type !== "ExportNamedDeclaration") return;
    const d = n.declaration;
    if (!d || d.type !== "FunctionDeclaration" || !d.id) return;
    if (!/^save/.test(d.id.name)) return;
    if (PUSHES.test(storeSrc.slice(d.body.range?.[0] ?? 0, d.body.range?.[1] ?? 0))) names.add(d.id.name);
  });
  return names;
}

const isUseEffect = (callee) =>
  (callee.type === "Identifier" && callee.name === "useEffect") ||
  (callee.type === "MemberExpression" && callee.property?.name === "useEffect");

// `store.saveX(...)` / `saveX(...)` — the callee's final name.
const calleeName = (call) => {
  const c = call.callee;
  if (c.type === "Identifier") return c.name;
  if (c.type === "MemberExpression" && c.property?.type === "Identifier") return c.property.name;
  return null;
};

function mountWrites(files, synced) {
  const hits = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    let ast;
    try { ast = parse(src); }
    catch (err) { hits.push(`${f.replace(ROOT, "")} — UNPARSEABLE: ${err.message}`); continue; }
    walk(ast, (n) => {
      if (n.type !== "CallExpression" || !isUseEffect(n.callee)) return;
      const [fn, deps] = n.arguments;
      // No dep array, or an empty one, is a run-once effect and a different
      // thing entirely — it cannot re-fire, so there is nothing to skip.
      if (!deps || deps.type !== "ArrayExpression" || deps.elements.length === 0) return;
      if (!fn || (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression")) return;
      const body = fn.body;
      if (!body || body.type !== "BlockStatement" || body.body.length === 0) return;

      const calls = body.body.map((st) =>
        st.type === "ExpressionStatement" && st.expression.type === "CallExpression"
          ? calleeName(st.expression) : null);
      if (calls.some((c) => c === null)) return;          // does more than write
      if (!calls.every((c) => synced.has(c))) return;     // local-only writes are fine
      hits.push(`${f.replace(ROOT, "")}:${n.loc.start.line}  ${calls.join(", ")}`);
    });
  }
  return hits;
}

describe("a mount pass never pushes a default over the gym's own value", () => {
  const files = sourceFiles(join(ROOT, "src"));
  const synced = syncedWriters(readFileSync(join(ROOT, "src/lib/store.js"), "utf8"));

  it("🔴 the detector can see the shape that shipped — the positive control", () => {
    // Reconstructed from `MusicHubScreen` as it was, because a scan that matched
    // nothing and a scan that found nothing are indistinguishable from the
    // assertion's side.
    const bad = `
      function MusicHubScreen() {
        const [energy, setEnergy] = React.useState(() => store.getDjEnergy());
        React.useEffect(() => { store.saveDjEnergy(energy); }, [energy]);
        return null;
      }`;
    const found = [];
    walk(parse(bad), (n) => {
      if (n.type !== "CallExpression" || !isUseEffect(n.callee)) return;
      const [fn, deps] = n.arguments;
      if (!deps || deps.type !== "ArrayExpression" || !deps.elements.length) return;
      const st = fn.body.body[0];
      found.push(calleeName(st.expression));
    });
    expect(found, "the detector must find the shape that shipped").toEqual(["saveDjEnergy"]);
    expect(synced.has("saveDjEnergy"), "…and must know that writer reaches the server").toBe(true);
  });

  it("🔴 knows a LOCAL-only writer is not the defect", () => {
    // `saveDraftClass` is a plain localStorage write. App.jsx persists the draft
    // on every change with a raw `useEffect` and that is correct — a scanner
    // that reported it would be argued with once and then deleted.
    expect(synced.has("saveDraftClass"),
      "saveDraftClass does not push, so writing it on mount clobbers nothing").toBe(false);
    expect(synced.has("saveSkinId"),
      "…but saveSkinId does, which is why useAfterMount exists").toBe(true);
  });

  it("🔴 finds the files and the writers at all — an empty scan would pass trivially", () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files.some(f => f.endsWith("music/MusicHubScreen.jsx"))).toBe(true);
    expect(synced.size, "no synced writers found — the store.js scan is broken").toBeGreaterThan(5);
  });

  it("🔴 no component writes a synced value on mount", () => {
    const hits = mountWrites(files, synced);
    // Named in the message, so a failure says WHERE and WHICH writer rather than
    // only that a count moved.
    expect(hits, "use `useAfterMount` (src/ui/useAfterMount.js) for these").toEqual([]);
  });
});
