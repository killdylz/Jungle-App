// Shared UI primitives — extracted verbatim from App.jsx (workstream A, Fable
// spec 4.5 monolith split). Theme context + responsive hook live here so the
// primitives are self-contained; App.jsx provides ThemeContext at the root.
import React, { useState, useEffect } from "react";

// FR-A2: theme/brand context so any surface can read the active skin + gym branding.
export const ThemeContext = React.createContext({ skin: null, gymBranding: {} });
export function useTheme(){ return React.useContext(ThemeContext); }

// ─── Responsive hook ──────────────────────────────────────────────────────────
export function useWindowWidth() {
  const [w, setW] = useState(typeof window!=="undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return w;
}

// ─── UI Primitives ────────────────────────────────────────────────────────────
export const Btn = ({children, onClick, variant="primary", style:s={}, ...p}) => (
  <button onClick={onClick} style={{
    padding:"10px 18px",
    background:variant==="ghost"?"transparent":variant==="green"?"var(--green)":"var(--accent)",
    color:variant==="ghost"?"var(--accent)":variant==="green"?"var(--on-green)":"var(--on-accent)",
    border:`1px solid ${variant==="ghost"?"var(--accent)":"transparent"}`,
    borderRadius:"6px",cursor:"pointer",fontSize:"13px",fontWeight:"700",
    boxShadow:variant==="ghost"?"none":"var(--glow)",
    display:"inline-flex",alignItems:"center",gap:"6px",
    transition:"background .3s ease, color .2s ease, border-color .3s ease",
    ...s}} {...p}>{children}</button>
);
export const Input = ({style:s={}, ...p}) => (
  <input style={{padding:"9px 12px",background:"var(--navy)",border:"1px solid var(--border)",borderRadius:"6px",color:"var(--text)",fontSize:"13px",outline:"none",width:"100%",boxSizing:"border-box",...s}} {...p}/>
);
export const Select = ({children, style:s={}, ...p}) => (
  <select style={{padding:"9px 12px",background:"var(--navy)",border:"1px solid var(--border)",borderRadius:"6px",color:"var(--text)",fontSize:"13px",outline:"none",width:"100%",...s}} {...p}>{children}</select>
);
export const Tag = ({children, color, style:s={}}) => (
  <span style={{display:"inline-block",padding:"3px 9px",background:color||"var(--navy)",color:"white",borderRadius:"4px",fontSize:"11px",fontWeight:"700",...s}}>{children}</span>
);
export const SpBadge = ({children}) => (
  <span style={{display:"inline-flex",alignItems:"center",gap:"5px",padding:"5px 10px",background:"var(--green-20)",color:"var(--green)",borderRadius:"6px",fontSize:"12px",fontWeight:"700",border:"1px solid var(--green-40)",transition:"background .3s,color .2s,border-color .3s"}}>{children}</span>
);

// ─── Logo ─────────────────────────────────────────────────────────────────────
// Option A (default): Leaf + Barbell in a circle
export const JungleLogo = ({size=32}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="46" fill="var(--accent-10)" stroke="var(--accent)" strokeWidth="2"/>
    {/* Jungle leaf */}
    <path d="M26 57 Q37 22 56 29 Q41 45 26 57Z" fill="var(--green)" opacity="0.95"/>
    <path d="M56 29 Q71 17 74 35 Q62 40 56 29Z" fill={"var(--green)"} opacity="0.7"/>
    <line x1="26" y1="57" x2="56" y2="29" stroke={"var(--green)"} strokeWidth="1.5" opacity="0.4"/>
    {/* Barbell */}
    <rect x="22" y="68" width="56" height="6" rx="3" fill={"var(--accent)"}/>
    <rect x="13" y="62" width="12" height="18" rx="2.5" fill={"var(--accent)"}/>
    <rect x="75" y="62" width="12" height="18" rx="2.5" fill={"var(--accent)"}/>
  </svg>
);

// FR-H2: one logo asset, many placements. Uploaded image -> styled wordmark -> monogram tile.
export function BrandLogo({ size=26, showName=false, gymBranding }) {
  const _ctx = useTheme();
  const _gb = (gymBranding && (gymBranding.logo || gymBranding.gymName)) ? gymBranding : (_ctx.gymBranding || {});
  const logo = _gb && _gb.logo;
  const name = (_gb && _gb.gymName) || "";
  const disp = "var(--display)";
  const wrap = { display:"inline-flex", alignItems:"center", gap:`${Math.round(size*0.32)}px`, minWidth:0 };
  if (logo) {
    return (
      <span style={wrap}>
        <img src={logo} alt={name||"gym logo"} style={{height:`${size}px`,maxWidth:`${size*4.2}px`,objectFit:"contain",display:"block"}}/>
        {showName && name && <span style={{fontSize:`${Math.round(size*0.5)}px`,fontWeight:"800",letterSpacing:"1px",color:"var(--text)",whiteSpace:"nowrap"}}>{name}</span>}
      </span>
    );
  }
  if (name) {
    return (
      <span style={wrap}>
        <span style={{width:`${size}px`,height:`${size}px`,borderRadius:`${Math.round(size*0.28)}px`,background:"var(--accent)",color:"var(--bg)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontFamily:disp,fontWeight:"800",fontSize:`${Math.round(size*0.58)}px`,flexShrink:0,lineHeight:1}}>{name.trim().charAt(0).toUpperCase()}</span>
        {showName && <span style={{fontFamily:disp,fontSize:`${Math.round(size*0.62)}px`,fontWeight:"800",letterSpacing:"1.5px",color:"var(--text)",whiteSpace:"nowrap",textTransform:"uppercase"}}>{name}</span>}
      </span>
    );
  }
  return (
    <span style={wrap}>
      <JungleLogo size={size}/>
      {showName && <span style={{fontSize:`${Math.round(size*0.6)}px`,fontWeight:"800",letterSpacing:"2px",color:"var(--text)"}}>JUNGLE</span>}
    </span>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({icon, label, value, color}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  return (
    <div style={{padding:isMobile?"12px 10px":"18px",background:"var(--card)",borderRadius:"10px",border:"1px solid var(--border)"}}>
      <div style={{fontSize:isMobile?"18px":"22px",marginBottom:isMobile?"5px":"8px"}}>{icon}</div>
      <p style={{fontSize:isMobile?"20px":"26px",fontWeight:"800",color:color||"var(--text)",marginBottom:"3px",lineHeight:"1"}}>{value}</p>
      <p style={{fontSize:"10px",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px"}}>{label}</p>
    </div>
  );
}
