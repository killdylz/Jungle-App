// ─── The coach's profile + gym branding modal ────────────────────────────────
//
// Out of App.jsx and into its own lazy chunk (session 28 §2.2). A modal, already
// behind a click, and one a coach opens rarely — the cheapest kind of byte to
// move out of the eager bundle.
//
// `GYM_FONTS` came with it: this is its only reader.
//
// ⚠️ The branding Save here writes the WHOLE blob. Session 27 fixed it merging
// rather than replacing — `membershipPrice` is set on another screen and was
// being erased. Keep the spread.
import React, { useState, useRef } from "react";
import { Check, LogOut, User } from "lucide-react";
import { SCFG } from "../data/stageConfig.js";
import { hueInk } from "../lib/colors.js";
import { localDateStr } from "../lib/format.js";
import { extractDominantColor } from "../lib/brandGenerator.js";
import { Input, Select, useWindowWidth } from "../ui/primitives.jsx";
import { useDialog } from "../ui/dialog.js";

// ─── Gym Fonts ────────────────────────────────────────────────────────────────
const GYM_FONTS = [
  { label:"Default (System)",   value:"system" },
  { label:"Montserrat",         value:"Montserrat" },
  { label:"Bebas Neue",         value:"Bebas Neue" },
  { label:"Oswald",             value:"Oswald" },
  { label:"Anton",              value:"Anton" },
  { label:"Rajdhani",           value:"Rajdhani" },
  { label:"Barlow Condensed",   value:"Barlow Condensed" },
  { label:"Exo 2",              value:"Exo 2" },
  { label:"Black Ops One",      value:"Black Ops One" },
  { label:"Russo One",          value:"Russo One" },
  { label:"Graduate",           value:"Graduate" },
];

