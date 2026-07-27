// ─── AnalyticsScreen (I6 decomposition; NOT lazy — see below) ────────────────
//
// Moved out of App.jsx as a plain module: 252 lines of a 4,993-line file, with
// ZERO App.jsx-local dependencies (only React and useWindowWidth), which made it
// the cheapest slice available.
//
// ⚠️ It is deliberately a STATIC import, and the I9 backlog entry that sent us
// here was wrong about why. That entry said this screen "ships to every device
// and never renders" because FLAGS.mockAnalytics is false. Measured against the
// real bundle, it does not ship at all: FLAGS is a module-level const of literal
// values, so rollup folds `FLAGS.mockAnalytics` to false and drops the whole
// branch. None of this screen's strings appear in the main chunk either before
// or after this move.
//
// React.lazy was tried first and made things WORSE: it defeats the constant
// folding, so a 13.48 KB chunk gets emitted, added to the service-worker
// precache (48 files/1366 KB → 49/1379 KB) and downloaded by every install for
// a screen nobody renders — plus 78 bytes of loader in the main chunk. The
// static import keeps the elimination: the rebuilt bundle is byte-identical to
// the pre-move one, same hash.
//
// If FLAGS.mockAnalytics is ever flipped on, revisit — with the branch live this
// screen WOULD land in the main chunk, and lazy would then be the right call.
//
// The numbers below are HARDCODED SAMPLE DATA and always have been. That is why
// the flag is off: PRODUCT-DIRECTION would rather show a gym an honest "not yet"
// than a dashboard of invented attendance. The screen is kept, not deleted,
// because the audit wants the layout retained for the Phase-2 build on real
// attendance.

import React from "react";
import { useWindowWidth } from "../ui/primitives.jsx";

