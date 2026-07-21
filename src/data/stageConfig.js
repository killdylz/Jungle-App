// Stage configuration — the five-ish block types a class is built from.
//
// This lives outside App.jsx because BOTH sides of the music quarantine read it:
// App.jsx uses `label` and `color` on every builder, runner and display surface,
// and src/music/ uses `bpmMin`/`bpmMax` to match tracks to a stage. Leaving it in
// App.jsx would have made src/music/ import App.jsx — a cycle — so the shared data
// moved to a module neither side owns.
// bpmMin/bpmMax are science-backed target ranges per workout phase (see PRD §4.2)
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
