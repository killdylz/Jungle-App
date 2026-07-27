// Duration and occurrence formatting, shared by the Builder (in App.jsx) and by
// the Class Runner cluster (src/screens/runner/). Extracted in I6 stage 5: the
// runner moved out and these three came with it as far as the module boundary,
// at which point "both sides call them" is the whole argument for a shared file
// rather than a copy. A copy of `fmt` would drift the moment one side changed
// how it pads seconds, and the Builder's stage list and the Runner's clock would
// disagree about the same number on the same screen.
export const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
export const fmtSec = s => `${s}s`;
// "today 18:00" / "Tue 18:00" — when a scheduled occurrence starts. 24h, because
// the Schedule's own slots are ("06:00", "18:00") and a coach comparing the two
// should not have to translate. Says "today" for the common case rather than
// making someone work out which weekday it is now.
export const fmtOccurrence = iso => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const t = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  const midnight = new Date(); midnight.setHours(0,0,0,0);
  const sameDay = d >= midnight && d < new Date(midnight.getTime() + 864e5);
  return `${sameDay ? "today" : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]} ${t}`;
};
