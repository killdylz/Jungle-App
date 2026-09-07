// ─── Which store fields can the product actually write? (S31 §2.2) ──────────
//
// 🔴 WHY THIS EXISTS. Session 30 shipped `updateCoach` accepting five keys while
// the app passed exactly one. `name`, `userId`, `active` and `aliases` could only
// be set by editing localStorage by hand, and every gate stayed green — because a
// field nothing writes breaks nothing. No test can notice an absence; this can.
//
// It reports, for each patch-shaped writer in `store.js`, the keys the writer
// ACCEPTS and the keys any call site under `src/` (excluding tests and the store
// itself) actually PASSES. The difference is the answer.
//
// ⚠️ THIS IS AN AUDIT, NOT A VERDICT. A key with no writer is not automatically a
// defect: import paths, seeds and migrations legitimately write fields no control
// touches. Read the output and decide case by case. `storeWriters.test.js` pins
// only the rule that actually generalised.
//
// ⚠️ WHAT IT CANNOT SEE, stated so the output is not over-trusted:
//   · a call passing a spread (`{ ...draft }`) — the keys are not literal, so the
//     writer is recorded as OPAQUE and its accepted keys are not claimed missing.
//   · `save*(list)` writers that take a whole object or array rather than a patch.
//     They are listed separately as unchecked, rather than silently omitted.
//   · a field written only through `saveX(wholeList)` after being built inline.
// Every one of those is a reason to read the report rather than trust a count.

// ─── The three that are supposed to be here ─────────────────────────────────
//
// 🔴 WHY THIS LIVES IN THE SCRIPT NOW. Every run printed three `🔴 NO WRITER`
// lines and all three were documented, reasoned, permanent seams — the triage
// was written up in `docs/STORE-WRITER-AUDIT.md` and then had to be re-read from
// scratch every time somebody ran the script. A red flag that is always wrong is
// not a weak signal; it is an ignored one, and after enough runs "the same three
// as always" becomes indistinguishable from a regression hiding among them.
//
// ⚠️ ADDING A LINE HERE IS A PRODUCT DECISION, NOT A WAY TO GREEN THE BUILD.
// Each entry asserts "nothing in `src/` can set this field, and that is correct".
// It is not a suppression: the audit still FINDS these keys — they stay in
// `writers[].missing` — and `storeWriters.test.js` uses exactly that to prove the
// sweep still works. The allowlist IS the positive control, so an entry that
// stops being found fails the suite rather than quietly shrinking the check.
//
// Exported so the script and the test cannot disagree about what is accepted;
// the prose is the whole point and belongs where the flag is raised.
export const KNOWN_SEAMS = {
  "addCoach.id":
    "caller-supplies-id seam (`extra.id || newId()`), used by tests and seeds. No gym types a coach's internal id.",
  "addMember.externalRef":
    "API symmetry with updateMember. The FIELD has a writer — the CSV import builds the member row directly and `applyAttendanceImport` stores it — just not through this function.",
  "updateMember.externalRef":
    "Deliberately not hand-editable. The roster form edits the four things a human knows (name, email, joined, status); an external reference is another system's key, and a hand-typed one that does not match that system is a confident wrong answer where a blank was merely empty. Its writer is the CSV import.",
};

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as espree from "espree";

const ROOT = new URL("..", import.meta.url).pathname;
const STORE = join(ROOT, "src/lib/store.js");

const parse = (src) => espree.parse(src, {
  ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, loc: true,
});

function walk(node, fn, parent = null) {
  if (!node || typeof node.type !== "string") return;
  fn(node, parent);
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "range" || k === "parent") continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && walk(c, fn, node));
    else if (v && typeof v.type === "string") walk(v, fn, node);
  }
}

function jsFiles(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { jsFiles(p, out); continue; }
    if (!/\.(js|jsx)$/.test(e)) continue;
    if (/\.test\.jsx?$/.test(e)) continue;
    out.push(p);
  }
  return out;
}

