// Stage configuration — the five-ish block types a class is built from.
//
// This lives outside App.jsx because BOTH sides of the music quarantine read it:
// App.jsx uses `label` and `color` on every builder, runner and display surface,
// and src/music/ uses `bpmMin`/`bpmMax` to match tracks to a stage. Leaving it in
// App.jsx would have made src/music/ import App.jsx — a cycle — so the shared data
// moved to a module neither side owns.
// bpmMin/bpmMax are science-backed target ranges per workout phase (see PRD §4.2)
//
// ⚠️ `color` IS NOT A KEY. Three pairs share a hue — warmup/power (#F59E0B),
// core/stretch (#10B981) and engine/recovery (#06B6D4) — so colour cannot
// identify a stage type even for a viewer with typical colour vision, let alone
// one without. Any surface that shows a stage MUST also write its `label` (or
// the stage's own name); the colour is reinforcement, never the carrier. The
// spec's §3 accessibility rule says the same thing for a different reason, and
// both were being broken in the same places — see the B8 audit in
// `e2e/honesty.spec.js`, which is what now holds the line.
//
// Widening the palette to ten distinguishable hues is NOT the fix and would
// make it worse: ten hues cannot be told apart at 8 m on a TV by anyone. The
// fix is the label, which is why these colours are left exactly as they are.
export const SCFG = {
  warmup:   { label:"Warm-Up",        color:"#F59E0B", bpmMin:80,  bpmMax:110 },
  circuit:  { label:"Circuit",        color:"#EF4444", bpmMin:110, bpmMax:130 },
  strength: { label:"Strength",       color:"#8B5CF6", bpmMin:110, bpmMax:130 },
  engine:   { label:"Engine",         color:"#06B6D4", bpmMin:130, bpmMax:160 },
  power:    { label:"Power",          color:"#F59E0B", bpmMin:120, bpmMax:150 },
  core:     { label:"Core",           color:"#10B981", bpmMin:90,  bpmMax:120 },
  cardio:   { label:"Cardio Blast",   color:"#F97316", bpmMin:120, bpmMax:150 },
  recovery: { label:"Active Recovery",color:"#06B6D4", bpmMin:80,  bpmMax:100 },
  stretch:  { label:"Stretch",        color:"#10B981", bpmMin:60,  bpmMax:90  },
  cooldown: { label:"Cool-Down",      color:"#3B82F6", bpmMin:80,  bpmMax:100 },
};
