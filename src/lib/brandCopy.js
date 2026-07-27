// FR-H3: the microcopy register, one voice per gym. Surfaces read copy from
// here and never hard-code strings — that contract is the reason this is a
// module of its own rather than a table inside the one screen that reads it
// today (the coach Display's station cue). N4's member page is the next caller,
// and it must speak in the gym's voice, not Jungle's.
// FR-H3: microcopy register per voice. Surfaces read copy from here, never hard-code strings.
export const BRAND_COPY = {
  "systemised-motivational": { kioskTag:"Show up. Do the work.", waitingHead:"Your session starts soon", stationCue:"Lock in" },
  "earned-disciplined":      { kioskTag:"Earn it.", waitingHead:"Warm up, get ready", stationCue:"Hold the standard" },
  "joyful-inclusive":        { kioskTag:"Come move with us", waitingHead:"So glad you are here", stationCue:"You have got this" },
  "competitive-measurable":  { kioskTag:"Beat yesterday", waitingHead:"Next heat loading", stationCue:"Push the pace" },
  "credible-community":      { kioskTag:"Train together", waitingHead:"Class starting shortly", stationCue:"Find your rhythm" },
  "technical-considered":    { kioskTag:"Move with intent", waitingHead:"Preparing your session", stationCue:"Precision over speed" },
};
export function brandCopy(voice, slot){ const v = BRAND_COPY[voice] || BRAND_COPY["credible-community"]; return v[slot] || ""; }
