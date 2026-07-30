import { describe, it, expect } from "vitest";
import { PRESET_SKINS, DEFAULT_SKIN_ID, baseSkin, resolveSkinTokens } from "./skins.js";

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
