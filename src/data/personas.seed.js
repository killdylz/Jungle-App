// ─── Coach-persona seed (workstream D) ───────────────────────────────────────
// Coach-first model: a persona is an individual coach; class type (S360 / GC /
// Enduro…) is a dimension WITHIN them, carried on each plan. This seed is a
// single SAMPLE coach with one S360 plan, so the two-level UI (coach → class
// type → movements/plans) has something real to render before Google Slides
// import is wired. It is illustrative — replace it by importing your coaches'
// own decks; do NOT treat the example plan as a real historical deck.
//
// Only the S360 class type is populated (it's the best-documented format). The
// derived profile (structure / schemes / movements / defaults) is COMPUTED from
// the plan by src/lib/personaAggregate.js. The qualitative bits that can't be
// derived from block data — conventions & vocabulary — live in
// styleProfile.byClassType, where the extraction Edge Function will also write.

export const SEED_PERSONAS = [
  {
    name: "Example Coach — The Garage",
    kind: "coach",
    description: "Sample coach persona (S360 strength format). Replace by importing your coaches' Google Slides.",
    styleProfile: {
      byClassType: {
        S360: {
          focus: "strength",
          conventions: [
            "1st set as a primer",
            "RIR 2 on primary work",
            "antagonist supersets (A1+A2, B1+B2)",
            "\"go to B / A after\" rotation cue",
            "regression offered per movement",
          ],
          vocabulary: ["M1", "A1/A2", "B1/B2", "C1", "primer", "RIR", "regression"],
        },
      },
    },
    plans: [
      {
        source: "jungle",
        title: "S360 — Deadlift (Peak Strength) · example",
        classType: "S360",
        focus: "Deadlift — Peak Strength",
        plan: {
          note: "Illustrative example matching the S360 format — replace by importing real decks.",
          blocks: [
            {
              label: "Warm Up",
              role: "warmup",
              scheme: { type: "time", rest_sec: 0, note: "~5 min, raise + prime the posterior chain" },
              exercises: [
                { name: "Assault Bike", equip: "erg", reps: "2 min easy" },
                { name: "Banded Good Morning", equip: "band", reps: "15" },
                { name: "Glute Bridge", equip: "bodyweight", reps: "15" },
                { name: "World's Greatest Stretch", equip: "bodyweight", reps: "5", per_side: true },
              ],
            },
            {
              label: "M1 — Deadlift",
              role: "primary_lift",
              scheme: { type: "sets_reps", sets: 5, reps: [5, 5, 5, 5, 5], rir: 2, rest_sec: 180,
                        note: "1st set as a primer, then build to a tough 5 @ RIR 2" },
              exercises: [
                { name: "Conventional Deadlift", equip: "barbell", reps: "5×5", regression: "DB / Trap-bar Deadlift" },
              ],
            },
            {
              label: "A1 + A2 — Superset",
              role: "superset",
              rotation: "A1 → A2, 3 rounds (go to B after)",
              scheme: { type: "rounds", sets: 3, rir: 2, rest_sec: 60, note: "antagonist pair — hinge accessory + horizontal pull" },
              exercises: [
                { name: "Romanian Deadlift", equip: "barbell", reps: "10", regression: "DB RDL" },
                { name: "Chest-Supported Row", equip: "dumbbell", reps: "12" },
              ],
            },
            {
              label: "B1 + B2 — Superset",
              role: "superset",
              rotation: "B1 → B2, 3 rounds",
              scheme: { type: "rounds", sets: 3, rest_sec: 60, note: "quad accessory + anti-extension core" },
              exercises: [
                { name: "Walking Lunge", equip: "dumbbell", reps: "10", per_side: true, regression: "Split Squat" },
                { name: "Hanging Knee Raise", equip: "bodyweight", reps: "12", regression: "Dead Bug" },
              ],
            },
            {
              label: "C1 — Finisher",
              role: "finisher",
              scheme: { type: "amrap", rest_sec: 90, note: "8-min AMRAP, leave 1 in the tank" },
              exercises: [
                { name: "Kettlebell Swing", equip: "kettlebell", reps: "15" },
                { name: "Farmer Carry", equip: "dumbbell", reps: "20 m" },
              ],
            },
          ],
        },
      },
    ],
  },
];
