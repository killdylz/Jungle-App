import { useEffect, useState, useCallback } from "react";
import { fetchSummary } from "../lib/summaryApi.js";
import { summaryTotals } from "../lib/summaryContent.js";

// ─── N4 — the member's view of a class they did ──────────────────────────────
//
// THE ONLY MEMBER-FACING SURFACE IN THE PRODUCT. Everything else Jungle renders
// is for a trainer or an owner. F6's white-label claim — "the member
// experiences the studio's brand" — has until now been asserted entirely on
// screens no member ever sees. This is where it becomes checkable.
//
// WHOSE PAGE THIS IS. The gym's. Same rule as the share card and for the same
// reason: a member looking at this is looking at their studio, and a "Powered
// by Jungle" mark here would be us taking the gym's audience on the one screen
// where they are paying attention. There is no Jungle name on this page and
// there should never be one.
//
// SELF-CONTAINED ON PURPOSE. No primitives, no theme provider, no store, no
// supabase client. It renders from one fetch and the brand snapshot that came
// back with it. That is what lets it sit OUTSIDE AuthGate in main.jsx — which
// it must, because AuthGate shows a login wall to anyone without a session, and
// a member has no session and never will.
//
// ⛔ Do not give this page a member's name, streak, or attendance. The token in
// front of it is class-scoped precisely so a link pasted into a group chat
// cannot be walked back to a person. The moment this page renders a member, the
// URL becomes a PDPA disclosure. If a personalised version is ever wanted, it
// needs a different token design and a privacy notice first (spec §F6).

const FALLBACK = {
  bg: "#0A0F0C", card: "#0F1611", text: "#E8EFE9", muted: "#8AA294",
  accent: "#7BE3A4", border: "rgba(255,255,255,.10)",
  display: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  body: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};

// A member opens this on a phone, usually one-handed, often on the way out of
// the building. Mobile is the design target; the desktop case is a max-width.
const WRAP = { minHeight: "100vh", padding: "28px 20px 56px", boxSizing: "border-box" };
const INNER = { width: "100%", maxWidth: "620px", margin: "0 auto" };

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

// Sets/reps/rest as one readable line. A member is not reading a spec sheet, so
// "3 × 10, rest 30s" beats a three-column table that has to reflow on a phone.
function movementDetail(ex) {
  const bits = [];
  if (ex?.s && ex?.r) bits.push(`${ex.s} × ${ex.r}`);
  else if (ex?.r) bits.push(ex.r);
  else if (ex?.s) bits.push(`${ex.s} sets`);
  if (ex?.rest) bits.push(`rest ${ex.rest}`);
  return bits.join(", ");
}

