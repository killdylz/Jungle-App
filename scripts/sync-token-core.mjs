// Copy the shared token core from src/lib/classToken.js into both Edge
// Functions, byte for byte.
//
// The functions are deployed by pasting one file into the Supabase dashboard,
// so they cannot import from src/. That leaves duplication as the only option,
// and duplication that drifts is how every member link starts failing to verify
// against a token every member link was minted with. So: one canonical copy,
// this script to push it, and src/lib/classToken.mirror.test.js to fail the
// build if anyone edits a copy directly.
//
//   node scripts/sync-token-core.mjs          — write the copies
//   node scripts/sync-token-core.mjs --check  — exit 1 if they are stale
//
// The placeholder `// __TOKEN_CORE__` marks the insertion point on a first run;
// afterwards the block itself is replaced in place.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(root, "src", "lib", "classToken.js");
const TARGETS = [
  path.join(root, "supabase", "functions", "summary-token", "index.ts"),
  path.join(root, "supabase", "functions", "summary-read", "index.ts"),
];

const BEGIN = "// ─── BEGIN SHARED TOKEN CORE ────────────────────────────────────────────────";
const END = "// ─── END SHARED TOKEN CORE ──────────────────────────────────────────────────";
const PLACEHOLDER = "// __TOKEN_CORE__";

export function extractCore(source) {
  const a = source.indexOf(BEGIN);
  const b = source.indexOf(END);
  if (a < 0 || b < 0 || b < a) throw new Error("token core markers not found in classToken.js");
  return source.slice(a, b + END.length);
}

function apply(target, core) {
  const before = fs.readFileSync(target, "utf8");
  let after;
  if (before.includes(PLACEHOLDER)) {
    after = before.replace(PLACEHOLDER, core);
  } else {
    const a = before.indexOf(BEGIN);
    const b = before.indexOf(END);
    if (a < 0 || b < 0) throw new Error(`no token core and no placeholder in ${target}`);
    after = before.slice(0, a) + core + before.slice(b + END.length);
  }
  return { before, after };
}

function main() {
  const core = extractCore(fs.readFileSync(SOURCE, "utf8"));
  const check = process.argv.includes("--check");
  let stale = 0;

  for (const target of TARGETS) {
    const { before, after } = apply(target, core);
    if (before === after) { console.log(`ok    ${path.relative(root, target)}`); continue; }
    stale++;
    if (check) { console.error(`STALE ${path.relative(root, target)}`); continue; }
    fs.writeFileSync(target, after, "utf8");
    console.log(`wrote ${path.relative(root, target)}`);
  }

  if (check && stale) {
    console.error(`\n${stale} copy(ies) out of date. Run: node scripts/sync-token-core.mjs`);
    process.exit(1);
  }
}

// 🔴 ONLY when run as a command. classToken.mirror.test.js imports extractCore
// from this file, and while the sync ran at import time that test could never
// fail: importing it REPAIRED the drift it was about to measure, so a
// hand-edited Edge Function was silently fixed and then reported identical.
// Caught by mutating a copy and watching the test pass anyway. A guard that
// heals what it inspects is worse than no guard, because it reports success.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
