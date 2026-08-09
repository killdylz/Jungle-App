import { describe, it, expect } from "vitest";
import {
  membershipPrice, revenueAtRisk, describeRevenueAtRisk, fmtMoney,
  PRICE_FIELD, CURRENCY_FIELD, CURRENCIES, DEFAULT_CURRENCY,
} from "./revenueAtRisk.js";
import { atRiskMembers, applyRetentionActions } from "./retention.js";

const priced = (over = {}) => ({ [PRICE_FIELD]: 150, ...over });

// ─── The half of this feature that matters ───────────────────────────────────
// Everything below the price tests is arithmetic anyone would get right. THIS is
// the block that stops the feature drifting into a fabricated number: a gym that
// has set no price must produce `null` from every entry point, for every shape of
// nothing a real branding blob can hold.
describe("no price set means NO number, not a zero", () => {
  it("returns null for every shape of an unset price", () => {
    const nothing = [
      undefined, null, {}, { [PRICE_FIELD]: undefined }, { [PRICE_FIELD]: null },
      { [PRICE_FIELD]: "" }, { [PRICE_FIELD]: "   " },
      // A number input cleared in one browser gives "", in another 0. Both mean
      // "I do not want this shown", and "S$0/month at risk" is the confident
      // wrong number this whole module exists to refuse.
      { [PRICE_FIELD]: 0 }, { [PRICE_FIELD]: "0" }, { [PRICE_FIELD]: -150 },
      { [PRICE_FIELD]: "not a price" }, { [PRICE_FIELD]: NaN },
      { [PRICE_FIELD]: Infinity },
      // Only the currency set, with no amount — an owner who touched the select
      // and nothing else has still set no price.
      { [CURRENCY_FIELD]: "SGD" },
    ];
    nothing.forEach(b => {
      expect(membershipPrice(b), `${JSON.stringify(b)} read as a price`).toBeNull();
    });
  });

  it("carries the null all the way through: no price ⇒ no revenue figure", () => {
    const flags = [{ memberId: "m1" }, { memberId: "m2" }];
    expect(revenueAtRisk(flags, membershipPrice({}))).toBeNull();
    expect(revenueAtRisk(flags, null)).toBeNull();
    expect(describeRevenueAtRisk(null, null)).toBe("");
  });

  // The positive control for the block above. Without it, a `membershipPrice`
  // that returned null unconditionally — a one-character typo away — would make
  // every assertion here pass and the feature would silently never appear.
  it("CONTROL: a price that IS set reads as one", () => {
    expect(membershipPrice(priced())).toEqual({ amount: 150, currency: "SGD", symbol: "S$" });
    expect(revenueAtRisk([{ memberId: "m1" }], membershipPrice(priced()))).not.toBeNull();
  });
});

describe("membershipPrice", () => {
  it("accepts the string a text input actually stores", () => {
    expect(membershipPrice({ [PRICE_FIELD]: "150" })?.amount).toBe(150);
    expect(membershipPrice({ [PRICE_FIELD]: " 149.50 " })?.amount).toBe(149.5);
  });

  it("defaults the currency to the launch market and never to an unknown code", () => {
    expect(membershipPrice(priced()).currency).toBe(DEFAULT_CURRENCY);
    expect(DEFAULT_CURRENCY).toBe("SGD");
    // A code from an older build, a hand-edited localStorage, or a server row
    // written by a future version must not reach the screen as a bare code with
    // no symbol. Falling back is safe here because the AMOUNT is the owner's own
    // and only the unit is being guessed — and the select cannot produce this.
    expect(membershipPrice({ ...priced(), [CURRENCY_FIELD]: "XYZ" }).currency).toBe(DEFAULT_CURRENCY);
    expect(membershipPrice({ ...priced(), [CURRENCY_FIELD]: "myr" })).toEqual(
      { amount: 150, currency: "MYR", symbol: "RM" });
  });

  it("gives every offered currency a symbol", () => {
    // The select is built from CURRENCIES, so a row added without a symbol would
    // render `undefined150` on the owner's screen.
    CURRENCIES.forEach(c => {
      expect(c.code, `${c.code} is not a 3-letter code`).toMatch(/^[A-Z]{3}$/);
      expect(c.symbol, `${c.code} has no symbol`).toBeTruthy();
      expect(membershipPrice({ [PRICE_FIELD]: 1, [CURRENCY_FIELD]: c.code }).symbol).toBe(c.symbol);
    });
  });
});

