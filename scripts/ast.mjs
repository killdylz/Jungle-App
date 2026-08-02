// Six small AST reports over this repo's source. Written because the linter
// cannot see the things that have actually cost sessions here.
//
//   node scripts/ast.mjs outline  <file>              top-level decls + line spans
//   node scripts/ast.mjs scan     <file> <Decl,…>     what moving those decls would need
//   node scripts/ast.mjs dead     <file…>             imported bindings never used
//   node scripts/ast.mjs deadctl  <file…>             controls with no behaviour
//   node scripts/ast.mjs handlers <file…>             on* handlers on intrinsic elements
//
// 🔴 `dead` is the one with a proven miss. `eslint.config.js` sets
// `'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }]`, which exempts
// every SCREAMING_CASE constant, every PascalCase component and every
// `_`-prefixed binding from the unused check. `CLASS_TYPES` — a dead hardcoded
// class-type list — sat in App.jsx unreported until someone read it by eye. An
// unused `<Component>` or a stale `_baseSkin` would go the same way.
//
// Every report ends with a `scanned N/M` line and exits non-zero when it scanned
// nothing: a clean run and a run that parsed no files look identical otherwise,
// and this repo has been fooled by that before. Zero FINDINGS is a pass; zero
// FILES is a broken invocation.
//
// ⚠️ A dead named import costs ZERO bytes — rollup shakes at export granularity.
// Removing them buys an accurate reading of what a file depends on, not size.
// ⚠️ `deadctl` cannot evaluate `FLAGS.*` gating, has no inert-ancestor check and
// no `<details>` awareness. It over-reports on purpose; every hit needs a
// reachability check by hand before you believe it.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Babel is present transitively (vite → @babel/*), not as a direct dependency,
// so resolve it against the repo's own package.json rather than this file.
const require = createRequire(path.join(root, "package.json"));
const { parse } = require("@babel/parser");
const traverseMod = require("@babel/traverse");
const traverse = traverseMod.default || traverseMod;

const rel = f => path.relative(root, f).replace(/\\/g, "/");

function parseFile(file) {
  const code = fs.readFileSync(file, "utf8");
  return {
    code,
    ast: parse(code, {
      sourceType: "module",
      plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator", "dynamicImport"],
      errorRecovery: false,
    }),
  };
}

// Expand file arguments; a directory means every .js/.jsx under it.
function expand(args) {
  const out = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); }
    else if (/\.jsx?$/.test(e.name)) out.push(p);
  });
  args.forEach(a => {
    const p = path.resolve(root, a);
    if (!fs.existsSync(p)) { console.error(`no such path: ${a}`); process.exit(2); }
    fs.statSync(p).isDirectory() ? walk(p) : out.push(p);
  });
  // Overlapping arguments (`src src/App.jsx`) would otherwise scan and report a
  // file twice, which reads as two findings where there is one.
  return [...new Set(out.map(p => path.resolve(p)))];
}

// ── outline ──────────────────────────────────────────────────────────────────
// Anchor on NAMES, never line numbers: the spans move the moment anything above
// them changes, which is exactly when you are reading this report.
function cmdOutline(files) {
  let n = 0;
  for (const file of files) {
    const { ast } = parseFile(file);
    console.log(`\n${rel(file)}`);
    for (const node of ast.program.body) {
      const d = node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration"
        ? node.declaration : node;
      if (!d) { continue; }
      const names = d.type === "VariableDeclaration"
        ? d.declarations.map(x => x.id.name).filter(Boolean)
        : d.id?.name ? [d.id.name] : [];
      if (!names.length) continue;
      const exported = node.type.startsWith("Export") ? "export " : "";
      const kind = d.type === "VariableDeclaration" ? d.kind
        : d.type === "FunctionDeclaration" ? "function"
        : d.type === "ClassDeclaration" ? "class" : d.type;
      const span = node.loc.end.line - node.loc.start.line + 1;
      console.log(`  ${String(node.loc.start.line).padStart(5)}–${String(node.loc.end.line).padEnd(5)} ${String(span).padStart(4)}L  ${exported}${kind} ${names.join(", ")}`);
      n++;
    }
  }
  return { findings: n, label: "declarations" };
}

