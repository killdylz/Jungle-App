import { describe, it, expect } from "vitest";
import { auditPairs, textFailures, hueInkOn, platedOn, CHIP_ALPHA, BADGE_ALPHA } from "./brandAudit.js";
import { PRESET_SKINS } from "./skins.js";
import { DANGER, WARN, contrastRgb, parseCssColor, hexA, compositeOver } from "./colors.js";
import { generateThemes } from "./brandGenerator.js";

// ─── The audit that was narrower than the gate ───────────────────────────────
//
// The panel checked five opaque token pairs and told an owner "Member-visible
// text meets WCAG AA". `e2e/brandTokens.spec.js`, on the same palette, found nine
// defects it called passing. These pin the widened list.
//
// 🔴 The load-bearing test is `catches what the old five could not`: a palette
// where every original row passes and a new one fails. Without it this file is
// fourteen rows that agree with each other, which is what the old five were.

const LIGHT_SKIN = {
  bg: "#F4F6F2", card: "#FFFFFF", navy: "#E7ECE6", border: "rgba(0,0,0,.12)",
  accent: "#12224A", green: "#1E6B4A", text: "#12181B", muted: "#5A6B60",
};
// The five rows the audit used to be, by id.
const OLD_FIVE = ["text-bg", "text-card", "muted-bg", "onacc-acc", "accent-bg"];
const byId = (rows, id) => rows.find((r) => r.id === id);

