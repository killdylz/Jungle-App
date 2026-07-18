// ─── Feature flags ───────────────────────────────────────────────────────────
// Mock/theatre surfaces default OFF so they can never be demoed as real (a
// sales-integrity requirement — see roadmap Phase 0 "de-risk"). Flip a flag to
// true ONLY for local UI work, never in a build a prospect might see. Each mock
// surface gets replaced by a real-data implementation in the phase noted below.

export const FLAGS = {
  mockAnalytics:    false, // AnalyticsScreen hardcoded KPIs + calendar suggestions/leaderboard → real analytics, Phase 2 (N2)
  mockMembers:      false, // MemberScreen demo app + demo member song requests → superseded by the REAL RosterScreen (F4 slice 2); this flag now only gates the old member-facing demo
  mockSchedule:     false, // BASE_SCHEDULE hardcoded classes → class_instances, Phase 1
  attendeeShare:    false, // Legacy b64-in-URL read-only attendee view (+ the "Share with Class" buttons that mint those links) → replaced by magic-link member view, Phase 1
  mockIntegrations: false, // IntegrationsScreen fake ClassPass/Stripe/Wearables "connected" cards → real integrations, later phase
  mockDiscover:     false, // Exercise Library "Discover packs" feed — fabricated authors/import counts + no-op Import → real community pack marketplace, later phase
};

// Views that exist only as mock/theatre today. Hidden from every nav and blocked
// at the render choke-point unless their flag is explicitly on.
// `member` is NOT listed here any more: that route now renders RosterScreen, which
// is real data (the members / attendance tables from 0007) rather than theatre.
const MOCK_VIEW_FLAG = { analytics: "mockAnalytics", integrations: "mockIntegrations" };

export function isViewEnabled(key) {
  const flag = MOCK_VIEW_FLAG[key];
  return flag ? !!FLAGS[flag] : true;
}
