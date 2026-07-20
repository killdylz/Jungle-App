// Exercise glossary — reference data for the Glossary screen.
// Extracted from App.jsx (Fable §4.5 step 1: data constants → src/data/).
export const GLOSSARY = {
  "Upper Body": [
    { name:"Overhead Press",      muscles:"Shoulders, Triceps, Upper Traps", diff:"Intermediate", cues:"Drive from shoulder, full lockout overhead, ribs down." },
    { name:"Single-Arm DB Row",   muscles:"Lats, Rhomboids, Biceps",         diff:"Intermediate", cues:"Hinge 45°, row to lower chest, squeeze scapula at top." },
    { name:"Push-Up",             muscles:"Chest, Triceps, Serratus",        diff:"Beginner",     cues:"Wide hands, lower slow, explosive push, protract at top." },
    { name:"Renegade Row",        muscles:"Lats, Core, Shoulders",           diff:"Advanced",     cues:"Plank position, minimal hip rotation, row to ribcage." },
    { name:"Spider Curl",         muscles:"Biceps, Brachialis",              diff:"Beginner",     cues:"Incline bench 45°, arm hangs free, curl to shoulder." },
    { name:"JM Press",            muscles:"Triceps, Chest",                  diff:"Advanced",     cues:"Bar to nose, elbows 45°, press explosively to lockout." },
  ],
  "Lower Body": [
    { name:"Back Squat",          muscles:"Quads, Glutes, Hamstrings",       diff:"Beginner",     cues:"Feet hip-width, chest tall, break parallel, drive through heels." },
    { name:"Nordic Curl",         muscles:"Hamstrings (eccentric)",          diff:"Advanced",     cues:"Anchor feet, lower body slow with hamstrings, pull back up." },
    { name:"Pistol Squat",        muscles:"Quads, Glutes, Hamstrings, Core", diff:"Advanced",     cues:"Weighted or assisted, contralateral leg extended, hip depth." },
    { name:"Skater Bound",        muscles:"Glutes, Quads, Hamstrings, Core", diff:"Intermediate", cues:"Bound lateral, drive off rear leg, land stacked knee." },
    { name:"Box Jump",            muscles:"Quads, Glutes, Hamstrings",       diff:"Intermediate", cues:"Swing arms, explosive extension, land soft, full reset." },
    { name:"Copenhagen Adductor", muscles:"Adductors, Obliques, Core",       diff:"Beginner",     cues:"Side plank position, bottom leg extended, top knee bent." },
    { name:"Box Depth Jump",      muscles:"Quads, Glutes, Reactive Strength",diff:"Advanced",     cues:"Step off, absorb fast, explode straight up immediately." },
  ],
  "Core & Stability": [
    { name:"Dead Bug",            muscles:"Rectus Abdominis, Transverse, Spinal Erectors", diff:"Beginner", cues:"Press lower back down, opposite arm-leg lower, slow." },
    { name:"Pallof Press",        muscles:"Obliques, Core, Stability",       diff:"Beginner",     cues:"Cable or band, offset stance, press without rotation." },
    { name:"Hollow Rock",         muscles:"Core, Spinal Erectors",           diff:"Beginner",     cues:"Hollow position, lower back flattened, shoulder blades protracted." },
    { name:"Bird Dog",            muscles:"Core, Glutes, Stabilizers",       diff:"Beginner",     cues:"Neutral spine, opposite arm-leg extend, no rotation." },
    { name:"Battle Rope Wave",    muscles:"Shoulders, Core, Cardiovascular", diff:"Intermediate", cues:"Alternate wave, drive from hips, keep core braced." },
  ],
  "Plyometrics & Cardio": [
    { name:"Tuck Jump",           muscles:"Quads, Glutes, Cardiovascular",   diff:"Intermediate", cues:"Explosive takeoff, tuck knees to chest, land soft." },
    { name:"High Knee Drive",     muscles:"Hip Flexors, Cardiovascular",     diff:"Beginner",     cues:"Drive knees up to hip height, stay on balls of feet, pump arms." },
    { name:"Bear Crawl Sprint",   muscles:"Full Body, Core",                 diff:"Intermediate", cues:"Hips level, fast hands and feet, keep back flat." },
    { name:"Burpee Complex",      muscles:"Full Body, Cardiovascular",       diff:"Intermediate", cues:"Controlled lower, explosive jump, hands always shoulder-width." },
  ],
  "Mobility & Prehab": [
    { name:"World's Greatest Stretch", muscles:"Full Body Mobility", diff:"Beginner",     cues:"Walking lunge, rotate, hamstring stretch, thoracic extension." },
    { name:"Hip 90/90 Flow",           muscles:"Hip Mobility, Glutes", diff:"Beginner",   cues:"90° flexion and abduction, alternate sides, explore ROM." },
    { name:"Thoracic CAR",             muscles:"Thoracic Spine",       diff:"Intermediate",cues:"Tall kneeling, open up, big circles, drive rotation." },
    { name:"Shoulder CARs",            muscles:"Shoulder Complex",     diff:"Beginner",    cues:"Standing tall, full ROM circles, smooth and controlled." },
    { name:"Hamstring Floss",          muscles:"Hamstrings, Glutes",   diff:"Beginner",    cues:"Standing fold, hamstring tension, gentle oscillation." },
    { name:"Pigeon Flow",              muscles:"Hip External Rotators, Glutes", diff:"Beginner", cues:"90° hip angle, alternate hip stretch, breathe deep." },
  ]
};
