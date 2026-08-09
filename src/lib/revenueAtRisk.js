// ─── Monthly revenue at risk (N3 → the owner's half of the argument) ──────────
//
// WHY THIS EXISTS
// The at-risk panel is the coach's screen and it is honest: it names members and
// shows the arithmetic behind each flag. But Jungle proves its value to the COACH
// and is sold to the OWNER, and an owner does not buy "1 member needs attention".
// They buy "S$740/month is walking out the door", because that is the number they
// can hold against a subscription price.
//
// The whole of that argument is one input the product did not hold: what a
// membership costs. Everything else — who is at risk, why, how many — was already
// computed. So this module is deliberately tiny: a price, a count, a product.
//
// ── THE DESIGN CONSTRAINT, which is the whole module ────────────────────────
// This repo's standing rule is that **a confident wrong number is worse than no
// number**. A revenue figure is the most quotable thing on the screen — it is
// what gets screenshotted into a pitch and repeated back in a renewal
// conversation — so it is exactly where a guess does the most damage.
//
// Therefore:
//   • No price set → `null`. Not zero, not a placeholder, not an industry
//     average. The panel renders exactly as it did before this module existed.
//   • The figure is MONTHLY RECURRING REVENUE, not lifetime value. LTV needs an
//     average-tenure assumption Jungle has not earned from any gym's data; MRR is
//     `members × price`, which an owner can check in their head and argue with.
//   • It is derived from the ACTIVE flags — the same list the headline count is
//     derived from. Feeding it the raw flags instead would put "S$450" next to
//     "2 members need attention", and a screen that contradicts itself is not one
//     an owner will quote. (`describeRetention` carries the same note for the
//     same reason; that contradiction has shipped here once already.)
//
// ── ONE PRICE PER GYM ───────────────────────────────────────────────────────
// Not per member. `docs/GTM-SINGAPORE.md` §2 rejected per-member pricing for
// Jungle's own tiers because it "punishes growth and requires metering" — the
// metering half applies here too. A per-member price field is a field that is
// wrong for most rows on day one, and a wrong-per-row total is worse than a
// blunt-but-checkable one. If a gym has three tiers, the honest first cut is the
// one number their owner already quotes when asked what a membership costs.

// Where the price lives: inside the `branding` blob, which already round-trips to
// `brand_profiles.branding` (0004) — so this needs no migration and syncs with
// everything else the owner sets about their gym.
export const PRICE_FIELD = "membershipPrice";
export const CURRENCY_FIELD = "membershipCurrency";

// The currencies an owner can pick. Singapore first because that is the launch
// market (GTM §1), then the neighbours a boutique-studio operator here plausibly
// runs a second location in, then the majors.
//
// A code + symbol table rather than `Intl.NumberFormat`'s locale guess: the
// symbol has to be the one the OWNER writes on their own price list. Rendering
// "SGD 150.00" or "$150" to a Singapore gym that says "S$150" is a small
// wrongness, but it is wrongness in the one number this module exists to make
// quotable, and the table costs a dozen lines.
export const CURRENCIES = [
  { code: "SGD", symbol: "S$" },
  { code: "MYR", symbol: "RM" },
  { code: "HKD", symbol: "HK$" },
  { code: "AUD", symbol: "A$" },
  { code: "USD", symbol: "US$" },
  { code: "GBP", symbol: "£" },
  { code: "EUR", symbol: "€" },
  { code: "AED", symbol: "AED " },
  { code: "INR", symbol: "₹" },
  { code: "IDR", symbol: "Rp" },
  { code: "THB", symbol: "฿" },
  { code: "PHP", symbol: "₱" },
];
export const DEFAULT_CURRENCY = CURRENCIES[0].code;

const SYMBOL = new Map(CURRENCIES.map(c => [c.code, c.symbol]));

/**
 * The price the owner set, or `null` if they have not set one.
 *
 * ⚠️ Zero and negative are UNSET, not "free". A number input is cleared to an
 * empty string by some browsers and to `0` by others, and an owner who deletes
 * the figure means "I don't want this shown" in both cases. Treating 0 as a real
 * price would put "0 members × S$0 = S$0/month at risk" on the screen — a
 * confident number that says nothing, which is the exact failure this module's
 * header refuses.
 *
 * @param branding the `getGymBranding()` blob
 * @returns { amount, currency, symbol } | null
 */
export function membershipPrice(branding) {
  // Strings, because the input is a text/number field and localStorage
  // round-trips whatever it was given. `Number("")` is 0, which the >0 test
  // below rejects — so an empty field cannot become a price.
  const raw = branding?.[PRICE_FIELD];
  const amount = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const code = String(branding?.[CURRENCY_FIELD] || DEFAULT_CURRENCY).toUpperCase();
  const currency = SYMBOL.has(code) ? code : DEFAULT_CURRENCY;
  return { amount, currency, symbol: SYMBOL.get(currency) };
}

/**
 * Render a money amount the way the owner's own price list does.
 *
 * Whole numbers lose the decimals: a membership is "S$150/month", not
 * "S$150.00/month", and the trailing zeros make a checkable number look like a
 * generated one. Fractions keep two places, because a price of 149.5 that
 * rendered as "S$150" would be a rounded figure presented as an exact one.
 */
export function fmtMoney(amount, price) {
  if (!Number.isFinite(amount)) return "";
  const symbol = price?.symbol ?? SYMBOL.get(DEFAULT_CURRENCY);
  const whole = Math.round(amount * 100) % 100 === 0;
  const n = whole
    ? Math.round(amount).toLocaleString("en-US")
    : amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${n}`;
}

/**
 * Monthly recurring revenue represented by a set of at-risk flags.
 *
 * @param flags  the ACTIVE flags — post-`applyRetentionActions`. See the header.
 * @param price  from `membershipPrice()`; `null` when the owner has set none.
 * @returns null when there is no price or nothing at risk, else
 *          { members, perMember, total, currency, symbol }
 */
export function revenueAtRisk(flags, price) {
  if (!price) return null;
  // One flag per member is guaranteed upstream — `atRiskMembers` returns after
  // pushing rule 1's flag and only reaches rule 2 when rule 1 did not fire — but
  // this de-duplicates by member id anyway. If a second rule is ever added and
  // that invariant is relaxed, the arithmetic here must still be "members ×
  // price"; counting flags would bill one member twice, and the total would be a
  // number no owner could reconcile against their own roster.
  const members = new Set((flags || []).map(f => f?.memberId).filter(Boolean)).size;
  if (!members) return null;
  return {
    members,
    perMember: price.amount,
    total: members * price.amount,
    currency: price.currency,
    symbol: price.symbol,
  };
}

/**
 * The sentence that goes next to the figure. Every other flag on this screen
 * states the rule that produced it; this states the multiplication, so an owner
 * can check it against their own price list rather than trusting it.
 */
export function describeRevenueAtRisk(r, price) {
  if (!r) return "";
  return `${r.members} member${r.members === 1 ? "" : "s"} × ${fmtMoney(r.perMember, price)}/month`;
}
