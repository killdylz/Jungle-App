// ─── Brand Studio ────────────────────────────────────────────────────────────
//
// Lifted out of App.jsx whole, unchanged apart from its imports. The reason is
// bytes, not tidiness: `StaffApp.js` had 10.5 kB of headroom against a 360 kB
// ceiling, and that ceiling is what the next feature has to fit inside.
//
// This screen is the right one to move first and the argument is not its size.
// It is OWNER-ONLY and opened rarely — a coach running classes never sees it —
// and it is the ONLY caller of `colors.js`'s generator machinery
// (`extractPalette`, `generateSkinFromPalette`, `generateThemes`,
// `nudgeContrast`), so the chunk takes that with it. Everything a class needs at
// 6am stays in the eager bundle.
//
// ⚠️ `applySkinCSS` and `resolveSkinTokens` are NOT owner-only and stay eager —
// App calls them on every skin change. Importing them here shares them; it does
// not move them.
//
// `ProgramChip` came along because this is its only caller.
import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { supabase, supabaseEnabled } from "../supabase.js";
import { TEMPLATES } from "../data/templates.js";
import { PRESET_SKINS, baseSkin, resolveSkinTokens } from "../lib/skins.js";
import { PRICE_FIELD, CURRENCY_FIELD, CURRENCIES, DEFAULT_CURRENCY } from "../lib/revenueAtRisk.js";
import { hexA, wcagContrast, nudgeContrast, extractPalette, DEFAULT_PROGRAMS,
         generateSkinFromPalette, generateThemes, applySkinCSS, inkOn, hueInk } from "../lib/colors.js";
import { useWindowWidth } from "../ui/primitives.jsx";

function ProgramChip({ name, tint }) {
  // The fallback is Canopy's mint, and it is DATA rather than a missed token: a
  // program with no tint of its own gets the default skin's first program
  // colour, the same value `DEFAULT_PROGRAMS` carries.
  const hex = tint || "#7BE3A4";   // DEFAULT_PROGRAMS' first tint, i.e. data

  // ⚠️ The tint paints the PLATE and tints the INK, but is not the ink itself.
  // Measured on a light skin, the Brand Studio's three program chips read
  // 1.64–2.40:1 with the tint used raw — on the screen the product is demoed
  // from. `hueInk` anchors the ink to `--text` so the chip stays recognisably
  // violet/teal/mint at any polarity. See colors.js.
  return <span style={{display:"inline-flex",alignItems:"center",padding:"3px 10px",borderRadius:"999px",fontSize:"11px",fontWeight:"700",color:hueInk(hex),background:hexA(hex,0.14),border:`1px solid ${hexA(hex,0.4)}`,whiteSpace:"nowrap"}}>{name}</span>;
}

