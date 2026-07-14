// ─── Coach-persona seeds (workstream D) ──────────────────────────────────────
// Three "house" formats observed across The Garage decks (S360 / GC / Enduro).
// The style_profiles below are the DOCUMENTED conventions of each format — the
// same ones the prototype detected when parsing the six sample decks. They give
// each persona a learned-style summary immediately, so "Draft into Builder" has
// something to work from before the real historical decks are imported.
//
// The corpus (persona_plans) is intentionally near-empty: only ONE illustrative
// S360 plan ships here, clearly labelled. The real plans come from re-importing
// the gym's Google Slides decks — that's when style_profiles get recomputed from
// actual data. Do NOT treat the example plan as a real historical deck.
//
// Shape a plan's `plan` field takes (proven on the six decks):
//   { blocks:[ { label, role, rotation?, scheme:{ type, sets?, reps?, rir?, rest_sec?, note? },
//               exercises:[ { name, equip?, reps?, per_side?, regression?, target? } ] } ] }

export const SEED_PERSONAS = [
  {
    name: "The Garage — S360",
    kind: "format",
    description: "Strength format. Barbell primary + antagonist supersets, hypertrophy/peak-strength focus.",
    styleProfile: {
      focus: "strength",
      structure: [
        "Warm Up (~5 min)",
        "M1 — barbell primary (DB regression offered)",
        "A1+A2 / B1+B2 — antagonist supersets, 3 rounds",
        "C1 — finisher",
      ],
      conventions: [
        "1st set as a primer",
        "RIR 2 on primary work",
        "antagonist supersets (A1+A2, B1+B2)",
        "\"go to B / A after\" rotation cue",
        "regression offered per movement",
      ],
      schemes: ["ladder (e.g. 12-10-10-8)", "5×5"],
      defaults: { rir: 2, primary_rest_sec: 180, finisher_rest_sec: 90, superset_rounds: 3 },
      vocabulary: ["M1", "A1/A2", "B1/B2", "C1", "primer", "RIR", "regression"],
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
                { name: "Conventional Deadlift", equip: "barbell", reps: "5×5",
                  regression: "DB / Trap-bar Deadlift" },
              ],
            },
            {
              label: "A1 + A2 — Superset",
              role: "superset",
              rotation: "A1 → A2, 3 rounds (go to B after)",
              scheme: { type: "rounds", sets: 3, rir: 2, rest_sec: 60,
                        note: "antagonist pair — hinge accessory + horizontal pull" },
              exercises: [
                { name: "Romanian Deadlift", equip: "barbell", reps: "10", regression: "DB RDL" },
                { name: "Chest-Supported Row", equip: "dumbbell", reps: "12" },
              ],
            },
            {
              label: "B1 + B2 — Superset",
              role: "superset",
              rotation: "B1 → B2, 3 rounds",
              scheme: { type: "rounds", sets: 3, rest_sec: 60,
                        note: "quad accessory + anti-extension core" },
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
  {
    name: "The Garage — GC (Fundamental)",
    kind: "format",
    description: "Conditioning format. Erg-heavy interval / AMRAP / rep-target circuits.",
    styleProfile: {
      focus: "conditioning",
      structure: [
        "C1 — warm-up circuit",
        "C2 / C3 — conditioning circuits (interval · AMRAP · rep-target)",
      ],
      conventions: [
        "erg-heavy (row / bike / ski)",
        "circuit numbering C1 → C2 → C3",
        "mix of interval, AMRAP and rep-target formats",
      ],
      schemes: ["interval", "amrap", "rep-target circuit"],
      defaults: {},
      vocabulary: ["C1", "C2", "C3", "AMRAP", "interval", "erg"],
    },
    plans: [],
  },
  {
    name: "The Garage — Enduro",
    kind: "format",
    description: "Periodized endurance. 24-week block, runs + ergs + sled, RPE-driven.",
    styleProfile: {
      focus: "endurance",
      structure: [
        "Periodized within a 24-week block (\"Week X of 24\")",
        "Mixed-modal endurance: runs + ergs + sled",
      ],
      conventions: [
        "explicit periodization (\"Week X of 24\")",
        "RPE-driven intensity",
        "mixed modal: run / erg / sled",
      ],
      schemes: ["time", "distance", "rpe-target"],
      defaults: {},
      vocabulary: ["Week X/24", "RPE", "sled", "erg", "run"],
    },
    plans: [],
  },
];
