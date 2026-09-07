// Duration and occurrence formatting, shared by the Builder (in App.jsx) and by
// the Class Runner cluster (src/screens/runner/). Extracted in I6 stage 5: the
// runner moved out and these three came with it as far as the module boundary,
// at which point "both sides call them" is the whole argument for a shared file
// rather than a copy. A copy of `fmt` would drift the moment one side changed
// how it pads seconds, and the Builder's stage list and the Runner's clock would
// disagree about the same number on the same screen.
export const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
export const fmtSec = s => `${s}s`;
// "today 18:00" / "Tue 18:00" — when a scheduled occurrence starts. 24h, because
// the Schedule's own slots are ("06:00", "18:00") and a coach comparing the two
// should not have to translate. Says "today" for the common case rather than
// making someone work out which weekday it is now.
export const fmtOccurrence = iso => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const t = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  const midnight = new Date(); midnight.setHours(0,0,0,0);
  const sameDay = d >= midnight && d < new Date(midnight.getTime() + 864e5);
  return `${sameDay ? "today" : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]} ${t}`;
};

// "just now" / "2 min ago" / "3 h ago" / "5 days ago" — how long since an epoch
// millisecond timestamp. Written for the sync banner's "last tried", whose whole
// job is to let a coach tell a blip apart from a fortnight of divergence.
//
// Coarse on purpose. The retry timer ticks every 30 seconds, so a figure in
// seconds would imply a precision the mechanism behind it does not have.
//
// Returns "" for a missing or unparseable timestamp rather than "just now": an
// absent `at` is the one case where the honest answer is to say nothing, and a
// caller that renders "" simply omits the phrase. Guessing "just now" would turn
// a ledger entry with no timestamp — which is what an older build wrote — into a
// confident claim that the retry is healthy.
export const fmtAgo = (at, now = Date.now()) => {
  // `t <= 0` and not just `!Number.isFinite(t)`: Number(null) is 0, not NaN, so a
  // null timestamp would otherwise sail through and render as the epoch — "19000
  // days ago" — which is exactly the confident wrong answer this returns "" for.
  const t = Number(at);
  if (!Number.isFinite(t) || t <= 0) return "";
  const ms = now - t;
  if (ms < 60_000) return "just now";        // includes small negative clock skew
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};

// Today, as the reader's CALENDAR says it — never `toISOString().slice(0,10)`,
// which is UTC and is a different day from the coach's for part of every day.
//
// 🔴 SHARED, because the alternative has already cost this product twice. It
// lived privately in `store.js` while `useClassRunner` and `ProfileModal` each
// used the UTC form, and a session taught at 7am in Singapore was written — and
// DISPLAYED — under yesterday's date. Two copies of a date rule is how a writer
// and its reader drift apart while both look correct in the timezone the tests
// happen to run in.
//
// ⚠️ Anything that WRITES a date string a human will read, or compares one, uses
// this. Jungle's first market is Singapore (UTC+8), so "the tests pass in UTC" is
// not evidence about the shipped product.
export const localDateStr = (ms = Date.now()) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// A stored `YYYY-MM-DD` as a coach would say it: "today", "yesterday", or
// "Sat 22 Aug". Used by the two Recent Sessions lists (Dashboard and
// ProfileModal), which both rendered the raw ISO string.
//
// 🔴 WHY THIS RENDERS AT ALL. The Dashboard header says "Monday 24 Aug" and the
// panel three cards below it said "2026-08-24" — the same day, in two notations,
// on one screen. Session 30 found and fixed exactly this shape in the coach
// availability column ("3 slots · stated 4d ago" above "1 slot · stated 204 days
// ago"); this is the same defect in a different panel, and it is machine
// notation shown to a human besides.
//
// ⚠️ PARSED BY PARTS, NEVER BY `new Date(str)`. `new Date("2026-08-24")` is
// UTC midnight by specification, so reading it back with local getters returns
// the PREVIOUS day anywhere west of UTC — which is the exact bug S31 §2.4 spent
// two commits removing. Building `new Date(y, m-1, d)` is a local date by
// construction and cannot drift.
const DAY3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtSessionDay = (dateStr, now = Date.now()) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  // Anything that is not a plain calendar date is passed through untouched
  // rather than guessed at — an empty cell beats a confidently wrong day.
  if (!m) return String(dateStr || "");
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  return `${DAY3[d.getDay()]} ${d.getDate()} ${MON3[d.getMonth()]}`;
};

