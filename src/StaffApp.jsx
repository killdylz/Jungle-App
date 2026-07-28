import App from './App.jsx'
import AuthGate from './AuthGate.jsx'

// The staff half of the root split (N4). It exists so main.jsx can lazy-load
// AuthGate + App as ONE chunk: `lazy()` takes a module, and pairing them here
// keeps the auth wall and the thing it guards inseparable — there is no import
// of App.jsx anywhere that skips AuthGate.
//
// Everything about the app's boot is unchanged; this is a wrapper, not a layer.
export default function StaffApp() {
  return (
    <AuthGate>
      <App />
    </AuthGate>
  );
}
