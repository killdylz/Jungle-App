// Starter class templates — seeded programs shown in the Templates screen.
// Extracted from App.jsx (Fable §4.5 step 1: data constants → src/data/).
export const TEMPLATES = [
  { id:"t1", name:"Apex HIIT",       tag:"30 min", emoji:"⚡", desc:"Zero-rest intervals, max output every round",      color:"#EF4444",
    stages:[
      { type:"warmup",   name:"Ignition",      dur:300,  exercises:[{n:"Light Jog",s:"",r:"5 min",rest:""},{n:"World's Greatest Stretch",s:"1",r:"60s",rest:""}],  tracks:[] },
      { type:"circuit",  name:"Surge Block 1", dur:480,  exercises:[{n:"Burpee Complex",s:"4",r:"10",rest:"20s"},{n:"Box Jump",s:"4",r:"8",rest:"20s"}],             tracks:[] },
      { type:"cardio",   name:"Velocity Peak", dur:360,  exercises:[{n:"Tuck Jump",s:"3",r:"15",rest:"30s"},{n:"High Knee Drive",s:"3",r:"40",rest:"30s"}],          tracks:[] },
      { type:"circuit",  name:"Surge Block 2", dur:480,  exercises:[{n:"Renegade Row",s:"3",r:"10",rest:"30s"},{n:"Skater Bound",s:"3",r:"12",rest:"30s"}],          tracks:[] },
      { type:"cooldown", name:"Reset",         dur:180,  exercises:[{n:"Pigeon Flow",s:"",r:"60s each",rest:""},{n:"Hamstring Floss",s:"",r:"45s",rest:""}],          tracks:[] },
    ]
  },
  { id:"t2", name:"Iron Protocol",   tag:"60 min", emoji:"🏋️", desc:"Compound lifts, progressive overload structure",   color:"#8B5CF6",
    stages:[
      { type:"warmup",   name:"Mobility Prime", dur:600,  exercises:[{n:"Hip 90/90 Flow",s:"",r:"3 min",rest:""},{n:"Thoracic CAR",s:"2",r:"10",rest:""}],          tracks:[] },
      { type:"strength", name:"Primary Lift",   dur:1200, exercises:[{n:"Primal Squat",s:"5",r:"5",rest:"3 min"},{n:"Atlas Press",s:"4",r:"6",rest:"2 min"}],         tracks:[] },
      { type:"strength", name:"Accessory Work", dur:900,  exercises:[{n:"Nordic Curl",s:"3",r:"6",rest:"90s"},{n:"Serpent Row",s:"4",r:"8",rest:"90s"}],              tracks:[] },
      { type:"recovery", name:"Active Rest",    dur:300,  exercises:[{n:"Dead Bug",s:"3",r:"10",rest:"60s"},{n:"Shoulder CARs",s:"2",r:"8",rest:""}],                 tracks:[] },
      { type:"cooldown", name:"Restore",        dur:600,  exercises:[{n:"Pigeon Flow",s:"",r:"90s each",rest:""},{n:"Hollow Rock",s:"2",r:"30s",rest:"30s"}],          tracks:[] },
    ]
  },
  { id:"t3", name:"Circuit Surge",   tag:"45 min", emoji:"🔥", desc:"Mixed modality, maximum metabolic output",         color:"#F97316",
    stages:[
      { type:"warmup",   name:"Activation",    dur:300,  exercises:[{n:"Bear Crawl Sprint",s:"3",r:"20m",rest:"30s"}],                                               tracks:[] },
      { type:"circuit",  name:"Station A",     dur:600,  exercises:[{n:"Burpee Complex",s:"3",r:"10",rest:"30s"},{n:"Box Jump",s:"3",r:"8",rest:"30s"}],              tracks:[] },
      { type:"circuit",  name:"Station B",     dur:600,  exercises:[{n:"Battle Rope Wave",s:"3",r:"30s",rest:"30s"},{n:"Spider Curl",s:"3",r:"12",rest:"30s"}],       tracks:[] },
      { type:"circuit",  name:"Station C",     dur:600,  exercises:[{n:"Copenhagen Adductor",s:"3",r:"10",rest:"30s"},{n:"Pallof Press",s:"3",r:"12",rest:"30s"}],    tracks:[] },
      { type:"cooldown", name:"Cool-Down",     dur:300,  exercises:[{n:"World's Greatest Stretch",s:"",r:"90s each",rest:""}],                                        tracks:[] },
    ]
  },
  { id:"t4", name:"Flow State",      tag:"45 min", emoji:"🧘", desc:"Mind-body connection, breath-led movement",        color:"#10B981",
    stages:[
      { type:"warmup",   name:"Centering",     dur:600,  exercises:[{n:"Hip 90/90 Flow",s:"",r:"5 min",rest:""}],                                                    tracks:[] },
      { type:"stretch",  name:"Active Flow",   dur:900,  exercises:[{n:"World's Greatest Stretch",s:"",r:"90s each",rest:""},{n:"Pigeon Flow",s:"",r:"2 min each",rest:""}], tracks:[] },
      { type:"stretch",  name:"Deep Work",     dur:900,  exercises:[{n:"Thoracic CAR",s:"2",r:"10",rest:""},{n:"Shoulder CARs",s:"2",r:"8",rest:""}],                  tracks:[] },
      { type:"cooldown", name:"Savasana",      dur:300,  exercises:[{n:"Hamstring Floss",s:"",r:"60s each",rest:""}],                                                  tracks:[] },
    ]
  },
  { id:"t5", name:"Velocity",        tag:"45 min", emoji:"🚴", desc:"Cadence peaks, structured recovery valleys",       color:"#3B82F6",
    stages:[
      { type:"warmup",   name:"Base Build",    dur:300,  exercises:[{n:"Light Jog",s:"",r:"5 min",rest:""}],                                                          tracks:[] },
      { type:"cardio",   name:"Threshold Push",dur:600,  exercises:[{n:"Skater Bound",s:"4",r:"30s",rest:"20s"}],                                                     tracks:[] },
      { type:"recovery", name:"Valley",        dur:300,  exercises:[{n:"Easy Walk",s:"",r:"5 min",rest:""}],                                                          tracks:[] },
      { type:"cardio",   name:"Peak Effort",   dur:600,  exercises:[{n:"Box Depth Jump",s:"4",r:"8",rest:"30s"},{n:"Tuck Jump",s:"3",r:"12",rest:"20s"}],              tracks:[] },
      { type:"cooldown", name:"Restore",       dur:300,  exercises:[{n:"Hamstring Floss",s:"",r:"60s each",rest:""}],                                                  tracks:[] },
    ]
  },
  { id:"t6", name:"Reset & Restore", tag:"30 min", emoji:"🌿", desc:"Active recovery, mobility restoration",            color:"#06B6D4",
    stages:[
      { type:"stretch",  name:"Unwind",        dur:600,  exercises:[{n:"Hip 90/90 Flow",s:"",r:"5 min",rest:""},{n:"Thoracic CAR",s:"2",r:"8",rest:""}],              tracks:[] },
      { type:"stretch",  name:"Deep Release",  dur:600,  exercises:[{n:"Pigeon Flow",s:"",r:"2 min each",rest:""},{n:"World's Greatest Stretch",s:"",r:"90s each",rest:""}], tracks:[] },
      { type:"cooldown", name:"Settle",        dur:600,  exercises:[{n:"Shoulder CARs",s:"2",r:"10",rest:""},{n:"Hamstring Floss",s:"",r:"60s each",rest:""}],          tracks:[] },
    ]
  },
];