describe("auditPairs", () => {
  it("still carries every pair the old audit had", () => {
    const rows = auditPairs(PRESET_SKINS.canopy.tokens);
    for (const id of OLD_FIVE) expect(byId(rows, id), `${id} was dropped`).toBeTruthy();
    // …with the graphic row still scored at 3:1, not silently promoted to 4.5.
    expect(byId(rows, "accent-bg").min).toBe(3.0);
    expect(byId(rows, "accent-bg").big).toBe(true);
  });

  // The sweep passes on both of these, so the panel has to as well — a panel
  // stricter than the gate sends owners to fix things CI considers fine.
  it("agrees with the sweep's own skins: every shipped preset passes", () => {
    for (const [id, skin] of Object.entries(PRESET_SKINS)) {
      const rows = auditPairs(skin.tokens, skin.programs);
      const fails = rows.filter((r) => !r.pass);
      expect(fails.map((f) => `${f.label} ${f.ratio.toFixed(2)}:1`), `${id} has failures`).toEqual([]);
    }
  });

  it("passes on the hand-built light skin the sweep runs against", () => {
    expect(auditPairs(LIGHT_SKIN).filter((r) => !r.pass)).toEqual([]);
  });

  // A generated identity must be READABLE — a gym uploads a logo and gets a room
  // it can read. This is the guarantee colors.test.js makes of the generator,
  // asserted through the panel the owner actually reads.
  // Scoped to the SURFACE rows — text and secondary text on bg/card/navy. That is
  // "a gym uploads a logo and gets a room it can read", and it holds for every
  // seed and both polarities. The FILL rows do not always hold, and pinning that
  // separately below is the honest shape rather than weakening this one.
  const SURFACE_ROWS = ["text-bg", "text-card", "text-navy", "muted-bg", "muted-card", "muted-navy"];
  it("passes every surface text row on identities generated from real logo colours", () => {
    for (const seed of ["#B5122C", "#1D4ED8", "#D4A017", "#A855F7", "#12224A", "#7BE3A4"]) {
      for (const lm of [0.2, 0.7]) {
        for (const th of generateThemes([seed], lm)) {
          const fails = auditPairs(th.tokens, th.programs)
            .filter((r) => SURFACE_ROWS.includes(r.id) && !r.pass);
          expect(fails.map((f) => f.label), `${seed} @${lm} / ${th.name}`).toEqual([]);
        }
      }
    }
  });

  // 🔴 THE SECOND FINDING, and it is about `inkOn` rather than about a token.
  // `inkOn` picks whichever of bg/text contrasts MORE against a fill — which is
  // the right question and cannot invert — but "more" is not "enough". On a LIGHT
  // identity with a mid-luminance accent, BOTH candidates sit near 4:1 and the
  // button label fails AA whichever one wins:
  //
  //   violet #A855F7 light → bg 3.70:1, text 4.13:1, best 4.13:1
  //   blue   #1D4ED8 light, "Steel" → bg 3.91:1, text 3.85:1, best 3.91:1
  //
  // Not repaired here for the same reason as the accent finding above: the fix is
  // to bend the gym's own accent. Reported instead, which the panel now does.
  it("reports a light identity's accent label when neither ink is enough", () => {
    const th = generateThemes(["#A855F7"], 0.7)[0];
    const rows = auditPairs(th.tokens, th.programs);
    const label = byId(rows, "onacc-acc");
    expect(label.pass).toBe(false);
    expect(label.ratio).toBeGreaterThan(3);      // not broken — just under the line
    expect(label.ratio).toBeLessThan(4.5);
    // The surfaces are all fine, so the panel points at the fill and nothing else.
    for (const id of SURFACE_ROWS) expect(byId(rows, id).pass, id).toBe(true);
  });

  // 🔴 A FINDING, PINNED RATHER THAN ASSERTED AWAY. The widened audit was written
  // to catch what the old five missed and the first thing it caught was in the
  // generator: a studio whose logo is DARK gets an accent that cannot be used as
  // a graphic on its own background.
  //
  //   navy    #12224A → accent on bg 1.25:1
  //   blue    #1D4ED8 → 2.90:1
  //   crimson #B5122C → 2.86:1     (WCAG 1.4.11 wants 3:1)
  //
  // It is not a arithmetic slip and it is not fixed here, deliberately: the only
  // repair is to bend the gym's own brand accent, and `--danger`'s rule in
  // colors.js — never auto-mangle a colour the gym chose — is the same argument.
  // What the product owes them is to SAY so, which is what this row now does and
  // what `contrast.passesAA` never did: it is `textOnBg >= 4.5` and nothing else,
  // so the generated-identity badge read "✓ Passes WCAG AA" over an accent at
  // 1.25:1. That badge now reads this audit instead.
  it("reports a dark logo's accent as failing the graphic minimum", () => {
    const th = generateThemes(["#12224A"], 0.2)[0];
    expect(th.contrast.passesAA, "precondition: the generator still calls this AA").toBe(true);
    const rows = auditPairs(th.tokens, th.programs);
    const graphic = byId(rows, "accent-bg");
    expect(graphic.pass).toBe(false);
    expect(graphic.ratio).toBeLessThan(1.5);
    // …and it is the ONLY failure, so the panel names the accent rather than
    // telling the gym its whole palette is broken.
    expect(rows.filter((r) => !r.pass).map((r) => r.id)).toEqual(["accent-bg"]);
    expect(textFailures(rows), "a graphic failure must not be counted as a text failure").toBe(0);
  });

  // 🔴 THE ONE THIS EXISTS FOR. `--navy` is an editable token in the fine-tune
  // panel. Moved to a plausible value, the OLD five rows all pass while
  // secondary text on the inset surface sits at 1.47:1 — the panel would have
  // said "Member-visible text meets WCAG AA" over it.
  it("catches what the old five could not", () => {
    const rows = auditPairs({ ...PRESET_SKINS.canopy.tokens, navy: "#6E8478" });
    for (const id of OLD_FIVE) {
      expect(byId(rows, id).pass, `precondition: ${id} must still pass or this proves nothing`).toBe(true);
    }
    expect(byId(rows, "muted-navy").pass).toBe(false);
    expect(byId(rows, "muted-navy").ratio).toBeLessThan(2);
    expect(textFailures(rows)).toBeGreaterThan(0);
  });

  // Every row must be reachable as a failure. A check that cannot fail is
  // theatre, and this repo's rule is to delete those rather than ship them.
  it("has no row that is incapable of failing", () => {
    const seen = new Set();
    let seed = 7;
    const rnd = () => {                       // deterministic, so a red run reproduces
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return "#" + ((seed >> 7) & 0xffffff).toString(16).padStart(6, "0");
    };
    for (let i = 0; i < 6000; i++) {
      const tk = { bg: rnd(), card: rnd(), navy: rnd(), border: "rgba(255,255,255,.07)",
                   accent: rnd(), green: rnd(), text: rnd(), muted: rnd() };
      for (const r of auditPairs(tk, [{ name: "Strength", tint: rnd() }])) {
        if (!r.pass) seen.add(r.id);
      }
    }
    const ids = auditPairs(PRESET_SKINS.canopy.tokens, [{ name: "Strength", tint: "#A78BFA" }]).map((r) => r.id);
    expect([...ids].filter((id) => !seen.has(id)), "these rows never failed in 6000 palettes").toEqual([]);
  });

  // A chip is a hue at 14% over a surface with `hueInk` for the ink. Read as
  // SOLID — which is what a panel without compositing does — the plate is the
  // raw hue and the answer is wrong. Both halves are asserted here.
  it("measures a chip as a composited plate, not as the raw hue", () => {
    const tk = PRESET_SKINS.canopy.tokens;
    const tint = "#A78BFA";
    const rows = auditPairs(tk, [{ name: "Strength", tint }]);
    const chip = byId(rows, "chip-Strength");
    expect(chip).toBeTruthy();

    const plate = platedOn(tint, CHIP_ALPHA, tk.card);
    const ink = hueInkOn(tint, tk.text);
    expect(chip.ratio).toBeCloseTo(contrastRgb(ink, plate), 6);

    // The plate is NOT the raw hue, and the ink is NOT the raw hue either —
    // those are the two ways this row gets silently wrong.
    const rawOnRaw = contrastRgb(parseCssColor(tint), parseCssColor(tk.card));
    expect(chip.ratio).not.toBeCloseTo(rawOnRaw, 2);
    expect(plate).not.toEqual(parseCssColor(tint));
  });

  it("composites the chip plate exactly as hexA + source-over does", () => {
    const got = platedOn("#A78BFA", CHIP_ALPHA, "#0F1611");
    const want = compositeOver(parseCssColor(hexA("#A78BFA", CHIP_ALPHA)), parseCssColor("#0F1611"));
    expect(got).toEqual(want);
  });

  // The audit must measure the SAME red the product paints. A compliance panel
  // reporting on a colour `applySkinCSS` does not write is reporting on nothing.
  it("checks the danger and warning plates the app actually writes", () => {
    const tk = PRESET_SKINS.canopy.tokens;
    const rows = auditPairs(tk);
    expect(byId(rows, "danger").bg)
      .toBe(`rgb(${[...Object.values(platedOn(DANGER, BADGE_ALPHA, tk.card))].slice(0, 3).map(Math.round).join(", ")})`);
    expect(byId(rows, "warn")).toBeTruthy();
    // Not skin-derived, so the same hue on two different palettes must give two
    // different ratios only because the SURFACE moved.
    const dark = byId(auditPairs(PRESET_SKINS.canopy.tokens), "danger").ratio;
    const light = byId(auditPairs(LIGHT_SKIN), "danger").ratio;
    expect(dark).not.toBeCloseTo(light, 2);
  });

  // `fgKey` drives the Fix button. A derived row offering a Fix would rewrite a
  // token the row does not name.
  it("offers a fixable token only on rows that name one", () => {
    const rows = auditPairs(PRESET_SKINS.canopy.tokens);
    for (const r of rows) {
      if (r.fgKey) expect(["text", "muted", "accent"]).toContain(r.fgKey);
    }
    for (const id of ["onacc-acc", "ongrn-grn", "danger", "warn"]) {
      expect(byId(rows, id).fgKey, `${id} must not offer a Fix`).toBeNull();
    }
    expect(rows.filter((r) => r.id.startsWith("chip-")).every((r) => r.fgKey === null)).toBe(true);
  });

  it("counts only non-graphic rows as text failures", () => {
    // An accent that is decorative at 3:1 is not a reason to tell an owner their
    // text is unreadable.
    const rows = auditPairs({ ...PRESET_SKINS.canopy.tokens, accent: "#0D120F" });
    expect(byId(rows, "accent-bg").pass).toBe(false);
    expect(byId(rows, "accent-bg").big).toBe(true);
    expect(textFailures(rows)).toBe(rows.filter((r) => !r.big && !r.pass).length);
  });

  // A draft the coach is mid-edit through, and a store that arrived malformed.
  it("survives absent and unparseable tokens rather than throwing", () => {
    for (const tk of [null, undefined, {}, { bg: "not-a-colour", text: "#fff" }]) {
      expect(() => auditPairs(tk)).not.toThrow();
      const rows = auditPairs(tk);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(Number.isFinite(r.ratio)).toBe(true);
    }
  });

  it("falls back to the default programs when a skin carries none", () => {
    const withNone = auditPairs(PRESET_SKINS.canopy.tokens, []);
    expect(withNone.some((r) => r.id.startsWith("chip-"))).toBe(true);
  });
});