// ── A stage's duration, from whatever a coach typed into the box ─────────────
//
// 🔴 `<input type="number" min="1" max="60">` DOES NOT CLAMP. `min` and `max`
// are validation hints the browser reports through `:invalid` and constraint
// validation; nothing stops a value outside them reaching `e.target.value`, and
// the Builder's handler was `parseInt(e.target.value || "1") * 60` — an
// expression that defends only the EMPTY string.
//
// So typing `-5` stored `dur: -300`, and the consequences ran the length of the
// product. Measured by driving it:
//
//   • the Builder's own header read "30 min · 5 stages" for a class whose five
//     stages are 35 minutes of work — the negative silently SUBTRACTS from every
//     total, and nothing on screen says a stage is the reason;
//   • the Room TV — the biggest screen in the gym, and one of the two surfaces
//     `UI-UX-DIRECTION` §1 ranks above every staff screen — rendered
//     **"Warm-Up · -5m"** in its plan strip and again as the running stage's
//     duration, in front of paying members;
//   • `summaryContent` drops a `durMin` that rounds below a minute, which is how
//     the member link came to report a 60-minute class as 25.
//
// A stage of zero or negative minutes is not a short stage; it is not a
// duration. The floor is the `min="1"` the control already declares and the `1`
// its own empty-string fallback already used, so this changes no value a coach
// could have meant.
//
// ⚠ NO CEILING, deliberately, even though the control says `max="60"`. 999
// stores 59,940 seconds and that IS absurd — but a 75-minute open-gym block is
// a real thing a studio programmes, and silently rewriting a coach's 75 to 60
// would destroy input rather than reject it. Refusing the impossible and
// allowing the merely long is the honest split. The control's `max="60"` was
// the only part still making a claim it does not enforce; session 37 removed the
// attribute and replaced it with `stageDurNote` below, which warns without
// destroying the value.
export const MIN_STAGE_SEC = 60;
export function stageDurSec(raw) {
  const mins = parseInt(raw, 10);
  if (!Number.isFinite(mins)) return MIN_STAGE_SEC;   // "", "abc", "1e5"'s tail
  return Math.max(MIN_STAGE_SEC, mins * 60);
}

// ── The other half of that same box: a stage nobody could have meant ─────────
//
// Session 36 floored the input and deliberately left `max="60"` on the control.
// It is now the only attribute on that field still making a claim nothing
// enforces, and two separate things are wrong with it, pulling opposite ways:
//
//   • as a LIMIT it is fiction. `max` is a validation hint, exactly as `min`
//     was, so `999` still reaches `stage.dur` and stores 16h 39m;
//   • as a FACT it is wrong. A 75-minute open-gym block is a real thing a
//     studio programmes, so 60 would be the WRONG ceiling even if the browser
//     did enforce it — which is why `stageDurSec` has no ceiling at all.
//
// Clamping is not the fix. Rewriting a coach's 75 to 60 destroys input rather
// than rejecting it, and that is the argument `stageDurSec`'s own comment
// already makes about the floor. So the false attribute goes and the box says
// out loud what it stored instead: a warning is honest at every value, and a
// ceiling that lies is not honest at any of them.
//
// 🔴 THE THRESHOLD IS TWO HOURS, AND ONE HOUR IS THE WRONG ANSWER. Written
// first at 60 minutes, which fired on 75 — the exact value session 36 refused to
// clamp because a studio really does programme a 75-minute open-gym block.
// A warning that cries on a legitimate value is the same defect as a ceiling
// that lies, one screen later: it teaches a coach to ignore the line. Caught by
// the e2e that asserts 75 is left unremarked, not by reading the code.
//
// Two hours clears every real block (60, 75, a 90-minute workshop) and still
// catches every slip that matters, because the slip is an extra digit: 30→300,
// 45→450, 60→600, and the 999 that started this. Nothing between 90 minutes and
// two hours is worth interrupting someone over.
//
// Returns "" — not null, not a boolean — so a caller renders it or does not,
// with no second rule about which falsy value means "say nothing".
export const LONG_STAGE_SEC = 2 * 60 * 60;
export function stageDurNote(durSec) {
  const s = Number(durSec);
  if (!Number.isFinite(s) || s <= LONG_STAGE_SEC) return "";
  const mins = Math.round(s / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const len = m ? `${h}h ${m}m` : `${h}h`;
  return `That is ${len} for one stage — longer than most whole classes. Saved as you typed it; change it if it was a slip.`;
}