describe("fmtMoney", () => {
  it("drops decimals on a whole number and keeps them on a fraction", () => {
    const p = membershipPrice(priced());
    expect(fmtMoney(450, p)).toBe("S$450");
    // A price of 149.50 × 3 must not render as an exact-looking S$449.
    expect(fmtMoney(448.5, p)).toBe("S$448.50");
  });

  it("groups thousands, because the whole point is a figure read at a glance", () => {
    expect(fmtMoney(12_600, membershipPrice(priced()))).toBe("S$12,600");
  });

  it("returns empty for a non-number rather than 'S$NaN'", () => {
    expect(fmtMoney(undefined, null)).toBe("");
    expect(fmtMoney(NaN, null)).toBe("");
  });
});

describe("revenueAtRisk", () => {
  const p = membershipPrice(priced());

  it("is members × price, and says so", () => {
    const r = revenueAtRisk([{ memberId: "m1" }, { memberId: "m2" }, { memberId: "m3" }], p);
    expect(r).toMatchObject({ members: 3, perMember: 150, total: 450, currency: "SGD" });
    expect(describeRevenueAtRisk(r, p)).toBe("3 members × S$150/month");
  });

  it("says 'member' not 'members' for one", () => {
    expect(describeRevenueAtRisk(revenueAtRisk([{ memberId: "m1" }], p), p)).toBe("1 member × S$150/month");
  });

  it("counts MEMBERS, not flags", () => {
    // `atRiskMembers` returns at most one flag per member today. If a second
    // absence-shaped rule is added and that invariant relaxes, the total must
    // still be reconcilable against the roster — billing one member twice makes
    // the figure impossible for an owner to check, which is worse than blunt.
    const r = revenueAtRisk([
      { memberId: "m1", rule: "absence" },
      { memberId: "m1", rule: "new_member_low_visits" },
      { memberId: "m2", rule: "absence" },
    ], p);
    expect(r.members).toBe(2);
    expect(r.total).toBe(300);
  });

  it("returns null when nothing is at risk, so a healthy gym sees no money card", () => {
    expect(revenueAtRisk([], p)).toBeNull();
    expect(revenueAtRisk(null, p)).toBeNull();
    // A flag with no member id is not a member.
    expect(revenueAtRisk([{ rule: "absence" }], p)).toBeNull();
  });
});

// ─── The screen must not contradict itself ──────────────────────────────────
// `describeRetention` carries a note about exactly this bug in its own words: the
// card once said "2" next to "3 members meet an at-risk rule", because the
// headline counted active flags and the sentence counted raw ones. The money
// figure is the third thing on that card that can disagree with the other two,
// and it is the one that gets quoted.
describe("the figure agrees with the headline count", () => {
  const NOW = Date.parse("2026-06-01T12:00:00Z");
  const daysAgo = d => new Date(NOW - d * 86_400_000).toISOString();
  const members = [
    { id: "m1", name: "Ana", status: "active" },
    { id: "m2", name: "Ben", status: "active" },
    { id: "m3", name: "Cai", status: "active" },
  ];
  const attendance = [
    // m1 and m2 have lapsed; m3 came in yesterday, which also keeps the studio
    // "recording" so the absence rule is live at all.
    { memberId: "m1", checkedInAt: daysAgo(40) },
    { memberId: "m2", checkedInAt: daysAgo(30) },
    { memberId: "m3", checkedInAt: daysAgo(1) },
  ];

  it("drops a handled member from the total, not just from the list", () => {
    const p = membershipPrice(priced());
    const flags = atRiskMembers(members, attendance, { now: NOW });
    expect(flags.length).toBe(2);          // control: the fixture really flags two
    expect(revenueAtRisk(flags, p).total).toBe(300);

    const { active } = applyRetentionActions(flags, [
      { memberId: "m1", rule: flags.find(f => f.memberId === "m1").rule,
        action: "acted", occurredAt: daysAgo(0) },
    ], attendance);
    expect(active.length).toBe(1);
    // The number the owner reads must be the number the list adds up to.
    expect(revenueAtRisk(active, p).total).toBe(150);
  });
});
