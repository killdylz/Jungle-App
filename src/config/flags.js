// ─── Feature flags ───────────────────────────────────────────────────────────
// Mock/theatre surfaces default OFF so they can never be demoed as real (a
// sales-integrity requirement — see roadmap Phase 0 "de-risk"). Flip a flag to
// true ONLY for local UI work, never in a build a prospect might see.
//
// A flag is a HOLDING PEN, not a filing cabinet. Five of them (mockMembers,
// mockSchedule, attendeeShare, mockIntegrations, mockDiscover) were retired in
// the session-5 cut: the code they gated is deleted, and git history is the
// archive. Flagged-off theatre still costs — it is read during every refactor,
// it hides latent crashes behind a `false` (the attendee route referenced a
// component that was never written), and it invites a demo-day mistake.
//
// `music` is different in kind: the code behind it is intact and quarantined in
// src/music/, not deleted, pending the post-pilot decision.

export const FLAGS = {
  // AnalyticsScreen's hardcoded KPIs. Kept — the audit wants the screen retained
  // as the layout target for real N2 analytics, so this one earns its flag.
  mockAnalytics: false,

  // The music / Auto-DJ subsystem (audit 2.1). Cut from the sellable product:
  // no argued value for trainer, owner or member; Spotify's consumer ToS
  // prohibits commercial-premises playback, and public performance in Singapore
  // needs COMPASS/RIPS licences the GYM must hold. Renders half-dead without a
  // Spotify login. Code lives in src/music/, untouched, so the decision stays
  // reversible. TempoGuide is deliberately NOT behind this flag — it needs no
  // licence and is the display's honest no-music state.
  music: false,
};

// Which views may appear in a nav. This is the SINGLE choke-point — there are
// four separate nav arrays in App.jsx (sidebar, dashboard rail, primaryNav, the
// mobile sheet) and hand-editing each one is how a retired screen survives in
// exactly one menu. Declare it here instead.
//
// `false` means retired: the screen is gone or folded into another surface, and
// no flag brings it back. Spelling it as a literal keeps it from reading like a
// typo'd flag name that silently returns undefined.
//
//   integrations → deleted; route renders the honest coming-soon panel
//   templates    → folded into the Builder's class-type picker as Jungle presets
//   glossary     → folded into the Exercise Library (cues on the movement row)
//
// A coach cannot hold three mental models of "what goes in a class" (audit 2.3):
// class shapes, the movement library, and starter templates collapse to two.
// 🔴 `analytics` USED TO BE HERE, mapped to `mockAnalytics`, and removing it is
// the whole nav half of the N2 build. The backlog said the analytics route "already
// exists" and is "in three nav arrays" — both true, and both beside the point,
// because this map meant `isViewEnabled("analytics")` returned false and every one
// of those three nav arrays filtered the entry straight back out. The route was
// live and unreachable: nothing in the product could navigate to it.
//
// It is gone from this map rather than flipped on, and the distinction matters.
// `FLAGS.mockAnalytics` is still false and `AnalyticsScreen`'s invented KPIs are
// still dead code — flipping it would ship "1,284 active members" and "£412 per
// class" to a paying gym. What is now behind the route is `RetentionScreen`,
// computed from the gym's own rows, so it needs no flag: the honesty gate lives in
// `cohortModel`, which states what data is missing instead of drawing a shape.
//
// The lesson for the next screen gated this way: a mock flag doing double duty as
// a nav gate makes "replace the mock" require a flags.js edit that reads exactly
// like the thing the backlog forbade.
const MOCK_VIEW_FLAG = {
  music: "music",
  integrations: false,
  templates: false,
  glossary: false,
};

// Views that need a SERVER, not a flag.
//
// UI-POLISH §3.5. The Team screen's entire content, with Supabase unconfigured,
// was one sentence: "Team accounts are available on the online version of
// Jungle." A nav entry whose only job is to tell you it does not work here is
// worse than no nav entry — the coach spends a click and a screen to learn that
// a thing they were offered is not on offer.
//
// This lives here rather than as an `&& supabaseEnabled` at the nav, because the
// whole point of this module is that there is ONE place deciding what appears in
// a nav; App.jsx has four nav arrays and a second rule would eventually apply to
// three of them. It takes runtime context rather than reading `supabase.js`
// itself so that flags.js stays a pure, importable statement of policy — a
// config module that imports the Supabase client is a config module that cannot
// be unit-tested.
//
// ⚠️ `ctx.supabaseEnabled === false` rather than `!ctx.supabaseEnabled`: an
// omitted context must leave every view exactly as it was. A caller that has not
// been taught about this yet gets the old answer, not a silently hidden screen.
const NEEDS_SERVER = new Set(["team"]);

export function isViewEnabled(key, ctx = {}) {
  if (NEEDS_SERVER.has(key) && ctx.supabaseEnabled === false) return false;
  if (!(key in MOCK_VIEW_FLAG)) return true;
  const flag = MOCK_VIEW_FLAG[key];
  return flag === false ? false : !!FLAGS[flag];
}