export default function AnalyticsScreen({onBack}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 768;
  const [timeFilter, setTimeFilter] = React.useState("12w");
  const [rpeTab, setRpeTab] = React.useState("distribution");

  const attendanceData = [
    {label:"W1",val:74},{label:"W2",val:81},{label:"W3",val:88},{label:"W4",val:72},
    {label:"W5",val:90},{label:"W6",val:86},{label:"W7",val:93},{label:"W8",val:78},
    {label:"W9",val:95},{label:"W10",val:82},{label:"W11",val:88},{label:"W12",val:91},
  ];
  const maxAttn = Math.max(...attendanceData.map(d=>d.val), 1);

  const classTypes = [
    {label:"HIIT",       pct:94, color:"#F59E0B"},
    {label:"Hyrox sim",  pct:88, color:"#22D3A6"},
    {label:"Strength Lab",pct:71, color:"#8B5CF6"},
    {label:"Spin",       pct:63, color:"#3B82F6"},
    {label:"Yoga / recovery",pct:48,color:"#10B981"},
  ];

  const kpis = [
    {label:"Active members",  value:"1,284", delta:"▲ 6.2% vs prev", up:true},
    {label:"Avg visits / wk", value:"3.4",   delta:"▲ 0.3",           up:true},
    {label:"Churn risk",      value:"47",    delta:"members flagged",  up:false, warn:true},
    {label:"Revenue / class", value:"£412",  delta:"▲ 9%",            up:true},
  ];

  const trainers = [
    {name:"Mara K.",  fill:"96%", nps:78, score:9.2},
    {name:"Dev R.",   fill:"91%", nps:74, score:8.8},
    {name:"Priya S.", fill:"79%", nps:69, score:8.1},
  ];

  const musicImpact = [
    {rank:1, track:"Pump It — Reso",        stat:"+18% return when played"},
    {rank:2, track:"Belters — C. Bland",    stat:"+14% return"},
    {rank:3, track:"Lose Control — T.Swims",stat:"+11% return"},
  ];

  const bpmByClass = [
    {label:"HIIT",     bpm:130, color:"#F59E0B"},
    {label:"Hyrox",    bpm:140, color:"#22D3A6"},
    {label:"Strength", bpm:95,  color:"#8B5CF6"},
    {label:"Spin",     bpm:126, color:"#3B82F6"},
    {label:"Yoga",     bpm:72,  color:"#10B981"},
  ];

  const rpeData = [5,6,7,8,9,10].map(v=>({v,count:v===7?38:v===8?29:v===6?16:v===9?11:v===5?4:2}));
  const maxRpe = Math.max(...rpeData.map(d=>d.count));

  return (
    <div style={{flex:1,overflowY:"auto",padding:isMobile?"16px":"28px",boxSizing:"border-box"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"22px",flexWrap:"wrap",gap:"12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
          <button onClick={onBack} aria-label="Back" style={{background:"none",border:"none",cursor:"pointer",color:"var(--text)",display:"flex",alignItems:"center"}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div>
            <h2 style={{fontFamily:"var(--display)",fontSize:isMobile?"18px":"20px",fontWeight:"700",color:"var(--text)",margin:0}}>Studio analytics</h2>
            <div style={{fontSize:"12px",color:"var(--muted)",marginTop:"2px"}}>Barry's · Shoreditch</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
          <div style={{display:"flex",border:`1px solid var(--border)`,borderRadius:"9px",overflow:"hidden",fontSize:"12px"}}>
            {[["4w","4 weeks"],["12w","12 weeks"],["year","Year"]].map(([k,lbl])=>(
              <div key={k} onClick={()=>setTimeFilter(k)}
                style={{padding:"8px 14px",background:timeFilter===k?"var(--navy)":"transparent",color:timeFilter===k?"var(--text)":"var(--muted)",fontWeight:timeFilter===k?"600":"400",cursor:"pointer"}}>
                {lbl}
              </div>
            ))}
          </div>
          <button style={{border:`1px solid var(--border)`,background:"transparent",color:"var(--text)",fontWeight:"600",fontSize:"13px",padding:"8px 15px",borderRadius:"9px",cursor:"pointer",display:"flex",alignItems:"center",gap:"7px"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>
            Export
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":`repeat(${isTablet?2:4},1fr)`,gap:"12px",marginBottom:"18px"}}>
        {kpis.map((k,i)=>(
          <div key={i} style={{background:"var(--card)",border:`1px solid ${k.warn?"#F59E0B40":"var(--border)"}`,borderRadius:"14px",padding:"18px"}}>
            <div style={{fontSize:"10px",letterSpacing:"1px",color:"var(--muted)",fontWeight:"700",textTransform:"uppercase"}}>{k.label}</div>
            <div style={{fontFamily:"var(--display)",fontSize:"28px",fontWeight:"700",marginTop:"6px",color:k.warn?"#F59E0B":"var(--text)"}}>{k.value}</div>
            <div style={{fontSize:"12px",marginTop:"3px",color:k.warn?"#F59E0B":k.up?"var(--accent)":"#EF4444"}}>{k.delta}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"1.4fr 1fr",gap:"14px",marginBottom:"14px"}}>
        {/* Attendance chart */}
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
            <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)"}}>Attendance & fill rate</div>
            <div style={{fontSize:"11px",color:"var(--muted)",display:"flex",alignItems:"center",gap:"5px"}}>
              <span style={{width:"8px",height:"8px",borderRadius:"2px",background:"var(--accent)",display:"inline-block"}}/>Attendance
              <span style={{marginLeft:"8px",width:"8px",height:"8px",borderRadius:"2px",background:"#E0B85B",display:"inline-block"}}/>Fill %
            </div>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:isMobile?"3px":"6px",height:"100px",marginBottom:"8px"}}>
            {attendanceData.map((d,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}>
                <div style={{
                  width:"100%",
                  background:`linear-gradient(to top, color-mix(in srgb, var(--accent) 80%, transparent), color-mix(in srgb, var(--green) 40%, transparent))`,
                  borderRadius:"3px 3px 0 0",
                  height:`${(d.val/maxAttn)*90}px`,
                  transition:"height 0.4s",
                }}/>
                <p style={{fontSize:"9px",color:"var(--muted)"}}>{d.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Class type distribution */}
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)",marginBottom:"16px"}}>Most-booked class types</div>
          <div style={{display:"flex",flexDirection:"column",gap:"11px"}}>
            {classTypes.map((item,i)=>(
              <div key={i}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                  <span style={{fontSize:"12px",color:"var(--text)",fontWeight:"600"}}>{item.label}</span>
                  <span style={{fontSize:"12px",color:item.color,fontWeight:"700"}}>{item.pct}%</span>
                </div>
                <div style={{height:"6px",background:"var(--navy)",borderRadius:"3px",overflow:"hidden"}}>
                  <div style={{width:`${item.pct}%`,height:"100%",background:item.color,borderRadius:"3px"}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RPE + Trainers row */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"1fr 1fr",gap:"14px",marginBottom:"14px"}}>
        {/* RPE Distribution */}
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
            <div>
              <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)"}}>RPE distribution</div>
              <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>avg <span style={{color:"var(--accent)",fontWeight:"700"}}>7.4</span> · reported exertion · last 12 wks</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:"10px",height:"90px",marginBottom:"8px"}}>
            {rpeData.map((d,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"4px"}}>
                <div style={{
                  width:"100%",
                  background:d.v>=8?"color-mix(in srgb, var(--accent) 80%, transparent)":d.v<=5?"#EF4444aa":"#E0B85Baa",
                  borderRadius:"3px 3px 0 0",
                  height:`${(d.count/maxRpe)*80}px`,
                  transition:"height 0.4s",
                }}/>
                <p style={{fontSize:"10px",color:"var(--muted)"}}>{d.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trainer performance */}
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)",marginBottom:"14px"}}>Trainer performance</div>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {trainers.map((t,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 14px",background:"var(--navy)",borderRadius:"10px",border:`1px solid var(--border)`}}>
                <div style={{width:"34px",height:"34px",borderRadius:"50%",background:"color-mix(in srgb, var(--accent) 13%, transparent)",border:`1px solid color-mix(in srgb, var(--accent) 25%, transparent)`,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--accent)",fontSize:"12px",fontWeight:"700",flexShrink:0}}>
                  {t.name.split(" ")[0][0]}{t.name.split(" ")[1]?.[0]||""}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:"13px",fontWeight:"600",color:"var(--text)"}}>{t.name}</div>
                  <div style={{fontSize:"11px",color:"var(--muted)"}}>{t.fill} fill · NPS {t.nps}</div>
                </div>
                <div style={{fontFamily:"var(--display)",fontSize:"18px",fontWeight:"700",color:"var(--accent)"}}>{t.score}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Music impact + BPM by class */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"1.2fr 1fr",gap:"14px",marginBottom:"14px"}}>
        {/* Music that fills rooms */}
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)",marginBottom:"14px"}}>Music that fills rooms</div>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {musicImpact.map((m,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 0",borderBottom:i<musicImpact.length-1?`1px solid var(--border)`:"none"}}>
                <div style={{width:"24px",height:"24px",borderRadius:"50%",background:"color-mix(in srgb, var(--accent) 13%, transparent)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--accent)",fontSize:"11px",fontWeight:"800",flexShrink:0}}>{m.rank}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"13px",fontWeight:"600",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.track}</div>
                </div>
                <div style={{fontSize:"12px",color:"var(--accent)",fontWeight:"700",whiteSpace:"nowrap"}}>{m.stat}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Best BPM by class */}
        <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"14px",padding:"18px"}}>
          <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)",marginBottom:"14px"}}>Best BPM by class</div>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {bpmByClass.map((b,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",background:"var(--navy)",borderRadius:"8px",border:`1px solid var(--border)`}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                  <div style={{width:"8px",height:"8px",borderRadius:"50%",background:b.color}}/>
                  <span style={{fontSize:"13px",fontWeight:"600",color:"var(--text)"}}>{b.label}</span>
                </div>
                <span style={{fontFamily:"var(--display)",fontSize:"16px",fontWeight:"700",color:b.color}}>{b.bpm} <span style={{fontSize:"11px",color:"var(--muted)",fontWeight:"400"}}>BPM</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Churn risk members */}
      <div style={{background:"var(--card)",border:`1px solid #F59E0B40`,borderRadius:"14px",padding:"18px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
          <div>
            <div style={{fontFamily:"var(--display)",fontSize:"14px",fontWeight:"700",color:"var(--text)"}}>Churn risk</div>
            <div style={{fontSize:"11px",color:"#F59E0B",marginTop:"2px"}}>47 members flagged · no visit in 10+ days</div>
          </div>
          <button style={{padding:"7px 14px",background:"#F59E0B20",border:"1px solid #F59E0B50",borderRadius:"7px",cursor:"pointer",color:"#F59E0B",fontSize:"12px",fontWeight:"700"}}>Message all</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
          {[
            {name:"Sarah M.",  lastSeen:"12d ago", missed:3, type:"HIIT"},
            {name:"James T.",  lastSeen:"18d ago", missed:4, type:"Hyrox"},
            {name:"Priya K.",  lastSeen:"9d ago",  missed:2, type:"Yoga"},
            {name:"Marcus L.", lastSeen:"14d ago", missed:5, type:"Strength"},
          ].map((m,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 12px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px"}}>
              <div style={{width:"32px",height:"32px",borderRadius:"50%",background:"#F59E0B20",border:"1px solid #F59E0B40",display:"flex",alignItems:"center",justifyContent:"center",color:"#F59E0B",fontSize:"11px",fontWeight:"700",flexShrink:0}}>
                {m.name.split(" ").map(n=>n[0]).join("")}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:"13px",fontWeight:"600",color:"var(--text)"}}>{m.name}</div>
                <div style={{fontSize:"11px",color:"var(--muted)"}}>Last seen {m.lastSeen} · {m.missed} missed · {m.type}</div>
              </div>
              <button style={{padding:"5px 12px",background:"transparent",border:`1px solid var(--border)`,borderRadius:"6px",cursor:"pointer",color:"var(--text)",fontSize:"11px",fontWeight:"600",whiteSpace:"nowrap"}}>Contact</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
