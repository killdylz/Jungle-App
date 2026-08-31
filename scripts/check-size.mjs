// Bundle-size guard. Fails the build when a chunk grows past its ceiling.
//
//   node scripts/check-size.mjs           credential-less build (local default)
//   node scripts/check-size.mjs --prod    build made WITH VITE_SUPABASE_* set
//
// 🔴 WHY TWO BUDGET SETS. Without `VITE_SUPABASE_URL`/`ANON_KEY`, rollup drops
// every sync path and the whole `@supabase/*` client with it — StaffApp is
// 340 KB credential-less and 581 KB prod-shaped. Those are BOTH real builds and
// comparing one against the other's numbers is meaningless, which is a mistake
// this repo has already made in prose. CI builds prod-shaped (see deploy.yml),
// so CI runs `--prod`; a bare local `npm run build` is the local set.
//
// The mode is ASSERTED, not assumed: `GoTrueClient` is an @supabase/auth-js
// internal that only survives when the client is actually bundled, so asking
// for the wrong set fails loudly instead of passing against numbers that do not
// describe the build in front of it.
//
// These are CEILINGS to catch unintended drift, not targets — roughly 4% over
// what the tree measured when they were set. If a deliberate feature pushes one
// over, raise it IN THE SAME COMMIT and say what bought the bytes. Silently
// raising a budget is the same as not having one.
//
// 📏 The member path is the number that matters commercially: it is what someone
// who is not a customer downloads to look at one class. It was 206.69 KB at
// session 19 and is 213.50 KB now — that drift is exactly what this catches.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(root, "dist", "assets");
const prod = process.argv.includes("--prod");
// 1000, not 1024 — vite reports kB and every size recorded in this repo's docs
// is vite's number. A guard that quotes KiB would disagree with the handoff by
// 2.4% and someone would eventually "fix" the wrong one.
const KB = 1000;

// Chunk name → ceiling in KB, per build shape. Measured 2026-08-03.
// ⚠️ An UNLISTED chunk is counted in the file total and has no ceiling at all, so
// a new lazy chunk that is not added here can grow without ever failing this
// guard. RetentionScreen (N2) measured 11.09 KB credential-less when it landed;
// its ceiling is 14 rather than the usual +4% because the PROD-shaped number
// cannot be measured locally — no credentials — and CI is the run that judges it.
// Its contents are app code plus lib/cohorts.js, with nothing supabase-shaped of
// its own, so the two build shapes should agree closely.
// ClientsScreen (PT) measured 16.28 KB credential-less when it landed; its ceiling
// is 18 rather than the usual +4%, following RetentionScreen's precedent and for
// the same reason — the PROD-shaped number cannot be measured locally (no
// credentials) and CI is the run that judges it. Its contents are app code plus
// lib/progression.js and lib/ptConstants.js, both pure and neither
// supabase-shaped, so the two build shapes should agree closely.
//
// ⚠️ StaffApp went 349.84 -> 354.64 KB in the same commit, and NOT because this
// screen is in it. It is not. The PT domain in store.js became REACHABLE when
// this chunk started importing it, so rollup could no longer drop it — and
// store.js lives in StaffApp. That leaves 5.36 KB of StaffApp headroom, which is
// the tightest this budget has ever been. The client app (a third entry point)
// must not add to store.js without buying the room back first.
const BUDGETS = prod
  ? { "index.js": 215, "StaffApp.js": 610, "PersonasScreen.js": 100, "RetentionScreen.js": 14, "ClientsScreen.js": 18, "ClassSummary.js": 8, "summaryApi.js": 5 }
  : { "index.js": 215, "StaffApp.js": 360, "PersonasScreen.js": 100, "RetentionScreen.js": 14, "ClientsScreen.js": 18, "ClassSummary.js": 8, "summaryApi.js": 3 };
// What a browser actually downloads, which is the claim worth defending.
const PATHS = prod
  ? { member: 225, staff: 825 }
  : { member: 222, staff: 575 };

if (!fs.existsSync(ASSETS)) { console.error(`no dist/assets — run \`npm run build\` first`); process.exit(2); }
const files = fs.readdirSync(ASSETS).filter(f => /\.(js|css)$/.test(f));
// A guard that measured nothing looks exactly like a guard that passed.
if (!files.length) { console.error("dist/assets holds no js/css — nothing was measured"); process.exit(2); }

const sizeOf = f => fs.statSync(path.join(ASSETS, f)).size / KB;
// Vite hashes filenames; the logical chunk is everything before the last dash.
const logical = f => f.replace(/-[A-Za-z0-9_-]{8,}(\.\w+)$/, "$1");
const byName = new Map(files.map(f => [logical(f), sizeOf(f)]));

// ── Assert the build in front of us is the one we were told to judge ─────────
const hasClient = files.some(f => /\.js$/.test(f)
  && fs.readFileSync(path.join(ASSETS, f), "utf8").includes("GoTrueClient"));
if (prod && !hasClient) {
  console.error("--prod was given but no @supabase client is bundled — this is a CREDENTIAL-LESS build.\n"
    + "Build with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY set, or drop --prod.");
  process.exit(2);
}
if (!prod && hasClient) {
  console.error("this is a PROD-SHAPED build but --prod was not given — the local budgets do not describe it.\n"
    + "Re-run with --prod.");
  process.exit(2);
}

const get = n => byName.get(n) ?? 0;
const memberPath = get("index.js") + get("index.css") + get("ClassSummary.js") + get("summaryApi.js");
const staffPath = get("index.js") + get("index.css") + get("StaffApp.js") + get("StaffApp.css");

let failed = 0;
const line = (label, kb, budget) => {
  const over = kb > budget;
  if (over) failed++;
  const pct = budget ? ((budget - kb) / budget * 100).toFixed(1) : "0";
  console.log(`${over ? "OVER " : "ok   "} ${label.padEnd(20)} ${kb.toFixed(2).padStart(8)} KB`
    + `  budget ${String(budget).padStart(4)} KB`
    + (over ? `  — ${(kb - budget).toFixed(2)} KB OVER` : `  (${pct}% headroom)`));
};

console.log(`\nbundle size — ${prod ? "PROD-SHAPED" : "credential-less"} build\n`);
for (const [name, budget] of Object.entries(BUDGETS)) {
  if (!byName.has(name)) { console.error(`MISSING ${name} — expected chunk not emitted`); failed++; continue; }
  line(name, get(name), budget);
}
console.log("");
line("member path", memberPath, PATHS.member);
line("staff path", staffPath, PATHS.staff);
console.log(`\n(member path = index.js + index.css + ClassSummary.js + summaryApi.js;`
  + ` staff = index + StaffApp; PersonasScreen ${get("PersonasScreen.js").toFixed(2)} KB`
  + `, RetentionScreen ${get("RetentionScreen.js").toFixed(2)} KB`
  + ` and ClientsScreen ${get("ClientsScreen.js").toFixed(2)} KB load lazily)`);

console.log(`\nmeasured ${files.length} files · ${failed} over budget`);
process.exit(failed ? 1 : 0);
