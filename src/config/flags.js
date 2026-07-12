// ─── Feature flags ───────────────────────────────────────────────────────────
// Mock/theatre surfaces default OFF so they can never be demoed as real (a
// sales-integrity requirement — see roadmap Phase 0 "de-risk"). Flip a flag to
// true ONLY for local UI work, never in a build a prospect might see. Each mock
// surface gets replaced by a real-data implementation in the phase noted below.

export const FLAGS = {
  mockAnalytics: false, // AnalyticsScreen hardcoded KPIs + calendar suggestions/leaderboard → real analytics, Phase 2 (N2)
  mockMembers:   false, // MemberScreen demo app + demo member song requests → members table, Phase 1
  mockSchedule:  false, // BASE_SCHEDULE hardcoded classes → class_instances, Phase 1
  attendeeShare: false, // Legacy b64-in-URL read-only attendee view → replaced by magic-link member view, Phase 1
};

// Views that exist only as mock/theatre today. Hidden from every nav and blocked
// at the render choke-point unless their flag is explicitly on.
const MOCK_VIEW_FLAG = { analytics: "mockAnalytics", member: "mockMembers" };

export function isViewEnabled(key) {
  const flag = MOCK_VIEW_FLAG[key];
  return flag ? !!FLAGS[flag] : true;
}