function Message({ tokens, title, body, onRetry }) {
  return (
    <div style={{ ...WRAP, background: tokens.bg, color: tokens.text, fontFamily: tokens.body, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...INNER, textAlign: "center" }}>
        <h1 style={{ fontFamily: tokens.display, fontSize: "22px", fontWeight: 800, margin: "0 0 10px" }}>{title}</h1>
        <p style={{ fontSize: "14px", lineHeight: 1.6, color: tokens.muted, margin: 0 }}>{body}</p>
        {onRetry ? (
          <button onClick={onRetry}
            style={{ marginTop: "22px", padding: "11px 22px", borderRadius: "9px", border: "none", cursor: "pointer",
                     background: tokens.accent, color: tokens.bg, fontWeight: 800, fontSize: "14px", fontFamily: tokens.body }}>
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function ClassSummary({ token }) {
  const [state, setState] = useState({ phase: "loading", data: null, reason: "" });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, phase: "loading" }));
    const r = await fetchSummary(token);
    if (r.ok) setState({ phase: "ready", data: r, reason: "" });
    else setState({ phase: "error", data: null, reason: r.reason || "invalid" });
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const brand = state.data?.brand || {};
  const tokens = { ...FALLBACK };
  for (const k of Object.keys(FALLBACK)) if (brand[k]) tokens[k] = brand[k];

  const gymName = state.data?.gym?.name || "";
  const klass = state.data?.klass || {};
  const content = state.data?.content || null;
  const title = content?.title || klass.name || "Class";

  // The tab is the gym's too. Set once the data arrives; before that the
  // index.html default stands rather than flashing a placeholder.
  useEffect(() => {
    if (state.phase !== "ready") return;
    document.title = [gymName, title].filter(Boolean).join(" · ") || "Class";
  }, [state.phase, gymName, title]);

  if (state.phase === "loading") {
    return (
      <div style={{ ...WRAP, background: tokens.bg, color: tokens.muted, fontFamily: tokens.body, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span data-testid="summary-loading" style={{ fontSize: "14px" }}>Loading your class…</span>
      </div>
    );
  }

  if (state.phase === "error") {
    const copy = {
      expired: ["This link has expired", "Links stay live for a couple of weeks. Ask your studio for a fresh one."],
      "not-found": ["This class is no longer available", "Your studio may have removed it."],
      network: ["Couldn't load your class", "Check your connection and try again."],
    }[state.reason] || ["This link isn't valid", "Check you copied the whole link, or ask your studio for a new one."];
    return (
      <div data-testid={`summary-error-${state.reason}`}>
        <Message tokens={tokens} title={copy[0]} body={copy[1]}
          onRetry={state.reason === "network" ? load : null} />
      </div>
    );
  }

  const totals = summaryTotals(content);
  const facts = [
    totals.minutes ? `${totals.minutes} min` : (klass.durationMin ? `${klass.durationMin} min` : ""),
    totals.movementCount ? `${totals.movementCount} movement${totals.movementCount === 1 ? "" : "s"}` : "",
    klass.coachName ? `with ${klass.coachName}` : "",
  ].filter(Boolean);

  return (
    <main data-testid="summary-ready"
      style={{ ...WRAP, background: tokens.bg, color: tokens.text, fontFamily: tokens.body }}>
      <div style={{ ...INNER }}>
        {gymName ? (
          <div style={{ color: tokens.accent, fontWeight: 700, fontSize: "12px", letterSpacing: "3px", textTransform: "uppercase", marginBottom: "10px" }}>
            {gymName}
          </div>
        ) : null}

        <div style={{ color: tokens.muted, fontSize: "13px", marginBottom: "8px" }}>{fmtDate(klass.startsAt)}</div>

        <h1 style={{ fontFamily: tokens.display, fontSize: "clamp(30px, 8vw, 44px)", lineHeight: 1.08, fontWeight: 800, margin: "0 0 14px", overflowWrap: "anywhere" }}>
          {title}
        </h1>

        {facts.length ? (
          <div style={{ color: tokens.muted, fontSize: "14px", marginBottom: "26px" }}>{facts.join("  ·  ")}</div>
        ) : null}

        {content && content.stages?.length ? (
          <div>
            {content.stages.map((s, i) => (
              <section key={i} style={{ background: tokens.card, border: `1px solid ${tokens.border}`, borderRadius: "14px", padding: "16px 16px 14px", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", marginBottom: s.exercises?.length ? "12px" : 0 }}>
                  <h2 style={{ fontFamily: tokens.display, fontSize: "17px", fontWeight: 700, margin: 0, overflowWrap: "anywhere" }}>
                    {s.name || `Section ${i + 1}`}
                  </h2>
                  {s.durMin ? (
                    <span style={{ color: tokens.accent, fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap" }}>{s.durMin} min</span>
                  ) : null}
                </div>
                {s.exercises?.length ? (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {s.exercises.map((ex, j) => {
                      const detail = movementDetail(ex);
                      return (
                        <li key={j} style={{ display: "flex", justifyContent: "space-between", gap: "14px", padding: "7px 0", borderTop: j ? `1px solid ${tokens.border}` : "none" }}>
                          <span style={{ fontSize: "15px", overflowWrap: "anywhere" }}>{ex.n}</span>
                          {detail ? (
                            <span style={{ fontSize: "13px", color: tokens.muted, whiteSpace: "nowrap" }}>{detail}</span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {s.more ? (
                  <div style={{ fontSize: "12px", color: tokens.muted, marginTop: "8px" }}>+{s.more} more</div>
                ) : null}
              </section>
            ))}
            {content.more ? (
              <div style={{ fontSize: "13px", color: tokens.muted, marginTop: "4px" }}>+{content.more} more sections</div>
            ) : null}
          </div>
        ) : (
          // The class exists but nothing was published for it — either the coach
          // never pressed the button, or migration 0009 has not been run yet.
          // Say so plainly rather than render a beautiful empty page.
          <p data-testid="summary-no-content" style={{ color: tokens.muted, fontSize: "14px", lineHeight: 1.6, margin: 0 }}>
            The full breakdown for this class isn't available.
          </p>
        )}

        <p style={{ color: tokens.muted, fontSize: "11px", lineHeight: 1.6, marginTop: "30px" }}>
          This is a private link to one class. It stops working after a while.
        </p>
      </div>
    </main>
  );
}
