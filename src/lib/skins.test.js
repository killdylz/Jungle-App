import { describe, it, expect } from "vitest";
import { PRESET_SKINS, DEFAULT_SKIN_ID, baseSkin, resolveSkinTokens,
         isFallbackGeneratedSkin, FALLBACK_GENERATED_TOKEN_SETS } from "./skins.js";
import { generateThemes, generateSkinFromPalette } from "./brandGenerator.js";

// ─── "What palette is this gym running?" — one answer ────────────────────────
//
// There used to be two, and they disagreed in exactly the case that matters:
// a gym with override tokens under a base skin id. `applyGenerated` writes that
// state on purpose ("canopy as base, generated tokens on top"), so a studio that
// uploaded its logo and pressed **Apply to all surfaces** got its identity
// stored, previewed correctly inside Brand Studio, and rendered nowhere.
//
// These pin the rule; `e2e/brandStudio.spec.js` drives it through a real reload,
// which is the only place the second half of the defect — the fonts — showed up.

describe("baseSkin", () => {
  it("returns the named preset", () => {
    expect(baseSkin("pulse")).toBe(PRESET_SKINS.pulse);
    expect(baseSkin("atelier")).toBe(PRESET_SKINS.atelier);
  });

  // 🔴 The load-bearing case. `"custom"` was written into `jungle_skin` as if it
  // were a skin id, and `PRESET_SKINS["custom"]` is undefined — so every lookup
  // keyed on the id fell through, including the `meta` that carries the fonts,
  // the accent glow and the numeral style. Never undefined, so a caller cannot
  // reach for `.fonts` on nothing.
  it("never returns undefined for an id that is not a preset", () => {
    for (const id of ["custom", "", null, undefined, "canopy-2", "CANOPY"]) {
      expect(baseSkin(id), `baseSkin(${JSON.stringify(id)})`).toBe(PRESET_SKINS[DEFAULT_SKIN_ID]);
    }
  });

  it("every preset carries the metadata applySkinCSS reads", () => {
    for (const [id, s] of Object.entries(PRESET_SKINS)) {
      expect(s.fonts?.display, `${id}.fonts.display`).toBeTruthy();
      expect(s.fonts?.body, `${id}.fonts.body`).toBeTruthy();
      expect(s.numeralStyle, `${id}.numeralStyle`).toBeTruthy();
      expect(s.accentBehaviour, `${id}.accentBehaviour`).toBeTruthy();
      expect(s.programs?.length, `${id}.programs`).toBeGreaterThan(0);
    }
  });
});

describe("resolveSkinTokens — overrides win whatever the base is called", () => {
  it("is the base skin's own tokens when the gym has no overrides", () => {
    expect(resolveSkinTokens("pulse", null)).toEqual(PRESET_SKINS.pulse.tokens);
    expect(resolveSkinTokens("atelier", undefined)).toEqual(PRESET_SKINS.atelier.tokens);
  });

  // 🔴 THE ONE. The old App-root rule was `activeSkinId === "custom" &&
  // customSkinTokens`, so this exact state — the state "Apply to all surfaces"
  // creates — rendered Canopy and threw the gym's identity away.
  it("layers overrides over a NAMED base, not only over the literal id 'custom'", () => {
    const generated = { bg: "#120018", accent: "#FF00AA" };
    const got = resolveSkinTokens("canopy", generated);
    expect(got.bg).toBe("#120018");
    expect(got.accent).toBe("#FF00AA");
    // …and the keys the gym did not override still come from the base, which is
    // what makes a partial override safe to store at all.
    expect(got.card).toBe(PRESET_SKINS.canopy.tokens.card);
    expect(got.muted).toBe(PRESET_SKINS.canopy.tokens.muted);
  });

  it("still resolves a store that was written with the old 'custom' id", () => {
    const saved = { ...PRESET_SKINS.atelier.tokens, accent: "#FF00AA" };
    expect(resolveSkinTokens("custom", saved).accent).toBe("#FF00AA");
    expect(resolveSkinTokens("custom", saved).bg).toBe(PRESET_SKINS.atelier.tokens.bg);
  });

  // A preset's token map is module state shared by every caller. Handing it out
  // by reference would let one screen's edit reach every other screen.
  it("hands back a fresh object, never the preset's own token map", () => {
    const got = resolveSkinTokens("canopy", null);
    expect(got).not.toBe(PRESET_SKINS.canopy.tokens);
    got.accent = "#000000";
    expect(PRESET_SKINS.canopy.tokens.accent).toBe("#7BE3A4");
  });

  it("covers every token applySkinCSS writes, for every preset", () => {
    // applySkinCSS reads exactly these eight and would set `--bg: undefined` for
    // a missing one, which renders as no background at all.
    const NEEDED = ["bg", "card", "navy", "border", "accent", "green", "text", "muted"];
    for (const id of Object.keys(PRESET_SKINS)) {
      const tk = resolveSkinTokens(id, null);
      for (const k of NEEDED) expect(tk[k], `${id}.${k}`).toBeTruthy();
    }
  });
});