// ── scan ─────────────────────────────────────────────────────────────────────
// What a set of declarations would need to survive being moved out, and which of
// its same-file dependencies the REST of the file still uses — that last part is
// the answer to "move it, or make it a shared module?".
function cmdScan(files, declArg) {
  const wanted = new Set((declArg || "").split(",").map(s => s.trim()).filter(Boolean));
  if (!wanted.size) { console.error("scan needs a comma-separated declaration list"); process.exit(2); }
  const file = files[0];
  const { ast } = parseFile(file);

  const topLevel = new Map();   // name → node
  const importOf = new Map();   // local name → source
  for (const node of ast.program.body) {
    if (node.type === "ImportDeclaration") {
      node.specifiers.forEach(s => importOf.set(s.local.name, node.source.value));
      continue;
    }
    const d = node.type.startsWith("Export") ? node.declaration : node;
    if (!d) continue;
    const names = d.type === "VariableDeclaration"
      ? d.declarations.map(x => x.id.name).filter(Boolean)
      : d.id?.name ? [d.id.name] : [];
    names.forEach(nm => topLevel.set(nm, node));
  }
  const missing = [...wanted].filter(w => !topLevel.has(w));
  if (missing.length) { console.error(`not found in ${rel(file)}: ${missing.join(", ")}`); process.exit(2); }

  // Identifiers referenced from inside one declaration. A plain recursive walk
  // rather than `traverse`: babel refuses to traverse a synthetic File wrapper,
  // and re-traversing the whole program per declaration is quadratic.
  const refsOf = node => {
    const found = new Set();
    const seen = new Set();
    const walk = (n, parent, key) => {
      if (!n || typeof n !== "object" || seen.has(n)) return;
      if (Array.isArray(n)) { n.forEach(c => walk(c, parent, key)); return; }
      if (typeof n.type !== "string") return;
      seen.add(n);
      if (n.type === "Identifier" || n.type === "JSXIdentifier") {
        const isMemberProp = parent?.type === "MemberExpression" && !parent.computed && parent.property === n;
        const isKey = parent?.type === "ObjectProperty" && !parent.computed && parent.key === n;
        const isAttrName = parent?.type === "JSXAttribute" && parent.name === n;
        const isIntrinsic = n.type === "JSXIdentifier" && /^[a-z]/.test(n.name);
        if (!isMemberProp && !isKey && !isAttrName && !isIntrinsic) found.add(n.name);
      }
      for (const k of Object.keys(n)) {
        if (k === "loc" || k === "leadingComments" || k === "trailingComments") continue;
        walk(n[k], n, k);
      }
    };
    walk(node, null, null);
    return found;
  };

  const closure = new Set(wanted);
  const queue = [...wanted];
  const leansOn = new Set();
  while (queue.length) {
    const name = queue.shift();
    for (const r of refsOf(topLevel.get(name))) {
      if (closure.has(r) || !topLevel.has(r)) continue;
      leansOn.add(r); closure.add(r); queue.push(r);
    }
  }

  // Which imports the closure needs.
  const neededImports = new Map();
  for (const name of closure) {
    for (const r of refsOf(topLevel.get(name))) {
      if (importOf.has(r)) {
        const src = importOf.get(r);
        if (!neededImports.has(src)) neededImports.set(src, new Set());
        neededImports.get(src).add(r);
      }
    }
  }

  // Of the same-file declarations the closure drags in, which does the REST of
  // the file still use? Those cannot simply move — they become a shared module.
  const restUses = new Set();
  for (const [name, node] of topLevel) {
    if (closure.has(name)) continue;
    refsOf(node).forEach(r => { if (leansOn.has(r)) restUses.add(r); });
  }

  console.log(`\n${rel(file)} — moving ${[...wanted].join(", ")}\n`);
  console.log("  imports it needs:");
  [...neededImports].sort().forEach(([src, names]) => console.log(`    ${src.padEnd(38)} ${[...names].sort().join(", ")}`));
  console.log(`\n  same-file declarations it leans on (${leansOn.size}):`);
  [...leansOn].sort().forEach(n => console.log(`    ${n}`));
  console.log(`\n  …of those, still used by the REST of the file (${restUses.size})`);
  console.log("  — these are the SHARED ones. Moving them breaks the file behind you;");
  console.log("    they belong in a module both sides import.");
  [...restUses].sort().forEach(n => console.log(`    🔴 ${n}`));
  return { findings: restUses.size, label: "shared declarations" };
}

// ── dead ─────────────────────────────────────────────────────────────────────
function cmdDead(files) {
  let hits = 0;
  for (const file of files) {
    const { ast } = parseFile(file);
    const imported = new Map();   // local → { source, line }
    for (const node of ast.program.body) {
      if (node.type !== "ImportDeclaration") continue;
      node.specifiers.forEach(s =>
        imported.set(s.local.name, { source: node.source.value, line: s.loc.start.line }));
    }
    if (!imported.size) continue;

    // Babel's own binding resolution rather than a name sweep. It counts a
    // JSX element name as a reference — the half eslint's varsIgnorePattern
    // hides, since `<Foo/>` is usually the only use a PascalCase import gets —
    // and it resolves SHADOWING for free: a local declaration that covers an
    // import (FloorLiveScreen's own `fmt`) leaves the import at zero references
    // even though the name appears all over the file.
    traverse(ast, {
      Program(p) {
        for (const [name, info] of imported) {
          const binding = p.scope.getBinding(name);
          if (!binding || binding.references > 0) continue;
          console.log(`${rel(file)}:${info.line}  ${name}  — imported from '${info.source}', never used`);
          hits++;
        }
        p.stop();
      },
    });
  }
  return { findings: hits, label: "dead imports" };
}

