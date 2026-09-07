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
export const audit = {
  writers: [...writers].map(([name, info]) => ({
    name, line: info.line,
    accepts: [...info.keys].sort(),
    passed: [...(passed.get(name) || new Set())].sort(),
    missing: [...info.keys].filter(k => !(passed.get(name) || new Set()).has(k)).sort(),
    opaque: opaque.get(name) || [],
    sites: sites.get(name) || [],
  })).sort((a, b) => a.name.localeCompare(b.name)),
  wholeObjWriters,
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
    unwritten += missing.length;
    console.log(`   🔴 NO WRITER: ${missing.join(", ")}`);
  } else if (missing.length && isOpaque) {
    console.log(`   ⚠️  unresolved (spread hides them): ${missing.join(", ")}`);
  }
  if (callSites.length) console.log(`   at: ${callSites.join(", ")}`);
  console.log("");
}

console.log("── not checked: writers that take a whole object or list, not a patch ──");
for (const w of wholeObjWriters) console.log(`   ${w.name}(${w.params.join(", ")})  store.js:${w.line}`);

console.log(`\n${writers.size} patch-shaped writers · ${unwritten} accepted keys with no writer`);
}
