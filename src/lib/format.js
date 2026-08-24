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
