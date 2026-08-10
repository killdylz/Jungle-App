// ─── Cold start — what a brand-new gym is actually looking at (B1) ───────────
//
// WHY THIS EXISTS
// `DashboardScreen` computes four KPIs from `sessionHistory`: sessions this
// week, hours this month, day streak, total sessions. Every one of them is
// derived from the SAME empty array on day one, so the first thing a studio
// owner sees after signing up is "0 · 0.0 · 0 · 0" — four confident numbers all
// saying nothing. UI-UX-DIRECTION §2 calls that "reads as a dead product", and
// it is the one screen where that impression is most expensive: it is the first
// ten minutes of every new gym, and the moment they decide whether this is for
// them.
//
// The house empty-state rule (UI-UX §1) is that an empty state must say WHAT is
// missing, WHY it matters, and THE ONE ACTION that fills it. A zero does none of
// the three. So before there is anything to count, the KPI row is replaced by
// the three steps that lead to a first real number.
//
// WHY IT GATES ON SESSIONS, NOT ON "ALL STEPS DONE"
// The KPI row is meaningful exactly when there is at least one session to count,
// so that — not checklist completion — is the switch. A gym that runs classes
// daily but never imports its old attendance must NOT be shown a setup card
// where its numbers belong; it gets its KPIs, plus one quiet line naming what is
// still outstanding. The checklist is a cold-start surface, not a nag.
//
// Pure and count-based on purpose: the Dashboard already holds these lists, the
// logic is the part worth testing, and nothing here touches localStorage.

// The order is the order a gym actually does them, and each step's `done` test is
// the cheapest honest one. "Bring in your classes" is satisfied by ANY route in —
// importing a deck, or building one by hand — because insisting on a particular
// route would be Jungle telling a coach how to work.
export const SETUP_STEPS = [
  {
    key: "classes",
    title: "Bring in your classes",
    // The why, in the owner's terms, not ours.
    body: "Import a deck you already teach from, or build one from scratch. Jungle learns the shape you already use.",
    cta: "Add a class",
    view: "personas",
  },
  {
    key: "run",
    title: "Run your first class",
    body: "Put the plan on the room screen and work through it. The class history — and every number on this page — writes itself from here.",
    cta: "Open Class Runner",
    view: "live",
  },
  {
    key: "members",
    title: "Bring your members across",
    body: "Import the attendance history from your old system so Jungle can tell you who is slipping away, from day one.",
    cta: "Import members",
    view: "member",
  },
];

// ─── What to call the coach ──────────────────────────────────────────────────
//
// §2.5 asked for "GOOD AFTERNOON, COACH" to use the coach's name, "which the app
// knows everywhere else". It does not: `display_name` comes from the Google/
// Supabase session (`user_metadata.full_name || name || … || user.email`), and the
// credential-less build — which is what GitHub Pages serves — has no session at
// all. "Coach" there is the honest output of holding no name, not a bug.
//
// The real defect is the EMAIL fallback, which is reachable the moment Supabase is
// configured for a coach whose Google profile carries no name:
// `display_name.split(" ")[0]` on "dylanrodrigues2710@gmail.com" greets them with
// the whole address, upper-cased, in 12px letterspaced accent type across the top
// of the Dashboard.
//
// So: a first word, or the part of an email before the @, or "Coach". Lives here
// rather than in the two components that need it (the Dashboard greeting and the
// sidebar) because they had a copy each, and a copy is how the sidebar and the
// header come to disagree about who is signed in.
export function coachFirstName(displayName) {
  const raw = String(displayName || "").trim();
  if (!raw) return "Coach";
  // An email is not a name. Take the local part and stop at the first separator,
  // so "dylan.rodrigues@x.com" is "Dylan" and not "Dylan.rodrigues".
  const fromEmail = raw.includes("@");
  const local = fromEmail ? raw.split("@")[0] : raw;
  const first = local.split(/[\s._-]+/).filter(Boolean)[0] || "";
  if (!first) return "Coach";
  // Digits are what an email local part carries and a name does not. A greeting of
  // "DYLANRODRIGUES2710" is worse than the honest fallback.
  if (/\d/.test(first)) return "Coach";
  // Capitalised only when it came from an email, because local parts are
  // conventionally lower-case and the SIDEBAR renders this raw — the Dashboard's
  // greeting upper-cases everything, so "dylan" is invisible there and shows up
  // only in the one place nobody would think to look. A real `full_name` is left
  // exactly as the coach typed it; "de Souza" is not ours to correct.
  return fromEmail ? first[0].toUpperCase() + first.slice(1) : first;
}

/**
 * Which of the three cold-start steps a gym has done, and whether the KPI row
 * has anything real to say yet.
 *
 * @param classes  how many class plans/shapes exist (any source)
 * @param sessions how many classes have actually been run
 * @param members  how many people are on the roster
 */
export function setupProgress({ classes = 0, sessions = 0, members = 0 } = {}) {
  const isDone = {
    classes: classes > 0,
    run: sessions > 0,
    members: members > 0,
  };
  const steps = SETUP_STEPS.map(s => ({ ...s, done: !!isDone[s.key] }));
  const done = steps.filter(s => s.done).length;

  return {
    steps,
    done,
    total: steps.length,
    // Every step ticked. Distinct from `showChecklist` because the two answer
    // different questions: this one is "is setup finished", that one is "does
    // the KPI row have anything to count".
    complete: done === steps.length,
    // The switch. Sessions, not completion — see the header note.
    showChecklist: sessions === 0,
    // The single outstanding step to name once the KPIs are live. `null` when
    // nothing is outstanding, so the caller renders nothing rather than an
    // encouraging blank.
    nextStep: steps.find(s => !s.done) || null,
    // ── Reaching the end should be said, once ────────────────────────────────
    // 🔴 `complete` CANNOT BE TRUE WHILE THE CHECKLIST IS ON SCREEN, and that is
    // structural rather than an oversight. `showChecklist` is `sessions === 0`;
    // the `run` step is done at `sessions > 0`. The two conditions are exact
    // opposites, so the most a coach can ever see on that card is "2 of 3" — and
    // `describeSetup`'s "Setup is done" branch was unreachable dead copy that also
    // told them to run a class they must already have run to get there.
    //
    // So the acknowledgement belongs on the OTHER side of the switch, where the
    // coach actually arrives: KPIs are showing, everything is ticked, and the
    // first class has just been run.
    //
    // "Once" without a new storage key or a dismiss button: it shows only while
    // `sessions === 1`. Running a second class retires it. A permanent "you're all
    // set" banner is a nag with a compliment on it, and a dismissible one needs
    // state to remember, which is a key to migrate and a thing to get wrong.
    justFinished: done === steps.length && sessions === 1,
  };
}

/**
 * The line under the header of the checklist card. Says where they are without
 * congratulating them for an empty gym — "0 of 3" is not a milestone.
 */
export function describeSetup(progress) {
  const { done, total } = progress;
  if (done === 0) return `Three steps to your first class. Nothing here is permanent — you can change all of it later.`;
  if (done < total) return `${done} of ${total} done. Keep going — your numbers appear on this page as soon as you have run a class.`;
  // Kept so the function is total for any caller, but see `justFinished`: this
  // branch cannot be reached from the Dashboard's checklist, because completing
  // the third step is what hides the checklist. The old copy here said "Run a
  // class and this page starts filling in", which would only ever have been read
  // by someone who had just run one.
  return `All three steps are done.`;
}