// ─── BrandStudioScreen ────────────────────────────────────────────────────────
// Smart brand recommendation: gym archetype -> curated accent + vibe + suggested preset.
const GYM_ARCHETYPES = [
  // ⚠️ THESE HEXES ARE DATA, and it is the one table where that is unambiguous:
  // each is a SUGGESTED accent — the seed a gym's own palette is generated from
  // when it has no logo to read. Tokenising them would mean recommending the
  // gym the colour it already has, which is not a recommendation.
  { label:"HIIT / Bootcamp",     kw:["hiit","bootcamp","conditioning","sweat","burn"], accent:"#FF5A3C", vibe:"energetic", preset:"pulse",   note:"High-intensity - a hot, punchy accent that reads across a dark room." },
  { label:"HYROX / Functional",  kw:["hyrox","functional","engine","race","competitive","erg"], accent:"#D6FF3D", vibe:"energetic", preset:"pulse",   note:"Race energy - electric lime with tabular numerals and accent glow." },
  { label:"Strength / CrossFit", kw:["strength","crossfit","power","barbell","lift","heavy"], accent:"#F5A623", vibe:"bold", preset:"pulse",   note:"Heavy and industrial - a bold amber-steel accent." },
  { label:"Boutique / Wellness", kw:["boutique","wellness","holistic","yoga","flow","calm","natural","mindful"], accent:"#7BE3A4", vibe:"natural", preset:"canopy",  note:"Calm and natural - soft sage green over gentle surfaces." },
  { label:"Luxury / Reformer",   kw:["luxury","reformer","pilates","premium","editorial","refined"], accent:"#C8A86A", vibe:"luxury", preset:"atelier", note:"Quiet luxury - warm gold on near-black with a serif display face." },
  { label:"Spin / Rhythm",       kw:["spin","rhythm","cycle","ride","dance","beat"], accent:"#A855F7", vibe:"energetic", preset:"pulse",   note:"Nightclub energy - a vivid violet with an accent glow." },
  { label:"Boxing / Combat",     kw:["boxing","combat","mma","fight","muay","kick"], accent:"#EF4444", vibe:"bold", preset:"pulse",   note:"Combat grit - a bold red on a dark canvas." },
  { label:"Recovery / Mobility", kw:["recovery","mobility","stretch","restore","sauna","reset"], accent:"#5BD0C0", vibe:"calm", preset:"canopy",  note:"Restorative - a cool teal, low-contrast and easy on the eyes." },
];
function recommendArchetype(text){
  const t=(text||"").toLowerCase();
  if(t){ const hit=GYM_ARCHETYPES.find(a=>a.kw.some(k=>t.includes(k))); if(hit) return hit; }
  return null;
}
export function BrandStudioScreen({onBack, gymBranding={}, onBrandingChange, activeSkinId="canopy", onSkinChange, customSkinTokens=null, onCustomSkinChange}) {
  const vw = useWindowWidth();
  const isMobile = vw < 480;
  const isTablet = vw < 768;

  // ── Preset templates ──────────────────────────────────────────────────────────
  const presets = [
    // The three shipped skins, shown as swatches OF themselves. `PRESET_SKINS`
    // in skins.js is the source; these are the preview chips beside each name,
    // and a preview painted in the CURRENT skin would show three identical rows.
    { id:"canopy",  label:"Canopy",  desc:"Natural · Wellness",   accent:"#7BE3A4", bg:"#0A0F0C", preview:["#7BE3A4","#CFF5DE","#0F1611"], fonts:"Space Grotesk · Hanken" },
    { id:"pulse",   label:"Pulse",   desc:"Electric · HIIT",      accent:"#D6FF3D", bg:"#08090A", preview:["#D6FF3D","#ECFFA3","#101113"], fonts:"Anton · Archivo" },
    { id:"atelier", label:"Atelier", desc:"Luxury · Editorial",   accent:"#C8A86A", bg:"#0C0C0E", preview:["#C8A86A","#E8D6AE","#131316"], fonts:"Instrument Serif · Manrope" },
  ];

  // ── Brand generator state ─────────────────────────────────────────────────────
  const [files, setFiles]         = React.useState([]);
  const [logoSrc, setLogoSrc]     = React.useState(gymBranding.logo || null);
  const [palette, setPalette]     = React.useState(null);        // string[] from extractPalette
  const [analyzing, setAnalyzing] = React.useState(false);
  const [analyzeStep, setAnalyzeStep] = React.useState(0);
  const [generatedSkin, setGeneratedSkin] = React.useState(null); // full skin object
  const [generatedThemes, setGeneratedThemes] = React.useState([]);   // FR-H1: 3 options
  const [luma, setLuma] = React.useState(0.2);                        // FR-H6: collateral luminance
  const [vibe, setVibe]           = React.useState("natural");
  const fileRef                   = React.useRef(null);

  // ── Fine-tune state (draft tokens for the active skin) ───────────────────────
  // This screen's answer to "what is in force" was the CORRECT one; the App root
  // had the other. Both now come from skins.js, so the panel a coach checks
  // their branding on and the app they check it against cannot disagree again.
  const _baseSkin = baseSkin(activeSkinId);
  const currentTokens = resolveSkinTokens(activeSkinId, customSkinTokens);

  const [draftTokens, setDraftTokens] = React.useState(currentTokens);
  const [recPrompt, setRecPrompt] = React.useState("");
  const [recNote, setRecNote] = React.useState(null);
  const [recBusy, setRecBusy] = React.useState(false);
  // 🔴 `customSkinTokens` belongs in here, and its absence became DESTRUCTIVE the
  // moment the app started honouring a generated identity. "Apply to all
  // surfaces" changes the tokens without changing the base skin id, so this
  // effect never fired: the app repainted in the gym's new colours while the
  // eight swatches below still showed the old ones. A coach who then nudged one
  // and pressed "Save custom tokens" would have written the STALE draft back
  // over the identity they had just generated.
  //
  // Re-syncing on a `customSkinTokens` change cannot fight the coach's own
  // editing: `setDraftTokens` inside an onChange does not touch
  // `customSkinTokens`, so the effect stays quiet until something outside this
  // panel replaces the palette — which is exactly when the draft is stale.
  React.useEffect(() => { setDraftTokens(currentTokens); }, [activeSkinId, customSkinTokens]);

  const analyzeSteps = [
    "Reading the colours in your logo…",
    "Deriving background & surface tones…",
    "Checking accessibility contrast…",
    "Composing your custom identity…",
  ];

  const vibes = [
    { id:"natural",   label:"Natural" },
    { id:"energetic", label:"Energetic" },
    { id:"luxury",    label:"Luxury" },
    { id:"bold",      label:"Bold" },
    { id:"calm",      label:"Calm" },
  ];

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFiles([file.name]);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target.result;
      setLogoSrc(src);
      setPalette(null);
      setGeneratedSkin(null);
    };
    reader.readAsDataURL(file);
  };

  const runAnalysis = () => {
    if (!logoSrc) return;
    setAnalyzing(true);
    setAnalyzeStep(0);
    setGeneratedSkin(null);
    setGeneratedThemes([]);

    // 🔴 THE EXTRACTED PALETTE IS CARRIED DOWN THE CHAIN, NOT READ FROM STATE.
    //
    // This walked through four `setTimeout` steps and generated the identity at
    // the last one from `palette` — a state variable set by the extraction at
    // step 1. `advance` is a closure created when `runAnalysis` runs, so it
    // captured `palette` as it was THEN, which `handleFile` had just set to
    // `null`. `setPalette` re-rendered and built a new closure; the timer chain
    // already in flight kept the old one. So the final step read `null`, took
    // the `|| ["#7BE3A4"]` fallback, and generated from CANOPY'S MINT — every
    // time, for every logo.
    //
    // Measured, not reasoned: three logos (#B5122C crimson, #1D4ED8 blue,
    // #D4A017 gold) produced BYTE-IDENTICAL skins, all green. "Upload your
    // brand — Jungle designs the identity" designed one identity for everybody,
    // on the screen `PRODUCT-DIRECTION` §3 says the company is sold from, and
    // nothing could see it: the swatch row rendered the real logo colours
    // correctly one panel above, so the screen looked like it was working.
    //
    // Passed as an ARGUMENT rather than held in a ref: a ref would fix the
    // symptom while leaving the next step free to read state that has not
    // arrived. The chain now carries everything it needs.
    const advance = (i, pal, lm) => {
      if (i === 1) {
        // Real palette extraction at step 1
        extractPalette(logoSrc, (swatches, lumaOut) => {
          const extracted = swatches || ["#7BE3A4"];   // see generateThemes below: a generator SEED
          const lumaVal = lumaOut != null ? lumaOut : 0.2;
          setPalette(extracted);
          setLuma(lumaVal);
          setAnalyzeStep(2);
          setTimeout(() => advance(2, extracted, lumaVal), 900);
        });
      } else if (i >= analyzeSteps.length) {
        setAnalyzing(false);
        // Generate the skin from the palette THIS RUN extracted.
        // Canopy's accent is the seed when a logo yields no usable swatch — an
        // input to the generator, not a painted colour.
        const themes = generateThemes(pal || ["#7BE3A4"], lm != null ? lm : 0.2);
        setGeneratedThemes(themes);
        setGeneratedSkin(themes[0]);
      } else {
        setAnalyzeStep(i);
        setTimeout(() => advance(i + 1, pal, lm), 900);
      }
    };
    setTimeout(() => { setAnalyzeStep(1); advance(1, null, null); }, 700);
  };

  const applyGenerated = () => {
    if (!generatedSkin) return;
    // Switch to "canopy" as base then apply custom token overrides
    onSkinChange("canopy");
    onCustomSkinChange(generatedSkin.tokens);
    if (logoSrc) onBrandingChange({ ...gymBranding, logo: logoSrc });
  };
  const applyRecommendation = (arch) => {
    if(!arch) return;
    const mode = arch.mode === "light" ? "light" : "dark";
    const skin = generateSkinFromPalette([arch.accent], arch.vibe, mode);
    setDraftTokens({ ...skin.tokens });
    setRecNote({ label:arch.label, preset:arch.preset, note:arch.note });
  };
  // LLM-first: ask the smart-build function (task:"brand") for a bespoke scheme,
  // falling back to the offline curated matcher on any error or when Supabase is off.
  const runRecommend = async () => {
    const pr = (recPrompt||"").trim();
    const curated = () => applyRecommendation(recommendArchetype(pr) || GYM_ARCHETYPES[0]);
    if (pr && supabaseEnabled && supabase) {
      setRecBusy(true);
      try {
        const { data, error } = await supabase.functions.invoke("smart-build", { body: { prompt: pr, task: "brand" } });
        if (error) throw error;
        if (data && data.error) throw new Error(data.error);
        if (data && data.accent) {
          applyRecommendation({
            label: data.name || "Custom recommendation",
            accent: data.accent,
            vibe: data.vibe || "natural",
            mode: data.mode,
            preset: data.preset || "canopy",
            note: data.note || "",
          });
          setRecBusy(false);
          return;
        }
      } catch (err) { /* fall back to curated matcher */ }
      setRecBusy(false);
    }
    curated();
  };

  const tokenLabels = [
    { key:"bg",     label:"Background" },
    { key:"card",   label:"Card surface" },
    { key:"navy",   label:"Inset / chip" },
    { key:"accent", label:"Primary accent" },
    { key:"green",  label:"Accent light" },
    { key:"text",   label:"Primary text" },
    { key:"muted",  label:"Secondary text" },
    { key:"border", label:"Border" },
  ];

  // Contrast badges for fine-tune panel
  const contrastBadge = (fg, bg) => {
    try {
      const ratio = wcagContrast(fg, bg);
      const pass = ratio >= 4.5;
      return <span style={{fontSize:"9px",padding:"1px 5px",borderRadius:"4px",background:pass?"rgba(123,227,164,.15)":"rgba(239,68,68,.15)",color:pass?hueInk("var(--green)"):hueInk("var(--danger)"),fontWeight:"700",marginLeft:"4px"}}>{ratio.toFixed(1)}:1</span>;
    } catch(_){ return null; }
  };

  // ── WCAG-AA contrast audit of member-visible token pairs (Fable F6 · P2 10-foot rule).
  //    Checked live against the draft tokens the coach is editing. Button-label colour
  //    (--on-accent) is auto-derived, so we mirror that derivation here rather than
  //    treating it as an editable token.
  //
  //    `inkOn` IS that derivation, imported rather than re-implemented: this audit
  //    used to carry its own copy of the luminance rule, so the runtime and the
  //    badge the coach reads could disagree about what colour the button label
  //    would actually be.
  const onAccentFor = (tk) => {
    try { return inkOn(tk.accent, tk.bg, tk.text); }
    catch(_){ return tk.text; }
  };
  const a11yChecks = [
    { id:"text-bg",   fgKey:"text",   fg:draftTokens.text,          bg:draftTokens.bg,     label:"Body text on background",     min:4.5, big:false },
    { id:"text-card", fgKey:"text",   fg:draftTokens.text,          bg:draftTokens.card,   label:"Text on card surface",        min:4.5, big:false },
    { id:"muted-bg",  fgKey:"muted",  fg:draftTokens.muted,         bg:draftTokens.bg,     label:"Secondary text on background",min:4.5, big:false },
    { id:"onacc-acc", fgKey:null,     fg:onAccentFor(draftTokens),  bg:draftTokens.accent, label:"Button label on accent",      min:4.5, big:false },
    { id:"accent-bg", fgKey:"accent", fg:draftTokens.accent,        bg:draftTokens.bg,     label:"Accent as text / graphics",   min:3.0, big:true  },
  ].map(c => {
    let ratio = 0; try { ratio = wcagContrast(c.fg, c.bg); } catch(_){}
    return { ...c, ratio, pass: ratio >= c.min };
  });
  const a11yTextFails = a11yChecks.filter(c => !c.big && !c.pass).length;
  const fixablePair  = (c) => c.fgKey && c.fgKey !== "accent" && !c.pass;   // never auto-mangle the brand accent
  const fixPair = (c) => { if (fixablePair(c)) setDraftTokens(d => ({ ...d, [c.fgKey]: nudgeContrast(c.fg, c.bg, c.min) })); };
  const fixAllText = () => setDraftTokens(d => {
    const nd = { ...d };
    a11yChecks.forEach(c => { if (c.fgKey && c.fgKey !== "accent" && !c.pass) nd[c.fgKey] = nudgeContrast(nd[c.fgKey], c.bg, c.min); });
    return nd;
  });

  const sectionStyle = {
    background:"var(--card)", border:`1px solid var(--border)`, borderRadius:"16px", padding:"20px",
  };
  const displayFont = (_baseSkin.fonts?.display || "Space Grotesk");

  return (
    <div style={{flex:1,overflowY:"auto",padding:isMobile?"14px":"28px",boxSizing:"border-box"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"24px"}}>
        <button onClick={onBack} aria-label="Back" data-tap style={{background:"none",border:`1px solid var(--border)`,borderRadius:"8px",padding:"7px",cursor:"pointer",color:"var(--text)",display:"flex"}}>
          <ArrowLeft size={16}/>
        </button>
        <div>
          <h2 style={{fontFamily:`'${displayFont}',sans-serif`,fontSize:isMobile?"17px":"22px",fontWeight:"800",color:"var(--text)",margin:0,letterSpacing:"-0.3px"}}>Brand Studio</h2>
          <div style={{fontSize:"12px",color:"var(--muted)",marginTop:"2px"}}>Upload your brand — Jungle designs the identity, then reskins every surface</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr":"1fr 1fr",gap:"18px"}}>

        {/* ── LEFT COL ──────────────────────────────────────────────────────── */}
        <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>

          {/* 1. PRESET TEMPLATES */}
          <div style={sectionStyle}>
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"12px"}}>TEMPLATES</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px"}}>
              {/* ⚠️ A <button>, not the <div onClick> these were. Found while
                  writing the reload sweep, which tried to click them by role and
                  could not: a keyboard-only or screen-reader user could not choose a
                  skin AT ALL. That is the three primary choices on the white-label
                  screen — the whole "make it look like your gym" story — reachable
                  only by mouse.
                  Nothing in the suite would have noticed. keyboard.spec.js asserts
                  every visible CONTROL is reachable by Tab, and a div with an
                  onClick has no role, so it was never a control to reach; every
                  existing test clicks these by their TEXT, which works on a div and
                  hides the defect. Session 15's "five dead controls" in a different
                  costume.
                  `aria-pressed` because these are a set of toggles where exactly one
                  is on, and "ACTIVE" was previously conveyed by colour and a tick —
                  neither of which a screen reader announces. */}
              {presets.map(p => {
                const active = activeSkinId===p.id && !customSkinTokens;
                return (
                  <button key={p.id} type="button" aria-pressed={active}
                    onClick={()=>{ onSkinChange(p.id); onCustomSkinChange(null); }}
                    style={{
                      padding:"14px 12px",
                      background: active ? `${p.accent}12` : "var(--navy)",
                      border:`1px solid ${active ? p.accent : "var(--border)"}`,
                      borderRadius:"12px", cursor:"pointer",
                      boxShadow: active ? `0 0 0 3px ${p.accent}25` : "none",
                      transition:"all .25s",
                      // A button brings its own alignment and font; these three were
                      // laid out as blocks and must keep reading as cards.
                      display:"block", width:"100%", textAlign:"left",
                      font:"inherit", color:"inherit",
                    }}>
                    {/* Swatch row */}
                    <div style={{display:"flex",gap:"4px",marginBottom:"8px"}}>
                      {p.preview.map((c,i)=>(
                        <div key={i} style={{flex:1,height:"22px",borderRadius:"5px",background:c,border:"1px solid rgba(255,255,255,.08)"}}/>
                      ))}
                    </div>
                    <div style={{fontFamily:`'${displayFont}',sans-serif`,fontSize:"13px",fontWeight:"800",color:active?p.accent:"var(--text)",marginBottom:"2px"}}>{p.label}</div>
                    <div style={{fontSize:"10px",color:"var(--muted)",lineHeight:"1.4"}}>{p.desc}</div>
                    {/* `--muted` is ALREADY the recessive colour. Dimming it a second
                        time with an opacity took it to 2.73:1 on a light skin and
                        3.60:1 on Canopy — below AA on the shipped default. 11px,
                        not 9px: the type scale's smallest step (UI-UX §1). */}
                    <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"5px"}}>{p.fonts}</div>
                    {active && <div style={{marginTop:"8px",fontSize:"9px",fontWeight:"700",color:p.accent,display:"flex",alignItems:"center",gap:"3px"}}><Check size={10}/> ACTIVE</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. GENERATE FROM BRAND */}
          <div style={sectionStyle}>
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"12px"}}>GENERATE FROM YOUR BRAND</div>

            {/* Logo upload */}
            <div
              onClick={()=>fileRef.current?.click()}
              style={{border:`1px dashed ${logoSrc?"var(--accent)":"var(--border)"}`,borderRadius:"12px",padding:"18px",textAlign:"center",cursor:"pointer",marginBottom:"12px",background:logoSrc?`color-mix(in srgb, var(--accent) 3%, transparent)`:"var(--navy)",transition:"all .2s"}}>
              {logoSrc
                ? <img src={logoSrc} alt="logo" style={{maxHeight:"60px",maxWidth:"100%",objectFit:"contain",borderRadius:"6px"}}/>
                : <>
                    <div style={{fontSize:"24px",marginBottom:"6px"}}>🎨</div>
                    <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"2px"}}>Drop your logo here</div>
                    <div style={{fontSize:"11px",color:"var(--muted)"}}>PNG, JPG, SVG · click to browse</div>
                  </>
              }
            </div>
            <input ref={fileRef} type="file" accept="image/*" aria-label="Upload a logo to generate your palette from" style={{display:"none"}} onChange={handleFileChange}/>

            {/* Vibe selector */}
            <div style={{marginBottom:"12px"}}>
              <div style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600",marginBottom:"7px"}}>Brand vibe</div>
              <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                {vibes.map(v=>(
                  <button key={v.id} onClick={()=>setVibe(v.id)}
                    style={{padding:"5px 11px",borderRadius:"999px",fontSize:"11px",fontWeight:"600",cursor:"pointer",
                      background:vibe===v.id?"var(--accent)":"var(--navy)",
                      // `--on-accent`, not Canopy's near-black. `inkOn` computes this
                      // token by asking which of bg/text contrasts more against the
                      // accent, and hardcoding `#0A0F0C` bypassed it: measured on a
                      // navy accent (#12224A), where the token resolves to #F4F6F2,
                      // this pill rendered at 1.25:1 — invisible, on the one screen
                      // the product is demoed from.
                      color:vibe===v.id?"var(--on-accent)":"var(--muted)",
                      border:`1px solid ${vibe===v.id?"var(--accent)":"var(--border)"}`,transition:"all .15s"}}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Extracted palette preview */}
            {palette && (
              <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
                <div style={{fontSize:"10px",color:"var(--muted)",fontWeight:"600",marginRight:"4px",lineHeight:"24px"}}>From your logo:</div>
                {palette.map((c,i)=>(
                  <div key={i} title={c} style={{width:"24px",height:"24px",borderRadius:"6px",background:c,border:"1px solid rgba(255,255,255,.12)",cursor:"default"}}/>
                ))}
              </div>
            )}

            {/* Analyze button */}
            {!analyzing && !generatedSkin && (
              <button onClick={runAnalysis} disabled={!logoSrc}
                style={{width:"100%",padding:"12px",background:logoSrc?"var(--accent)":"rgba(255,255,255,.06)",border:"none",borderRadius:"10px",cursor:logoSrc?"pointer":"not-allowed",fontSize:"13px",fontWeight:"700",color:logoSrc?"var(--on-accent)":"var(--muted)",fontFamily:`'${displayFont}',sans-serif`,transition:"all .2s"}}>
                Analyse & generate identity
              </button>
            )}

            {/* Progress */}
            {analyzing && (
              <div style={{display:"flex",flexDirection:"column",gap:"8px",padding:"4px 0"}}>
                {analyzeSteps.map((s,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:"9px"}}>
                    <div style={{width:"18px",height:"18px",borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                      background:i<analyzeStep?"var(--accent)":i===analyzeStep?`color-mix(in srgb, var(--accent) 13%, transparent)`:"var(--navy)",
                      // `color` on the wrapper and `currentColor` on the icon, rather
                      // than `color="var(--on-accent)"` on the icon itself: lucide
                      // passes its `color` prop through to the SVG `stroke`
                      // PRESENTATION ATTRIBUTE, and a `var()` in a presentation
                      // attribute is not resolved everywhere. Inheriting is safe.
                      color:"var(--on-accent)",
                      border:`1px solid ${i<=analyzeStep?"var(--accent)":"var(--border)"}`}}>
                      {i<analyzeStep && <Check size={10} color="currentColor" strokeWidth={3}/>}
                      {i===analyzeStep && <div style={{width:"5px",height:"5px",borderRadius:"50%",background:"var(--accent)"}}/>}
                    </div>
                    <span style={{fontSize:"12px",color:i<=analyzeStep?"var(--text)":"var(--muted)"}}>{s}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Generated result */}
            {generatedSkin && !analyzing && (
              <div style={{background:"var(--navy)",border:`1px solid ${generatedSkin.tokens.accent}50`,borderRadius:"12px",padding:"14px",marginTop:"4px"}}>
                <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"8px"}}>GENERATED IDENTITY</div>
                {generatedThemes.length>1 && (
                  <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
                    {generatedThemes.map((th,i)=>{
                      const on = generatedSkin && generatedSkin.name===th.name;
                      return (
                        <button key={i} onClick={()=>setGeneratedSkin(th)} style={{flex:1,padding:"8px",background:on?th.tokens.accent+"22":"var(--card)",border:`1px solid ${on?th.tokens.accent:"var(--border)"}`,borderRadius:"9px",cursor:"pointer",textAlign:"left"}}>
                          <div style={{display:"flex",gap:"3px",marginBottom:"6px"}}>
                            {[th.tokens.accent,th.tokens.green,th.tokens.card].map((c,j)=><div key={j} style={{flex:1,height:"14px",borderRadius:"3px",background:c}}/>)}
                          </div>
                          <div style={{fontSize:"11px",fontWeight:"700",color:on?th.tokens.accent:"var(--text)"}}>{th.name}</div>
                          {th.recommended && <div style={{fontSize:"8px",fontWeight:"700",color:"var(--accent)",letterSpacing:"0.5px"}}>RECOMMENDED</div>}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
                  {[generatedSkin.tokens.accent, generatedSkin.tokens.green, generatedSkin.tokens.card, generatedSkin.tokens.bg].map((c,i)=>(
                    <div key={i} title={c} style={{flex:1,height:"28px",borderRadius:"7px",background:c,border:"1px solid rgba(255,255,255,.1)"}}/>
                  ))}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                  <div>
                    <div style={{fontSize:"12px",fontWeight:"700",color:"var(--text)"}}>{generatedSkin.fonts.display} · {generatedSkin.fonts.body}</div>
                    <div style={{fontSize:"10px",color:"var(--muted)"}}>Vibe: {generatedSkin.vibe} · {generatedSkin.contrast?.passesAA?"✓ Passes WCAG AA":"⚠ Low contrast"}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:"8px"}}>
                  <button onClick={applyGenerated}
                    /* ⚠️ NOT `var(--on-accent)` here, and this is the interesting one
                       of the four: this button is painted with the GENERATED skin's
                       accent, not the one currently applied, so the live token is the
                       ink for the wrong colour. `inkOn` is called directly against the
                       generated skin's own tokens — which is exactly what
                       `applySkinCSS` will do when the coach presses it. */
                    style={{flex:1,padding:"10px",background:generatedSkin.tokens.accent,border:"none",borderRadius:"8px",cursor:"pointer",fontSize:"12px",fontWeight:"700",color:inkOn(generatedSkin.tokens.accent,generatedSkin.tokens.bg,generatedSkin.tokens.text),fontFamily:`'${displayFont}',sans-serif`}}>
                    Apply to all surfaces
                  </button>
                  <button onClick={()=>{setGeneratedSkin(null);setGeneratedThemes([]);}}
                    style={{padding:"10px 14px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",cursor:"pointer",fontSize:"12px",color:"var(--muted)"}}>
                    Retry
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COL ─────────────────────────────────────────────────────── */}
        <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>

          {/* Smart recommendation */}
          <div style={sectionStyle}>
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"10px"}}>SMART RECOMMENDATION</div>
            <div style={{fontSize:"12px",color:"var(--muted)",marginBottom:"10px"}}>Describe your gym or pick a type — get a suggested palette that passes accessibility checks, straight into the swatches below.</div>
            <div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>
              <input value={recPrompt} onChange={e=>setRecPrompt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!recBusy&&runRecommend()} disabled={recBusy} placeholder="e.g. high-intensity hyrox gym, industrial" style={{flex:1,minWidth:0,padding:"9px 12px",background:"var(--navy)",border:"1px solid var(--border)",borderRadius:"8px",color:"var(--text)",fontSize:"13px"}}/>
              <button onClick={runRecommend} disabled={recBusy} style={{padding:"9px 16px",background:"var(--accent)",color:"var(--bg)",border:"none",borderRadius:"8px",cursor:recBusy?"default":"pointer",opacity:recBusy?0.7:1,fontWeight:"700",fontSize:"13px",whiteSpace:"nowrap"}}>{recBusy?"Thinking…":"Recommend"}</button>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"6px",marginBottom:"12px"}}>
              {GYM_ARCHETYPES.map(a=>(
                <button key={a.label} onClick={()=>{ setRecPrompt(a.label); applyRecommendation(a); }} style={{display:"flex",alignItems:"center",gap:"6px",padding:"5px 10px",background:"var(--navy)",border:"1px solid var(--border)",borderRadius:"999px",cursor:"pointer",fontSize:"11px",fontWeight:"600",color:"var(--muted)"}}>
                  <span style={{width:"10px",height:"10px",borderRadius:"50%",background:a.accent,flexShrink:0}}/>{a.label}
                </button>
              ))}
            </div>
            {/* 🔴 This used to read "Applied to the swatches below (based on the
                Atelier preset)", and a recommendation is a PALETTE — eight colour
                tokens from `generateSkinFromPalette`. It never touched the preset.
                So a pilates studio was told, in the app's own words, that it was
                getting "a serif display face", pressed Save, reloaded, and had
                Space Grotesk; a HYROX gym was promised "tabular numerals and
                accent glow" and got neither. Fonts, glow and numeral style live
                on the SKIN (`applySkinCSS`'s meta), and a palette cannot carry
                them — that is the same split §1c settled: an override is a
                palette on top of the skin the gym chose.
                The note now offers the preset instead of claiming it, and taking
                it keeps the recommended palette layered on top. Stated, not
                applied — the Builder's scheduled-type notice for the same reason:
                silently restyling a gym would throw away typography they picked. */}
            {recNote && (
              <div style={{padding:"10px 12px",background:"color-mix(in srgb, var(--accent) 10%, transparent)",border:"1px solid color-mix(in srgb, var(--accent) 25%, transparent)",borderRadius:"9px",fontSize:"12px",color:"var(--text)",lineHeight:"1.5"}}>
                <b>{recNote.label}</b> - {recNote.note} <span style={{color:"var(--muted)"}}>The palette is in the swatches below — tweak it, then Save. Its type and finish come from the {baseSkin(recNote.preset).name} preset, which is a separate choice.</span>
                {recNote.preset !== activeSkinId && (
                  <button onClick={()=>{ onSkinChange(recNote.preset); onCustomSkinChange(draftTokens); }}
                    style={{display:"block",marginTop:"9px",padding:"7px 12px",background:"var(--navy)",border:"1px solid var(--border)",borderRadius:"8px",cursor:"pointer",fontSize:"11px",fontWeight:"700",color:"var(--text)"}}>
                    Use {baseSkin(recNote.preset).name}’s type &amp; finish, keep this palette
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 3. FINE-TUNE */}
          <div style={sectionStyle}>
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"12px"}}>FINE-TUNE TOKENS</div>
            <div style={{fontSize:"9px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"6px"}}>Program tints · decorative</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"6px",marginBottom:"16px"}}>
              {((generatedSkin&&generatedSkin.programs)||_baseSkin.programs||DEFAULT_PROGRAMS).map((pg,i)=>(
                <ProgramChip key={i} name={pg.name} tint={pg.tint}/>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
              {tokenLabels.map(({key,label})=>(
                <div key={key} style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  {/* The visible {label} sits to the RIGHT of the swatch and was
                      never associated with it, so all eight tokens announced as
                      an identical bare "color" control. Same defect as the
                      twelve symbol-only buttons in session 12: the name has to
                      exist AND distinguish, and eight interchangeable colour
                      pickers for bg / surface / accent / text distinguish
                      nothing. Named from the same `label` the sighted user
                      reads, so the two can never drift apart. */}
                  <input type="color" aria-label={`${label} colour`}
                    value={draftTokens[key]?.startsWith("rgba")?"var(--card)":draftTokens[key]||"#000000"}  /* <input type="color"> requires a 6-digit hex and rejects anything else; this is the empty-value default the element demands, not a painted colour */
                    onChange={e=>setDraftTokens(d=>({...d,[key]:e.target.value}))}
                    style={{width:"30px",height:"30px",borderRadius:"6px",border:`1px solid var(--border)`,cursor:"pointer",background:"none",padding:"1px"}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:"12px",fontWeight:"600",color:"var(--text)"}}>{label}</div>
                    <div style={{fontSize:"10px",color:"var(--muted)",fontFamily:"monospace"}}>{draftTokens[key]}</div>
                  </div>
                  {(key==="text"||key==="muted")&&contrastBadge(draftTokens[key],draftTokens.bg)}
                  {key==="accent"&&contrastBadge(draftTokens[key],draftTokens.bg)}
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:"8px",marginTop:"14px"}}>
              {/* 🔴 This used to also call `onSkinChange("custom")`, and `"custom"`
                  is not a skin: `PRESET_SKINS["custom"]` is undefined, so from
                  the next reload the gym had no fonts, no accent glow and no
                  numeral style — a studio on Atelier lost Instrument Serif for
                  nudging one colour, and saw it work until they closed the tab.
                  Overrides are a PALETTE on top of the skin the gym chose, so
                  the base keeps its id and everything else it carries. */}
              <button onClick={()=>{onCustomSkinChange(draftTokens);}}
                style={{flex:1,padding:"10px",background:"var(--accent)",border:"none",borderRadius:"8px",cursor:"pointer",fontSize:"12px",fontWeight:"700",color:"var(--on-accent)",fontFamily:`'${displayFont}',sans-serif`}}>
                Save custom tokens
              </button>
              <button onClick={()=>{setDraftTokens({..._baseSkin.tokens});onCustomSkinChange(null);}}
                style={{padding:"10px 14px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",cursor:"pointer",fontSize:"12px",color:"var(--muted)"}}>
                Reset
              </button>
            </div>
          </div>

          {/* 3.5 ACCESSIBILITY — live WCAG-AA contrast audit (F6 · P2 10-foot rule) */}
          <div style={sectionStyle}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"8px",flexWrap:"wrap",marginBottom:"10px"}}>
              <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",textTransform:"uppercase",letterSpacing:"1.5px"}}>ACCESSIBILITY · WCAG AA</div>
              {a11yTextFails>0 && (
                <button onClick={fixAllText} title="Nudge failing text colours until they pass AA"
                  style={{fontSize:"11px",fontWeight:"700",padding:"5px 11px",borderRadius:"999px",border:"1px solid var(--accent)",background:"color-mix(in srgb, var(--accent) 12%, transparent)",color:"var(--accent)",cursor:"pointer"}}>Auto-fix text</button>
              )}
            </div>

            {/* Roll-up banner */}
            <div style={{display:"flex",alignItems:"center",gap:"9px",padding:"10px 12px",borderRadius:"9px",marginBottom:"12px",
              background:a11yTextFails===0?"rgba(123,227,164,.12)":"rgba(245,158,11,.12)",
              border:`1px solid ${a11yTextFails===0?"rgba(123,227,164,.4)":"rgba(245,158,11,.4)"}`}}>
              <span style={{fontSize:"15px",flexShrink:0}}>{a11yTextFails===0?"✓":"⚠️"}</span>
              <span style={{fontSize:"12px",fontWeight:"600",color:"var(--text)",lineHeight:1.4}}>
                {a11yTextFails===0
                  ? "Member-visible text meets WCAG AA — legible at room-display size."
                  : `${a11yTextFails} text pair${a11yTextFails>1?"s":""} below AA — may be hard to read from the back of the floor.`}
              </span>
            </div>

            {/* Per-pair rows */}
            <div style={{display:"flex",flexDirection:"column",gap:"7px"}}>
              {a11yChecks.map(c=>(
                <div key={c.id} style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  <div style={{width:"36px",height:"28px",borderRadius:"6px",background:c.bg,border:`1px solid var(--border)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{color:c.fg,fontSize:"13px",fontWeight:"800",lineHeight:1}}>Aa</span>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"12px",fontWeight:"600",color:"var(--text)"}}>{c.label}</div>
                    <div style={{fontSize:"10px",color:"var(--muted)"}}>{c.ratio.toFixed(2)}:1 · needs {c.min}:1{c.big?" · large/graphic":""}</div>
                  </div>
                  <span style={{fontSize:"10px",fontWeight:"800",padding:"2px 7px",borderRadius:"999px",flexShrink:0,
                    // 🔴 These two badges ARE the AA audit, and on a light skin
                    // they measured 1.47:1 — the compliance feature failing the
                    // compliance rule, on the demo surface. Canopy's mint and the
                    // danger red were spelled raw; the tokens plus `hueInk` make
                    // them readable on any palette a gym builds.
                    background:c.pass?"rgba(123,227,164,.15)":"rgba(239,68,68,.15)",color:c.pass?hueInk("var(--green)"):hueInk("var(--danger)")}}>{c.pass?"AA":"FAIL"}</span>
                  {fixablePair(c) && (
                    <button onClick={()=>fixPair(c)} title="Nudge this text colour until it passes AA"
                      style={{fontSize:"10px",fontWeight:"700",padding:"3px 8px",borderRadius:"6px",border:`1px solid var(--border)`,background:"var(--navy)",color:"var(--text)",cursor:"pointer",flexShrink:0}}>Fix</button>
                  )}
                </div>
              ))}
            </div>

            <div style={{fontSize:"10px",color:"var(--muted)",marginTop:"11px",lineHeight:1.5}}>
              Live against your draft tokens. AA needs 4.5:1 for body text, 3:1 for large/graphic marks. Passing keeps every branded member surface — including the room TV read at 8&nbsp;m — legible.
            </div>
          </div>

          {/* 4. LIVE PREVIEW */}
          <div style={sectionStyle}>
            {/* "on sample content" is the load-bearing half. The RESKIN is live —
                that part was always true — but the numbers below it are made up,
                and the header said nothing about it. NPS was the worst of them:
                there is no survey anywhere in this product and no path to one, so
                a metric no gym will ever see here was sitting on the screen an
                owner is shown during a sales conversation. Replaced with the
                class length, which Jungle does know. The preview still needs
                content to be a preview — it just has to say that it is sample. */}
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"12px"}}>LIVE PREVIEW · your colours and fonts, on sample content</div>
            {/* `inert`, not `aria-hidden` + `tabIndex={-1}`.
                This pane is a PICTURE of the gym's app, and it ends in a live
                accent-coloured <button>Start Class</button> on sample content.
                Sighted users read it as a mockup from the surrounding frame; a
                keyboard or screen-reader user got a real, focusable "Start
                Class" that announces itself like every other button on the
                screen and does nothing — the same class of defect as session
                15's five dead controls, but reachable only by the people least
                able to tell it was decoration.
                `tabIndex={-1}` here would not have worked: it takes the
                CONTAINER out of the tab order and leaves every descendant in.
                `aria-hidden` alone is worse than nothing — hiding a subtree
                that still contains a focusable element is itself a violation,
                because focus can land somewhere the a11y tree says is absent.
                `inert` (React 19 passes it through) does both, for the whole
                subtree, and keeps doing both if the preview grows another
                control. */}
            <div inert style={{background:"var(--bg)",borderRadius:"12px",padding:"16px",border:`1px solid var(--border)`}}>
              {/* Mini nav */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
                {/* The gym's own name, because this is the white-label preview —
                    showing "JUNGLE" here was the one wordmark it should never be. */}
                <div style={{fontFamily:`'${displayFont}',sans-serif`,fontSize:"15px",fontWeight:"800",color:"var(--accent)",letterSpacing:"2px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"48%"}}>
                  {(gymBranding?.gymName || "JUNGLE").toUpperCase()}
                </div>
                <div style={{display:"flex",gap:"10px"}}>
                  {[["MEMBERS","24"],["RPE","7.4"],["MIN","45"]].map(([l,v])=>(
                    <div key={l} style={{textAlign:"center"}}>
                      <div style={{fontFamily:`'${displayFont}',sans-serif`,fontSize:"14px",fontWeight:"800",color:"var(--accent)"}}>{v}</div>
                      <div style={{fontSize:"9px",color:"var(--muted)",fontWeight:"700"}}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Mini class card */}
              <div style={{background:"var(--card)",border:`1px solid var(--border)`,borderRadius:"10px",padding:"12px",marginBottom:"8px"}}>
                <div style={{fontSize:"9px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"5px"}}>NEXT CLASS</div>
                <div style={{fontFamily:`'${displayFont}',sans-serif`,fontSize:"15px",fontWeight:"800",color:"var(--text)",marginBottom:"2px"}}>Strength Lab</div>
                <div style={{fontSize:"11px",color:"var(--muted)"}}>with Priya · 18:30 · 45 min</div>
                <div style={{marginTop:"8px",height:"3px",borderRadius:"2px",background:`linear-gradient(to right, var(--accent), var(--green))`}}/>
              </div>
              {/* Mini schedule rows */}
              {["06:00  Sunrise HIIT","12:15  Hyrox Sim","18:30  Strength Lab"].map((c,i)=>(
                <div key={i} style={{fontSize:"11px",color:i===0?"var(--text)":"var(--muted)",padding:"5px 0",borderBottom:`1px solid var(--border)`,display:"flex",justifyContent:"space-between"}}>
                  <span>{c}</span>
                  {i===0&&<span style={{fontSize:"9px",padding:"2px 6px",background:`color-mix(in srgb, var(--accent) 9%, transparent)`,color:"var(--accent)",borderRadius:"4px",fontWeight:"700"}}>LIVE</span>}
                </div>
              ))}
              {/* Mini button */}
              <button style={{width:"100%",marginTop:"10px",padding:"9px",background:"var(--accent)",border:"none",borderRadius:"8px",cursor:"pointer",fontSize:"12px",fontWeight:"700",color:"var(--on-accent)",fontFamily:`'${displayFont}',sans-serif`}}>
                Start Class
              </button>
            </div>
          </div>

          {/* 5. GYM NAME + LOGO (existing brand settings) */}
          <div style={sectionStyle}>
            <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"12px"}}>GYM IDENTITY</div>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              <div>
                <div style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600",marginBottom:"5px"}}>Gym name</div>
                <input value={gymBranding.gymName||""} onChange={e=>onBrandingChange({...gymBranding,gymName:e.target.value})}
                  placeholder="Your gym name…"
                  style={{width:"100%",padding:"9px 12px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px",boxSizing:"border-box"}}/>
              </div>
              {gymBranding.logo && (
                <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  <img src={gymBranding.logo} style={{height:"36px",maxWidth:"80px",objectFit:"contain",borderRadius:"6px",border:`1px solid var(--border)`}} alt="logo"/>
                  <button onClick={()=>onBrandingChange({...gymBranding,logo:null})}
                    style={{padding:"6px 10px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"11px"}}>
                    Remove
                  </button>
                </div>
              )}

              {/* ── Membership price ──────────────────────────────────────────
                  Not branding in the visual sense, and it lives here anyway:
                  `branding` is the blob that already round-trips to
                  `brand_profiles` (0004), so this is the one place a per-gym
                  fact can be stored without a migration — and migrations are
                  Dylan's, not a session's.

                  Its ONLY consumer is the Members screen's at-risk panel, which
                  turns "3 members need attention" into a monthly figure. Left
                  blank, that panel shows no money at all rather than a zero, so
                  the copy below promises exactly what happens and no more. */}
              <div>
                <div style={{fontSize:"11px",color:"var(--muted)",fontWeight:"600",marginBottom:"5px"}}>Membership price</div>
                <div style={{display:"flex",gap:"8px"}}>
                  <select aria-label="Currency" value={gymBranding[CURRENCY_FIELD]||DEFAULT_CURRENCY}
                    onChange={e=>onBrandingChange({...gymBranding,[CURRENCY_FIELD]:e.target.value})}
                    style={{padding:"9px 8px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px",cursor:"pointer",flexShrink:0}}>
                    {/* "S$ SGD", but just "AED" for the one currency whose symbol
                        IS its code — "AED AED" read as a rendering bug, spotted
                        by looking at the open select rather than by any test. */}
                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>
                      {c.symbol.trim() === c.code ? c.code : `${c.symbol.trim()} ${c.code}`}
                    </option>)}
                  </select>
                  {/* `inputMode="decimal"` with type="text", not type="number":
                      a number input's spinner and scroll-to-change are a bad fit
                      for a figure typed once, and Firefox lets a number input
                      hold "e5" while reporting an empty value — which would read
                      as unset while looking filled in. The string is parsed by
                      `membershipPrice`, which rejects anything that is not a
                      positive finite number. */}
                  <input type="text" inputMode="decimal" aria-label="Membership price per month"
                    value={gymBranding[PRICE_FIELD] ?? ""}
                    onChange={e=>onBrandingChange({...gymBranding,[PRICE_FIELD]:e.target.value})}
                    placeholder="e.g. 150"
                    style={{flex:1,minWidth:0,padding:"9px 12px",background:"var(--navy)",border:`1px solid var(--border)`,borderRadius:"8px",color:"var(--text)",fontSize:"13px",boxSizing:"border-box"}}/>
                </div>
                <div style={{fontSize:"10px",color:"var(--muted)",marginTop:"5px",lineHeight:1.5}}>
                  What one membership costs per month. Used to show the revenue behind the
                  at-risk list on the Members screen. Leave it blank and no figure is shown.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