// ── deadctl ──────────────────────────────────────────────────────────────────
// Intrinsic <button>/<a> with no handler and no href, and JSX attributes that
// pass a handler prop nothing declares. Over-reports by construction.
function cmdDeadCtl(files) {
  let hits = 0;
  for (const file of files) {
    const { ast } = parseFile(file);
    traverse(ast, {
      JSXOpeningElement(p) {
        const nameNode = p.node.name;
        if (nameNode.type !== "JSXIdentifier") return;
        const tag = nameNode.name;
        if (tag !== "button" && tag !== "a") return;
        let hasAction = false, hasSpread = false, isSubmit = false;
        for (const attr of p.node.attributes) {
          if (attr.type === "JSXSpreadAttribute") { hasSpread = true; continue; }
          const an = attr.name?.name;
          if (!an) continue;
          if (/^on[A-Z]/.test(an)) hasAction = true;
          if (tag === "a" && an === "href") hasAction = true;
          if (an === "type" && attr.value?.value === "submit") isSubmit = true;
          if (an === "disabled") hasAction = hasAction || false;
        }
        if (hasAction || hasSpread || isSubmit) return;

        // Ancestor checks — §4.4 listed both as known holes, and running this
        // for the first time fired one of each. Brand Studio's white-label
        // preview is a full mock app inside `<div inert>`: a handler-less
        // "Start Class" there is CORRECT, because `inert` takes the whole
        // subtree out of the a11y tree and out of the tab order. A bare button
        // inside a <form> is a submit button whether or not it says so.
        const enclosing = (test) => p.findParent(a => a.isJSXElement() && test(a.node.openingElement));
        if (enclosing(o => o.attributes.some(at => at.type === "JSXAttribute" && at.name?.name === "inert"))) return;
        if (enclosing(o => o.name.type === "JSXIdentifier" && o.name.name === "form")) return;

        // Still cannot evaluate `FLAGS.*` gating — a control inside a branch
        // that folds to `[]` reports here and is not real. Check every hit.
        const inDetails = enclosing(o => o.name.type === "JSXIdentifier" && o.name.name === "details");
        console.log(`${rel(file)}:${p.node.loc.start.line}  <${tag}> with no handler, href or spread`
          + (inDetails ? "  — inside <details>, may be decorative" : "")
          + `  — confirm it is not FLAGS-gated before believing it`);
        hits++;
      },
    });
  }
  return { findings: hits, label: "suspect controls" };
}

// ── handlers ─────────────────────────────────────────────────────────────────
function cmdHandlers(files) {
  const buckets = new Map();
  let hits = 0;
  for (const file of files) {
    const { ast } = parseFile(file);
    traverse(ast, {
      JSXAttribute(p) {
        const an = p.node.name?.name;
        if (!an || !/^on[A-Z]/.test(an)) return;
        const el = p.parentPath.node.name;
        if (el.type !== "JSXIdentifier" || !/^[a-z]/.test(el.name)) return;  // intrinsic only
        if (!buckets.has(an)) buckets.set(an, []);
        buckets.get(an).push(`${rel(file)}:${p.node.loc.start.line}  <${el.name}>`);
        hits++;
      },
    });
  }
  [...buckets.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([evt, list]) => {
    console.log(`\n${evt}  (${list.length})`);
    list.forEach(l => console.log(`  ${l}`));
  });
  return { findings: hits, label: "intrinsic handlers" };
}

// ── main ─────────────────────────────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2);
const COMMANDS = { outline: cmdOutline, scan: cmdScan, dead: cmdDead, deadctl: cmdDeadCtl, handlers: cmdHandlers };
if (!COMMANDS[cmd]) {
  console.error(`usage: node scripts/ast.mjs <${Object.keys(COMMANDS).join("|")}> <file…>`);
  process.exit(2);
}
const fileArgs = cmd === "scan" ? rest.slice(0, 1) : rest;
const files = expand(fileArgs.length ? fileArgs : ["src"]);
let parsed = 0;
const counted = files.filter(f => { try { parseFile(f); parsed++; return true; } catch (e) {
  console.error(`PARSE FAILED ${rel(f)}: ${e.message}`); return false; } });

const { findings, label } = COMMANDS[cmd](counted, rest[1]);

// The control line. A clean scan and a scan that ran on nothing are otherwise
// indistinguishable, and this repo has read one as the other.
console.log(`\nscanned ${parsed}/${files.length} files · ${findings} ${label}`);
if (parsed === 0) { console.error("scanned nothing — that is a broken invocation, not a pass"); process.exit(1); }
