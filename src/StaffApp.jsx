import App from './App.jsx'
import AuthGate from './AuthGate.jsx'
import { ToastProvider } from './ui/toast.jsx'

// The staff half of the root split (N4). It exists so main.jsx can lazy-load
// AuthGate + App as ONE chunk: `lazy()` takes a module, and pairing them here
// keeps the auth wall and the thing it guards inseparable — there is no import
// of App.jsx anywhere that skips AuthGate.
//
// Everything about the app's boot is unchanged; this is a wrapper, not a layer.
//
// ToastProvider moved HERE from inside App's own JSX. It still "wraps the whole
// staff app", which is what its old comment promised — but a component cannot
// consume a context it provides, so App itself could not toast. That mattered the
// moment the last `window.confirm` in App.jsx ("Start a new class? Your current
// plan will be replaced.") became an undo: the state it has to restore lives in
// App, and the alternative was threading a callback down to the Dashboard and
// back. Nothing else changes — the toast is `position: fixed`, so where it sits in
// the tree does not affect where it appears, and it consumes no theme context.
export default function StaffApp() {
  return (
    <ToastProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </ToastProvider>
  );
}
