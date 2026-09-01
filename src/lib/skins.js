// ─── The gym's palette: the three preset skins, and what is actually in force ─
//
// Extracted from App.jsx, where `PRESET_SKINS` sat as a module constant and the
// question "what tokens is this gym running?" was answered in TWO places with
// two different rules:
//
//   App root        `activeSkinId === "custom" && customSkinTokens`
//   Brand Studio    `customSkinTokens ? { ...base, ...customSkinTokens } : base`
//
// They disagree exactly when a gym has override tokens under a skin id that is
// not the literal string `"custom"` — which is the state **Apply to all
// surfaces** creates, because `applyGenerated` deliberately keeps `"canopy"` as
// the BASE and layers the generated tokens over it. So a studio that uploaded
// its logo, generated an identity and pressed the button got:
//
//   · the tokens written to `jungle_custom_skin` ✅
//   · the Brand Studio's own swatches showing them ✅
//   · every other screen in the product rendering Canopy ❌
//
// The one screen a coach checks their branding on was the one screen that lied.
//
// 🔴 The deeper fault, and the reason this is a module rather than a one-line
// condition: `"custom"` was being used as a skin ID, and it is not a skin.
// `PRESET_SKINS["custom"]` is `undefined`, so EVERY lookup keyed on the id fell
// through — including `applySkinCSS`'s `meta`, which carries the fonts, the
// accent glow and the numeral style. A gym on Atelier who nudged one colour kept
// Instrument Serif for the rest of the session and lost it on the next reload,
// because the first `applySkinCSS` of a fresh load had no skin to read fonts
// from. Pulse lost its glow and its tabular numerals the same way.
//
// The question is not "is the id `custom`". It is "are there override tokens" —
// which is the rule the Brand Studio's own preset highlight (`activeSkinId ===
// p.id && !customSkinTokens`) has always used. `summaryApi.js` states the
// general form: anything that resolves a gym's palette by preset id "silently
// downgrades exactly the gyms that cared most about looking like themselves".

export const PRESET_SKINS = {
  canopy: {
    name: "Canopy", vibe: "natural",
    tokens: { bg: "#0A0F0C", card: "#0F1611", navy: "#141D17", border: "rgba(255,255,255,.07)",
              accent: "#7BE3A4", green: "#CFF5DE", text: "#E8EFE9", muted: "#8AA294" },
    fonts: { display: "Space Grotesk", body: "Hanken Grotesk" },
    voice: "credible-community", numeralStyle: "proportional", accentBehaviour: "flat", mode: "dark",
    programs: [{ name: "Strength", tint: "#A78BFA" }, { name: "Endurance", tint: "#34D399" }, { name: "Mobility", tint: "#22D3EE" }],
  },
  pulse: {
    name: "Pulse", vibe: "energetic",
    tokens: { bg: "#08090A", card: "#101113", navy: "#17181B", border: "rgba(255,255,255,.08)",
              accent: "#D6FF3D", green: "#ECFFA3", text: "#F4F5F2", muted: "#8B8F8A" },
    fonts: { display: "Anton", body: "Archivo" },
    voice: "competitive-measurable", numeralStyle: "tabular", accentBehaviour: "glow", mode: "dark",
    programs: [{ name: "Race", tint: "#FB7185" }, { name: "Power", tint: "#FBBF24" }, { name: "Engine", tint: "#38BDF8" }],
  },
  atelier: {
    name: "Atelier", vibe: "luxury",
    tokens: { bg: "#0C0C0E", card: "#131316", navy: "#1A1A1E", border: "rgba(255,255,255,.06)",
              accent: "#C8A86A", green: "#E8D6AE", text: "#ECEAE6", muted: "#908C85" },
    fonts: { display: "Instrument Serif", body: "Manrope" },
    voice: "technical-considered", numeralStyle: "proportional", accentBehaviour: "flat", mode: "dark",
    programs: [{ name: "Reformer", tint: "#C8A86A" }, { name: "Sculpt", tint: "#D4A5A5" }, { name: "Flow", tint: "#9FB4C4" }],
  },
};

export const DEFAULT_SKIN_ID = "canopy";

/**
 * The skin a gym is BASED on. Never undefined: an id that is not a preset —
 * `"custom"` from a store written before this module existed, or a value that
 * arrived from the server — falls back to the default rather than producing an
 * object with no fonts, no numerals and no accent behaviour.
 */
export function baseSkin(activeSkinId) {
  return PRESET_SKINS[activeSkinId] || PRESET_SKINS[DEFAULT_SKIN_ID];
}

/**
 * The tokens actually in force: the base skin, with the gym's own overrides on
 * top. Overrides win WHATEVER the base is called, which is the whole point.
 *
 * Returns a fresh object every call — `applySkinCSS` reads it and nothing should
 * be able to mutate a preset's own token map through the value it gets back.
 */
