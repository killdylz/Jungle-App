import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ErrorBoundary from './ui/ErrorBoundary.jsx'
import { tokenFromFragment } from './lib/classToken.js'
import { bootColours } from './lib/colors.js'

// ── Service worker (P7 offline) ──────────────────────────────────────────────
// Production only: in dev it would sit between Vite and the browser and fight
// HMR, which is a debugging trap nobody needs. Registered after `load` so it
// never competes with the first paint on gym Wi-Fi. A registration failure is
// logged and ignored — the app must work without it.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((e) => console.warn("[sw] registration failed:", e?.message || e));
  });
}

// ── N4: the member link is decided BEFORE anything else ──────────────────────
//
// This branch has to live here, above AuthGate, and that is not a stylistic
// choice. With Supabase configured, AuthGate renders a Sign-in wall to anyone
// without a session — so a member tapping their class link would be asked to
// log into their gym's staff app. No route inside App could fix that, because
// App would never render.
//
// Read ONCE, at module scope: a member's link is what the page was OPENED with.
// Reacting to hashchange by re-rendering would mean a stray `#` anywhere in the
// app could swap a signed-in coach into the member view mid-session.
const summaryToken = tokenFromFragment(typeof window !== "undefined" ? window.location.hash : "");

// …with one exception, and it is not hypothetical. Changing ONLY the fragment is
// a same-document navigation: the browser does not re-run this module, so
// pasting a member link into a tab that already has the app open leaves the app
// on screen and looks exactly like a broken link. The first person to do that
// will be whoever is verifying the feature. A full reload — only when a token
// actually appears, and only when it is a different one — makes that path
// behave the same as opening the link cold, which is the only behaviour anyone
// expects. (Verified by probe: goto('#s=…') kept the app; reload showed the
// summary.)
if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    const next = tokenFromFragment(window.location.hash);
    if (next && next !== summaryToken) window.location.reload();
  });
}

// Both branches are lazy so neither audience pays for the other. A member on
// mobile data gets React and a small page instead of the entire coach app —
// supabase-js, the exercise library, every screen — and staff never download
// the member page at all.
const ClassSummary = lazy(() => import('./screens/ClassSummary.jsx'));
const StaffApp = lazy(() => import('./StaffApp.jsx'));

// Matches AuthGate's own loading state, and wears the colours the app painted
// last time — so a studio with a light palette does not get a flash of
// near-black while its chunk downloads. See bootColours.
const BOOT = bootColours();
if (typeof document !== "undefined") document.body.style.background = BOOT.bg;

const Booting = () => (
  <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
                background: BOOT.bg, color: BOOT.muted,
                fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
    Loading…
  </div>
);

// The boundary sits OUTSIDE both branches deliberately: AuthGate does async
// Supabase work at mount and can throw too, and a crash there would otherwise be
// the same white screen with no way back.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<Booting />}>
        {summaryToken ? <ClassSummary token={summaryToken} /> : <StaffApp />}
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
)