// ── 1. What each writer ACCEPTS ─────────────────────────────────────────────
// A "patch-shaped" writer is one whose last parameter is an object the caller
// fills in — `patch` or `extra` by this repo's convention. Accepted keys are read
// from `"k" in patch`, `patch.k` and destructuring of that parameter.
const storeSrc = readFileSync(STORE, "utf8");
const storeAst = parse(storeSrc);
const writers = new Map();   // name -> { keys:Set, param, line }
const wholeObjWriters = [];  // name -> takes a list/object, not a patch

for (const node of storeAst.body) {
  const fn = node.type === "ExportNamedDeclaration" && node.declaration?.type === "FunctionDeclaration"
    ? node.declaration : null;
  if (!fn || !fn.id) continue;
  const name = fn.id.name;
  if (!/^(update|add|save|set|apply)/.test(name)) continue;

  const patchParam = fn.params.find(p =>
    (p.type === "AssignmentPattern" && p.left.type === "Identifier" && /^(patch|extra|opts|options)$/.test(p.left.name))
    || (p.type === "Identifier" && /^(patch|extra|opts|options)$/.test(p.name)));

  if (!patchParam) {
    wholeObjWriters.push({ name, line: fn.loc.start.line,
      params: fn.params.map(p => p.type === "Identifier" ? p.name
        : p.type === "AssignmentPattern" ? p.left.name : p.type) });
    continue;
  }
  const pname = patchParam.type === "AssignmentPattern" ? patchParam.left.name : patchParam.name;
  const keys = new Set();
  walk(fn.body, (n) => {
    // `"k" in patch`
    if (n.type === "BinaryExpression" && n.operator === "in"
        && n.right.type === "Identifier" && n.right.name === pname
        && n.left.type === "Literal") keys.add(String(n.left.value));
    // `patch.k`
    if (n.type === "MemberExpression" && !n.computed
        && n.object.type === "Identifier" && n.object.name === pname
        && n.property.type === "Identifier") keys.add(n.property.name);
  });
  writers.set(name, { keys, param: pname, line: fn.loc.start.line });
}

// ── 2. What the app PASSES ──────────────────────────────────────────────────
//
// A call rarely passes a literal. `updateCoach(id, patch)` builds `patch` two
// lines up, and `patch` is built by `coachEditPatch()` in another file. So the
// keys are resolved through two hops before a writer is called opaque:
//
//   1. `const patch = { a, b }`        → the literal's keys, in the same file.
//   2. `const patch = makePatch(...)`  → the keys of the object `makePatch`
//                                        RETURNS, if it is defined in src/.
//
// Anything deeper stays OPAQUE and is reported as unresolved rather than
// missing. Guessing in the other direction is what made this script's first run
// report §2.1's brand-new edit form as four fields with no control.

// name -> Set(keys) for every `function f(){ return { ... } }` in src/.
const returnedKeys = new Map();
function collectReturnShapes(ast) {
  walk(ast, (n) => {
    const isFn = n.type === "FunctionDeclaration" || n.type === "FunctionExpression"
              || n.type === "ArrowFunctionExpression";
    if (!isFn) return;
    const name = n.id?.name;
    if (!name) return;
    const keys = new Set();
    walk(n.body, (r) => {
      if (r.type !== "ReturnStatement" || r.argument?.type !== "ObjectExpression") return;
      for (const p of r.argument.properties) {
        if (p.type === "SpreadElement") { keys.add("…spread"); continue; }
        const k = p.key?.type === "Identifier" ? p.key.name
          : p.key?.type === "Literal" ? String(p.key.value) : null;
        if (k) keys.add(k);
      }
    });
    if (keys.size) returnedKeys.set(name, keys);
  });
}

// Per-file: `const X = <init>` so an identifier argument can be followed.
function collectLocalObjects(ast) {
  const locals = new Map();
  walk(ast, (n) => {
    if (n.type !== "VariableDeclarator" || !n.init) return;
    if (n.id.type === "Identifier") { locals.set(n.id.name, n.init); return; }
    // `const [form, setForm] = useState(EMPTY_FORM)` — the state variable's shape
    // is its initial value. Without this hop every form-backed writer in the app
    // reads as opaque, and `updateMember` — whose five keys ARE all written, by
    // RosterScreen's edit form — would sit permanently in the unresolved bucket.
    // A rule that cannot see the most common way a screen holds a patch is a rule
    // that would have missed §2.1 too.
    if (n.id.type === "ArrayPattern" && n.init.type === "CallExpression") {
      const cn = n.init.callee.type === "Identifier" ? n.init.callee.name
        : (n.init.callee.type === "MemberExpression" && n.init.callee.property.type === "Identifier")
          ? n.init.callee.property.name : null;
      if (cn === "useState" && n.init.arguments[0] && n.id.elements[0]?.type === "Identifier") {
        locals.set(n.id.elements[0].name, n.init.arguments[0]);
      }
    }
  });
  return locals;
}