export function ProfileModal({profile, onClose, onLogout, sessionHistory=[], gymBranding={}, onBrandingChange}) {
  if (!profile) return null;

  const vwPM = useWindowWidth();
  const isMobilePM = vwPM < 480;
  const [tab, setTab] = useState("profile"); // "profile" | "branding"
  const dlg = useDialog(onClose, "Your profile and gym branding");

  // ── Profile stats ──
  const totalSessions = sessionHistory.length;
  const totalMinutes  = sessionHistory.reduce((a,s)=>a+(s.durMin||0),0);
  const totalHours    = (totalMinutes/60).toFixed(1);
  const avgDur        = totalSessions ? Math.round(totalMinutes/totalSessions) : 0;
  // 🔴 LOCAL calendar dates on BOTH sides (S31 §2.4). `d.setDate(d.getDate()-1)`
  // steps a LOCAL day, and this used to render each step with
  // `toISOString().slice(0,10)` — UTC — while `useClassRunner` wrote the same
  // way. The pair was self-consistent, so the streak counted correctly; what was
  // wrong was the date SHOWN next to each session, which read as yesterday's for
  // a coach training before 8am in Singapore. Both halves now use the local rule,
  // so the step and the label finally measure the same thing.
  //
  // ⚠️ Sessions recorded BEFORE this change carry a UTC date. There is no
  // migration, because a stored date string has no time in it and the zone it was
  // written in cannot be recovered — guessing would be a confident wrong answer.
  // For a coach east of UTC who trains early, a streak spanning the change can be
  // one short once; it self-heals as new sessions land.
  const now = new Date(), today = localDateStr(now.getTime());
  const dates = new Set(sessionHistory.map(s=>s.date));
  let streak = 0;
  for (let d=new Date(now);;d.setDate(d.getDate()-1)) {
    const ds = localDateStr(d.getTime());
    if (dates.has(ds)) streak++; else if (ds<today) break;
  }
  const typeCounts = {};
  sessionHistory.forEach(s => s.stageTypes?.forEach(t=>{ typeCounts[t]=(typeCounts[t]||0)+1; }));
  const topType = Object.entries(typeCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const recent = sessionHistory.slice(0,5);

  // ── Branding draft ──
  const [draft, setDraft] = useState({
    logo:        gymBranding.logo        || null,
    gymName:     gymBranding.gymName     || "",
    accentColor: gymBranding.accentColor || "var(--accent)",
    secondColor: gymBranding.secondColor || "var(--green)",
    fontFamily:  gymBranding.fontFamily  || "system",
    customFont:  gymBranding.customFont  || "",
  });
  const [extracting, setExtracting] = useState(false);
  const [saved, setSaved]           = useState(false);
  const fileRef = useRef(null);

  const handleLogoUpload = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target.result;
      // Resize to ≤320px before storing
      const tmpImg = new Image();
      tmpImg.onload = () => {
        const maxD = 320, scale = Math.min(1, maxD/tmpImg.width, maxD/tmpImg.height);
        const cv = document.createElement("canvas");
        cv.width = Math.round(tmpImg.width*scale); cv.height = Math.round(tmpImg.height*scale);
        cv.getContext("2d").drawImage(tmpImg, 0, 0, cv.width, cv.height);
        const resized = cv.toDataURL("image/png", 0.85);
        setDraft(d => ({...d, logo: resized}));
        setExtracting(true);
        extractDominantColor(resized, color => {
          setExtracting(false);
          if (color) setDraft(d => ({...d, accentColor: color}));
        });
      };
      tmpImg.src = src;
    };
    reader.readAsDataURL(file);
  };

  const saveBranding = () => {
    const effectiveFont = draft.fontFamily === "custom" ? (draft.customFont||"system") : draft.fontFamily;
    // ⚠️ `...gymBranding` FIRST, then the draft. This used to save the draft
    // alone, which REPLACED the whole branding blob with the six keys this tab
    // edits — so any per-gym fact stored alongside them was silently erased by an
    // owner opening this tab and pressing Save. Nothing was lost while the blob
    // held only these six; `membershipPrice` (set in Brand Studio) is the first
    // key that would have been, and the failure would have looked like the price
    // "not saving" with no error anywhere.
    //
    // The draft still wins on the fields it owns, so Save means what it says.
    onBrandingChange({...gymBranding, ...draft, fontFamily: effectiveFont});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const resetBranding = () => {
    const empty = { logo:null, gymName:"", accentColor:null, secondColor:null, fontFamily:"system", customFont:"" };
    setDraft(empty);
    onBrandingChange({});
  };

  const TabBtn = ({id, label}) => (
    <button onClick={()=>setTab(id)} style={{flex:1, padding:"9px", background:tab===id?"color-mix(in srgb, var(--accent) 13%, transparent)":"transparent",
      color:tab===id?"var(--accent)":"var(--muted)", border:`1px solid ${tab===id?"color-mix(in srgb, var(--accent) 31%, transparent)":"var(--border)"}`,
      borderRadius:"8px", cursor:"pointer", fontSize:"12px", fontWeight:"700"}}>
      {label}
    </button>
  );

  return (
    <div style={{position:"fixed",inset:"0",background:"rgba(0,0,0,0.65)",display:"flex",alignItems:isMobilePM?"flex-end":"center",justifyContent:"center",zIndex:1000,padding:isMobilePM?"0":"16px"}} onClick={onClose}>
      <div {...dlg} onClick={e=>e.stopPropagation()} style={{background:"var(--card)",borderRadius:isMobilePM?"14px 14px 0 0":"14px",width:"100%",maxWidth:"420px",maxHeight:isMobilePM?"96vh":"92vh",display:"flex",flexDirection:"column",overflow:"hidden",border:`1px solid var(--border)`,outline:"none"}}>

        {/* Header */}
        <div style={{padding:"18px 20px 12px",borderBottom:`1px solid var(--border)`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:"14px",marginBottom:"14px"}}>
            {profile.images?.[0]?.url
              ? <img src={profile.images[0].url} style={{width:"52px",height:"52px",borderRadius:"50%",border:`2px solid var(--green)`}} alt="avatar"/>
              : <div style={{width:"52px",height:"52px",borderRadius:"50%",background:"var(--navy)",display:"flex",alignItems:"center",justifyContent:"center"}}><User size={24} color={"var(--muted)"}/></div>
            }
            <div style={{flex:1,minWidth:0}}>
              <p style={{fontSize:"16px",fontWeight:"700",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profile.display_name||"Spotify User"}</p>
              <p style={{fontSize:"11px",color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profile.email}</p>
            </div>
          </div>
          {/* Tabs */}
          <div style={{display:"flex",gap:"6px"}}>
            <TabBtn id="profile"  label="👤 Profile"/>
            <TabBtn id="branding" label="🎨 Gym Branding"/>
          </div>
        </div>

        {/* ── PROFILE TAB ── */}
        {tab === "profile" && <>
          {/* Stats */}
          <div style={{padding:"14px 18px",borderBottom:`1px solid var(--border)`,flexShrink:0}}>
            <p style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"10px"}}>Your Stats</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
              {[
                {icon:"🏋️",label:"Total Sessions",value:String(totalSessions),color:"var(--accent)"},
                {icon:"⏱️",label:"Total Hours",   value:totalHours+"h",      color:"var(--green)"},
                // Violet and orange are decoration; `hueInk` keeps them legible
                // whatever polarity the gym's skin has. See colors.js.
                {icon:"📊",label:"Avg Duration",  value:avgDur+" min",        color:hueInk("#8B5CF6")},
                {icon:"🔥",label:"Day Streak",    value:String(streak),       color:hueInk("#F97316")},
              ].map(s=>(
                <div key={s.label} style={{padding:"10px 12px",background:"var(--navy)",borderRadius:"8px",border:`1px solid var(--border)`}}>
                  <p style={{fontSize:"18px",fontWeight:"800",color:s.color,lineHeight:"1"}}>{s.value}</p>
                  <p style={{fontSize:"10px",color:"var(--muted)",marginTop:"2px"}}>{s.icon} {s.label}</p>
                </div>
              ))}
            </div>
            {topType && <p style={{fontSize:"11px",color:"var(--muted)",marginTop:"10px"}}>🏆 Most trained: <span style={{color:hueInk(SCFG[topType]?.color||"var(--green)"),fontWeight:"700"}}>{SCFG[topType]?.label||topType}</span></p>}
          </div>
          {/* Recent sessions */}
          <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
            <p style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"10px"}}>Recent Sessions</p>
            {recent.length === 0
              ? <p style={{fontSize:"12px",color:"var(--muted)",textAlign:"center",padding:"16px 0"}}>No sessions yet. Start one to track your history.</p>
              : recent.map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 0",borderBottom:i<recent.length-1?`1px solid var(--border)`:"none"}}>
                  <div style={{width:"36px",height:"36px",borderRadius:"8px",background:"color-mix(in srgb, var(--accent) 13%, transparent)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:"16px"}}>🏋️</span></div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:"13px",fontWeight:"600",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name||"Workout"}</p>
                    <p style={{fontSize:"11px",color:"var(--muted)"}}>{s.date} · {s.durMin} min · {s.stages} stage{s.stages!==1?"s":""}</p>
                  </div>
                </div>
              ))
            }
          </div>
        </>}

        {/* ── BRANDING TAB ── */}
        {tab === "branding" && (
          <div style={{flex:1,overflowY:"auto",padding:"16px 18px",display:"flex",flexDirection:"column",gap:"16px"}}>

            {/* Gym logo */}
            <div>
              <p style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"8px",fontWeight:"700"}}>Gym Logo</p>
              <div style={{display:"flex",gap:"12px",alignItems:"flex-start"}}>
                {/* Preview */}
                <div style={{width:"80px",height:"80px",borderRadius:"10px",background:"var(--navy)",border:`1px solid var(--border)`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
                  {draft.logo
                    ? <img src={draft.logo} style={{width:"100%",height:"100%",objectFit:"contain"}} alt="logo"/>
                    : <span style={{fontSize:"28px"}}>🏢</span>
                  }
                </div>
                <div style={{flex:1}}>
                  <input ref={fileRef} type="file" accept="image/*" aria-label="Upload your gym logo" style={{display:"none"}} onChange={handleLogoUpload}/>
                  <button onClick={()=>fileRef.current?.click()}
                    style={{width:"100%",padding:"9px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",cursor:"pointer",color:"var(--text)",fontSize:"12px",fontWeight:"700",marginBottom:"6px"}}>
                    {extracting ? "⏳ Reading your logo…" : draft.logo ? "🔄 Change Logo" : "📁 Upload Logo"}
                  </button>
                  {draft.logo && (
                    <button onClick={()=>setDraft(d=>({...d,logo:null}))}
                      style={{width:"100%",padding:"7px",background:"transparent",border:`1px solid var(--border)`,borderRadius:"8px",cursor:"pointer",color:"var(--muted)",fontSize:"11px"}}>
                      Remove
                    </button>
                  )}
                  <p style={{fontSize:"10px",color:"var(--muted)",marginTop:"5px"}}>Logo appears in the header. Dominant colour is auto-extracted.</p>
                </div>
              </div>
            </div>

            {/* Gym name */}
            <div>
              <p style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"6px",fontWeight:"700"}}>Gym Name</p>
              <Input value={draft.gymName} onChange={e=>setDraft(d=>({...d,gymName:e.target.value}))} placeholder="e.g. Iron House Fitness"/>
              <p style={{fontSize:"10px",color:"var(--muted)",marginTop:"4px"}}>Shown in the header alongside your logo.</p>
            </div>

            {/* Accent colour */}
            <div>
              <p style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"8px",fontWeight:"700"}}>Accent Colour</p>
              <div style={{display:"flex",gap:"10px",alignItems:"center"}}>
                <input type="color" aria-label="Accent colour" value={draft.accentColor} onChange={e=>setDraft(d=>({...d,accentColor:e.target.value}))}
                  style={{width:"48px",height:"40px",borderRadius:"8px",border:`1px solid var(--border)`,cursor:"pointer",background:"none",padding:"2px"}}/>
                <div style={{flex:1,padding:"10px 14px",background:draft.accentColor,borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:"13px",fontWeight:"700",color:"white"}}>{draft.accentColor}</span>
                  <span style={{fontSize:"11px",color:"rgba(255,255,255,0.7)"}}>Primary</span>
                </div>
              </div>
              <p style={{fontSize:"10px",color:"var(--muted)",marginTop:"4px"}}>Auto-extracted from logo — override by clicking the swatch.</p>
            </div>

            {/* Secondary colour */}
            <div>
              <p style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"8px",fontWeight:"700"}}>Secondary Colour</p>
              <div style={{display:"flex",gap:"10px",alignItems:"center"}}>
                <input type="color" aria-label="Secondary colour" value={draft.secondColor} onChange={e=>setDraft(d=>({...d,secondColor:e.target.value}))}
                  style={{width:"48px",height:"40px",borderRadius:"8px",border:`1px solid var(--border)`,cursor:"pointer",background:"none",padding:"2px"}}/>
                <div style={{flex:1,padding:"10px 14px",background:draft.secondColor,borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:"13px",fontWeight:"700",color:"white"}}>{draft.secondColor}</span>
                  <span style={{fontSize:"11px",color:"rgba(255,255,255,0.7)"}}>Secondary</span>
                </div>
              </div>
            </div>

            {/* Font */}
            <div>
              <p style={{fontSize:"11px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"6px",fontWeight:"700"}}>Font</p>
              <Select aria-label="Gym font" value={draft.fontFamily} onChange={e=>setDraft(d=>({...d,fontFamily:e.target.value}))}>
                {GYM_FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                <option value="custom">✏️ Custom Google Font…</option>
              </Select>
              {draft.fontFamily !== "system" && draft.fontFamily !== "custom" && (
                <p style={{fontSize:"13px",marginTop:"8px",fontFamily:`'${draft.fontFamily}', sans-serif`,color:"var(--text)",padding:"8px 12px",background:"var(--navy)",borderRadius:"8px",border:`1px solid var(--border)`}}>
                  The quick brown fox — {draft.fontFamily}
                </p>
              )}
              {draft.fontFamily === "custom" && (
                <Input placeholder="e.g. Poppins, Nunito, Space Grotesk" value={draft.customFont}
                  onChange={e=>setDraft(d=>({...d,customFont:e.target.value}))} style={{marginTop:"6px"}}/>
              )}
              <p style={{fontSize:"10px",color:"var(--muted)",marginTop:"4px"}}>Loaded from Google Fonts — applied app-wide.</p>
            </div>


          </div>
        )}

        {/* Footer */}
        <div style={{padding:"12px 18px",borderTop:`1px solid var(--border)`,display:"flex",gap:"8px",flexShrink:0}}>
          {tab === "branding" ? <>
            <button onClick={saveBranding}
              style={{flex:2,padding:"10px",background:saved?"var(--green)":"var(--accent)",color:saved?"var(--on-green)":"var(--on-accent)",border:"none",borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"12px",transition:"background .3s,color .2s",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
              {saved ? <><Check size={13}/> Saved!</> : "💾 Save Branding"}
            </button>
            <button onClick={resetBranding}
              style={{flex:1,padding:"10px",background:"var(--navy)",color:"var(--muted)",border:`1px solid var(--border)`,borderRadius:"8px",cursor:"pointer",fontWeight:"600",fontSize:"12px"}}>
              Reset
            </button>
            <button onClick={onClose} style={{flex:1,padding:"10px",background:"var(--navy)",color:"var(--text)",border:`1px solid var(--border)`,borderRadius:"8px",cursor:"pointer",fontWeight:"600",fontSize:"12px"}}>Close</button>
          </> : <>
            <button onClick={onLogout} style={{flex:1,padding:"10px",background:"color-mix(in srgb, var(--accent) 8%, transparent)",color:"var(--accent)",border:`1px solid color-mix(in srgb, var(--accent) 25%, transparent)`,borderRadius:"8px",cursor:"pointer",fontWeight:"700",fontSize:"12px",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
              <LogOut size={13}/> Sign Out
            </button>
            <button onClick={onClose} style={{flex:1,padding:"10px",background:"var(--navy)",color:"var(--text)",border:`1px solid var(--border)`,borderRadius:"8px",cursor:"pointer",fontWeight:"600",fontSize:"12px"}}>Close</button>
          </>}
        </div>
      </div>
    </div>
  );
}

// ─── PinScreen ────────────────────────────────────────────────────────────────
