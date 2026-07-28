// Workout / stage libraries -- extracted verbatim from App.jsx (workstream A,
// Fable spec 4.5 monolith split). Pure data, no imports. Edited copies live in
// localStorage/Supabase via getLibrary()/saveLibrary() in App.jsx.

// ─── Workout Library ──────────────────────────────────────────────────────────
// Each class type → sub-types → { warmup[], main[], cooldown[] }
// Exercise fields match builder format: { id, n, s, r, rest, muscles, notes, timing }
export const WORKOUT_LIBRARY = {
  crossfit: {
    label:"CrossFit", icon:"⚡", color:"#EF4444",
    description:"Constantly varied functional movements performed at high intensity",
    subTypes:{
      wod:{
        label:"WOD (Workout of the Day)", description:"Classic CrossFit daily workout combining gymnastics, weightlifting and metabolic conditioning",
        warmup:[
          {id:"cf-wod-wu-1",n:"Jump Rope Drill",s:"3",r:"30s",rest:"20s",muscles:"Calves, Shoulders, Coordination",notes:"Single unders → attempts at double unders"},
          {id:"cf-wod-wu-2",n:"PVC Overhead Squat",s:"2",r:"10",rest:"30s",muscles:"Shoulders, Thoracic, Ankles",notes:"Focus on depth and vertical torso"},
          {id:"cf-wod-wu-3",n:"Hip 90/90 Flow",s:"",r:"90s each side",rest:"",muscles:"Hip Flexors, Glutes, Thoracic",notes:"Slow controlled transitions"},
          {id:"cf-wod-wu-4",n:"Banded Glute Activation",s:"2",r:"15",rest:"20s",muscles:"Glutes, Abductors",notes:"Monster walk + clamshell"},
          {id:"cf-wod-wu-5",n:"Hollow Body Hold",s:"2",r:"20s",rest:"20s",muscles:"Core, Lats",notes:"Press lower back into floor"},
        ],
        main:[
          {id:"cf-wod-m-1",n:"Thruster",s:"4",r:"10",rest:"60s",muscles:"Quads, Shoulders, Triceps",notes:"Full squat, press overhead in one motion",timing:"none"},
          {id:"cf-wod-m-2",n:"Pull-Up (Kipping)",s:"4",r:"8",rest:"60s",muscles:"Lats, Biceps, Core",notes:"Scale to banded or ring rows"},
          {id:"cf-wod-m-3",n:"Box Jump",s:"4",r:"8",rest:"30s",muscles:"Quads, Glutes, Power",notes:"Land softly, reset between reps"},
          {id:"cf-wod-m-4",n:"Double Unders",s:"4",r:"30",rest:"30s",muscles:"Cardio, Coordination, Calves",notes:"Scale to 90 single unders"},
          {id:"cf-wod-m-5",n:"Wall Ball Shot",s:"4",r:"15",rest:"30s",muscles:"Quads, Shoulders, Cardio",notes:"10ft target, full depth squat"},
          {id:"cf-wod-m-6",n:"Toes to Bar",s:"3",r:"10",rest:"30s",muscles:"Core, Hip Flexors, Lats",notes:"Control the swing, avoid kipping wildly"},
        ],
        cooldown:[
          {id:"cf-wod-cd-1",n:"Doorway Pec Stretch",s:"",r:"60s each",rest:"",muscles:"Pectorals, Anterior Shoulder",notes:"Two heights: 90° and 135° elbow"},
          {id:"cf-wod-cd-2",n:"Pigeon Stretch",s:"",r:"90s each side",rest:"",muscles:"Hip External Rotators, Glutes",notes:"Support on forearms if tight"},
          {id:"cf-wod-cd-3",n:"Couch Stretch",s:"",r:"90s each side",rest:"",muscles:"Hip Flexors, Quads",notes:"Against a wall or box"},
          {id:"cf-wod-cd-4",n:"Thoracic Foam Roll",s:"",r:"90s",rest:"",muscles:"Thoracic Spine, Lats",notes:"10 passes, pause on tight spots"},
        ],
      },
      amrap:{
        label:"AMRAP", description:"As Many Rounds As Possible — maximum work within a fixed time window",
        warmup:[
          {id:"cf-amrap-wu-1",n:"Light Row / Bike",s:"",r:"5 min",rest:"",muscles:"Full Body, Cardio",notes:"Build intensity over 5 minutes"},
          {id:"cf-amrap-wu-2",n:"World's Greatest Stretch",s:"",r:"60s each side",rest:"",muscles:"Hip Flexors, Thoracic, Hamstrings",notes:"Elbow to ground, rotate"},
          {id:"cf-amrap-wu-3",n:"Air Squat",s:"2",r:"10",rest:"20s",muscles:"Quads, Glutes, Mobility",notes:"Focus on heel contact and depth"},
          {id:"cf-amrap-wu-4",n:"Inchworm",s:"2",r:"6",rest:"20s",muscles:"Hamstrings, Shoulders, Core",notes:"Walk out to plank, walk back"},
        ],
        main:[
          {id:"cf-amrap-m-1",n:"Burpee",s:"",r:"AMRAP 20 min",rest:"",muscles:"Full Body, Cardio",notes:"Consistent pace beats sprinting and stopping",timing:"none"},
          {id:"cf-amrap-m-2",n:"Kettlebell Swing",s:"",r:"15 reps/round",rest:"",muscles:"Posterior Chain, Cardio",notes:"Hinge, not squat. Drive hips forward"},
          {id:"cf-amrap-m-3",n:"Push-Up",s:"",r:"10 reps/round",rest:"",muscles:"Chest, Triceps, Core",notes:"Scale: knee push-ups"},
          {id:"cf-amrap-m-4",n:"Goblet Squat",s:"",r:"10 reps/round",rest:"",muscles:"Quads, Glutes",notes:"Elbows inside knees at bottom"},
          {id:"cf-amrap-m-5",n:"Assault Bike Calories",s:"",r:"10 cal/round",rest:"",muscles:"Full Body, Cardio",notes:"Maintain consistent output"},
        ],
        cooldown:[
          {id:"cf-amrap-cd-1",n:"Child's Pose",s:"",r:"2 min",rest:"",muscles:"Lats, Thoracic, Hips",notes:"Arms extended or by sides"},
          {id:"cf-amrap-cd-2",n:"Downward Dog to Upward Dog",s:"2",r:"5 slow",rest:"",muscles:"Hamstrings, Hip Flexors, Shoulders",notes:"Breathe into each transition"},
          {id:"cf-amrap-cd-3",n:"Supine Twist",s:"",r:"60s each side",rest:"",muscles:"Thoracic Spine, Glutes",notes:"Guide the knee to the floor"},
        ],
      },
      emom:{
        label:"EMOM", description:"Every Minute On the Minute — structured interval work with built-in recovery",
        warmup:[
          {id:"cf-emom-wu-1",n:"Dynamic Hip Circle",s:"2",r:"10 each direction",rest:"20s",muscles:"Hips, Glutes",notes:"Large slow circles"},
          {id:"cf-emom-wu-2",n:"Band Pull-Apart",s:"3",r:"15",rest:"20s",muscles:"Rear Delts, Rhomboids",notes:"Stretch band at chest height"},
          {id:"cf-emom-wu-3",n:"Squat to Stand",s:"2",r:"8",rest:"20s",muscles:"Hamstrings, Quads, Ankles",notes:"Hold ankles, straighten legs"},
          {id:"cf-emom-wu-4",n:"Lat Activation Hang",s:"2",r:"20s",rest:"20s",muscles:"Lats, Grip, Shoulder",notes:"Active hang on bar or rings"},
        ],
        main:[
          {id:"cf-emom-m-1",n:"Power Clean",s:"",r:"3 reps/min (10 min)",rest:"",muscles:"Posterior Chain, Power, Full Body",notes:"70-80% 1RM, reset between reps",timing:"emom"},
          {id:"cf-emom-m-2",n:"Ring Dip",s:"",r:"5 reps/min (8 min)",rest:"",muscles:"Triceps, Chest, Shoulders",notes:"Scale to box dips",timing:"emom"},
          {id:"cf-emom-m-3",n:"Handstand Push-Up",s:"",r:"Max reps/min (8 min)",rest:"",muscles:"Shoulders, Triceps, Core",notes:"Scale to pike push-up",timing:"emom"},
          {id:"cf-emom-m-4",n:"Deadlift",s:"",r:"4 reps/min (10 min)",rest:"",muscles:"Posterior Chain, Core",notes:"Moderate weight, perfect form every rep",timing:"emom"},
        ],
        cooldown:[
          {id:"cf-emom-cd-1",n:"Lat Stretch (Bar Hang)",s:"",r:"60s",rest:"",muscles:"Lats, Thoracic, Shoulders",notes:"Allow body to decompress"},
          {id:"cf-emom-cd-2",n:"Hamstring Floss",s:"",r:"60s each",rest:"",muscles:"Hamstrings, Calves",notes:"Straight leg, dorsiflexed foot"},
          {id:"cf-emom-cd-3",n:"Seated Thoracic Rotation",s:"",r:"45s each side",rest:"",muscles:"Thoracic Spine, Obliques",notes:"Sit cross-legged, rotate from mid-back"},
        ],
      },
    },
  },

  spin:{
    label:"Spin / Indoor Cycling", icon:"🚴", color:"#3B82F6",
    description:"High-energy indoor cycling combining endurance, intervals and strength on the bike",
    subTypes:{
      endurance:{
        label:"Endurance Ride", description:"Sustained aerobic effort building base fitness and fat-burning capacity",
        warmup:[
          {id:"sp-end-wu-1",n:"Easy Cadence Build",s:"",r:"5 min",rest:"",muscles:"Quads, Hamstrings, Calves",notes:"Start at 70 RPM, build to 90 RPM. Resistance: 1-2"},
          {id:"sp-end-wu-2",n:"Standing Climb",s:"",r:"2 min",rest:"",muscles:"Glutes, Quads",notes:"Resistance 4-5, 60-70 RPM. Activate glutes"},
          {id:"sp-end-wu-3",n:"Seated Run",s:"",r:"2 min",rest:"",muscles:"Full Legs, Cardio",notes:"Resistance 2, 95-100 RPM. Breathing check"},
        ],
        main:[
          {id:"sp-end-m-1",n:"Steady State Base",s:"",r:"15 min",rest:"",muscles:"Quads, Glutes, Cardiovascular",notes:"80-85% max heart rate. Resistance 5-6, 85-90 RPM"},
          {id:"sp-end-m-2",n:"Progressive Climb",s:"3",r:"4 min",rest:"2 min easy",muscles:"Glutes, Quads, Back",notes:"Add resistance each minute. Sit then stand in final minute"},
          {id:"sp-end-m-3",n:"Tempo Intervals",s:"4",r:"3 min on / 2 min easy",rest:"",muscles:"Full Legs, Cardio",notes:"Push to 90% on working interval"},
          {id:"sp-end-m-4",n:"Seated Sprint",s:"6",r:"20s",rest:"40s easy",muscles:"Fast-Twitch Legs, Cardio",notes:"Max RPM, resistance 3"},
        ],
        cooldown:[
          {id:"sp-end-cd-1",n:"Cool-Down Spin",s:"",r:"5 min",rest:"",muscles:"Legs, Cardiovascular",notes:"Drop to 70 RPM, resistance 1. Let heart rate fall"},
          {id:"sp-end-cd-2",n:"Standing Quad Stretch",s:"",r:"45s each",rest:"",muscles:"Quads, Hip Flexors",notes:"Hold saddle, pull foot to glute"},
          {id:"sp-end-cd-3",n:"Hamstring Stretch (off bike)",s:"",r:"60s each",rest:"",muscles:"Hamstrings, Calves",notes:"Foot on saddle, hinge forward"},
          {id:"sp-end-cd-4",n:"Seated Forward Fold",s:"",r:"90s",rest:"",muscles:"Hamstrings, Lower Back",notes:"Floor, legs straight, reach forward"},
        ],
      },
      hiit_ride:{
        label:"HIIT Ride", description:"Max-effort sprint intervals with full recovery — anaerobic capacity and explosive power",
        warmup:[
          {id:"sp-hiit-wu-1",n:"Easy Pedal",s:"",r:"3 min",rest:"",muscles:"Legs, Cardio",notes:"Resistance 1, 85 RPM. Just moving"},
          {id:"sp-hiit-wu-2",n:"Pyramid Acceleration",s:"3",r:"30s",rest:"30s",muscles:"Legs, Cardio",notes:"Each sprint slightly faster. Build to 90% effort"},
          {id:"sp-hiit-wu-3",n:"Standing Jog",s:"",r:"2 min",rest:"",muscles:"Quads, Core, Balance",notes:"Light resistance. Hover above saddle"},
        ],
        main:[
          {id:"sp-hiit-m-1",n:"Tabata Sprint",s:"8",r:"20s MAX / 10s rest",rest:"",muscles:"Full Legs, Cardio, Power",notes:"Max RPM resistance 2. True maximum effort",timing:"tabata"},
          {id:"sp-hiit-m-2",n:"Heavy Climb Burst",s:"5",r:"30s",rest:"90s easy",muscles:"Glutes, Quads",notes:"Resistance 8-9. Standing, drive through heels"},
          {id:"sp-hiit-m-3",n:"Flying 20s",s:"10",r:"20s",rest:"60s easy",muscles:"Power, Cardio",notes:"Build 10s, max 10s. Explosive turnover"},
          {id:"sp-hiit-m-4",n:"Pyramid Intervals",s:"",r:"1/2/3/2/1 min",rest:"Equal rest",muscles:"Cardio, Endurance, Power",notes:"Intensity increases on way up, decreases on way down"},
        ],
        cooldown:[
          {id:"sp-hiit-cd-1",n:"Easy Pedal",s:"",r:"5 min",rest:"",muscles:"Recovery, Cardiovascular",notes:"Resistance 1. Spin legs out"},
          {id:"sp-hiit-cd-2",n:"Hip Flexor Stretch",s:"",r:"60s each",rest:"",muscles:"Hip Flexors",notes:"Lunge position, sink hips forward"},
          {id:"sp-hiit-cd-3",n:"Calf Stretch",s:"",r:"45s each",rest:"",muscles:"Gastrocnemius, Soleus",notes:"Wall or step. Straight and bent knee versions"},
        ],
      },
      hills:{
        label:"Hills & Climbs", description:"Resistance-heavy climbing simulations for lower body strength and muscular endurance",
        warmup:[
          {id:"sp-hills-wu-1",n:"Base Spin",s:"",r:"4 min",rest:"",muscles:"Legs, Warm-Up",notes:"Light resistance, moderate cadence"},
          {id:"sp-hills-wu-2",n:"Standing Climb Preview",s:"3",r:"30s",rest:"30s",muscles:"Glutes, Quads",notes:"Taste of what's coming. Resistance 5"},
          {id:"sp-hills-wu-3",n:"Activation Squats (off bike)",s:"2",r:"10",rest:"20s",muscles:"Glutes, Quads",notes:"Full depth bodyweight squat"},
        ],
        main:[
          {id:"sp-hills-m-1",n:"Seated Climb",s:"4",r:"4 min",rest:"2 min easy",muscles:"Quads, Glutes, Hamstrings",notes:"Resistance 7-8. 65-70 RPM. Power through heels"},
          {id:"sp-hills-m-2",n:"Standing Climb",s:"4",r:"3 min",rest:"2 min",muscles:"Glutes, Quads, Core",notes:"Resistance 8-9. 55-60 RPM. Stable upper body"},
          {id:"sp-hills-m-3",n:"Seated to Standing Transitions",s:"3",r:"8 times",rest:"",muscles:"Full Legs, Core",notes:"Every 30s switch seated/standing same resistance"},
          {id:"sp-hills-m-4",n:"Summit Sprint",s:"3",r:"45s",rest:"2 min",muscles:"Power, Quads, Calves",notes:"Resistance 6, burst to max cadence"},
        ],
        cooldown:[
          {id:"sp-hills-cd-1",n:"Easy Pedal Flush",s:"",r:"5 min",rest:"",muscles:"Recovery",notes:"Very light resistance, 80-90 RPM"},
          {id:"sp-hills-cd-2",n:"IT Band Stretch",s:"",r:"60s each",rest:"",muscles:"IT Band, Glutes",notes:"Cross leg over, lean away from bike"},
          {id:"sp-hills-cd-3",n:"Glute Stretch (Figure 4)",s:"",r:"60s each",rest:"",muscles:"Glutes, Piriformis",notes:"Seated on floor, figure-four position"},
        ],
      },
    },
  },

  circuit:{
    label:"Circuit Training", icon:"🔥", color:"#F97316",
    description:"Structured rotation through exercise stations targeting different muscle groups",
    subTypes:{
      cardio_circuit:{
        label:"Cardio Circuit", description:"High-rep, low-rest stations keeping heart rate elevated throughout",
        warmup:[
          {id:"cir-card-wu-1",n:"March on Spot",s:"",r:"2 min",rest:"",muscles:"Legs, Core, Heart Rate",notes:"Lift knees to hip height, pump arms"},
          {id:"cir-card-wu-2",n:"Lateral Shuffle",s:"3",r:"30s",rest:"20s",muscles:"Glutes, Adductors, Cardio",notes:"Low athletic stance, quick feet"},
          {id:"cir-card-wu-3",n:"Arm Circle Progression",s:"",r:"30s each direction",rest:"",muscles:"Shoulders, Thoracic",notes:"Small → large circles, forward and backward"},
          {id:"cir-card-wu-4",n:"High Knee Drive",s:"2",r:"20",rest:"20s",muscles:"Hip Flexors, Cardio, Coordination",notes:"Drive arms in opposition"},
        ],
        main:[
          {id:"cir-card-m-1",n:"Star Jump",s:"",r:"45s on / 15s rest",rest:"",muscles:"Full Body, Cardio",notes:"Land softly, arms overhead at top",timing:"tabata"},
          {id:"cir-card-m-2",n:"Mountain Climber",s:"",r:"45s on / 15s rest",rest:"",muscles:"Core, Shoulders, Cardio",notes:"Drive knees to opposite elbows for oblique focus",timing:"tabata"},
          {id:"cir-card-m-3",n:"Skater Bound",s:"",r:"45s on / 15s rest",rest:"",muscles:"Glutes, Adductors, Balance",notes:"Leap side to side, touch floor",timing:"tabata"},
          {id:"cir-card-m-4",n:"Burpee",s:"",r:"45s on / 15s rest",rest:"",muscles:"Full Body, Power, Cardio",notes:"Step back to scale intensity",timing:"tabata"},
          {id:"cir-card-m-5",n:"Jump Rope",s:"",r:"45s on / 15s rest",rest:"",muscles:"Calves, Coordination, Cardio",notes:"Single unders focus on consistent rhythm",timing:"tabata"},
          {id:"cir-card-m-6",n:"Broad Jump to Backpedal",s:"3",r:"8",rest:"30s",muscles:"Power, Quads, Cardio",notes:"Max distance jump, controlled backpedal return"},
        ],
        cooldown:[
          {id:"cir-card-cd-1",n:"Low Lunge Hip Flexor",s:"",r:"60s each",rest:"",muscles:"Hip Flexors, Quads",notes:"Sink hips forward, tall posture"},
          {id:"cir-card-cd-2",n:"Quad Stretch Standing",s:"",r:"45s each",rest:"",muscles:"Quads",notes:"Hold wall for balance if needed"},
          {id:"cir-card-cd-3",n:"World's Greatest Stretch",s:"",r:"60s each side",rest:"",muscles:"Hip Flexors, Thoracic, Hamstrings",notes:"Slow and deliberate, breathe into restriction"},
        ],
      },
      strength_circuit:{
        label:"Strength Circuit", description:"Compound movement stations with moderate rest building full-body strength",
        warmup:[
          {id:"cir-str-wu-1",n:"Foam Roll Thoracic",s:"",r:"90s",rest:"",muscles:"Thoracic Spine, Lats",notes:"Pause on tight spots, 5–10 passes"},
          {id:"cir-str-wu-2",n:"Goblet Squat",s:"2",r:"8",rest:"30s",muscles:"Quads, Glutes, Mobility",notes:"Light KB, focus on depth and upright torso"},
          {id:"cir-str-wu-3",n:"Band Pull-Apart",s:"3",r:"15",rest:"20s",muscles:"Rear Delts, Rhomboids",notes:"Squeeze at full extension"},
          {id:"cir-str-wu-4",n:"Single Leg Hip Hinge",s:"2",r:"8 each",rest:"20s",muscles:"Hamstrings, Glutes, Balance",notes:"Bodyweight RDL on one leg"},
        ],
        main:[
          {id:"cir-str-m-1",n:"Barbell Back Squat",s:"4",r:"8",rest:"90s",muscles:"Quads, Glutes, Core",notes:"Controlled descent, 3 seconds down"},
          {id:"cir-str-m-2",n:"Dumbbell Bench Press",s:"4",r:"10",rest:"90s",muscles:"Chest, Shoulders, Triceps",notes:"Full range of motion, slight arch"},
          {id:"cir-str-m-3",n:"Bent-Over Row",s:"4",r:"10",rest:"90s",muscles:"Lats, Rhomboids, Biceps",notes:"Hinge 45°, row elbows to hip"},
          {id:"cir-str-m-4",n:"Romanian Deadlift",s:"4",r:"10",rest:"90s",muscles:"Hamstrings, Glutes, Lower Back",notes:"Hip hinge, bar close to legs"},
          {id:"cir-str-m-5",n:"Overhead Press",s:"3",r:"10",rest:"90s",muscles:"Shoulders, Triceps, Core",notes:"Rib cage down, glutes engaged"},
          {id:"cir-str-m-6",n:"Farmer's Carry",s:"4",r:"30m",rest:"60s",muscles:"Core, Grip, Traps, Legs",notes:"Shoulders back, walk tall"},
        ],
        cooldown:[
          {id:"cir-str-cd-1",n:"Pigeon Stretch",s:"",r:"90s each",rest:"",muscles:"Glutes, Hip External Rotators",notes:"Use props if needed"},
          {id:"cir-str-cd-2",n:"Pec/Shoulder Stretch",s:"",r:"60s each",rest:"",muscles:"Pectorals, Anterior Shoulder",notes:"Doorway or corner stretch"},
          {id:"cir-str-cd-3",n:"Child's Pose with Lat Reach",s:"",r:"90s each side",rest:"",muscles:"Lats, Thoracic, Hips",notes:"Walk hands to one side to bias lat"},
        ],
      },
      fundamental:{
        label:"Fundamentals", description:"Movement pattern mastery — bodyweight fundamentals for beginners or skill refinement",
        warmup:[
          {id:"cir-fund-wu-1",n:"Cat-Cow",s:"2",r:"10",rest:"",muscles:"Spine, Core",notes:"Inhale on extension, exhale on flexion"},
          {id:"cir-fund-wu-2",n:"Dead Bug",s:"2",r:"8 each side",rest:"20s",muscles:"Core, Hip Flexors",notes:"Press lower back to floor throughout"},
          {id:"cir-fund-wu-3",n:"Glute Bridge",s:"2",r:"12",rest:"20s",muscles:"Glutes, Hamstrings",notes:"Drive through heels, squeeze at top"},
          {id:"cir-fund-wu-4",n:"Wall Slide",s:"2",r:"10",rest:"",muscles:"Shoulders, Thoracic",notes:"Maintain contact with wall throughout"},
        ],
        main:[
          {id:"cir-fund-m-1",n:"Bodyweight Squat",s:"3",r:"15",rest:"45s",muscles:"Quads, Glutes",notes:"Sit back, heels down, chest up"},
          {id:"cir-fund-m-2",n:"Push-Up (Progression)",s:"3",r:"10",rest:"45s",muscles:"Chest, Triceps, Core",notes:"Scale: incline → full → archer"},
          {id:"cir-fund-m-3",n:"Inverted Row",s:"3",r:"12",rest:"45s",muscles:"Lats, Rhomboids, Biceps",notes:"Straight body from ears to heels"},
          {id:"cir-fund-m-4",n:"Reverse Lunge",s:"3",r:"10 each",rest:"45s",muscles:"Quads, Glutes, Balance",notes:"Step back, 90° angles both knees"},
          {id:"cir-fund-m-5",n:"Plank Hold",s:"3",r:"30s",rest:"30s",muscles:"Core, Shoulders",notes:"Squeeze everything, breathe normally"},
          {id:"cir-fund-m-6",n:"Hip Hinge (Kettlebell Swing Prep)",s:"3",r:"10",rest:"30s",muscles:"Posterior Chain",notes:"Hinge at hip, soft knees, flat back"},
        ],
        cooldown:[
          {id:"cir-fund-cd-1",n:"Seated Hamstring Stretch",s:"",r:"60s each",rest:"",muscles:"Hamstrings",notes:"Flex foot, reach forward slowly"},
          {id:"cir-fund-cd-2",n:"Neck Rolls",s:"",r:"60s",rest:"",muscles:"Cervical Spine, Traps",notes:"Slow, half-circles only, avoid full roll"},
          {id:"cir-fund-cd-3",n:"Lying Glute Stretch",s:"",r:"60s each",rest:"",muscles:"Glutes, Piriformis",notes:"Figure-four on back, gentle pull"},
        ],
      },
    },
  },

  strength:{
    label:"Strength Training", icon:"🏋️", color:"#8B5CF6",
    description:"Progressive resistance training to build maximum strength and muscle mass",
    subTypes:{
      powerlifting:{
        label:"Powerlifting", description:"Squat, bench, deadlift — maximal strength through the big three lifts",
        warmup:[
          {id:"str-pow-wu-1",n:"Hip Airplanes",s:"2",r:"8 each",rest:"20s",muscles:"Glutes, Hip Stabilizers",notes:"Standing, kick leg back and rotate"},
          {id:"str-pow-wu-2",n:"Thoracic Extension (foam roll)",s:"",r:"2 min",rest:"",muscles:"Thoracic Spine",notes:"Arms crossed, roll from T4 to T12"},
          {id:"str-pow-wu-3",n:"Pause Box Squat (bar only)",s:"3",r:"5",rest:"30s",muscles:"Quads, Glutes",notes:"Pause 2s on box, feel hamstring load"},
          {id:"str-pow-wu-4",n:"Shoulder Capsule Stretch",s:"",r:"45s each",rest:"",muscles:"Posterior Shoulder",notes:"Cross body pull, stabilise with opposite hand"},
        ],
        main:[
          {id:"str-pow-m-1",n:"Back Squat",s:"5",r:"3",rest:"3 min",muscles:"Quads, Glutes, Core, Upper Back",notes:"85% 1RM. Brace hard, controlled descent"},
          {id:"str-pow-m-2",n:"Bench Press",s:"5",r:"3",rest:"3 min",muscles:"Pectorals, Triceps, Shoulders",notes:"Arch, retract scapula, drive feet into floor"},
          {id:"str-pow-m-3",n:"Conventional Deadlift",s:"4",r:"3",rest:"3 min",muscles:"Hamstrings, Glutes, Lower Back, Traps",notes:"Lat engagement cue: bend the bar"},
          {id:"str-pow-m-4",n:"Romanian Deadlift",s:"3",r:"8",rest:"90s",muscles:"Hamstrings, Glutes",notes:"Accessory — moderate weight, feel the stretch"},
          {id:"str-pow-m-5",n:"Paused Bench (60%)",s:"3",r:"5",rest:"90s",muscles:"Chest, Triceps",notes:"2s pause on chest, no bounce"},
        ],
        cooldown:[
          {id:"str-pow-cd-1",n:"Couch Stretch",s:"",r:"90s each",rest:"",muscles:"Hip Flexors, Quads",notes:"Against wall or box, vertical shin"},
          {id:"str-pow-cd-2",n:"Lat Hang",s:"",r:"60s",rest:"",muscles:"Lats, Thoracic",notes:"Passive hang on pull-up bar, decompress spine"},
          {id:"str-pow-cd-3",n:"Glute Pigeon",s:"",r:"90s each",rest:"",muscles:"Glutes, Piriformis",notes:"Elevated is fine if floor is too intense"},
        ],
      },
      bodybuilding:{
        label:"Bodybuilding / Hypertrophy", description:"Volume-focused training in the 8–15 rep range maximising muscle growth",
        warmup:[
          {id:"str-bbd-wu-1",n:"Resistance Band Chest Fly",s:"2",r:"15",rest:"20s",muscles:"Pectorals",notes:"Pre-activate before pressing"},
          {id:"str-bbd-wu-2",n:"Cable Face Pull",s:"2",r:"15",rest:"20s",muscles:"Rear Delts, External Rotators",notes:"External rotate at top"},
          {id:"str-bbd-wu-3",n:"Leg Extension (light)",s:"2",r:"15",rest:"20s",muscles:"Quads",notes:"Full extension, pause at top"},
          {id:"str-bbd-wu-4",n:"Hip Abduction",s:"2",r:"15",rest:"",muscles:"Glutes, Abductors",notes:"Cable or machine, slow eccentric"},
        ],
        main:[
          {id:"str-bbd-m-1",n:"Incline Dumbbell Press",s:"4",r:"12",rest:"90s",muscles:"Upper Chest, Shoulders, Triceps",notes:"30–45° angle, stretch at bottom"},
          {id:"str-bbd-m-2",n:"Cable Lateral Raise",s:"4",r:"15",rest:"60s",muscles:"Lateral Deltoid",notes:"Lead with elbow, no shrug"},
          {id:"str-bbd-m-3",n:"Leg Press",s:"4",r:"12",rest:"90s",muscles:"Quads, Glutes",notes:"Foot position controls emphasis"},
          {id:"str-bbd-m-4",n:"Machine Row",s:"4",r:"12",rest:"90s",muscles:"Lats, Rhomboids, Rear Delts",notes:"Drive elbows back, feel squeeze"},
          {id:"str-bbd-m-5",n:"Hammer Curl",s:"3",r:"12 each",rest:"60s",muscles:"Biceps, Brachialis",notes:"Neutral grip, no body swing"},
          {id:"str-bbd-m-6",n:"Tricep Rope Pushdown",s:"3",r:"15",rest:"60s",muscles:"Triceps",notes:"Spread rope at bottom, squeeze"},
          {id:"str-bbd-m-7",n:"Seated Leg Curl",s:"3",r:"12",rest:"60s",muscles:"Hamstrings",notes:"Full ROM, pause at peak contraction"},
        ],
        cooldown:[
          {id:"str-bbd-cd-1",n:"Lying Hamstring Stretch",s:"",r:"60s each",rest:"",muscles:"Hamstrings",notes:"Towel around foot if inflexible"},
          {id:"str-bbd-cd-2",n:"Cross-Body Shoulder Stretch",s:"",r:"45s each",rest:"",muscles:"Posterior Deltoid, Teres Minor",notes:"Pull straight arm across chest"},
          {id:"str-bbd-cd-3",n:"Bicep Wall Stretch",s:"",r:"45s each",rest:"",muscles:"Biceps, Anterior Shoulder",notes:"Hand on wall at shoulder height, rotate away"},
        ],
      },
      functional:{
        label:"Functional Strength", description:"Movement-based strength training for real-world athleticism and injury resilience",
        warmup:[
          {id:"str-func-wu-1",n:"Turkish Get-Up (no weight)",s:"2",r:"3 each side",rest:"30s",muscles:"Full Body, Stability",notes:"Slow deliberate each step"},
          {id:"str-func-wu-2",n:"Cossack Squat",s:"2",r:"8 each",rest:"20s",muscles:"Adductors, Quads, Ankles",notes:"Heel flat on working side"},
          {id:"str-func-wu-3",n:"Shoulder CARs",s:"2",r:"5 each direction",rest:"",muscles:"Shoulder Joint, Rotator Cuff",notes:"Full passive range of motion"},
        ],
        main:[
          {id:"str-func-m-1",n:"Single Leg Deadlift (DB)",s:"4",r:"8 each",rest:"90s",muscles:"Hamstrings, Glutes, Balance",notes:"Hip hinge, slight knee bend, tall spine"},
          {id:"str-func-m-2",n:"Turkish Get-Up",s:"4",r:"3 each side",rest:"90s",muscles:"Full Body, Core, Shoulder Stability",notes:"Slow on both up and down"},
          {id:"str-func-m-3",n:"Split Squat (Rear-Foot Elevated)",s:"4",r:"8 each",rest:"90s",muscles:"Quads, Glutes",notes:"Bulgarian — back foot elevated, vertical shin front"},
          {id:"str-func-m-4",n:"Suitcase Carry",s:"4",r:"40m",rest:"60s",muscles:"Core (Anti-Lateral Flexion), Grip",notes:"One arm, resist leaning"},
          {id:"str-func-m-5",n:"Landmine Press",s:"3",r:"10 each",rest:"75s",muscles:"Shoulders, Chest, Core",notes:"Staggered stance for stability"},
        ],
        cooldown:[
          {id:"str-func-cd-1",n:"90/90 Hip Stretch",s:"",r:"90s each",rest:"",muscles:"Hip Internal/External Rotators",notes:"Both positions — front and back leg"},
          {id:"str-func-cd-2",n:"Thoracic Rotation (Quadruped)",s:"",r:"45s each",rest:"",muscles:"Thoracic Spine, Obliques",notes:"Hand behind head, rotate elbow to ceiling"},
          {id:"str-func-cd-3",n:"Ankle Circles",s:"",r:"30s each direction",rest:"",muscles:"Ankles, Lower Leg",notes:"Full range, seated or standing"},
        ],
      },
    },
  },

  hiit:{
    label:"HIIT", icon:"⚡", color:"#F59E0B",
    description:"High-Intensity Interval Training — maximum effort bursts with strategic rest for fat loss and conditioning",
    subTypes:{
      tabata:{
        label:"Tabata", description:"20 seconds maximum effort, 10 seconds rest, 8 rounds = 4 minutes per exercise",
        warmup:[
          {id:"hiit-tab-wu-1",n:"Slow Squat Reach",s:"2",r:"10",rest:"20s",muscles:"Quads, Thoracic, Shoulders",notes:"Reach overhead as you stand"},
          {id:"hiit-tab-wu-2",n:"Arm Swing Cross-Body",s:"",r:"45s",rest:"",muscles:"Shoulders, Upper Back",notes:"Gradually increase speed and range"},
          {id:"hiit-tab-wu-3",n:"Step Touch",s:"",r:"60s",rest:"",muscles:"Legs, Coordination",notes:"Side to side, progress to grapevine"},
          {id:"hiit-tab-wu-4",n:"Slow Burpee",s:"2",r:"5",rest:"20s",muscles:"Full Body",notes:"No jump, controlled tempo"},
        ],
        main:[
          {id:"hiit-tab-m-1",n:"Squat Jump",s:"8",r:"20s MAX / 10s rest",rest:"",muscles:"Quads, Glutes, Power, Cardio",notes:"Full depth, explosive jump, land softly",timing:"tabata"},
          {id:"hiit-tab-m-2",n:"Push-Up Plank Alternating",s:"8",r:"20s MAX / 10s rest",rest:"",muscles:"Chest, Triceps, Core",notes:"Alternate between push-up and plank reach",timing:"tabata"},
          {id:"hiit-tab-m-3",n:"High Knees",s:"8",r:"20s MAX / 10s rest",rest:"",muscles:"Cardio, Hip Flexors, Core",notes:"Drive arms, maintain upright posture",timing:"tabata"},
          {id:"hiit-tab-m-4",n:"Alternating Reverse Lunge",s:"8",r:"20s MAX / 10s rest",rest:"",muscles:"Quads, Glutes",notes:"Explosively drive front knee up between lunges",timing:"tabata"},
          {id:"hiit-tab-m-5",n:"Battle Rope Slam",s:"8",r:"20s MAX / 10s rest",rest:"",muscles:"Shoulders, Core, Cardio",notes:"Overhead slam variation",timing:"tabata"},
        ],
        cooldown:[
          {id:"hiit-tab-cd-1",n:"Controlled Breathing Walk",s:"",r:"3 min",rest:"",muscles:"Cardiovascular Recovery",notes:"4-7-8 breath: inhale 4, hold 7, exhale 8"},
          {id:"hiit-tab-cd-2",n:"Standing Figure-4 Stretch",s:"",r:"60s each",rest:"",muscles:"Glutes, Piriformis",notes:"Wall or chair for balance"},
          {id:"hiit-tab-cd-3",n:"Neck and Shoulder Release",s:"",r:"30s each position",rest:"",muscles:"Traps, Neck, Shoulders",notes:"Ear to shoulder, apply gentle pressure"},
        ],
      },
      bootcamp:{
        label:"Bootcamp", description:"Military-style group training combining cardio, bodyweight strength and team drills",
        warmup:[
          {id:"hiit-boot-wu-1",n:"Jog + Sprint Shuttle",s:"2",r:"4x20m",rest:"30s",muscles:"Full Legs, Cardio",notes:"Walk, jog, run progression each shuttle"},
          {id:"hiit-boot-wu-2",n:"Jumping Jack",s:"2",r:"30s",rest:"15s",muscles:"Full Body, Cardio",notes:"Full arm extension overhead"},
          {id:"hiit-boot-wu-3",n:"Bear Crawl",s:"2",r:"20m",rest:"20s",muscles:"Core, Shoulders, Legs",notes:"Knees just off ground, opposing limbs"},
          {id:"hiit-boot-wu-4",n:"Iron Cross Leg Swing",s:"2",r:"10 each",rest:"",muscles:"Adductors, Hamstrings, Hip Flexors",notes:"Hold wall for balance"},
        ],
        main:[
          {id:"hiit-boot-m-1",n:"Burpee",s:"4",r:"10",rest:"30s",muscles:"Full Body, Cardio",notes:"No pause at top — continuous flow"},
          {id:"hiit-boot-m-2",n:"Sprint (50m)",s:"6",r:"1",rest:"45s",muscles:"Full Legs, Power, Cardio",notes:"Drive knees, pump arms"},
          {id:"hiit-boot-m-3",n:"Squat Thrust",s:"4",r:"15",rest:"30s",muscles:"Core, Quads, Shoulders",notes:"Plank position + feet jump in"},
          {id:"hiit-boot-m-4",n:"Push-Up Hold (Bottom Position)",s:"3",r:"20s",rest:"30s",muscles:"Chest, Triceps, Core",notes:"2 inches off floor, elbows at 45°"},
          {id:"hiit-boot-m-5",n:"Broad Jump",s:"4",r:"6",rest:"30s",muscles:"Power, Quads, Glutes",notes:"Land and reset, max distance each jump"},
          {id:"hiit-boot-m-6",n:"Flutter Kick",s:"3",r:"30s",rest:"20s",muscles:"Core, Hip Flexors",notes:"Lower back pressed down, controlled"},
        ],
        cooldown:[
          {id:"hiit-boot-cd-1",n:"Walking Lunge Stretch",s:"",r:"2 min",rest:"",muscles:"Hip Flexors, Quads",notes:"Slow, pause at lowest point each step"},
          {id:"hiit-boot-cd-2",n:"Seated Forward Fold",s:"",r:"90s",rest:"",muscles:"Hamstrings, Lower Back",notes:"Flex feet, reach forward"},
          {id:"hiit-boot-cd-3",n:"Thread the Needle",s:"",r:"60s each",rest:"",muscles:"Thoracic, Shoulder",notes:"From quadruped, one arm under body"},
        ],
      },
      athletic:{
        label:"Athletic Performance", description:"Sport-specific conditioning combining power, agility and metabolic work",
        warmup:[
          {id:"hiit-ath-wu-1",n:"Hip Circle",s:"2",r:"10 each direction",rest:"",muscles:"Hips, Glutes",notes:"Forward and backward hip circles"},
          {id:"hiit-ath-wu-2",n:"Ankle Bounce",s:"2",r:"30s",rest:"15s",muscles:"Calves, Achilles",notes:"Minimal ground contact time"},
          {id:"hiit-ath-wu-3",n:"A-Skip",s:"2",r:"20m",rest:"20s",muscles:"Hip Flexors, Calves, Coordination",notes:"Knee to 90°, push through forefoot"},
          {id:"hiit-ath-wu-4",n:"Lateral Bound (small)",s:"2",r:"8 each",rest:"20s",muscles:"Glutes, Adductors",notes:"Small, controlled lateral hops to start"},
        ],
        main:[
          {id:"hiit-ath-m-1",n:"Box Jump (Rebound)",s:"5",r:"6",rest:"45s",muscles:"Power, Quads, Calves",notes:"Minimal ground contact, fast rebound"},
          {id:"hiit-ath-m-2",n:"Lateral Hurdle Hop",s:"4",r:"10",rest:"30s",muscles:"Lateral Power, Ankles, Coordination",notes:"Quick feet, stiff ankles"},
          {id:"hiit-ath-m-3",n:"Med Ball Rotational Slam",s:"4",r:"8 each",rest:"30s",muscles:"Rotational Power, Obliques",notes:"Full hip rotation, aggressive"},
          {id:"hiit-ath-m-4",n:"Deceleration Lunge",s:"4",r:"6 each",rest:"30s",muscles:"Quads, Glutes, Proprioception",notes:"Step out aggressively, brake hard"},
          {id:"hiit-ath-m-5",n:"Single Leg Broad Jump",s:"3",r:"5 each",rest:"45s",muscles:"Power, Balance, Glutes",notes:"Stick the landing 2 seconds"},
        ],
        cooldown:[
          {id:"hiit-ath-cd-1",n:"Standing Quad Stretch",s:"",r:"45s each",rest:"",muscles:"Quads",notes:"Stabilising foot straight forward"},
          {id:"hiit-ath-cd-2",n:"Calf Stretch",s:"",r:"45s each, 2 positions",rest:"",muscles:"Gastrocnemius, Soleus",notes:"Straight knee then bent knee"},
          {id:"hiit-ath-cd-3",n:"Figure-4 Hip Stretch",s:"",r:"90s each",rest:"",muscles:"Glutes, Piriformis",notes:"Lying down, gentle pull"},
        ],
      },
    },
  },

  yoga:{
    label:"Yoga", icon:"🧘", color:"#10B981",
    description:"Mind-body practice integrating breath, movement and mindfulness",
    subTypes:{
      vinyasa:{
        label:"Vinyasa Flow", description:"Breath-linked movement flowing from pose to pose in a dynamic sequence",
        warmup:[
          {id:"yoga-vin-wu-1",n:"Child's Pose (Balasana)",s:"",r:"2 min",rest:"",muscles:"Hips, Thoracic, Lats",notes:"Arms extended, breathe into back body"},
          {id:"yoga-vin-wu-2",n:"Cat-Cow Flow",s:"2",r:"10 breaths",rest:"",muscles:"Spine, Core",notes:"Inhale = arch, exhale = round"},
          {id:"yoga-vin-wu-3",n:"Downward Dog",s:"",r:"60s",rest:"",muscles:"Hamstrings, Shoulders, Calves",notes:"Pedal heels alternately to open"},
          {id:"yoga-vin-wu-4",n:"Sun Salutation A (half speed)",s:"2",r:"1 round",rest:"",muscles:"Full Body",notes:"Focus on breath transitions, not speed"},
        ],
        main:[
          {id:"yoga-vin-m-1",n:"Sun Salutation B",s:"3",r:"1 round",rest:"",muscles:"Full Body, Cardio, Flexibility",notes:"Chair → Warrior 1 → Vinyasa"},
          {id:"yoga-vin-m-2",n:"Warrior 1 → 2 → Reverse",s:"",r:"5 breaths each side",rest:"",muscles:"Hips, Legs, Shoulders",notes:"Ground back foot, lengthen through fingertips"},
          {id:"yoga-vin-m-3",n:"Triangle → Extended Side Angle",s:"",r:"5 breaths each side",rest:"",muscles:"Adductors, Obliques, Hamstrings",notes:"Stack hips, lengthen side body"},
          {id:"yoga-vin-m-4",n:"Crow Pose (Bakasana)",s:"3",r:"15s",rest:"",muscles:"Core, Wrists, Shoulder Girdle",notes:"Round upper back, gaze forward"},
          {id:"yoga-vin-m-5",n:"Wheel (Urdhva Dhanurasana)",s:"3",r:"5 breaths",rest:"",muscles:"Hip Flexors, Chest, Shoulders, Spinal Extensors",notes:"Press into hands and feet evenly"},
        ],
        cooldown:[
          {id:"yoga-vin-cd-1",n:"Supine Spinal Twist",s:"",r:"90s each side",rest:"",muscles:"Thoracic, Obliques",notes:"Both shoulders contact the ground"},
          {id:"yoga-vin-cd-2",n:"Happy Baby",s:"",r:"90s",rest:"",muscles:"Hips, Groin, Lower Back",notes:"Rock gently side to side"},
          {id:"yoga-vin-cd-3",n:"Savasana",s:"",r:"5 min",rest:"",muscles:"Full Body Recovery, Nervous System",notes:"Complete stillness, scan body from feet to crown"},
        ],
      },
      yin:{
        label:"Yin Yoga", description:"Passive long-hold poses targeting deep connective tissue and joint mobility",
        warmup:[
          {id:"yoga-yin-wu-1",n:"Constructive Rest",s:"",r:"5 min",rest:"",muscles:"Lower Back, Nervous System",notes:"Feet flat on floor, knees up, arms relaxed"},
          {id:"yoga-yin-wu-2",n:"Supine Butterfly",s:"",r:"3 min",rest:"",muscles:"Adductors, Hips",notes:"Soles together, knees fall out. Support with blocks"},
          {id:"yoga-yin-wu-3",n:"Windshield Wiper Legs",s:"",r:"2 min",rest:"",muscles:"IT Band, Hips",notes:"Legs up, let knees fall side to side"},
        ],
        main:[
          {id:"yoga-yin-m-1",n:"Dragon Pose (deep lunge)",s:"",r:"3-5 min each",rest:"",muscles:"Hip Flexors, Quads",notes:"Sink weight forward, relax completely"},
          {id:"yoga-yin-m-2",n:"Sleeping Swan (Yin Pigeon)",s:"",r:"4-5 min each",rest:"",muscles:"Glutes, Hip External Rotators",notes:"Fold forward, use blocks under hip"},
          {id:"yoga-yin-m-3",n:"Caterpillar",s:"",r:"4-5 min",rest:"",muscles:"Hamstrings, Lower Back",notes:"Seated forward fold, fully round back"},
          {id:"yoga-yin-m-4",n:"Twisted Root (Reclined)",s:"",r:"3 min each",rest:"",muscles:"IT Band, Glutes, Thoracic",notes:"Cross leg over, both shoulders down"},
          {id:"yoga-yin-m-5",n:"Saddle Pose",s:"",r:"3-5 min",rest:"",muscles:"Quads, Hip Flexors, Ankles",notes:"Recline back — block under sacrum if needed"},
        ],
        cooldown:[
          {id:"yoga-yin-cd-1",n:"Savasana",s:"",r:"10 min",rest:"",muscles:"Nervous System, Full Body",notes:"Bolster under knees, eye pillow. Complete surrender"},
        ],
      },
      power_yoga:{
        label:"Power Yoga", description:"Strength-building yoga sequences combining poses with dynamic movement",
        warmup:[
          {id:"yoga-pow-wu-1",n:"Dynamic Child's Pose to Cobra",s:"",r:"8 reps",rest:"",muscles:"Spine, Shoulders, Hips",notes:"Flow between with breath"},
          {id:"yoga-pow-wu-2",n:"Standing Side Stretch",s:"",r:"45s each",rest:"",muscles:"Lats, Obliques",notes:"Reach overhead arc, breathe into ribs"},
          {id:"yoga-pow-wu-3",n:"Sun Salutation A",s:"3",r:"1 round",rest:"",muscles:"Full Body",notes:"Building pace, not max speed"},
        ],
        main:[
          {id:"yoga-pow-m-1",n:"Chair Pose Hold",s:"3",r:"10 breaths",rest:"",muscles:"Quads, Core, Shoulders",notes:"Arms overhead, sit deeper each breath"},
          {id:"yoga-pow-m-2",n:"Warrior 3 Balance",s:"3",r:"8 breaths each",rest:"",muscles:"Glutes, Hamstrings, Core",notes:"T-shape, flex standing foot"},
          {id:"yoga-pow-m-3",n:"Side Plank (Vasisthasana)",s:"3",r:"20s each",rest:"",muscles:"Obliques, Shoulders",notes:"Stack feet or stagger for modification"},
          {id:"yoga-pow-m-4",n:"Locust Pose",s:"3",r:"15s",rest:"",muscles:"Spinal Extensors, Glutes, Hamstrings",notes:"Both legs and arms off floor simultaneously"},
          {id:"yoga-pow-m-5",n:"Chaturanga Flow",s:"4",r:"8",rest:"",muscles:"Chest, Triceps, Core",notes:"Elbows skim ribs, straight line down"},
        ],
        cooldown:[
          {id:"yoga-pow-cd-1",n:"Seated Wide-Leg Forward Fold",s:"",r:"90s",rest:"",muscles:"Adductors, Hamstrings",notes:"Lead with chest, not forehead"},
          {id:"yoga-pow-cd-2",n:"Supine Spinal Twist",s:"",r:"90s each",rest:"",muscles:"Thoracic, Obliques",notes:"Arms in T, breathe into restriction"},
          {id:"yoga-pow-cd-3",n:"Legs-Up-the-Wall",s:"",r:"5 min",rest:"",muscles:"Legs, Lower Back, Nervous System",notes:"Scoot hips close to wall"},
        ],
      },
    },
  },

  boxing:{
    label:"Boxing / Kickboxing", icon:"🥊", color:"#EC4899",
    description:"Combat sports conditioning — technique, power and cardiovascular fitness through striking",
    subTypes:{
      boxing_fundamentals:{
        label:"Boxing Fundamentals", description:"Stance, footwork and the six basic punches — beginner to intermediate",
        warmup:[
          {id:"box-fund-wu-1",n:"Jump Rope",s:"3",r:"2 min",rest:"30s",muscles:"Calves, Coordination, Cardio",notes:"Focus on rhythm, not speed"},
          {id:"box-fund-wu-2",n:"Neck Rolls + Shoulder Circles",s:"2",r:"45s",rest:"",muscles:"Cervical Spine, Shoulders",notes:"Slow, no full backward roll"},
          {id:"box-fund-wu-3",n:"Shadow Boxing (low intensity)",s:"2",r:"2 min",rest:"30s",muscles:"Shoulders, Core, Cardio",notes:"Practice stance and weight transfer"},
          {id:"box-fund-wu-4",n:"Hip Rotation Drill",s:"2",r:"20",rest:"",muscles:"Core, Obliques",notes:"Drive rotation from hips, not shoulders"},
        ],
        main:[
          {id:"box-fund-m-1",n:"Jab-Cross Combo (Heavy Bag)",s:"4",r:"2 min rounds",rest:"1 min",muscles:"Shoulders, Chest, Core",notes:"Extend fully, retract fast"},
          {id:"box-fund-m-2",n:"1-2-3-4 Combo",s:"4",r:"2 min rounds",rest:"1 min",muscles:"Full Upper Body, Core",notes:"Jab-Cross-Left hook-Right hook"},
          {id:"box-fund-m-3",n:"Slip and Counter",s:"3",r:"90s",rest:"60s",muscles:"Core, Legs, Reaction",notes:"Bob outside lead foot, counter cross"},
          {id:"box-fund-m-4",n:"Footwork Ladder",s:"3",r:"60s",rest:"30s",muscles:"Calves, Glutes, Coordination",notes:"In/out, lateral, pivot patterns"},
          {id:"box-fund-m-5",n:"3-Minute Bag Round",s:"5",r:"3 min",rest:"1 min",muscles:"Full Body, Cardio, Endurance",notes:"Vary combos — work jabs, body shots"},
        ],
        cooldown:[
          {id:"box-fund-cd-1",n:"Shoulder Pendulum Swing",s:"",r:"60s each",rest:"",muscles:"Rotator Cuff, Anterior Shoulder",notes:"Lean forward, arm hangs and circles"},
          {id:"box-fund-cd-2",n:"Wrist and Forearm Stretch",s:"",r:"45s each direction",rest:"",muscles:"Forearms, Wrists",notes:"Extensor and flexor stretch both ways"},
          {id:"box-fund-cd-3",n:"Standing Glute Stretch",s:"",r:"60s each",rest:"",muscles:"Glutes, Piriformis",notes:"Figure-4 standing, wall for balance"},
        ],
      },
      kickboxing:{
        label:"Kickboxing", description:"Full-body striking combining punches and kicks for maximum conditioning",
        warmup:[
          {id:"kick-wu-1",n:"Jump Rope Intervals",s:"3",r:"90s",rest:"30s",muscles:"Cardio, Coordination",notes:"Vary between single and alternating foot"},
          {id:"kick-wu-2",n:"Dynamic Hip Opener",s:"2",r:"10 each",rest:"",muscles:"Hips, Groin",notes:"Hold something, circle leg forward/back"},
          {id:"kick-wu-3",n:"Leg Swing Kick",s:"2",r:"10 each",rest:"",muscles:"Hamstrings, Hip Flexors",notes:"Front kick motion, controlled"},
          {id:"kick-wu-4",n:"Shadow Combo",s:"2",r:"2 min",rest:"30s",muscles:"Full Body, Cardio",notes:"Include low kicks — visualise targets"},
        ],
        main:[
          {id:"kick-m-1",n:"Roundhouse Kick (pad or bag)",s:"4",r:"10 each side",rest:"45s",muscles:"Glutes, Obliques, Hip Flexors",notes:"Chamber, rotate hip, snap and retract"},
          {id:"kick-m-2",n:"Front Kick (Teep)",s:"4",r:"10 each",rest:"30s",muscles:"Quads, Hip Flexors, Core",notes:"Push through heel, re-chamber before landing"},
          {id:"kick-m-3",n:"Jab-Cross-Roundhouse Combo",s:"4",r:"2 min rounds",rest:"1 min",muscles:"Full Body, Cardio",notes:"Mix kicks at body and head height"},
          {id:"kick-m-4",n:"Jump Knee Strike",s:"3",r:"8 each",rest:"45s",muscles:"Core, Hip Flexors, Quads",notes:"Drive knee up explosively, tall upper body"},
          {id:"kick-m-5",n:"Thai Pad Work",s:"5",r:"3 min rounds",rest:"1 min",muscles:"Full Body, Power, Reaction",notes:"Call combos mid-round"},
        ],
        cooldown:[
          {id:"kick-cd-1",n:"Hip Flexor Lunge Stretch",s:"",r:"90s each",rest:"",muscles:"Hip Flexors, Quads",notes:"Back knee down, sink forward"},
          {id:"kick-cd-2",n:"Butterfly Groin Stretch",s:"",r:"90s",rest:"",muscles:"Adductors, Groin",notes:"Soles together, lean gently forward"},
          {id:"kick-cd-3",n:"Lying Quad Stretch",s:"",r:"60s each",rest:"",muscles:"Quads",notes:"Side-lying, bend knee to glute"},
        ],
      },
    },
  },

  pilates:{
    label:"Pilates", icon:"🌀", color:"#06B6D4",
    description:"Core-centred training integrating breath, alignment and controlled movement",
    subTypes:{
      mat_pilates:{
        label:"Mat Pilates", description:"Classical mat sequence using bodyweight for core strength, posture and flexibility",
        warmup:[
          {id:"pil-mat-wu-1",n:"Breathing Prep",s:"",r:"8 breaths",rest:"",muscles:"Deep Core, Diaphragm",notes:"Inhale wide ribcage, exhale zip from pelvic floor up"},
          {id:"pil-mat-wu-2",n:"Pelvic Curl",s:"2",r:"8",rest:"",muscles:"Glutes, Hamstrings, Spinal Articulation",notes:"Peel spine off mat vertebra by vertebra"},
          {id:"pil-mat-wu-3",n:"Spine Twist Supine",s:"2",r:"6 each",rest:"",muscles:"Obliques, Thoracic",notes:"Knees fall to one side, opposite shoulder stays"},
          {id:"pil-mat-wu-4",n:"Chest Lift",s:"2",r:"10",rest:"",muscles:"Rectus Abdominis, Hip Flexors",notes:"Curl from crown of head, elbows wide"},
        ],
        main:[
          {id:"pil-mat-m-1",n:"The Hundred",s:"1",r:"100 pumps",rest:"",muscles:"Core, Hip Flexors, Shoulders",notes:"Inhale 5, exhale 5. Legs at table-top or diagonal"},
          {id:"pil-mat-m-2",n:"Roll-Up",s:"3",r:"8",rest:"",muscles:"Rectus Abdominis, Spinal Flexibility",notes:"Peel and stack each vertebra, control down"},
          {id:"pil-mat-m-3",n:"Single Leg Stretch",s:"3",r:"10 each",rest:"",muscles:"Core, Hip Flexors",notes:"Hands on ankle and knee of bent leg"},
          {id:"pil-mat-m-4",n:"Criss-Cross",s:"3",r:"12",rest:"",muscles:"Obliques, Core",notes:"Rotate to opposite knee, extend other leg"},
          {id:"pil-mat-m-5",n:"Swan",s:"3",r:"6",rest:"",muscles:"Spinal Extensors, Glutes",notes:"Keep pelvis down, lengthen not compress"},
          {id:"pil-mat-m-6",n:"Side Kick Series",s:"2",r:"10 each",rest:"",muscles:"Glutes, Abductors, Core Stability",notes:"Stable pelvis and spine throughout"},
        ],
        cooldown:[
          {id:"pil-mat-cd-1",n:"Mermaid Stretch",s:"",r:"45s each",rest:"",muscles:"Obliques, Lats",notes:"Side sit, arm arcs over head"},
          {id:"pil-mat-cd-2",n:"Rest Position (Child's Pose)",s:"",r:"2 min",rest:"",muscles:"Hips, Lower Back, Thoracic",notes:"Breathe into back body completely"},
          {id:"pil-mat-cd-3",n:"Spine Stretch Forward",s:"",r:"60s",rest:"",muscles:"Hamstrings, Spinal Flexion",notes:"Seated, reach forward over straight legs"},
        ],
      },
      core_focus:{
        label:"Core Focus", description:"Deep stabiliser activation targeting the Pilates powerhouse — transversus abdominis, pelvic floor, multifidus",
        warmup:[
          {id:"pil-core-wu-1",n:"Imprinting Exercise",s:"",r:"2 min",rest:"",muscles:"Multifidus, Pelvic Floor",notes:"Find neutral spine, breathe deep abdomen"},
          {id:"pil-core-wu-2",n:"Heel Slides",s:"2",r:"8 each",rest:"",muscles:"Deep Core, Hip Flexors",notes:"Maintain neutral spine as leg extends"},
          {id:"pil-core-wu-3",n:"Bent Knee Fall Out",s:"2",r:"6 each",rest:"",muscles:"Hip Rotators, Deep Core Stability",notes:"Pelvis completely still, knee falls slowly"},
        ],
        main:[
          {id:"pil-core-m-1",n:"Dead Bug",s:"3",r:"8 each",rest:"30s",muscles:"Transversus Abdominis, Core",notes:"Opposite arm/leg, press lower back down"},
          {id:"pil-core-m-2",n:"Bird Dog",s:"3",r:"8 each",rest:"30s",muscles:"Multifidus, Glutes, Core",notes:"Level pelvis, extend fully"},
          {id:"pil-core-m-3",n:"Plank with Tap",s:"3",r:"8 each",rest:"30s",muscles:"Core, Shoulders, Glutes",notes:"Lift alternate hand to tap, minimal hip sway"},
          {id:"pil-core-m-4",n:"Bicycle Crunch",s:"3",r:"12 each",rest:"30s",muscles:"Obliques, Rectus Abdominis",notes:"Long elbow, rotate from ribcage not neck"},
          {id:"pil-core-m-5",n:"Side Plank Clamshell",s:"3",r:"10 each",rest:"30s",muscles:"Obliques, Glutes",notes:"Side plank, top knee opens"},
          {id:"pil-core-m-6",n:"Hollow Body Rock",s:"3",r:"20s",rest:"30s",muscles:"Full Core, Hip Flexors",notes:"Arms by ears, rock from shoulders to hips"},
        ],
        cooldown:[
          {id:"pil-core-cd-1",n:"Cat-Cow 3D",s:"",r:"8 each direction",rest:"",muscles:"Spine, Core",notes:"Also side-bend and rotation"},
          {id:"pil-core-cd-2",n:"Supine Knees to Chest",s:"",r:"90s",rest:"",muscles:"Lower Back, Glutes",notes:"Hug knees, gentle rock"},
          {id:"pil-core-cd-3",n:"Hip Hinge Release",s:"",r:"60s",rest:"",muscles:"Lower Back, Hamstrings",notes:"Standing, hinge and hang limp"},
        ],
      },
    },
  },

  bootcamp:{
    label:"Bootcamp", icon:"🎖️", color:"#7A94AA",
    description:"Military-inspired group training combining functional fitness, resilience and team challenge",
    subTypes:{
      military:{
        label:"Military Style", description:"Classic military physical training — functional endurance and raw toughness",
        warmup:[
          {id:"boot-mil-wu-1",n:"Jog on Spot",s:"",r:"3 min",rest:"",muscles:"Legs, Cardio",notes:"Progress intensity each minute"},
          {id:"boot-mil-wu-2",n:"Squat Thrust",s:"2",r:"10",rest:"20s",muscles:"Core, Quads, Shoulders",notes:"Controlled, not rushed"},
          {id:"boot-mil-wu-3",n:"Side-Straddle Hop",s:"2",r:"20",rest:"15s",muscles:"Full Body, Coordination",notes:"Military jumping jack — 4-count"},
          {id:"boot-mil-wu-4",n:"Arm Circles",s:"",r:"30s each direction",rest:"",muscles:"Shoulders",notes:"Forward and backward, small to large"},
        ],
        main:[
          {id:"boot-mil-m-1",n:"Push-Up",s:"4",r:"20",rest:"30s",muscles:"Chest, Triceps, Core",notes:"Cadence: down-two-three, up"},
          {id:"boot-mil-m-2",n:"Squat",s:"4",r:"20",rest:"30s",muscles:"Quads, Glutes",notes:"Parallel or below, weight in heels"},
          {id:"boot-mil-m-3",n:"Sit-Up",s:"4",r:"20",rest:"30s",muscles:"Core, Hip Flexors",notes:"Feet secured, full range"},
          {id:"boot-mil-m-4",n:"Burpee",s:"3",r:"15",rest:"45s",muscles:"Full Body, Cardio",notes:"Max effort, consistent form"},
          {id:"boot-mil-m-5",n:"Run (400m)",s:"4",r:"1",rest:"2 min",muscles:"Full Legs, Cardio, Endurance",notes:"Moderate pace, not sprint — maintain form"},
          {id:"boot-mil-m-6",n:"Plank",s:"3",r:"45s",rest:"30s",muscles:"Core, Shoulders",notes:"Rigid as a plank"},
        ],
        cooldown:[
          {id:"boot-mil-cd-1",n:"Standing IT Band Stretch",s:"",r:"45s each",rest:"",muscles:"IT Band, Glutes",notes:"Cross one leg, lean away"},
          {id:"boot-mil-cd-2",n:"Chest Opener",s:"",r:"60s",rest:"",muscles:"Pectorals, Anterior Shoulder",notes:"Clasp hands behind back, open chest"},
          {id:"boot-mil-cd-3",n:"Standing Hamstring Stretch",s:"",r:"60s each",rest:"",muscles:"Hamstrings",notes:"Straight leg heel elevated on surface"},
        ],
      },
      athletic_camp:{
        label:"Athletic Camp", description:"Sport science-backed bootcamp combining athletic drills with functional strength",
        warmup:[
          {id:"boot-ath-wu-1",n:"Skipping",s:"",r:"3 min",rest:"",muscles:"Cardio, Calves, Coordination",notes:"Single skip, vary rhythm"},
          {id:"boot-ath-wu-2",n:"Lunge with Rotation",s:"2",r:"8 each",rest:"20s",muscles:"Hip Flexors, Thoracic, Quads",notes:"Hands behind head, rotate to front leg"},
          {id:"boot-ath-wu-3",n:"T-Drill",s:"3",r:"1",rest:"30s",muscles:"Agility, Change of Direction, Legs",notes:"Forward run, lateral shuffle, backpedal"},
          {id:"boot-ath-wu-4",n:"Spiderman Stretch",s:"",r:"5 each side",rest:"",muscles:"Hip Flexors, Thoracic, Groin",notes:"From push-up: step outside hand, hold 3s"},
        ],
        main:[
          {id:"boot-ath-m-1",n:"Sled Push / Prowler",s:"4",r:"20m",rest:"90s",muscles:"Quads, Glutes, Calves, Drive",notes:"Forward lean, short fast steps"},
          {id:"boot-ath-m-2",n:"Tyre Flip",s:"4",r:"6",rest:"60s",muscles:"Posterior Chain, Grip, Power",notes:"Deadlift pattern, push as it tips"},
          {id:"boot-ath-m-3",n:"Battle Rope",s:"4",r:"30s",rest:"30s",muscles:"Shoulders, Core, Cardio",notes:"Alternate waves, maintain low stance"},
          {id:"boot-ath-m-4",n:"Sandbag Carry",s:"4",r:"40m",rest:"60s",muscles:"Core, Grip, Traps, Legs",notes:"Bear hug or shoulder carry — both sides"},
          {id:"boot-ath-m-5",n:"Box Jump Burpee",s:"3",r:"8",rest:"45s",muscles:"Power, Full Body, Cardio",notes:"Burpee into box jump — land controlled"},
        ],
        cooldown:[
          {id:"boot-ath-cd-1",n:"Standing Overhead Stretch",s:"",r:"60s",rest:"",muscles:"Lats, Thoracic, Shoulders",notes:"Interlace fingers overhead, lengthen"},
          {id:"boot-ath-cd-2",n:"Pigeon Stretch",s:"",r:"90s each",rest:"",muscles:"Glutes, Hip External Rotators",notes:"Knee towards same-side wrist"},
          {id:"boot-ath-cd-3",n:"Neck Stretch",s:"",r:"30s each",rest:"",muscles:"Neck, Upper Traps",notes:"Ear to shoulder, gentle hand assist"},
        ],
      },
    },
  },

  hyrox:{
    label:"Hyrox", icon:"🏅", color:"#F59E0B",
    description:"The world fitness race — 8×1km runs each followed by a functional workout station",
    subTypes:{
      race_prep:{
        label:"Race Simulation", description:"Full Hyrox-format session simulating the 8 station race structure with running intervals",
        warmup:[
          {id:"hx-race-wu-1",n:"Easy Run",s:"",r:"8 min",rest:"",muscles:"Full Legs, Cardio",notes:"Conversational pace. Build leg turnover gradually"},
          {id:"hx-race-wu-2",n:"Hip Flexor Lunge",s:"",r:"60s each side",rest:"",muscles:"Hip Flexors, Quads",notes:"Deep lunge, reach arm overhead on front leg side"},
          {id:"hx-race-wu-3",n:"Leg Swing",s:"",r:"15 each direction",rest:"",muscles:"Hip Flexors, Hamstrings",notes:"Forward/back and lateral. Hold wall for balance"},
          {id:"hx-race-wu-4",n:"Shoulder Circle",s:"",r:"10 each direction",rest:"",muscles:"Shoulders, Thoracic",notes:"Full ROM, large slow circles"},
          {id:"hx-race-wu-5",n:"Box Step-Up",s:"2",r:"10 each",rest:"30s",muscles:"Quads, Glutes",notes:"Activate glutes before heavy stations"},
        ],
        main:[
          {id:"hx-race-m-1",n:"1km Run + Ski Erg",s:"",r:"1km + 1000m",rest:"Into next station",muscles:"Full Body, Cardio, Shoulders",notes:"Ski erg: hinge at hips, drive with arms and legs. Consistent stroke rate",timing:"none"},
          {id:"hx-race-m-2",n:"1km Run + Sled Push",s:"",r:"1km + 50m",rest:"Into next station",muscles:"Quads, Glutes, Drive",notes:"Heavy sled: forward lean 45°, fast short steps, breathe every 2-3 steps"},
          {id:"hx-race-m-3",n:"1km Run + Sled Pull",s:"",r:"1km + 50m",rest:"Into next station",muscles:"Posterior Chain, Grip",notes:"Light sled: walk backward, hand over hand rope pull. Keep back straight"},
          {id:"hx-race-m-4",n:"1km Run + Burpee Broad Jumps",s:"",r:"1km + 80m",rest:"Into next station",muscles:"Full Body, Power, Cardio",notes:"Chest to floor, explosive jump forward. Find rhythm — don't sprint then die"},
          {id:"hx-race-m-5",n:"1km Run + Rowing",s:"",r:"1km + 1000m",rest:"Into next station",muscles:"Full Body, Posterior Chain, Cardio",notes:"Drive with legs first, lean back slightly, pull hands to sternum. 24-26 SPM target"},
          {id:"hx-race-m-6",n:"1km Run + Farmers Carry",s:"",r:"1km + 200m",rest:"Into next station",muscles:"Grip, Traps, Core, Legs",notes:"Tall posture, neutral spine. Switch hands at 100m turnaround"},
          {id:"hx-race-m-7",n:"1km Run + Sandbag Lunges",s:"",r:"1km + 100m",rest:"Into next station",muscles:"Quads, Glutes, Core",notes:"Sandbag in front rack or hugged to chest. Back knee close to floor"},
          {id:"hx-race-m-8",n:"1km Run + Wall Balls",s:"",r:"1km + 100 reps",rest:"Finish",muscles:"Quads, Shoulders, Cardio",notes:"10ft target. Full squat, drive through heels, release ball at top of push"},
        ],
        cooldown:[
          {id:"hx-race-cd-1",n:"Walk",s:"",r:"5 min",rest:"",muscles:"Cardiovascular Recovery",notes:"Slow walk, hands on head, deep nasal breaths"},
          {id:"hx-race-cd-2",n:"Quad Stretch",s:"",r:"60s each",rest:"",muscles:"Quads, Hip Flexors",notes:"Standing or lying, pull heel to glute"},
          {id:"hx-race-cd-3",n:"Hamstring Stretch",s:"",r:"60s each",rest:"",muscles:"Hamstrings",notes:"Seated single leg, reach toward toes"},
          {id:"hx-race-cd-4",n:"Shoulder Cross-Body Stretch",s:"",r:"45s each",rest:"",muscles:"Posterior Shoulder, Rhomboids",notes:"Pull arm across chest, ease into stretch"},
          {id:"hx-race-cd-5",n:"Cat-Cow",s:"",r:"10 slow",rest:"",muscles:"Thoracic Spine, Lumbar",notes:"On all fours. Full spinal flexion and extension"},
        ],
      },
      station_strength:{
        label:"Station Strength", description:"Isolated Hyrox station training — build strength and technique at each exercise",
        warmup:[
          {id:"hx-str-wu-1",n:"Row Erg Warm-Up",s:"",r:"3 min easy",rest:"",muscles:"Full Body, Posterior Chain",notes:"Damper at 3. Focus on leg drive sequence"},
          {id:"hx-str-wu-2",n:"Goblet Squat",s:"2",r:"10",rest:"30s",muscles:"Quads, Glutes, Thoracic",notes:"Light KB. Elbows inside knees, tall chest"},
          {id:"hx-str-wu-3",n:"Banded Shoulder Warm-Up",s:"2",r:"12",rest:"20s",muscles:"Rotator Cuff, Rear Delts",notes:"External rotation + band pull-apart"},
          {id:"hx-str-wu-4",n:"Walking Lunge",s:"",r:"20m",rest:"",muscles:"Quads, Glutes, Hip Flexors",notes:"Long stride, upright torso"},
        ],
        main:[
          {id:"hx-str-m-1",n:"Ski Erg Intervals",s:"5",r:"200m",rest:"90s",muscles:"Lats, Shoulders, Core, Cardio",notes:"Target consistent pace each rep. Practice double-pole rhythm"},
          {id:"hx-str-m-2",n:"Sled Push",s:"4",r:"25m",rest:"2 min",muscles:"Quads, Glutes, Calves",notes:"Add weight each set. Find race-day weight and master it"},
          {id:"hx-str-m-3",n:"Farmers Carry",s:"4",r:"50m",rest:"90s",muscles:"Grip, Traps, Core",notes:"Race weight. Time each rep, aim for sub-40s per 50m"},
          {id:"hx-str-m-4",n:"Sandbag Lunge",s:"3",r:"20m",rest:"90s",muscles:"Quads, Glutes, Core",notes:"Slow and controlled. Knee close to floor without touching"},
          {id:"hx-str-m-5",n:"Wall Ball",s:"4",r:"25",rest:"60s",muscles:"Quads, Shoulders, Cardio",notes:"Unbroken sets. Catch below chin, squat, explode"},
          {id:"hx-str-m-6",n:"Burpee Broad Jump",s:"3",r:"20m",rest:"90s",muscles:"Full Body, Power",notes:"Measure and track distance. Aim for consistent jump distance"},
        ],
        cooldown:[
          {id:"hx-str-cd-1",n:"Hip Flexor Stretch",s:"",r:"90s each",rest:"",muscles:"Hip Flexors",notes:"Low lunge, sink hips. Arms overhead for deeper stretch"},
          {id:"hx-str-cd-2",n:"Lat Stretch",s:"",r:"60s each",rest:"",muscles:"Lats, Thoracic",notes:"Arm overhead on box/wall, sit back into stretch"},
          {id:"hx-str-cd-3",n:"Calf Raises + Stretch",s:"",r:"60s",rest:"",muscles:"Gastrocnemius, Soleus",notes:"10 slow raises then stretch. Address running tightness"},
        ],
      },
      open_format:{
        label:"Hyrox Open", description:"Scaled or partner format — accessible Hyrox training for all fitness levels",
        warmup:[
          {id:"hx-open-wu-1",n:"Light Jog",s:"",r:"5 min",rest:"",muscles:"Legs, Cardio",notes:"5 min easy jog to elevate heart rate"},
          {id:"hx-open-wu-2",n:"Glute Bridge",s:"2",r:"15",rest:"20s",muscles:"Glutes, Hamstrings",notes:"Pause at top, squeeze glutes"},
          {id:"hx-open-wu-3",n:"Arm Swing",s:"",r:"30s each direction",rest:"",muscles:"Shoulders, Thoracic",notes:"Loosen shoulders for ski erg and carries"},
        ],
        main:[
          {id:"hx-open-m-1",n:"Run / Row Interval",s:"4",r:"400m each",rest:"2 min",muscles:"Full Legs, Cardio",notes:"Alternate between run and row to simulate race demands at lower intensity"},
          {id:"hx-open-m-2",n:"Light Sled Push",s:"4",r:"20m",rest:"90s",muscles:"Quads, Glutes",notes:"50% race weight. Build confidence with technique"},
          {id:"hx-open-m-3",n:"KB Carry (Farmers)",s:"3",r:"40m",rest:"60s",muscles:"Grip, Core, Traps",notes:"Light to moderate. Walk tall, neutral spine"},
          {id:"hx-open-m-4",n:"Goblet Squat + Wall Ball Combo",s:"3",r:"10+10",rest:"60s",muscles:"Quads, Shoulders, Glutes",notes:"10 goblet squats into 10 wall balls — mimics race transition fatigue"},
          {id:"hx-open-m-5",n:"Walking Lunge (Unloaded)",s:"3",r:"30m",rest:"60s",muscles:"Quads, Glutes",notes:"Learn sandbag lunge mechanics without load first"},
        ],
        cooldown:[
          {id:"hx-open-cd-1",n:"Full Body Stretch Sequence",s:"",r:"5 min",rest:"",muscles:"Full Body",notes:"Quad, hip flexor, hamstring, shoulder — 45s each"},
          {id:"hx-open-cd-2",n:"Foam Roll Quads",s:"",r:"90s each",rest:"",muscles:"Quads, IT Band",notes:"Slow passes. Pause on tender spots"},
          {id:"hx-open-cd-3",n:"Box Breathing",s:"",r:"5 rounds",rest:"",muscles:"Nervous System Recovery",notes:"Inhale 4s, hold 4s, exhale 4s, hold 4s"},
        ],
      },
    },
  },
};

