// ─── The class share card (UI-UX-DIRECTION §5) ───────────────────────────────
// One social artefact, done well: a 1080×1920 gym-branded image of tonight's
// class, generated entirely client-side.
//
// WHOSE MARKETING THIS IS. The card carries the GYM's name and the gym's
// colours, and it does NOT say "Powered by Jungle". A member posting their
// class to a story is doing the gym's marketing, not ours; a Jungle watermark
// on a member's story would be us taking the gym's audience, which is the exact
// opposite of a white-label product.
//
// NO MEMBER DATA. This is the gym-side card — class name, date, the work. The
// member-side variant (their streak, their check-in) belongs with the N4
// magic-link page, which needs an Edge Function to issue a signed token and is
// therefore not built yet. Keeping member data out means this ships with zero
// PDPA surface: nothing here identifies anybody.
//
// The layout maths is separated from the drawing so it can be tested. Canvas
// rendering is nearly untestable in a unit runner; text that overflows its box
// or a movement list that silently truncates is very testable, and is what
// actually goes wrong.

export const CARD_W = 1080;
export const CARD_H = 1920;

// Instagram-story safe area: the top ~250px and bottom ~250px are where the
// platform puts its own chrome (profile pill, reply bar), so nothing that must
// be read goes there.
export const SAFE_TOP = 260;
export const SAFE_BOTTOM = 260;

// How many movements fit before the card stops being readable across a room.
// Beyond this it says "+N more" rather than shrinking type until nothing reads.
export const MAX_MOVEMENTS = 12;

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * Every distinct movement in a class, in order, de-duplicated.
 * A circuit that repeats Burpees in three blocks should list them once — the
 * card is a poster, not a spec.
 */
export function cardMovements(stages = []) {
  const seen = new Set();
  const out = [];
  for (const s of stages || []) {
    for (const ex of s?.exercises || []) {
      const n = clean(ex?.n);
      if (!n) continue;
      const key = n.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(n);
    }
  }
  return out;
}

/**
 * The card's content, resolved and capped. Pure — this is the part worth
 * testing, because it is the part that quietly loses information.
 */
export function shareCardModel({ stages = [], sessionName = "", gymName = "", date = new Date() } = {}) {
  const all = cardMovements(stages);
  const shown = all.slice(0, MAX_MOVEMENTS);
  const overflow = all.length - shown.length;
  const totalSec = (stages || []).reduce((a, s) => a + (Number(s?.dur) || 0), 0);

  return {
    gymName: clean(gymName),
    // Never an empty headline: a card with no title is worse than a generic one.
    title: clean(sessionName) || "Today's class",
    dateLabel: date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }),
    minutes: Math.round(totalSec / 60),
    stageCount: (stages || []).length,
    movements: shown,
    overflow: overflow > 0 ? overflow : 0,
    // Stated so a caller can decide not to render a card at all rather than
    // producing a beautiful empty poster.
    isEmpty: all.length === 0,
  };
}

// Shrink a headline until it fits, with a floor. Below the floor it wraps
// instead — endlessly shrinking is how a long class name becomes unreadable.
export function fitFontSize(ctx, text, maxWidth, start, min = 40) {
  let size = start;
  while (size > min) {
    ctx.font = `800 ${size}px ${ctx.__displayFont || "sans-serif"}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 4;
  }
  return min;
}

export function wrapLines(ctx, text, maxWidth, maxLines = 3) {
  const words = clean(text).split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) { line = next; continue; }
    lines.push(line);
    line = w;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  // If it still does not fit, the last line is elided rather than overflowing
  // the card edge.
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "…");
  }
  return lines;
}

/**
 * Draw the card. `tokens` are the active skin's colours, so the card matches
 * whatever the gym's Room TV looks like without a second theme to maintain.
 */
export function drawShareCard(canvas, model, tokens = {}, fonts = {}) {
  const ctx = canvas.getContext("2d");
  const display = fonts.display || "sans-serif";
  const body = fonts.body || "sans-serif";
  ctx.__displayFont = display;

  const bg = tokens.bg || "#0A0F0C";
  const text = tokens.text || "#E8EFE9";
  const muted = tokens.muted || "#8AA294";
  const accent = tokens.accent || "#7BE3A4";

  canvas.width = CARD_W;
  canvas.height = CARD_H;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // A soft accent wash at the top, so the card reads as branded at thumbnail
  // size where no text is legible at all.
  const grad = ctx.createLinearGradient(0, 0, 0, CARD_H * 0.6);
  grad.addColorStop(0, `${accent}22`);
  grad.addColorStop(1, `${bg}00`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H * 0.6);

  const pad = 90;
  const maxW = CARD_W - pad * 2;
  let y = SAFE_TOP;

  // Gym name — the loudest brand signal on the card, and the only place a
  // studio's identity appears.
  if (model.gymName) {
    ctx.fillStyle = accent;
    ctx.font = `700 34px ${body}`;
    ctx.letterSpacing = "6px";
    ctx.fillText(model.gymName.toUpperCase(), pad, y);
    ctx.letterSpacing = "0px";
    y += 70;
  }

  ctx.fillStyle = muted;
  ctx.font = `600 30px ${body}`;
  ctx.fillText(model.dateLabel, pad, y);
  y += 90;

  // Title
  const size = fitFontSize(ctx, model.title, maxW, 108, 56);
  ctx.font = `800 ${size}px ${display}`;
  ctx.fillStyle = text;
  for (const line of wrapLines(ctx, model.title, maxW, 3)) {
    ctx.fillText(line, pad, y);
    y += size * 1.12;
  }
  y += 24;

  // The facts, stated plainly.
  ctx.fillStyle = muted;
  ctx.font = `600 32px ${body}`;
  const facts = [
    model.minutes ? `${model.minutes} min` : "",
    model.stageCount ? `${model.stageCount} section${model.stageCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join("  ·  ");
  if (facts) { ctx.fillText(facts, pad, y); y += 80; }

  // Rule
  ctx.fillStyle = `${accent}55`;
  ctx.fillRect(pad, y, maxW, 3);
  y += 70;

  // The work
  ctx.font = `600 40px ${body}`;
  const lineH = 62;
  const room = CARD_H - SAFE_BOTTOM - y;
  const fits = Math.max(0, Math.floor(room / lineH));
  const list = model.movements.slice(0, fits);
  for (const m of list) {
    ctx.fillStyle = accent;
    ctx.fillText("—", pad, y);
    ctx.fillStyle = text;
    ctx.fillText(m, pad + 52, y);
    y += lineH;
  }

  const hidden = model.overflow + (model.movements.length - list.length);
  if (hidden > 0) {
    ctx.fillStyle = muted;
    ctx.font = `600 34px ${body}`;
    ctx.fillText(`+${hidden} more`, pad, y);
  }

  return canvas;
}

// Filename a coach can find again on their phone.
export function shareCardFilename(model) {
  const slug = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug(model.gymName) || "class"}-${slug(model.title) || "session"}.png`;
}