// ─── The palette the broken generator handed out ─────────────────────────────
//
// The fix to `runAnalysis` (session 28) does nothing for a gym that already
// pressed "Apply to all surfaces". These pin the detector that finds them, and
// most of the value is in the negative cases: this is a heuristic offered to a
// paying customer about their own brand, so being wrong is expensive in a way
// that being silent is not.
describe("isFallbackGeneratedSkin", () => {
  // PROVENANCE. The frozen sets are the point of the detector, and a comment
  // saying where they came from is not checkable. This reproduces the broken
  // path exactly — `palette` null, `luma` at its useState initial — and asserts
  // the detector recognises what it produces.
  //
  // ⚠️ If a future change to `generateThemes` turns this red, the frozen sets
  // must NOT simply be updated to match. They describe what gyms already have in
  // localStorage, which no code change can alter. A new output belongs alongside
  // them only if the fallback path can still be reached at all.
  it("fires on every theme the fallback path produced", () => {
    const themes = generateThemes(["#7BE3A4"], 0.2);
    expect(themes).toHaveLength(3);
    for (const th of themes) {
      expect(isFallbackGeneratedSkin(th.tokens), `${th.name} went undetected`).toBe(true);
    }
  });

  // The luma half of the same stale closure. Every value under the 0.5
  // light/dark threshold produces the identical dark output, so the detector
  // does not need a luma of its own.
  it("fires whatever sub-threshold luma the stale closure held", () => {
    for (const lm of [null, 0, 0.2, 0.49]) {
      expect(isFallbackGeneratedSkin(generateThemes(["#7BE3A4"], lm)[0].tokens),
        `luma ${lm}`).toBe(true);
    }
  });

  // 🔴 THE CONTROL THE FEATURE EXISTS FOR. A boutique wellness studio whose mark
  // really is mint must never be told its brand is a defect. It is sitting on
  // Canopy's own surfaces (bg #0A0F0C), not the generator's derived ones
  // (#0b130e), and that one value is what keeps the offer off its screen.
  it("does NOT fire on a gym that deliberately chose Canopy's mint", () => {
    expect(isFallbackGeneratedSkin(PRESET_SKINS.canopy.tokens)).toBe(false);
    // …nor on the same preset reached through the resolver, which is the shape
    // the screen actually holds.
    expect(isFallbackGeneratedSkin(resolveSkinTokens("canopy", null))).toBe(false);
  });

  // A coach who hand-built a mint palette in the fine-tune editor: the accent is
  // Canopy's exact mint, so an accent-based detector fires on them. The whole
  // point of matching all eight tokens is that this one does not.
  it("does NOT fire on a hand-picked mint palette", () => {
    const handPicked = { ...PRESET_SKINS.canopy.tokens, accent:"#7BE3A4", green:"#CFF5DE" };
    expect(isFallbackGeneratedSkin(handPicked)).toBe(false);
  });

  it("does NOT fire on the other two shipped presets", () => {
    expect(isFallbackGeneratedSkin(PRESET_SKINS.pulse.tokens)).toBe(false);
    expect(isFallbackGeneratedSkin(PRESET_SKINS.atelier.tokens)).toBe(false);
  });

  // A gym whose logo the FIXED generator actually read. This is the common case
  // after session 28 and it must be silent, or the offer appears for everyone.
  it("does NOT fire on an identity generated from a real logo colour", () => {
    for (const seed of ["#B5122C", "#1D4ED8", "#D4A017", "#A855F7"]) {
      for (const th of generateThemes([seed], 0.2)) {
        expect(isFallbackGeneratedSkin(th.tokens), `${seed} / ${th.name}`).toBe(false);
      }
    }
    // Including the light branch, which was unreachable in production before.
    expect(isFallbackGeneratedSkin(generateThemes(["#D4A017"], 0.7)[0].tokens)).toBe(false);
  });

  // Exact-match is a deliberate scope choice: a gym that took the bad palette
  // and then edited it has since made a decision, and re-reading the logo would
  // throw it away. One changed token is enough to stop offering.
  it("stops firing once the gym has nudged a single token", () => {
    const bad = { ...FALLBACK_GENERATED_TOKEN_SETS[0] };
    expect(isFallbackGeneratedSkin(bad)).toBe(true);
    expect(isFallbackGeneratedSkin({ ...bad, accent:"#7BE3A5" })).toBe(false);
    expect(isFallbackGeneratedSkin({ ...bad, card:"#121c17" })).toBe(false);
  });

  // These values round-trip through JSON and a Supabase column; `#0B130E` is the
  // same colour as `#0b130e` and must not change the answer.
  it("is insensitive to hex case and stray whitespace", () => {
    const bad = FALLBACK_GENERATED_TOKEN_SETS[0];
    const upper = Object.fromEntries(Object.entries(bad).map(([k, v]) => [k, v.toUpperCase()]));
    expect(isFallbackGeneratedSkin(upper)).toBe(true);
    expect(isFallbackGeneratedSkin({ ...bad, bg:"  #0b130e  " })).toBe(true);
  });

  // A partial object is what a half-written store looks like. It is not a match
  // on the keys that happen to be present.
  it("does NOT fire on absent, empty or partial token maps", () => {
    for (const v of [null, undefined, {}, "", 0, [], "canopy"]) {
      expect(isFallbackGeneratedSkin(v), JSON.stringify(v)).toBe(false);
    }
    const { muted, ...missingOne } = FALLBACK_GENERATED_TOKEN_SETS[0];
    expect(missingOne.bg).toBe("#0b130e");           // precondition: still 7 of 8
    expect(isFallbackGeneratedSkin(missingOne)).toBe(false);
  });

  // The frozen sets are shared module state reachable from a screen.
  it("cannot be mutated by a caller", () => {
    expect(Object.isFrozen(FALLBACK_GENERATED_TOKEN_SETS)).toBe(true);
    expect(Object.isFrozen(FALLBACK_GENERATED_TOKEN_SETS[0])).toBe(true);
  });

  // The other half of the claim in skins.js: the fallback's derived background
  // differs from Canopy's own, which is the single value the whole detector's
  // safety rests on. Stated as its own assertion so a change to either is loud.
  it("rests on a background Canopy does not share", () => {
    expect(FALLBACK_GENERATED_TOKEN_SETS[0].bg).not.toBe(PRESET_SKINS.canopy.tokens.bg);
    expect(generateSkinFromPalette(["#7BE3A4"], "natural", "dark").tokens.bg)
      .toBe(FALLBACK_GENERATED_TOKEN_SETS[0].bg);
  });
});
