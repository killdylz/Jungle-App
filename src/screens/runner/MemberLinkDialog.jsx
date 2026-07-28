import { useState, useEffect, useRef } from "react";
import { Btn } from "../../ui/primitives.jsx";
import { useDialog } from "../../ui/dialog.js";
import * as store from "../../lib/store.js";
import { supabase, supabaseEnabled } from "../../supabase.js";
import { publishSummary } from "../../lib/summaryApi.js";

// ─── N4 — the coach's half: publish this class, get a link to hand out ───────
//
// A separate component and not a block inside LiveScreen, because useDialog is
// a hook and a hook cannot be called from inside `{cond && …}`. That is the
// same reason ResetLibraryConfirm, SmartBuildDialog and AddClassDialog exist.
//
// PUBLISHING IS AN ACT. Running a class does not create a member link and
// nothing here happens in the background — a coach presses a button and the
// gym's programming leaves the building. The alternative (auto-publish every
// class) would make the studio's content public by default, which is not a
// decision a piece of software should make on a business's behalf.
//
// THE LINK IS SHOWN, NOT JUST COPIED. A bare "Copy link" button that writes to
// the clipboard is a control that does nothing visible, and on a phone browser
// without a secure context it is a control that does nothing at all. The URL is
// on screen and selectable, so the coach can always get at it even when the
// clipboard API refuses.
export function MemberLinkDialog({ classInstanceId, stages, sessionName, onClose }) {
  const dlg = useDialog(onClose, "Member link");
  const [state, setState] = useState({ phase: "working", url: "", stored: true, reason: "", detail: "" });
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await publishSummary({
        classInstanceId, stages, sessionName,
        gymName: store.getGymBranding()?.gymName || "",
        supabase, supabaseEnabled,
      });
      if (!alive) return;
      if (r.ok) setState({ phase: "ready", url: r.url, stored: r.stored, reason: "", detail: "" });
      else setState({ phase: "error", url: "", stored: true, reason: r.reason, detail: r.detail || "" });
    })();
    return () => { alive = false; };
  }, [classInstanceId, sessionName, stages]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      // No clipboard permission, or an insecure context. Select the text so the
      // coach's own copy gesture works — never report a copy that did not happen.
      inputRef.current?.select();
    }
  };

  const errorCopy = {
    "offline-only": ["Not available offline", "Member links are created by your studio's server. Reconnect and try again."],
    empty: ["Nothing to share yet", "Add some movements to the class before sending it out."],
  }[state.reason] || ["Couldn't create the link", state.detail || "Try again in a moment."];

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div {...dlg} onClick={e=>e.stopPropagation()} style={{background:"var(--bg)",border:`1px solid var(--border)`,borderRadius:"14px",width:"100%",maxWidth:"440px",padding:"20px",outline:"none"}}>
        <div style={{fontFamily:"var(--display)",fontSize:"17px",fontWeight:"700",color:"var(--text)",marginBottom:"4px"}}>Member link</div>
        <div style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.6,marginBottom:"16px"}}>
          A page showing tonight's class in your colours. No sign-in, and it doesn't name anyone.
        </div>

        {state.phase === "working" && (
          <div data-testid="memberlink-working" style={{fontSize:"13px",color:"var(--muted)",padding:"10px 0"}}>Creating the link…</div>
        )}

        {state.phase === "error" && (
          <div data-testid={`memberlink-error-${state.reason}`}>
            <div style={{fontSize:"14px",fontWeight:"700",color:"var(--text)",marginBottom:"6px"}}>{errorCopy[0]}</div>
            <div style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.6}}>{errorCopy[1]}</div>
          </div>
        )}

        {state.phase === "ready" && (
          <div data-testid="memberlink-ready">
            <label htmlFor="memberlink-url" style={{display:"block",fontSize:"11px",color:"var(--muted)",fontWeight:"600",marginBottom:"6px"}}>
              Share this link
            </label>
            <div style={{display:"flex",gap:"8px"}}>
              <input id="memberlink-url" ref={inputRef} readOnly value={state.url}
                onFocus={e=>e.target.select()}
                style={{flex:1,minWidth:0,padding:"10px 12px",borderRadius:"8px",border:`1px solid var(--border)`,background:"transparent",color:"var(--text)",fontSize:"12px",outline:"none"}}/>
              <Btn onClick={copy} style={{padding:"8px 14px",flexShrink:0}}>{copied ? "Copied" : "Copy"}</Btn>
            </div>
            {!state.stored && (
              <div data-testid="memberlink-not-stored" style={{fontSize:"12px",color:"var(--muted)",lineHeight:1.6,marginTop:"12px",padding:"10px",border:`1px solid var(--border)`,borderRadius:"8px"}}>
                The link works, but it will show the class details without the movement list — the studio's database
                hasn't been set up for published classes yet.
              </div>
            )}
            <div style={{fontSize:"11px",color:"var(--muted)",lineHeight:1.6,marginTop:"12px"}}>
              Anyone with the link can see it, so send it to your members rather than posting it publicly. It stops
              working after two weeks.
            </div>
          </div>
        )}

        <div style={{display:"flex",justifyContent:"flex-end",marginTop:"18px"}}>
          <Btn variant="ghost" onClick={onClose} style={{padding:"7px 14px"}}>Done</Btn>
        </div>
      </div>
    </div>
  );
}
