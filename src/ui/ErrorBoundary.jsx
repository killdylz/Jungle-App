// ─── Error boundary (infra backlog I1) ───────────────────────────────────────
// Until this existed, ANY render throw white-screened the whole app. That is not
// hypothetical: `9f71f61` shipped `ReferenceError: reduce is not defined` into
// LiveScreen, and the runner went blank the instant a coach armed Mic Mode —
// mid-class, in front of a room. A blank page also destroys the one thing that
// would let the coach recover: the nav.
//
// A React error boundary must be a CLASS — there is no hook equivalent for
// componentDidCatch. Kept deliberately dependency-free (no theme context, no
// primitives) because the boundary has to render when the app around it is
// broken, and anything it imports is another thing that can throw.
//
// Two affordances, in the order a coach mid-class wants them:
//   "Try again"  — re-mounts the subtree. Clears transient render errors (a bad
//                  prop from one tick, a null that has since loaded) in ~0s.
//   "Reload"     — full reload. Safe by construction: store.js is local-first,
//                  so localStorage already holds the session and a reload
//                  rehydrates rather than loses.
import { Component, Fragment } from "react";

const wrap = {
  minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center",
  padding: "32px", background: "#060D18", color: "#EEEEEE",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
};
const card = { maxWidth: "520px", width: "100%", textAlign: "left" };
const btn = {
  padding: "10px 18px", borderRadius: "10px", border: "1px solid #2A3A52",
  background: "#111C2E", color: "#EEEEEE", fontSize: "14px", fontWeight: 600,
  cursor: "pointer", marginRight: "10px",
};
const btnPrimary = { ...btn, background: "#3B82F6", borderColor: "#3B82F6", color: "#fff" };

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, tries: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // No telemetry service yet, so the console is the only record. Keep the
    // component stack — it is what identifies WHICH panel died.
    console.error(`[jungle] render error in <${this.props.name || "app"}>`, error, info?.componentStack);
    this.props.onError?.(error, info);
  }

  render() {
    const { error, tries } = this.state;
    // `key` is what makes "Try again" a real RE-MOUNT rather than a re-render of
    // the same instances holding the same bad state — without it the subtree
    // keeps whatever value threw and throws again immediately.
    if (!error) return <Fragment key={tries}>{this.props.children}</Fragment>;

    const label = this.props.name ? `The ${this.props.name} panel` : "Jungle";
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={{ fontSize: "13px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#7C8DA6", marginBottom: "10px" }}>
            Something broke
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 10px" }}>{label} stopped responding.</h1>
          <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#A9B7C9", margin: "0 0 20px" }}>
            Your classes, plans and history are saved on this device — nothing has been lost.
            Try again first; reload if it keeps happening.
          </p>
          <div style={{ marginBottom: "18px" }}>
            <button style={btnPrimary} onClick={() => this.setState(s => ({ error: null, tries: s.tries + 1 }))}>
              Try again
            </button>
            <button style={btn} onClick={() => window.location.reload()}>Reload</button>
          </div>
          <details style={{ fontSize: "12px", color: "#7C8DA6" }}>
            <summary style={{ cursor: "pointer" }}>Technical detail</summary>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: "10px", fontSize: "11px", lineHeight: 1.5 }}>
              {String(error?.stack || error?.message || error)}
            </pre>
          </details>
          {tries > 0 && (
            <p style={{ fontSize: "12px", color: "#7C8DA6", marginTop: "14px" }}>
              Retried {tries} time{tries === 1 ? "" : "s"}.
            </p>
          )}
        </div>
      </div>
    );
  }
}
