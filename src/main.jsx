import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthGate from './AuthGate.jsx'
import ErrorBoundary from './ui/ErrorBoundary.jsx'

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
