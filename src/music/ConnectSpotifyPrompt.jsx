// ─── ConnectSpotifyPrompt ────────────────────────────────────────────────────
// Moved verbatim from App.jsx in decomposition stage 3.

// Shown when a music surface is opened without a connected Spotify account.
// Spotify is optional and post-login (any user for now) — never an entry gate.
function ConnectSpotifyPrompt({ onConnect, onBack }) {
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px",textAlign:"center",gap:"14px"}}>
      <div style={{fontSize:"34px"}}>🎵</div>
      <div style={{fontFamily:"var(--display)",fontSize:"20px",fontWeight:"800",color:"var(--text)"}}>Connect Spotify</div>
      <div style={{fontSize:"13px",color:"var(--muted)",maxWidth:"420px",lineHeight:1.5}}>Music is optional. Connect a Spotify account to power playlists and Auto-DJ. You can use the rest of Jungle without it.</div>
      <div style={{display:"flex",gap:"10px",marginTop:"4px"}}>
        {onConnect&&<button onClick={onConnect} style={{padding:"10px 20px",background:"#1DB954",color:"#fff"  /* Spotify's own green and its own white wordmark ink — see PlaylistImportModal */,border:"none",borderRadius:"9px",cursor:"pointer",fontWeight:"800",fontSize:"13px"}}>Connect Spotify</button>}
        {onBack&&<button onClick={onBack} style={{padding:"10px 20px",background:"transparent",color:"var(--text)",border:"1px solid var(--border)",borderRadius:"9px",cursor:"pointer",fontWeight:"700",fontSize:"13px"}}>Back</button>}
      </div>
    </div>
  );
}

export { ConnectSpotifyPrompt };
