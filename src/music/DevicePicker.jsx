// ─── SpotifyDevicePicker ─────────────────────────────────────────────────────
// Moved verbatim from App.jsx in decomposition stage 3.
import React from "react";

// ─── SpotifyDevicePicker ──────────────────────────────────────────────────────
// Shows a pill/dropdown to choose between browser player and external devices.
function SpotifyDevicePicker({ devices, activeDeviceId, setActiveDeviceId, browserDeviceId, refreshDevices, compact=false }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const handleOpen = async () => {
    setOpen(o => !o);
    if (!open) {
      setLoading(true);
      await refreshDevices().catch(()=>{});
      setLoading(false);
    }
  };

  const activeDevice = devices.find(d => d.id === activeDeviceId);
  const isBrowser = activeDeviceId === browserDeviceId;
  const label = activeDevice ? activeDevice.name : isBrowser ? "Browser" : "No device";

  const deviceIcon = (type) => {
    if (!type) return "🔊";
    const t = type.toLowerCase();
    if (t.includes("computer")) return "💻";
    if (t.includes("phone") || t.includes("smartphone")) return "📱";
    if (t.includes("speaker")) return "🔊";
    if (t.includes("tv") || t.includes("cast")) return "📺";
    return "🎵";
  };

  return (
    <div style={{position:"relative"}}>
      <button onClick={handleOpen}
        title="Choose playback device"
        style={{display:"flex",alignItems:"center",gap:"5px",padding:compact?"5px 9px":"6px 12px",
          background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"999px",
          fontSize:"11px",fontWeight:"600",color:"var(--text)",cursor:"pointer",whiteSpace:"nowrap"}}>
        <span style={{fontSize:"12px"}}>{deviceIcon(activeDevice?.type)}</span>
        {!compact && <span style={{maxWidth:"90px",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>}
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke={"var(--muted)"} strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"12px",padding:"8px",minWidth:"200px",zIndex:999,boxShadow:"0 8px 32px rgba(0,0,0,.6)"}}>
          <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",padding:"4px 8px 8px"}}>Playback device</div>
          {loading && <div style={{fontSize:"12px",color:"var(--muted)",padding:"8px",textAlign:"center"}}>Loading devices…</div>}
          {!loading && devices.length === 0 && (
            <div style={{fontSize:"11px",color:"var(--muted)",padding:"8px",lineHeight:"1.5",textAlign:"center"}}>
              No devices found.<br/>Open Spotify on another device.
            </div>
          )}
          {!loading && devices.map(dev => (
            <div key={dev.id} onClick={()=>{ setActiveDeviceId(dev.id); setOpen(false); }}
              style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 10px",borderRadius:"8px",cursor:"pointer",
                background:activeDeviceId===dev.id?"var(--accent-10)":"transparent",
                border:`1px solid ${activeDeviceId===dev.id?"var(--accent-30)":"transparent"}`,marginBottom:"2px"}}>
              <span style={{fontSize:"14px"}}>{deviceIcon(dev.type)}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"12px",fontWeight:"600",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dev.name}</div>
                <div style={{fontSize:"10px",color:"var(--muted)"}}>{dev.is_active?"▶ Currently active":"Available"}{dev.id===browserDeviceId?" · Browser player":""}</div>
              </div>
              {activeDeviceId===dev.id && <div style={{width:"6px",height:"6px",borderRadius:"50%",background:"var(--accent)",flexShrink:0}}/>}
            </div>
          ))}
          <div style={{borderTop:`1px solid var(--border)`,marginTop:"6px",paddingTop:"6px"}}>
            <button onClick={async()=>{setLoading(true); await refreshDevices().catch(()=>{}); setLoading(false);}}
              style={{width:"100%",padding:"7px",background:"transparent",border:"none",color:"var(--muted)",fontSize:"11px",cursor:"pointer",fontWeight:"600"}}>
              ↻ Refresh devices
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


export { SpotifyDevicePicker };
