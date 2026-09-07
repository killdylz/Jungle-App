import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as espree from "espree";

// ─── No source comment may render as text on a screen ───────────────────────
//
// 🔴 THE DEFECT THIS EXISTS FOR, and it shipped. `DisplayScreen.jsx` carried
//
//     <span …>BPM</span>  /* a sub-component: no scaleMult in scope, … */
//
// A `/* … */` written in the CHILDREN of a JSX element is not a comment. It is
// text. JSX comments need braces — `{/* … */}` — and without them the author's
// note becomes body copy. So the Room TV's Tempo Guide rendered
//
//     "/* a sub-component: no scaleMult in scope, and the absolute floor is
//      what this needed */"
//
// wrapped over eight lines and straight through the BPM ring, on the biggest
// screen in the gym, in front of paying members. `UI-UX-DIRECTION` §1 ranks that
// surface above every staff screen.
//
// Nothing could catch it. It compiles — it is valid JSX. `lint:crash` resolves
// identifiers, not text. 1290 unit tests and 534 e2e tests passed with it on
// screen; it was found by driving the board and READING what it rendered. This
// is the check that can, and it is cheap: a comment delimiter in a JSXText node
// is never anything but this mistake.
//
// ⚠️ It deliberately does NOT try to judge whether the text "looks like" a
// comment. `/*` or `*/` surviving into a JSXText node is the whole rule; a
// heuristic about prose would have to be argued with every time it ran, and a
// check that has to be argued with gets deleted.

const ROOT = new URL("../..", import.meta.url).pathname;

function sourceFiles(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { sourceFiles(p, out); continue; }
    if (!/\.(js|jsx)$/.test(e)) continue;
    if (/\.test\.jsx?$/.test(e)) continue;   // this file quotes the offender
    out.push(p);
  }
  return out;
}

const parse = (src) => espree.parse(src, {
  ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, loc: true,
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

// Every JSXText node in `src` that carries a comment delimiter, with where it is.
function commentsRenderedAsText(files) {
  const hits = [];
  for (const f of files) {
    let ast;
    try { ast = parse(readFileSync(f, "utf8")); }
    catch (err) { hits.push({ where: `${f} — UNPARSEABLE`, text: err.message }); continue; }
    walk(ast, (n) => {
      if (n.type !== "JSXText") return;
      if (!/\/\*|\*\//.test(n.value)) return;
      hits.push({
        where: `${f.replace(ROOT, "")}:${n.loc.start.line}`,
        text: n.value.trim().slice(0, 120),
      });
    });
  }
  return hits;
}

describe("a source comment never reaches a screen", () => {
  const files = sourceFiles(join(ROOT, "src"));

  it("🔴 the sweep can see the defect at all — the positive control", () => {
    // A scan that matched nothing and a scan that found nothing are
    // indistinguishable from the assertion's side, and this repo has been fooled
    // by exactly that. So the detector is run against the shape that shipped,
    // reconstructed here, BEFORE it is trusted to report zero below.
    const bad = `
      export function TempoGuide() {
        return (
          <div>
            <span>BPM</span>  /* a sub-component: no scaleMult in scope */
          </div>
        );
      }`;
    const ast = parse(bad);
    const found = [];
    walk(ast, (n) => { if (n.type === "JSXText" && /\/\*|\*\//.test(n.value)) found.push(n.value.trim()); });
    expect(found.length, "the detector must find the shape that shipped").toBe(1);
    expect(found[0]).toContain("no scaleMult in scope");

    // …and it must not fire on the CORRECT form, or it would be unusable.
    const good = `export function T() { return (<div>{/* a real JSX comment */}<span>BPM</span></div>); }`;
    const okAst = parse(good);
    const falsePositives = [];
    walk(okAst, (n) => { if (n.type === "JSXText" && /\/\*|\*\//.test(n.value)) falsePositives.push(n.value); });
    expect(falsePositives).toEqual([]);
  });

  it("🔴 finds the files at all — an empty file list would pass trivially", () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files.some(f => f.endsWith("screens/runner/DisplayScreen.jsx"))).toBe(true);
  });

  it("🔴 no comment delimiter survives into rendered text", () => {
    const hits = commentsRenderedAsText(files);
    // Named in the message, so a failure says WHERE rather than only that a
    // count moved.
    expect(hits.map(h => `${h.where}  ${JSON.stringify(h.text)}`)).toEqual([]);
  });
});