// ─── SCFG-to-library stage mapping ───────────────────────────────────────────
// Maps builder stage types → which exercise pool to draw from
export const STAGE_LIBRARY_MAP = {
  warmup:   "warmup",
  cooldown: "cooldown",
  stretch:  "cooldown",
  recovery: "cooldown",
  circuit:  "main",
  strength: "main",
  cardio:   "main",
};

// The stage timeline for a class type that has no entry above — which since
// DEC-16 (session 18) means any class type the GYM authored. Without it,
// `buildStagesFromTemplate` returned null for a gym's own type, `applyTemplate`
// returned early, and selecting "Barre" left the Builder showing whatever the
// previous class type had produced: the dropdown said Barre and the stages said
// CrossFit. A silent disagreement between the label and the content is worse
// than a visible failure, and it shipped for about an hour.
//
// Deliberately generic — warm-up, one main block, cool-down, 35 minutes. A gym
// authoring a class type is telling us we do not know its shape, so guessing a
// specialised one would be worse than an honest skeleton they can edit.
export const DEFAULT_STAGE_TEMPLATE = [
  { name: "Warm-Up",   type: "warmup",   dur: 300  },
  { name: "Main Set",  type: "circuit",  dur: 1500 },
  { name: "Cool-Down", type: "cooldown", dur: 300  },
];

