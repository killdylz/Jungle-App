// ── A gym that has actually been used ────────────────────────────────────────
//
// Every sweep in this repo has been fooled at least once by an EMPTY screen: a
// scan that matched nothing and a scan that found nothing are indistinguishable
// from the assertion's side. A roster with no members has no delete buttons, a
// week with no classes has no remove buttons, and a coach with no plans has no
// cascade — so a destructive sweep run against `freshApp` alone would report a
// clean bill of health for a product it never touched.
//
// This is the fixture those sweeps share. Row shapes are copied from
// `src/lib/store.js` and from the specs that already drive each domain
// (`export.spec.js` for members/attendance, `schedule.spec.js` for the week,
// `coachCover.spec.js` for the roster, `pt.spec.js` for the 1:1 lens) — NOT
// invented, because a crash on a row shape nobody writes is not a defect.
//
// ⚠️ The coach corpus is deliberately NOT here. `personas`, `persona_plans` and
// `persona_movements` are produced by "Load sample coach" and are the most
// intricate objects in the product; a hand-typed version of them would be a
// guess. `captureSampleCoach` below presses that button once and reads back what
// the app itself wrote, so the fixture carries the real thing.
//
// ⚠️ Dates are derived from today. A PAR-Q expires after twelve months and the
// schedule draws real weeks, so a literal date makes a test that passes for a
// year and then fails for reasons that have nothing to do with the code.

const pad = (n) => String(n).padStart(2, "0");
export const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const iso = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString();
};

// The seven PAR-Q answers, all "no" — a screen that clears the member for load.
//
// ⚠️ The keys are `q1`…`q7` and nothing else. `parq.js` keys `PARQ_QUESTIONS` by
// id and `answeredCount` counts only `typeof answers[q.id] === "boolean"`, so a
// fixture with readable names (`heart`, `chestPain`, …) yields SEVEN unanswered
// questions and the screen reports "Part-answered". That is not a defect in the
// product — it is the fixture lying — and the first draft of this file did
// exactly that. Row shapes come out of the source, never out of your head.
const CLEAN_PARQ = { q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false };

export function usedGym() {
  return {
    jungle_gym_branding: { gymName: "The Garage" },

    jungle_members: [
      { id: "m1", name: "Sarah Chen",  email: "sarah@example.com",  status: "active",    joinedAt: "", externalRef: "GYMPASS-88213" },
      { id: "m2", name: "Raj Kumar",   email: "raj@example.com",    status: "active",    joinedAt: "" },
      { id: "m3", name: "Ana Ferreira", email: "ana@example.com",   status: "active",    joinedAt: "" },
      { id: "m4", name: "Tom Wallace", email: "",                   status: "cancelled", joinedAt: "" },
    ],

    // A week a real studio would recognise: two coaches, three slots, one daily.
    jungle_user_classes: [
      { id: "uc1", name: "Morning Burn",   type: "HIIT",     coach: "Dylan", day: "Mon", slot: "06:00", dur: "45m", repeat: "weekly" },
      { id: "uc2", name: "Hyrox Sim",      type: "Hyrox",    coach: "Mara",  day: "Wed", slot: "18:00", dur: "1h",  repeat: "weekly" },
      { id: "uc3", name: "Daily Mobility", type: "Mobility", coach: "",      day: "Mon", slot: "12:00", dur: "30m", repeat: "daily" },
    ],

    // Classes already taught, and who was in them. Without these the Dashboard,
    // Analytics and the member records all render their empty states.
    jungle_class_instances: [
      { id: "ci1", name: "Morning Burn", classType: "HIIT",  coachName: "Dylan", startsAt: iso(-7) },
      { id: "ci2", name: "Hyrox Sim",    classType: "Hyrox", coachName: "Mara",  startsAt: iso(-3) },
    ],
    jungle_attendance: [
      { id: "a1", classInstanceId: "ci1", memberId: "m1", source: "coach",  checkedInAt: iso(-7) },
      { id: "a2", classInstanceId: "ci1", memberId: "m2", source: "coach",  checkedInAt: iso(-7) },
      { id: "a3", classInstanceId: "ci2", memberId: "m1", source: "member", checkedInAt: iso(-3) },
      { id: "a4", classInstanceId: "ci2", memberId: "m3", source: "import", checkedInAt: iso(-3) },
    ],
    // The gym's own record ABOUT a member — append-only (migration 0008).
    jungle_retention_actions: [
      { id: "r1", memberId: "m4", rule: "absence", action: "acted",
        note: "Phoned — travelling until August", occurredAt: iso(-2) },
    ],

    // Roster, one stated availability, one absence and the cover ask it raised.
    jungle_coaches: [
      { id: "co-dylan", name: "Dylan", aliases: [], userId: "", active: true, availability: {} },
      { id: "co-mara",  name: "Mara",  aliases: [], userId: "", active: true,
        availability: { Mon: ["06:00"] } },
    ],
    jungle_coach_absences: [
      { id: "ab1", coachId: "co-mara", from: day(2), to: day(3), reason: "Away" },
    ],

    // The 1:1 lens: one screened client with a session on the books, one who has
    // never been screened — the state the PAR-Q gate is about.
    jungle_pt_clients: [
      { id: "c1", memberId: "m1", goal: "First pull-up",  coachName: "Dylan", status: "active", startedAt: day(-60) },
      { id: "c2", memberId: "m3", goal: "Return to sport", coachName: "Dylan", status: "active", startedAt: day(-10) },
    ],
    jungle_parq_records: [
      { id: "pq1", memberId: "m1", screenedAt: day(-30), answers: CLEAN_PARQ,
        clearance: null, screenedBy: "Dylan", recordedAt: iso(-30) },
    ],
    jungle_pt_sessions: [
      { id: "ps1", clientId: "c1", memberId: "m1", date: day(3), planName: "Pull strength",
        stages: [{ id: "pst1", name: "Warm-Up", dur: 300, exercises: [{ n: "Band Pull-Apart" }] }],
        notes: "", status: "planned", parqStateAtAssign: "cleared", createdAt: iso(-1) },
    ],
  };
}

// Press "Load sample coach" once and read back what the app wrote. The three
// persona keys are the most expensive data in the product and the least
// guessable; this is the only honest way to have them in a fixture.
export async function captureSampleCoach(page, { freshApp, nav, expect }) {
  await freshApp(page);
  await nav(page, "Coaches");
  await page.getByRole("button", { name: /Load sample coach/ }).click();
  await expect(page.getByText("S360 — CLASS SHAPE")).toBeVisible();
  return page.evaluate(() => ({
    jungle_personas: JSON.parse(localStorage.getItem("jungle_personas") || "[]"),
    jungle_persona_plans: JSON.parse(localStorage.getItem("jungle_persona_plans") || "[]"),
    jungle_persona_movements: JSON.parse(localStorage.getItem("jungle_persona_movements") || "[]"),
    jungle_persona_generations: JSON.parse(localStorage.getItem("jungle_persona_generations") || "[]"),
  }));
}

// Write the whole gym and reload into it. Used both to set up and to RESTORE
// between presses, which is what makes a destructive sweep repeatable.
export async function installGym(page, blob) {
  await page.evaluate((b) => {
    localStorage.clear();
    sessionStorage.setItem("jungle_pin_ok", "1");
    for (const [k, v] of Object.entries(b)) localStorage.setItem(k, JSON.stringify(v));
  }, blob);
  await page.reload();
}
