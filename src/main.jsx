import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthGate from './AuthGate.jsx'
import ErrorBoundary from './ui/ErrorBoundary.jsx'

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

// The boundary sits OUTSIDE AuthGate deliberately: AuthGate does async Supabase
// work at mount and can throw too, and a crash there would otherwise be the same
// white screen with no way back.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthGate>
        <App />
      </AuthGate>
    </ErrorBoundary>
  </StrictMode>,
)