// ─── Class-level stage structure templates ────────────────────────────────────
// Defines the default stage timeline for each class type + sub-type.
// Each entry is an array of { name, type, dur } — id/exercises/tracks added at apply-time.
export const CLASS_STAGE_TEMPLATES = {
  crossfit:{
    wod:[
      {name:"Warm-Up",    type:"warmup",   dur:300},
      {name:"Skill Work", type:"strength", dur:900},
      {name:"WOD",        type:"circuit",  dur:1200},
      {name:"Cool-Down",  type:"cooldown", dur:300},
    ],
    amrap:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"AMRAP",     type:"circuit", dur:1200},
      {name:"Cool-Down", type:"cooldown",dur:300},
    ],
    emom:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"EMOM",      type:"circuit", dur:1200},
      {name:"Cool-Down", type:"cooldown",dur:300},
    ],
  },
  spin:{
    endurance:[
      {name:"Warm-Up",      type:"warmup",  dur:300},
      {name:"Base Ride",    type:"cardio",  dur:900},
      {name:"Climb Block",  type:"cardio",  dur:900},
      {name:"Sprint Block", type:"cardio",  dur:600},
      {name:"Cool-Down",    type:"cooldown",dur:300},
    ],
    hiit_ride:[
      {name:"Warm-Up",          type:"warmup",   dur:300},
      {name:"Sprint Intervals", type:"cardio",   dur:1200},
      {name:"Active Recovery",  type:"recovery", dur:300},
      {name:"Finisher",         type:"cardio",   dur:300},
      {name:"Cool-Down",        type:"cooldown", dur:300},
    ],
    hills:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"Climb A",   type:"cardio",  dur:720},
      {name:"Climb B",   type:"cardio",  dur:720},
      {name:"Climb C",   type:"cardio",  dur:480},
      {name:"Cool-Down", type:"cooldown",dur:480},
    ],
  },
  circuit:{
    cardio_circuit:[
      {name:"Warm-Up",         type:"warmup",   dur:300},
      {name:"Circuit A",       type:"circuit",  dur:900},
      {name:"Active Recovery", type:"recovery", dur:180},
      {name:"Circuit B",       type:"circuit",  dur:900},
      {name:"Cool-Down",       type:"cooldown", dur:420},
    ],
    strength_circuit:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"Circuit A", type:"circuit", dur:720},
      {name:"Circuit B", type:"circuit", dur:720},
      {name:"Circuit C", type:"circuit", dur:720},
      {name:"Cool-Down", type:"cooldown",dur:540},
    ],
    fundamental:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"Circuit A", type:"circuit", dur:1200},
      {name:"Cool-Down", type:"cooldown",dur:300},
    ],
  },
  strength:{
    powerlifting:[
      {name:"Warm-Up",        type:"warmup",   dur:600},
      {name:"Main Lifts",     type:"strength", dur:2100},
      {name:"Accessory Work", type:"strength", dur:600},
      {name:"Cool-Down",      type:"cooldown", dur:300},
    ],
    bodybuilding:[
      {name:"Warm-Up",         type:"warmup",   dur:300},
      {name:"Primary Group",   type:"strength", dur:1200},
      {name:"Secondary Group", type:"strength", dur:1200},
      {name:"Isolation",       type:"strength", dur:300},
      {name:"Cool-Down",       type:"cooldown", dur:300},
    ],
    functional:[
      {name:"Warm-Up",        type:"warmup",  dur:300},
      {name:"Strength Block", type:"strength",dur:1500},
      {name:"Cool-Down",      type:"cooldown",dur:300},
    ],
  },
  hiit:{
    tabata:[
      {name:"Warm-Up",        type:"warmup",   dur:300},
      {name:"Tabata Block 1", type:"circuit",  dur:480},
      {name:"Rest",           type:"recovery", dur:120},
      {name:"Tabata Block 2", type:"circuit",  dur:480},
      {name:"Rest",           type:"recovery", dur:120},
      {name:"Cool-Down",      type:"cooldown", dur:300},
    ],
    bootcamp:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"Station A", type:"circuit", dur:900},
      {name:"Station B", type:"circuit", dur:900},
      {name:"Cool-Down", type:"cooldown",dur:300},
    ],
    athletic:[
      {name:"Warm-Up",      type:"warmup",  dur:300},
      {name:"Power Block",  type:"strength",dur:600},
      {name:"Conditioning", type:"circuit", dur:1200},
      {name:"Cool-Down",    type:"cooldown",dur:300},
    ],
  },
  yoga:{
    vinyasa:[
      {name:"Warm-Up",        type:"warmup",  dur:300},
      {name:"Sun Salutation", type:"cardio",  dur:600},
      {name:"Standing Flow",  type:"circuit", dur:1200},
      {name:"Floor Work",     type:"stretch", dur:900},
      {name:"Cool-Down",      type:"cooldown",dur:600},
    ],
    yin:[
      {name:"Warm-Up",     type:"warmup",  dur:300},
      {name:"Yin Block 1", type:"stretch", dur:1200},
      {name:"Yin Block 2", type:"stretch", dur:900},
      {name:"Cool-Down",   type:"cooldown",dur:600},
    ],
    power_yoga:[
      {name:"Warm-Up",     type:"warmup",  dur:300},
      {name:"Power Flow",  type:"circuit", dur:1500},
      {name:"Core Work",   type:"strength",dur:600},
      {name:"Cool-Down",   type:"cooldown",dur:600},
    ],
  },
  boxing:{
    boxing_fundamentals:[
      {name:"Warm-Up",          type:"warmup",  dur:300},
      {name:"Technique Rounds", type:"circuit", dur:900},
      {name:"Bag Work",         type:"circuit", dur:900},
      {name:"Cool-Down",        type:"cooldown",dur:300},
    ],
    kickboxing:[
      {name:"Warm-Up",      type:"warmup",  dur:300},
      {name:"Combo Rounds", type:"circuit", dur:1200},
      {name:"Conditioning", type:"cardio",  dur:600},
      {name:"Cool-Down",    type:"cooldown",dur:300},
    ],
  },
  pilates:{
    mat_pilates:[
      {name:"Warm-Up",       type:"warmup",  dur:300},
      {name:"Core Sequence", type:"strength",dur:2100},
      {name:"Stretch",       type:"stretch", dur:600},
      {name:"Cool-Down",     type:"cooldown",dur:300},
    ],
    core_focus:[
      {name:"Warm-Up",     type:"warmup",  dur:300},
      {name:"Core Block A",type:"strength",dur:900},
      {name:"Core Block B",type:"strength",dur:900},
      {name:"Cool-Down",   type:"cooldown",dur:300},
    ],
  },
  bootcamp:{
    military:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"Circuit A", type:"circuit", dur:900},
      {name:"Circuit B", type:"circuit", dur:900},
      {name:"Cool-Down", type:"cooldown",dur:300},
    ],
    athletic_camp:[
      {name:"Warm-Up",   type:"warmup",  dur:300},
      {name:"Station A", type:"circuit", dur:720},
      {name:"Station B", type:"circuit", dur:720},
      {name:"Finisher",  type:"strength",dur:360},
      {name:"Cool-Down", type:"cooldown",dur:300},
    ],
  },
  hyrox:{
    race_prep:[
      {name:"Warm-Up",               type:"warmup",  dur:600},
      {name:"Ski Erg + Run",         type:"cardio",  dur:480},
      {name:"Sled Push + Run",       type:"cardio",  dur:480},
      {name:"Sled Pull + Run",       type:"cardio",  dur:480},
      {name:"Burpee BJ + Run",       type:"cardio",  dur:600},
      {name:"Rowing + Run",          type:"cardio",  dur:480},
      {name:"Farmers Carry + Run",   type:"cardio",  dur:480},
      {name:"Sandbag Lunges + Run",  type:"cardio",  dur:600},
      {name:"Wall Balls + Run",      type:"cardio",  dur:720},
      {name:"Cool-Down",             type:"cooldown",dur:600},
    ],
    station_strength:[
      {name:"Warm-Up",   type:"warmup",  dur:600},
      {name:"Ski Erg",   type:"strength",dur:900},
      {name:"Sled Work", type:"strength",dur:900},
      {name:"Carries",   type:"strength",dur:600},
      {name:"Cool-Down", type:"cooldown",dur:600},
    ],
    open_format:[
      {name:"Warm-Up",      type:"warmup",  dur:300},
      {name:"Station Work", type:"circuit", dur:1200},
      {name:"Conditioning", type:"cardio",  dur:900},
      {name:"Cool-Down",    type:"cooldown",dur:300},
    ],
  },
};