export function resolveSkinTokens(activeSkinId, customSkinTokens) {
  const base = baseSkin(activeSkinId).tokens;
  return customSkinTokens ? { ...base, ...customSkinTokens } : { ...base };
}

// ─── Is this palette the one the broken generator handed out? ────────────────
//
// Session 28 fixed `runAnalysis`: the generator read `palette` from a stale
// closure, got `null`, took the `|| ["#7BE3A4"]` fallback and derived every
// gym's identity from Canopy's mint regardless of the logo. **The fix is not
// retroactive.** A gym that pressed "Apply to all surfaces" before it has those
// tokens in `jungle_custom_skin`, and stored tokens are the source of truth —
// the app will keep painting them forever, and the Brand Studio will keep
// showing them as if the gym had chosen them.
//
// 🔴 THE DETECTOR IS ON THE TOKENS, NOT THE SKIN ID. `applyGenerated` sets
// `activeSkinId` to `"canopy"` DELIBERATELY and layers the generated tokens over
// it (this module's header explains why), so every generated identity — good or
// bad — sits under the id `"canopy"`. Keying on the id identifies the mechanism,
// not the fault, and would flag every correctly-generated gym.
//
// ⚠️ AND NOT ON THE ACCENT EITHER, which is the obvious heuristic and is WRONG
// in both directions:
//
//   · It MISSES a third of the affected gyms. The fallback produced three
//     themes and the coach picked one of them. Signature and Charge both land on
//     `#7BE3A4`, but **Steel's accent is `#aeccba`** — a desaturated derivation
//     that looks nothing like Canopy's mint. An accent test never sees them.
//   · It over-fires on anyone who genuinely likes mint.
//
// So the test is the WHOLE token set, byte for byte, against what that path
// deterministically produced. Eight values have to match, and the discriminator
// that makes this safe is the derived background: the fallback generates
// `#0b130e`, where Canopy's own preset background is `#0A0F0C`. A studio that
// hand-picked mint is sitting on Canopy's surfaces, not on these, so it does not
// match and is never told its brand is a bug.
//
// Exact-match also means a gym that took the bad palette and then NUDGED one
// token is not offered anything. That is deliberate: they have since made a
// decision about their palette, and re-reading the logo would discard it.
//
// FROZEN, not re-derived from `generateThemes` at call time, for two reasons.
// These describe what gyms ALREADY HAVE STORED — a fact about history that a
// future change to the generator must not silently rewrite. And the generator
// lives in the owner-only half of `colors.js`; calling it from this module,
// which is eager, would pin it into the entry chunk. `skins.test.js` asserts
// these still equal the fallback path's real output, so the provenance is
// checked rather than asserted in a comment.
//
// The luma argument does not appear here because it cannot vary: the same stale
// closure held `luma` at its `useState(0.2)` initial, and every value below the
// 0.5 light/dark threshold produces this identical dark output.
export const FALLBACK_GENERATED_TOKEN_SETS = Object.freeze([
  // "Signature" and "Charge" — identical tokens, because `generateThemes` takes
  // its second accent as `pal[1] || pal[0]` and the fallback palette is one
  // colour long. They differ only in fonts and voice, which are not stored.
  Object.freeze({ bg:"#0b130e", card:"#121c16", navy:"#18251d", border:"rgba(255,255,255,.07)",
                  accent:"#7BE3A4", green:"#daf4e4", text:"#e9ecea", muted:"#949e98" }),
  // "Steel" — the one an accent-based detector cannot see.
  Object.freeze({ bg:"#0d110f", card:"#141a16", navy:"#1b221e", border:"rgba(255,255,255,.07)",
                  accent:"#aeccba", green:"#f1f4f2", text:"#e9ecea", muted:"#949e98" }),
]);

const TOKEN_KEYS = ["bg", "card", "navy", "border", "accent", "green", "text", "muted"];
const norm = (v) => String(v == null ? "" : v).trim().toLowerCase();

/**
 * Does this stored custom palette match one the broken generator produced?
 *
 * Case- and whitespace-insensitive because these values round-trip through JSON
 * and a server column, and `#0B130E` is the same colour as `#0b130e`. A palette
 * missing any of the eight keys cannot be a generated one — the generator always
 * writes all eight — so a partial object is not a match rather than a match on
 * the keys that happen to be present.
 */
export function isFallbackGeneratedSkin(tokens) {
  if (!tokens || typeof tokens !== "object") return false;
  if (!TOKEN_KEYS.every((k) => tokens[k] != null)) return false;
  return FALLBACK_GENERATED_TOKEN_SETS.some((set) =>
    TOKEN_KEYS.every((k) => norm(tokens[k]) === norm(set[k])));
}