const appFiles = jsFiles(join(ROOT, "src")).filter(f => f !== STORE);
const passed = new Map();   // writer -> Set(keys)
const opaque = new Map();   // writer -> [sites] where a spread hid the keys
const sites  = new Map();   // writer -> [file:line]

const asts = new Map();
for (const f of [...appFiles, STORE]) {
  try { asts.set(f, parse(readFileSync(f, "utf8"))); } catch { /* not parseable here */ }
}
for (const ast of asts.values()) collectReturnShapes(ast);

for (const f of appFiles) {
  const ast = asts.get(f);
  if (!ast) continue;
  const locals = collectLocalObjects(ast);

  // An argument node → the set of keys it contributes, or null if unresolvable.
  const keysOf = (node, depth = 0) => {
    if (!node || depth > 2) return null;
    if (node.type === "ObjectExpression") {
      const out = new Set();
      for (const p of node.properties) {
        if (p.type === "SpreadElement") { out.add("…spread"); continue; }
        const k = p.key?.type === "Identifier" ? p.key.name
          : p.key?.type === "Literal" ? String(p.key.value) : null;
        if (k) out.add(k);
      }
      return out;
    }
    if (node.type === "Identifier") {
      if (locals.has(node.name)) return keysOf(locals.get(node.name), depth + 1);
      return null;
    }
    if (node.type === "CallExpression") {
      const cn = node.callee.type === "Identifier" ? node.callee.name
        : (node.callee.type === "MemberExpression" && node.callee.property.type === "Identifier")
          ? node.callee.property.name : null;
      return cn && returnedKeys.has(cn) ? returnedKeys.get(cn) : null;
    }
    return null;
  };

  walk(ast, (n) => {
    if (n.type !== "CallExpression") return;
    const callee = n.callee;
    const name = callee.type === "Identifier" ? callee.name
      : (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier")
        ? callee.property.name : null;
    if (!name || !writers.has(name)) return;

    const where = `${relative(ROOT, f)}:${n.loc.start.line}`;
    if (!sites.has(name)) sites.set(name, []);
    sites.get(name).push(where);

    // 🔴 A NON-LITERAL ARGUMENT IS OPAQUE, NOT EMPTY, and getting this wrong is
    // how the audit lies in the most dangerous direction. `updateCoach(id, patch)`
    // passes a variable built two lines up; reading "no keys passed" off that and
    // reporting the writer's whole surface as unwritten would flag a control that
    // demonstrably exists. It cost this script its first run: §2.1's brand-new
    // edit form — the positive control — came back as four missing writers.
    // Only the patch argument matters — it is the last one by this repo's
    // convention (`updateCoach(id, patch)`, `addMember(name, extra)`).
    const last = n.arguments[n.arguments.length - 1];
    const resolved = n.arguments.length > 1 || last?.type === "ObjectExpression"
      ? keysOf(last) : new Set();

    if (resolved === null || resolved.has("…spread")) {
      if (!opaque.has(name)) opaque.set(name, []);
      opaque.get(name).push(where);
    }
    if (resolved) {
      if (!passed.has(name)) passed.set(name, new Set());
      for (const k of resolved) if (k !== "…spread") passed.get(name).add(k);
    }
  });
}

// ── 3. The result, as data ──────────────────────────────────────────────────
// Exported so `storeWriters.test.js` can assert the rule without re-parsing, and
// so the CLI below and the test can never disagree about what was found.
const auditWriters = [...writers].map(([name, info]) => ({
  name, line: info.line,
  accepts: [...info.keys].sort(),
  passed: [...(passed.get(name) || new Set())].sort(),
  // ⚠️ `missing` stays the RAW answer, allowlist and all. Filtering it here
  // would take the allowlist's own positive control away from the test that
  // depends on still finding these three.
  missing: [...info.keys].filter(k => !(passed.get(name) || new Set()).has(k)).sort(),
  opaque: opaque.get(name) || [],
  sites: sites.get(name) || [],
})).sort((a, b) => a.name.localeCompare(b.name));

// Only writers whose keys are actually resolvable count as "found missing" — an
// opaque call site hides the keys rather than proving them absent, and the CLI
// has always reported those separately.
const allMissing = auditWriters.flatMap(w => (w.opaque.length ? [] : w.missing.map(k => `${w.name}.${k}`)));

export const audit = {
  writers: auditWriters,
  wholeObjWriters,
  // The three the allowlist explains, and the ones it does not. `unexplained` is
  // the number that should be zero; `staleSeams` is the other direction — an
  // allowlist entry the sweep no longer finds, which means either the field grew
  // a control (delete the line) or the parser stopped seeing it (fix the script).
  explained: allMissing.filter(k => k in KNOWN_SEAMS).sort(),
  unexplained: allMissing.filter(k => !(k in KNOWN_SEAMS)).sort(),
  staleSeams: Object.keys(KNOWN_SEAMS).filter(k => !allMissing.includes(k)).sort(),
};

// ── 4. The report ───────────────────────────────────────────────────────────
const RUN_AS_CLI = process.argv[1] && process.argv[1].endsWith("audit-store-writers.mjs");
let unwritten = 0;
if (RUN_AS_CLI) {
console.log("store writers — accepted keys vs keys any src/ call site passes\n");
for (const [name, info] of [...writers].sort()) {
  const got = passed.get(name) || new Set();
  const missing = [...info.keys].filter(k => !got.has(k)).sort();
  const callSites = sites.get(name) || [];
  const isOpaque = opaque.has(name);

  const head = callSites.length === 0
    ? "NO CALL SITE"
    : `${callSites.length} call site${callSites.length === 1 ? "" : "s"}`;
  console.log(`${name}()  store.js:${info.line}  — ${head}${isOpaque ? " (spread: keys opaque)" : ""}`);
  console.log(`   accepts: ${[...info.keys].sort().join(", ") || "(none found)"}`);
  console.log(`   passed : ${[...got].sort().join(", ") || "(nothing)"}`);
  if (missing.length && !isOpaque) {
    // Split, so the line that means "look at this" is only ever printed for
    // something worth looking at.
    const seams = missing.filter(k => `${name}.${k}` in KNOWN_SEAMS);
    const real  = missing.filter(k => !(`${name}.${k}` in KNOWN_SEAMS));
    unwritten += real.length;
    if (real.length) console.log(`   🔴 NO WRITER: ${real.join(", ")}`);
    for (const k of seams) console.log(`   🟢 no writer, and that is the decision: ${k} — ${KNOWN_SEAMS[`${name}.${k}`]}`);
  } else if (missing.length && isOpaque) {
    console.log(`   ⚠️  unresolved (spread hides them): ${missing.join(", ")}`);
  }
  if (callSites.length) console.log(`   at: ${callSites.join(", ")}`);
  console.log("");
}

console.log("── not checked: writers that take a whole object or list, not a patch ──");
for (const w of wholeObjWriters) console.log(`   ${w.name}(${w.params.join(", ")})  store.js:${w.line}`);

// An allowlist that has drifted is worth as much noise as an unwritten field,
// and in the opposite direction: it means the sweep has stopped finding
// something it is supposed to find.
if (audit.staleSeams.length) {
  console.log(`\n⚠️  ALLOWLIST IS STALE — the sweep no longer finds: ${audit.staleSeams.join(", ")}`);
  console.log("   Either the field grew a control (delete the line) or the parser stopped seeing it (fix the script).");
}

console.log(`\n${writers.size} patch-shaped writers · ${audit.explained.length} accepted keys with no writer and explained · ${unwritten} unexplained`);
// A non-zero exit so a clean run can be asserted by something other than a human
// reading the last line. `storeWriters.test.js` is still the gate; this is for
// the times the script is run on its own, which is how D6 was found.
if (unwritten || audit.staleSeams.length) process.exitCode = 1;
}
