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
