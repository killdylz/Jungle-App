// ─── Does a stored value reach a human raw? ──────────────────────────────────
//
// The generalisation of session 22's dashboard defect: `{c.type}` printed the
// catalogue KEY, so a coach read `GYM-BARRE-MRKHJ2LC` as the name of their own
// class type. `src/ui/labels.js` exists precisely so every internal enum that
// reaches a screen is translated in one place, and `labels.test.js` pins the
// MAPS — but nothing checked whether a call site had simply skipped them, which
// is what happened. `honesty.spec.js` checks four specific enum words on one
// screen; this is the same rule with no list to keep up to date.
//
// The rules, and why each one is safe to apply to a whole page:
//
//   uuid       `store.newId()` is a v4 UUID. It is a database key. There is no
//              copy in this product that should contain one.
//   gym-key    `newClassTypeKey()` mints `gym-<slug>-<base36 timestamp>`. The
//              LABEL is what a human reads; the key is storage.
//   snake_case `sets_reps`, `primary_lift`, `google_slides`, `class_type`. No
//              user-facing English contains an underscore, which is exactly what
//              made the underscore the giveaway in labels.js's own header.
//   gen-id     `custom_1785…`, `disc_1785…`, `uc1785…` — ids minted at a call
//              site rather than by `newId()`.
//
// ⚠️ The rules read what a human sees, so a FIXTURE containing an underscore in
// a member's name or email would be reported. That is the right failure
// direction — narrow the fixture, never the rule.

export const RAW_VALUE_RULES = [
  ["uuid",       /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi],
  ["gym-key",    /\bgym-[a-z0-9]+-[a-z0-9]{5,}\b/gi],
  ["snake_case", /\b[a-z]{2,}_[a-z_]{2,}\b/g],
  ["gen-id",     /\b(?:custom|disc|uc|ci)_?\d{10,}\b/gi],
];

// Serialised because the body runs in the PAGE — a RegExp does not survive the
// boundary, so source and flags cross instead and are rebuilt on the far side.
const wire = () => RAW_VALUE_RULES.map(([n, r]) => [n, r.source, r.flags]);

// `innerText`, not `textContent`: it is what a person actually reads, it
// respects hidden content, and it is the same choice the a11y scanners make.
export const rawValues = (page) => page.evaluate((pats) => {
  const text = document.body.innerText || "";
  const out = [];
  for (const [rule, src, flags] of pats) {
    const re = new RegExp(src, flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      const at = Math.max(0, m.index - 45);
      out.push({
        rule, hit: m[0],
        near: text.slice(at, m.index + m[0].length + 45).replace(/\s+/g, " ").trim(),
      });
    }
  }
  return out;
}, wire());

// 🔴 The positive control, run on THE SAME DOCUMENT, immediately after the real
// scan. A clean page and a scanner that read nothing are the same observation —
// this repo has been caught by that, and once already this session. Planting a
// node into the page under test proves the scanner was pointed at it, which
// scanning a separate fixture page cannot.
export async function proveScannerLive(page, where) {
  const PLANT = "gym-probe-zzq9k1 sets_reps 11111111-2222-4333-8444-555555555555 custom_1785425071481";
  await page.evaluate((t) => {
    const d = document.createElement("div");
    d.id = "__rawvalue_probe__";
    d.textContent = t;
    document.body.appendChild(d);
  }, PLANT);
  const found = await rawValues(page);
  await page.evaluate(() => document.getElementById("__rawvalue_probe__")?.remove());
  const rules = new Set(found.map(f => f.rule));
  if (rules.size !== RAW_VALUE_RULES.length) {
    throw new Error(
      `${where}: the scanner did not see its own planted probe — it found ` +
      `[${[...rules].join(", ")}] of ${RAW_VALUE_RULES.length} rules, so the ` +
      `clean result above proves nothing.`);
  }
  return found.length;
}

export const reportRawValues = (where, bad) =>
  `${where}: ${bad.length} stored value(s) rendered raw to a human:\n` +
  bad.map(b => `  [${b.rule}] ${JSON.stringify(b.hit)}\n    near: ${JSON.stringify(b.near)}`).join("\n");
