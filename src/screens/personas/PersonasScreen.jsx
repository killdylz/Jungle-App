// ─── Coach Personas — the D workstream's whole surface ───────────────────────
//
// I6 stage 4. Lifted verbatim out of App.jsx: PersonasScreen and the four panels
// it owns, plus the persona→Builder mapping and the Slides-import helpers that
// only this screen speaks.
//
// ⚠️ THE RISK THIS EXTRACTION CARRIES, written down because it has been paid
// twice. `lint:crash` resolves plain identifiers but NOT JSX element names, so a
// component or icon left unimported here lints clean, builds clean, and throws
// `ReferenceError` the moment a coach opens the screen — where the error boundary
// turns it into a calm "Something broke". That is exactly how stage 2 shipped a
// dead Members panel past a fully green gate. The guards that actually cover this
// file are `e2e/screens.spec.js` (asserts the Coaches screen renders AND that the
// boundary is absent), `e2e/personas.spec.js`, and the accessible-name sweep.
// Every icon below is imported explicitly for that reason.

import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, ArrowLeft, Search, Loader, X, Layers, Check, Upload, Users, Zap } from "lucide-react";
import { supabase, supabaseEnabled } from "../../supabase.js";
import * as store from "../../lib/store.js";
import { uid } from "../../lib/ids.js";
import { SEED_PERSONAS } from "../../data/personas.seed.js";
import { getLibrary } from "../../lib/libraryAccess.js";
import { classTypeOf, classTypesOf, aggregateClassType, aggregateMovements, classCategory,
         renameClassType, renameClassTypeInGenerations, totalCount } from "../../lib/personaAggregate.js";
import { CATEGORIES, categoryOf } from "../../lib/movementTaxonomy.js";
import { deriveBlueprint, reconcileBlueprint, draftFromBlueprint, BLUEPRINT_PRESETS } from "../../lib/blueprints.js";
import { GENERATION_PRESETS, applyPreset, presetDraftOpts, describePresetEffect,
         presetDraftTitle } from "../../lib/generationPresets.js";
import { slidesEnabled, getSlidesToken, parseDriveId, resolveDriveTarget, listPresentations,
         fetchPresentationText, splitDeckSlides, slideDate, looksLikeClassSlide } from "../../lib/slidesImport.js";
import { parsePlanText, deriveHints, PARSE_THRESHOLD, PARSER_VERSION } from "../../lib/planParser.js";
import { useWindowWidth, Btn, Input, Select, Tag } from "../../ui/primitives.jsx";
import { useDialog } from "../../ui/dialog.js";
import { useToast } from "../../ui/toast.jsx";
import { ROLE_LABEL, MOVEMENT_CATEGORY_LABEL, CLASS_CATEGORY_LABEL, SOURCE_LABEL,
         KIND_LABEL, schemeTypeLabel, readErrorMessage } from "../../ui/labels.js";

// ─── Coach Personas (workstream D — persona-level planning) ──────────────────
// Persona-first: define/choose a persona, connect historical plans as its
// corpus, view its learned style, then draft a new class "in this style" into
// the Builder (coach edits + approves — the hard gate). Local-first via store;
// syncs to coach_personas / persona_plans once 0005 is applied.

// Map a persona plan's normalized {blocks} → Builder stages. Roles collapse onto
// the Builder's five stage types; scheme/rest inform sets·reps·rest per exercise.
const ROLE_TO_STAGE = { warmup:"warmup", primary_lift:"strength", superset:"strength",
                        circuit:"circuit", finisher:"circuit", cooldown:"cooldown", recovery:"recovery" };
const ROLE_DUR_SEC  = { warmup:300, primary_lift:900, superset:600, circuit:600, finisher:480, cooldown:300, recovery:300 };
// Persona class-type category → Builder class-type key (each must exist in WORKOUT_LIBRARY).
// Item 9: a persona pushed to the Builder lands on the right class type, not "untyped".
const CATEGORY_TO_BUILDER = { strength:"strength", conditioning:"circuit", endurance:"hyrox", mixed:"bootcamp" };
// Two different things are called "category" in this system, so both are named
// explicitly: a CLASS category (what kind of session this is, from classCategory)
// and a MOVEMENT category (what kind of movement this is, from the §9.2 taxonomy).
// CLASS_CATEGORY_LABEL now lives in src/ui/labels.js with the other label maps.
function planToStages(plan) {
  const blocks = plan?.blocks || [];
  return blocks.map(b => {
    const sc = b.scheme || {};
    const restLabel = sc.rest_sec ? `${sc.rest_sec}s` : "";
    // Intensity + scheme qualifiers ride into the Builder on each exercise's notes
    // (stages have no block-level scheme fields).
    const schemeBits = [sc.rir != null ? `RIR ${sc.rir}` : "", sc.rpe != null ? `RPE ${sc.rpe}` : "",
                        sc.note || ""].filter(Boolean);
    const exercises = (b.exercises || []).map(ex => {
      // ex.reps is "" (schema default) when the block scheme's ladder applies —
      // only a non-empty per-exercise value overrides it.
      const reps = (ex.reps != null && String(ex.reps).trim() !== "") ? String(ex.reps)
                 : (Array.isArray(sc.reps) && sc.reps.length ? sc.reps.join("-") : "");
      const notes = [ex.per_side ? "per side" : "", ex.regression ? `regress: ${ex.regression}` : "",
                     ex.equip || "", ex.target ? `target: ${ex.target}` : "", ...schemeBits].filter(Boolean).join(" · ");
      return { n: ex.name || "Movement", s: sc.sets != null ? String(sc.sets) : "",
               r: reps, rest: restLabel, notes };
    });
    // A block that states its own length wins; the per-role default is the
    // fallback for parsed plans, which carry no duration at all (blocks have
    // none — only occasional prose in scheme.note hints at one, and parsing that
    // would be a guess dressed as data). A blueprint-drafted block DOES state
    // one, and it is the coach's own number from the class shape.
    const dur = Number(b.minutes) > 0 ? Math.round(Number(b.minutes) * 60)
                                      : (ROLE_DUR_SEC[b.role] || 600);
    return { id: uid(), type: ROLE_TO_STAGE[b.role] || "circuit",
             name: b.label || "Block", dur,
             exercises, tracks: [] };
  });
}

// Shared styling + labels for the persona surfaces.
const P_CARD = { background:"var(--card)", border:"1px solid var(--border)", borderRadius:"12px" };
const P_CHIP = { display:"inline-block", padding:"3px 9px", background:"var(--navy)", color:"var(--muted)", borderRadius:"5px", fontSize:"11px", fontWeight:"600", margin:"0 5px 5px 0" };
// Label maps live in src/ui/labels.js so the "no jargon reaches a coach" rule
// can be unit-tested rather than eyeballed (see labels.test.js).
const KIND_COLOR = { coach:"var(--accent)", format:"#8B5CF6", house:"#3B82F6" };
// (`ctOf` was a byte-identical copy of personaAggregate's `classTypeOf`. Two
//  readers of one question is exactly what §2.4 warns about, and the class-type
//  key is the value that proved it — so the copy is gone and both sides call the
//  same function.)
const fmtRest = s => s == null ? "" : (s >= 60 ? `${Math.floor(s/60)}m${s%60?` ${s%60}s`:""}` : `${s}s`);
const fmtScheme = sc => [schemeTypeLabel(sc?.type), sc?.sets!=null?`${sc.sets} sets`:"", sc?.rir!=null?`RIR ${sc.rir}`:"", sc?.rpe!=null?`RPE ${sc.rpe}`:"", sc?.rest_sec!=null?`rest ${fmtRest(sc.rest_sec)}`:""].filter(Boolean).join(" · ");
// Distinct exercise names across a plan's blocks — the novelty signature stored in
// the generation ledger and used to steer the next generation away from repeats.
const blockMovementNames = blocks => { const s = new Set(); (blocks||[]).forEach(b => (b.exercises||[]).forEach(ex => { const n=(ex.name||"").trim(); if (n) s.add(n); })); return [...s]; };
// supabase.functions.invoke wraps every non-2xx in a FunctionsHttpError whose
// message is just "Edge Function returned a non-2xx status code" — the function's
// real { error } body is on error.context (a Response). Read it or debugging is blind.
async function fnErrorMessage(error) {
  try {
    const body = await error.context.json();
    if (body?.error) return String(body.error);
    return JSON.stringify(body);
  } catch { return error?.message || String(error); }
}

// readErrorMessage / READ_ERRORS moved to src/ui/labels.js — see labels.test.js,
// which asserts no message leaks jargon at a coach.

// Free Gemini tiers cap requests-per-minute (e.g. 5/min for 2.5-flash), so a
// deck with many slides trips "quota exceeded … retry in Ns". Recognise those
// so the importer can WAIT OUT the 1-minute window and retry, instead of failing
// — keeping the whole import on the free tier.
const RATE_LIMITED = /quota|rate.?limit|resource.?exhausted|\b429\b|retry in|exceeded your current|high demand|overload|unavailable|try again/i;
function retryAfterSecs(msg) {
  const m = String(msg || "").match(/retry in ([\d.]+)\s*s/i); // Gemini says "Please retry in 58.7s"
  return m ? Math.ceil(Number(m[1])) : 0;
}
// A DAILY quota exhaustion is not a per-minute rate limit and must not be retried:
// Gemini's per-day cap resets on Google's ~midnight-Pacific cycle, so waiting 30s and
// retrying 6 times per slide just turns a dead import into a 30-minute hang before
// failing anyway. Google names the daily quota "…RequestsPerDay…" in the error.
const DAILY_QUOTA_GONE = /per\s?day|daily\s+(quota|limit)|limit:\s*0/i;

// One LLM call per slide drained the free daily quota on a single 18-slide deck, so
// slides are sent in batches. Small enough that one bad batch costs little and the
// response stays inside the output ceiling; big enough to cut quota use ~5x.
const SLIDE_BATCH = 5;

// looksLikeClassSlide lives in src/lib/slidesImport.js (slide logic, and unit-tested
// there — the heuristic is easy to break in a way no manual click would reveal).

// Extraction provenance, stored INSIDE persona_plans.plan (free-form jsonb) rather
// than as a new `source` value — persona_plans.source is CHECK-constrained to
// google_slides|manual|jungle, and inventing a fourth value is exactly the mistake
// that silently destroyed a corpus on 2026-07-18. Nothing downstream reads keys
// other than `blocks`, so this rides along safely and makes it possible to tell,
// later, which plans came from the parser and which from the model.
const extractMeta = (via, confidence) => ({
  via,                                   // "parser" | "llm"
  confidence: via === "parser" ? confidence : null,
  parserVersion: via === "parser" ? PARSER_VERSION : null,
  at: new Date().toISOString(),
});

// Coach-first: a persona is a coach; class type (S360 / GC / Enduro…) is a
// dimension within them. Open a coach → tab per class type → that class type's
// derived profile + editable movement catalog + past plans + draft/generate.
// Runs on localStorage; syncs to coach_personas/persona_plans/persona_movements
// once 0005 is applied. LLM generation arrives with the Edge Function (chunk 2).
export function PersonasScreen({ onBack, onDraftToBuilder }) {
  const vw = useWindowWidth();
  const { toast } = useToast();
  const isMobile = vw < 480;
  const isTablet = vw < 900;
  const [personas, setPersonas] = useState(() => store.getPersonas());
  const [plans, setPlans]       = useState(() => store.getPersonaPlans());
  const [movements, setMovements] = useState(() => store.getPersonaMovements());
  const [generations, setGenerations] = useState(() => store.getPersonaGenerations());
  const [selectedId, setSelectedId] = useState(() => store.getPersonas()[0]?.id || null);
  const [activeCT, setActiveCT] = useState(null);
  // D3 cold start: the class type a brand-new coach is naming before they have
  // imported anything.
  const [coldCT, setColdCT] = useState("");
  const [form, setForm] = useState({ name:"", kind:"coach", description:"" });
  const [editHead, setEditHead] = useState(false);
  const [headForm, setHeadForm] = useState({ name:"", description:"" });
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [planForm, setPlanForm] = useState({ title:"", classType:"", focus:"", json:"" });
  const [planErr, setPlanErr] = useState("");
  const [editingPlan, setEditingPlan] = useState(null);
  // The in-flight edit a discard handed back, held only long enough for the undo
  // toast to be able to reopen the editor with it. Separate from `editingPlan`
  // so the editor's pristine copy still comes from the SAVED plan.
  const [planEditDraft, setPlanEditDraft] = useState(null);
  // Google Slides import (chunk 3): folder → deck list → per-deck extract.
  const [showSlides, setShowSlides] = useState(false);
  const [slidesFolder, setSlidesFolder] = useState("");
  const [slideDecks, setSlideDecks] = useState(null);   // null = not listed yet
  const [deckSel, setDeckSel] = useState(() => new Set());
  const [slidesBusy, setSlidesBusy] = useState("");     // "" | "list" | "import"
  const [slidesErr, setSlidesErr] = useState("");
  const [slidesProg, setSlidesProg] = useState(null);   // { done, total, current }
  const [planMode, setPlanMode] = useState("json"); // "json" = paste extraction JSON · "text" = paste deck text → LLM extract
  const [planBusy, setPlanBusy] = useState(false);
  const [showGen, setShowGen] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState("");
  const [brief, setBrief] = useState({ focus:"", durationMin:"45", weekX:"", weekN:"" });

  useEffect(() => {
    let alive = true;
    store.hydratePersonas().then(r => {
      if (!alive || !r) return;
      setPersonas(r.personas); setPlans(r.plans); setMovements(r.movements || []);
      if (r.generations) setGenerations(r.generations);
      setSelectedId(id => id || r.personas[0]?.id || null);
    });
    return () => { alive = false; };
  }, []);

  // Backfill the movement catalog for any persona that has plans but no catalog
  // rows yet — e.g. plans arriving from a bulk import or a fresh load. Runs only
  // when a persona is missing entirely, so it never clobbers curated edits.
  useEffect(() => {
    if (!personas.length || !plans.length) return;
    const have = new Set(movements.map(m => m.personaId));
    const missing = personas.filter(p => !have.has(p.id) && plans.some(pl => pl.personaId === p.id));
    if (!missing.length) return;
    let cat = movements.slice();
    missing.forEach(p => {
      const pplans = plans.filter(pl => pl.personaId === p.id);
      cat = cat.concat(aggregateMovements(pplans, []).map(m => ({ ...m, personaId: p.id })));
    });
    setMovements(store.savePersonaMovements(cat));
  }, [personas, plans]); // movements omitted by design — guard prevents re-runs

  // Recompute a persona's movement catalog from its plans (using the current
  // catalog so alias/name edits fold occurrences together), persist, setState.
  const recompute = (allPlans, catalog, pid) => {
    const untouched = catalog.filter(m => m.personaId !== pid);
    const existing  = catalog.filter(m => m.personaId === pid);
    const pplans    = allPlans.filter(pl => pl.personaId === pid);
    const derived   = aggregateMovements(pplans, existing).map(m => ({ ...m, personaId: pid }));
    const merged = store.savePersonaMovements([...untouched, ...derived]);
    setMovements(merged);
  };

  const commitPersonas = list => { setPersonas(list); store.savePersonas(list); };
  // Sync is fire-and-forget, so re-read the failure ledger shortly after each save
  // to drive the banner. 1.2s comfortably covers a round trip without making the
  // save feel blocking; a slower network just means the banner appears a beat late.
  const [planSyncErr, setPlanSyncErr] = useState(() => store.syncErrorFor("persona_plans"));
  const commitPlans = (list, pid = selectedId) => {
    setPlans(list); store.savePersonaPlans(list);
    if (pid) recompute(list, movements, pid);
    setTimeout(() => setPlanSyncErr(store.syncErrorFor("persona_plans")), 1200);
  };

  const createPersona = () => {
    const name = form.name.trim();
    if (!name) return;
    const p = { id: store.newId(), name, kind: form.kind, description: form.description.trim(),
                styleProfile: {}, profileUpdatedAt: null };
    commitPersonas([...personas, p]);
    setSelectedId(p.id);
    setForm({ name:"", kind:"coach", description:"" });
  };
  const saveHead = () => {
    const name = headForm.name.trim(); if (!name) return;
    commitPersonas(personas.map(p => p.id === selectedId ? { ...p, name, description: headForm.description.trim() } : p));
    setEditHead(false);
  };
  // The most expensive delete in the product, and until session 25 the only
  // unguarded one: it takes the coach, their whole class corpus, the movement
  // catalogue aggregated from it and their generation ledger. Meanwhile deleting
  // a SINGLE exercise asked "are you sure?". The protection was inverted.
  //
  // This is the one action that gets both a confirm and an undo. An imported
  // corpus is an LLM pass over a real deck the coach has taught from for years —
  // it cannot be retyped, and it is the data the entire wedge feature is built
  // on. The confirm says what will go and how much of it; the undo means saying
  // yes by reflex is still recoverable.
  const removePersona = id => {
    const p = personas.find(x => x.id === id);
    const label = p?.name || "this coach";
    const nPlans = plans.filter(pl => pl.personaId === id).length;
    const nMoves = movements.filter(m => m.personaId === id).length;
    const nGens  = generations.filter(g => g.personaId === id).length;
    const also = [nPlans && `${nPlans} class plan${nPlans === 1 ? "" : "s"}`,
                  nMoves && `${nMoves} movement${nMoves === 1 ? "" : "s"}`,
                  nGens  && `${nGens} generated class${nGens === 1 ? "" : "es"}`].filter(Boolean);
    // "1 class plan, 11 movements and 3 generated classes" — an Oxford-less list
    // rather than `join(", ")`, which read as "1 class plan, 11 movements." and
    // looked like a sentence that had been cut off mid-way.
    const list = also.length < 2 ? also.join("")
      : `${also.slice(0, -1).join(", ")} and ${also[also.length - 1]}`;
    const detail = list ? ` This also deletes ${list}.` : "";
    if (!window.confirm(`Delete ${label}?${detail} You can undo this straight after.`)) return;

    // Captured BEFORE the delete. Restoring by re-deriving would not work:
    // aggregateMovements rebuilds the catalogue from the plans on every
    // recompute, so any manual edit on a zero-occurrence row — the rows its
    // retention rule exists to preserve — would silently not come back.
    const before = { personas, plans, movements, generations };

    const r = store.deletePersona(id);
    const moves = store.savePersonaMovements(store.getPersonaMovements().filter(m => m.personaId !== id));
    const gens = store.getPersonaGenerations().filter(g => g.personaId !== id); // server rows cascade via FK
    store.savePersonaGenerations(gens);
    setPersonas(r.personas); setPlans(r.plans); setMovements(moves); setGenerations(gens);
    if (selectedId === id) setSelectedId(r.personas[0]?.id || null);

    toast(`Deleted ${label}`, { undo: () => {
      const back = store.restorePersonaCascade(before);
      setPersonas(back.personas); setPlans(back.plans);
      setMovements(back.movements); setGenerations(back.generations);
      setSelectedId(id);
      toast(`${label} restored`);
    } });
  };
  const seedSample = () => {
    const now = personas.slice();
    const newPlans = plans.slice();
    const touched = [];
    SEED_PERSONAS.forEach(sp => {
      if (now.some(p => p.name === sp.name)) return; // idempotent by name
      const id = store.newId(); touched.push(id);
      now.push({ id, name: sp.name, kind: sp.kind, description: sp.description,
                 styleProfile: sp.styleProfile || {}, profileUpdatedAt: new Date().toISOString() });
      (sp.plans || []).forEach(pl => newPlans.push({
        id: store.newId(), personaId: id, source: pl.source || "jungle", sourceRef: "",
        title: pl.title, classType: pl.classType || "", focus: pl.focus || "", planDate: "", plan: pl.plan || {},
      }));
    });
    commitPersonas(now);
    setPlans(newPlans); store.savePersonaPlans(newPlans);
    let cat = movements;
    touched.forEach(pid => {
      const pplans = newPlans.filter(pl => pl.personaId === pid);
      const derived = aggregateMovements(pplans, []).map(m => ({ ...m, personaId: pid }));
      cat = [...cat, ...derived];
    });
    setMovements(store.savePersonaMovements(cat));
    setSelectedId(id => id || now[0]?.id || null);
  };

  const addPlan = () => {
    setPlanErr("");
    let parsed;
    try { parsed = JSON.parse(planForm.json); }
    catch (e) { setPlanErr("That doesn't look like a class. Paste the class text instead — Jungle will read it."); return; }
    const planObj = Array.isArray(parsed) ? { blocks: parsed } : (parsed.blocks ? parsed : { blocks: [] });
    if (!Array.isArray(planObj.blocks) || !planObj.blocks.length) { setPlanErr("No exercises found in that text. Check it includes the movements and sets, then try again."); return; }
    const ct = planForm.classType.trim();
    const pl = { id: store.newId(), personaId: selectedId, source: "manual", sourceRef: "",
                 title: planForm.title.trim() || "Untitled plan", classType: ct,
                 focus: planForm.focus.trim(), planDate: "", plan: planObj };
    commitPlans([...plans, pl]);
    setPlanForm({ title:"", classType:"", focus:"", json:"" });
    setShowAddPlan(false);
    if (ct) setActiveCT(ct);
  };
  // Paste raw deck text → the DETERMINISTIC parser first (src/lib/planParser.js),
  // with persona-ai (task:"extract") as the fallback for notation it can't read.
  // See spec §4.3.1: these are house formats — a private grammar repeated weekly —
  // so the model should be the cold-start tool, not the steady-state engine.
  const extractAndAdd = async () => {
    setPlanErr("");
    const text = (planForm.json || "").trim();
    if (!text) { setPlanErr("Paste the class text first."); return; }
    setPlanBusy(true);
    try {
      let data = null, via = "parser", conf = 0;
      const parsed = parsePlanText(text, {
        classTypeHint: planForm.classType.trim(), title: planForm.title.trim(),
        // Same per-coach hints as the Slides import — a pasted deck benefits from
        // the coach's known vocabulary just as much as an imported one.
        hints: deriveHints(plans.filter(pl => pl.personaId === selectedId),
                           movements.filter(m => m.personaId === selectedId)),
        // D2 — and the coach's own class SHAPES, keyed by class type. Where hints
        // teach the parser this coach's vocabulary, the blueprint teaches it their
        // structure, so a bare "C1 / C2 / C3" deck is read as the warm-up, circuit
        // and finisher the coach actually programs instead of being guessed at
        // (§4.3.2). Resolves only; never invents a block.
        blueprints: selected?.styleProfile?.blueprints || null,
      });
      if (parsed.confidence >= PARSE_THRESHOLD) {
        data = parsed; conf = parsed.confidence;
      } else {
        // Below threshold the parser DEFERS rather than guessing. Without the Edge
        // Function there is nothing to defer to, so say what the parser saw — that
        // is more actionable than a bare "extraction needs the function".
        // A coach is never shown a confidence percentage or the name of a
        // service (UI-UX §4). They are told what to DO. The parser's own reason
        // is kept out of the message for the same reason — it is written for us.
        if (!(supabaseEnabled && supabase)) {
          throw new Error("PARTIAL_READ");
        }
        const r = await supabase.functions.invoke("persona-ai", { body: {
          task: "extract", text, classType: planForm.classType.trim(), title: planForm.title.trim(), focus: planForm.focus.trim() } });
        if (r.error) throw new Error(await fnErrorMessage(r.error));
        if (r.data?.error) throw new Error(r.data.error);
        data = r.data; via = "llm";
      }
      const blocks = data?.plan?.blocks || [];
      if (!blocks.length) throw new Error("NO_EXERCISES");
      const ct = (planForm.classType.trim() || data.classType || "").trim();
      // "manual" — the coach supplied the deck text themselves. MUST be one of the
      // three values persona_plans' CHECK constraint allows (see store.planSource);
      // "extract" was silently failing every sync.
      const pl = { id: store.newId(), personaId: selectedId, source: "manual", sourceRef: "",
                   title: planForm.title.trim() || data.title || "Untitled plan", classType: ct,
                   focus: planForm.focus.trim() || data.focus || "", planDate: "",
                   plan: { blocks, _extract: extractMeta(via, conf) } };
      commitPlans([...plans, pl]);
      setPlanForm({ title:"", classType:"", focus:"", json:"" });
      setShowAddPlan(false);
      if (ct) setActiveCT(ct);
    } catch (e) {
      setPlanErr(readErrorMessage(e));
    } finally { setPlanBusy(false); }
  };
  // Renaming a plan's class type moves the ONLY thing that identifies it, so the
  // shape and extracted profile keyed under the old name have to travel with it
  // — see renameClassType, which decides rename-vs-move. Personas commit first:
  // both writes are independent, and a coach who reloads between them should
  // find the profile already under the new name rather than orphaned.
  const savePlanEdit = updated => {
    const before = plans.find(pl => pl.id === updated.id);
    const next   = plans.map(pl => pl.id === updated.id ? updated : pl);
    const oldCT  = classTypeOf(before || {}), newCT = classTypeOf(updated);
    if (oldCT !== newCT && selected) {
      const after = next.filter(pl => pl.personaId === selectedId);
      const sp = renameClassType(selected.styleProfile, oldCT, newCT, after);
      if (sp !== selected.styleProfile) commitPersonas(personas.map(p => p.id === selectedId ? { ...p, styleProfile: sp } : p));
      // The ledger is keyed by the class type's NAME too, and `recentGens`
      // selects on it — so leaving these behind emptied the coach's "Recently
      // generated" list AND the repeat-avoidance it feeds the next draft.
      const gens = renameClassTypeInGenerations(generations, oldCT, newCT, after, selectedId);
      if (gens !== generations) { setGenerations(gens); store.savePersonaGenerations(gens); }
      // Follow the rename. Without this the coach is dropped on whichever tab
      // happens to be first, which on a multi-type coach is not the one they
      // were just editing.
      if (activeCT === oldCT) setActiveCT(newCT);
    }
    commitPlans(next);
    setEditingPlan(null);
    setPlanEditDraft(null);
    toast(`Saved “${updated.title || "plan"}”`);
  };
  // Closing the editor. `draft` is non-null only when there were unsaved edits;
  // an untouched close says nothing, because acknowledging a no-op is noise.
  const closePlanEditor = draft => {
    const was = editingPlan;
    setEditingPlan(null);
    setPlanEditDraft(null);
    if (!draft || !was) return;
    toast("Discarded your unsaved changes", { undo: () => {
      // Order matters only in that both land in the same commit; the editor
      // reads `initial` on mount, and it mounts when `editingPlan` becomes set.
      setPlanEditDraft(draft);
      setEditingPlan(was);
    } });
  };
  // Undo, no confirm. A plan is one row and the coach can see immediately
  // whether they hit the right one — interrupting every correct deletion to
  // guard the rare wrong one is the trade a confirm makes, and it is the wrong
  // one here. `deletePersonaPlan` routes through _bgDelete, which drops the
  // delta mark, so re-saving really does re-push rather than computing an empty
  // delta (the trap restorePersonaCascade exists for).
  const removePlan = id => {
    const before = plans;
    const title = plans.find(pl => pl.id === id)?.title;
    commitPlans(store.deletePersonaPlan(id));
    toast(title ? `Removed “${title}”` : "Plan removed", { undo: () => {
      commitPlans(before);
      toast("Plan restored");
    } });
  };

  const changeMovement = updated => {
    const list = movements.map(m => m.id === updated.id ? updated : m);
    recompute(plans, list, selectedId); // re-fold occurrences under any new alias/name
  };
  // ⚠️ Only ever reachable from the "not in any plan" list. A row with
  // occurrences is re-derived on the next recompute, which is why the main
  // catalogue offers no delete — see MovementCatalog and store.deletePersonaMovement.
  const deleteMovement = id => setMovements(store.deletePersonaMovement(id));

  const selected = personas.find(p => p.id === selectedId) || null;
  const selPlans = plans.filter(pl => pl.personaId === selectedId);
  // Class types come from two places, not one. A coach who has imported classes
  // gets them from those; a BRAND-NEW coach (D3 cold start) has named a class
  // type and picked a shape for it before importing anything, and that shape is
  // stored on the persona. Deriving from plans alone is why a new coach used to
  // see nothing but "import something first".
  const classTypes = [...new Set([
    ...classTypesOf(selPlans),
    ...Object.keys(selected?.styleProfile?.blueprints || {}),
  ])];
  const curCT = (activeCT && classTypes.includes(activeCT)) ? activeCT : (classTypes[0] || null);
  const ctPlans = selPlans.filter(pl => classTypeOf(pl) === curCT);
  const prof = curCT ? aggregateClassType(selPlans, curCT) : null;
  const category = curCT ? classCategory(selPlans, curCT) : "mixed";
  const builderClass = CATEGORY_TO_BUILDER[category] || "bootcamp";
  const recentGens = generations.filter(g => g.personaId === selectedId && g.classType === curCT);
  const ctMoves = movements.filter(m => m.personaId === selectedId && (m.classTypes?.[curCT] || 0) > 0);
  // Rows that survive only on their edits. `aggregateMovements` keeps a row with
  // no occurrences when it looks manually edited — and a DERIVED equip counts,
  // so most do — precisely so a coach who drops a movement from a plan does not
  // lose the equipment, category, aliases or cue they set on it. But `ctMoves`
  // renders only rows WITH occurrences, so until this list existed they were
  // invisible and unreachable, accumulating locally and syncing to Postgres with
  // no way to see or remove them.
  //
  // Persona-scoped, not class-type-scoped: a row with zero occurrences belongs
  // to no class type, so filing it under the current tab would be a fiction.
  const orphanMoves = movements.filter(m => m.personaId === selectedId && totalCount(m.classTypes) === 0);
  const extracted = selected?.styleProfile?.byClassType?.[curCT] || {};
  const countFor = id => plans.filter(pl => pl.personaId === id).length;

  // ── Class shape (§9.1) — the coach's format as an editable object ──────────
  // Derived from their own corpus, then reconciled with whatever they have
  // edited. The edit ALWAYS wins; a divergence rides along as `contradiction`
  // for the card to surface rather than resolve (§13 Q7).
  const derivedBp = curCT ? deriveBlueprint(selPlans, curCT, ctMoves) : null;
  const blueprint = curCT ? reconcileBlueprint(selected?.styleProfile?.blueprints?.[curCT] || null, derivedBp) : null;
  const saveBlueprint = bp => {
    if (!selectedId || !curCT) return;
    // `contradiction` is a transient view concern computed on each reconcile —
    // persisting it would freeze one moment's drift into the coach's own record.
    const { contradiction: _drop, ...clean } = bp || {};
    commitPersonas(personas.map(p => p.id === selectedId ? { ...p, styleProfile: {
      ...(p.styleProfile || {}),
      blueprints: { ...((p.styleProfile || {}).blueprints || {}), [curCT]: clean },
    } } : p));
  };
  // D3 cold start. A coach with zero classes still has to be able to run one:
  // name the class type, pick the shape it usually takes, and get a draft. This
  // writes the preset as that class type's shape and switches to it — from
  // there the screen is identical to a coach who imported a season of decks,
  // except the movement catalog is empty until they add some.
  const startClassTypeFromPreset = (preset) => {
    const name = coldCT.trim();
    if (!selectedId || !name || !preset) return;
    commitPersonas(personas.map(p => p.id === selectedId ? { ...p, styleProfile: {
      ...(p.styleProfile || {}),
      blueprints: {
        ...((p.styleProfile || {}).blueprints || {}),
        // `source: "preset"` matters: reconcileBlueprint only defends an
        // "edited" shape from re-derivation, so a preset correctly gives way
        // once the coach's own classes arrive and a real shape can be derived.
        [name]: { ...preset, source: "preset", slots: preset.slots.map(s => ({ ...s, categories: [...s.categories] })) },
      },
    } } : p));
    setActiveCT(name);
    setColdCT("");
  };

  // Deterministic drafting from the coach's shape — no model involved. The
  // structure is theirs, the movements are theirs, the selection is arithmetic
  // (§9.3). Unlike generateForCT this works with Supabase off.
  //
  // D4: a preset is an optional NAMED INTENT layered on top ("heavier day",
  // "short class"). It transforms a COPY of the shape and never the shape
  // itself — pressing "try heavier this week" must not rewrite the format the
  // coach has used for years. See generationPresets.js.
  const draftFromShape = (arg = null) => {
    if (!blueprint) return;
    // A preset, or nothing. Anything else — most plausibly a MouseEvent from a
    // handler passed bare — is treated as "no preset" rather than read for
    // fields it does not have. Cheap, and this component hands `draftFromShape`
    // straight to a Btn.
    const preset = arg && typeof arg.key === "string" && typeof arg.name === "string" ? arg : null;
    const shaped = preset ? applyPreset(blueprint, preset) : blueprint;
    const opts = preset ? presetDraftOpts(preset, { classType: curCT, recent: recentGens })
                        : { classType: curCT, recent: recentGens };
    const { blocks } = draftFromBlueprint(shaped, ctMoves, opts);
    if (!blocks.length) return;
    const label = presetDraftTitle(curCT, preset);
    setGenerations(store.appendPersonaGeneration({ personaId: selectedId, classType: curCT, category,
      title: label, focus: "", brief: {}, movements: blockMovementNames(blocks), plan: { blocks } }));
    onDraftToBuilder(planToStages({ blocks }), label, builderClass);
  };

  // Deterministic fallback: seed the Builder from the coach's most recent plan for
  // this class type. Used when the Edge Function is absent or errors.
  const draftFromRecent = () => { const src = ctPlans[0]; if (src) onDraftToBuilder(planToStages(src.plan), `${curCT} — draft`, builderClass); };
  // True in-style generation: persona-ai (task:"generate") grounded on the derived
  // profile + movement catalog + a few past plans + the brief. Falls back to
  // draftFromRecent when Supabase is off or the function errors.
  const generateForCT = async () => {
    if (!curCT || !prof) return;
    setGenErr("");
    if (!(supabaseEnabled && supabase)) { draftFromRecent(); setShowGen(false); return; }
    setGenBusy(true);
    try {
      const payload = {
        task: "generate",
        persona: { name: selected?.name || "", kind: selected?.kind || "coach" },
        classType: curCT,
        category,
        brief: {
          focus: brief.focus.trim(),
          durationMin: Number(brief.durationMin) || undefined,
          weekX: brief.weekX ? Number(brief.weekX) : undefined,
          weekN: brief.weekN ? Number(brief.weekN) : undefined,
        },
        profile: prof,
        // The coach's fixed structure (§9.3): the model fills slots, it does not
        // decide the shape of the class. NOTE: unverified — the generate path
        // needs persona-ai redeployed and cannot be exercised locally at all.
        blueprint: blueprint ? { name: blueprint.name, slots: blueprint.slots } : undefined,
        catalog: ctMoves.map(m => ({ name: m.name, equip: m.equip || "", category: categoryOf(m), aliases: m.aliases || [] })),
        examples: ctPlans.slice(0, 3).map(pl => ({ title: pl.title, focus: pl.focus || "", plan: pl.plan })),
        // Items 6–8: what's already been recommended to THIS coach for THIS class type,
        // so the model produces something meaningfully different.
        recent: generations.filter(g => g.personaId === selectedId && (g.classType || "") === curCT)
                  .slice(0, 6).map(g => ({ title: g.title, focus: g.focus, movements: (g.movements || []).slice(0, 12) })),
      };
      const { data, error } = await supabase.functions.invoke("persona-ai", { body: payload });
      if (error) throw new Error(await fnErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      const blocks = data?.plan?.blocks || [];
      if (!blocks.length) throw new Error("no blocks came back");
      const label = data.title || `${curCT}${brief.focus.trim() ? " — " + brief.focus.trim() : " — generated"}`;
      // Record the recommendation so the next generation for this coach avoids repeating it.
      setGenerations(store.appendPersonaGeneration({ personaId: selectedId, classType: curCT, category,
        title: label, focus: brief.focus.trim(), brief: payload.brief, movements: blockMovementNames(blocks), plan: { blocks } }));
      onDraftToBuilder(planToStages({ blocks }), label, builderClass);
      setShowGen(false);
    } catch (e) {
      setGenErr(`Generation failed: ${e.message || e}. Drafted from the most recent plan instead.`);
      draftFromRecent();
    } finally { setGenBusy(false); }
  };

  // ── Google Slides import (chunk 3) ────────────────────────────────────────
  // The coach's decks live in their own Drive folder: token → list the folder's
  // presentations → per-deck slide text → persona-ai task:"extract" → fold into
  // the corpus. sourceRef carries the presentation id so re-imports dedupe;
  // the folder is remembered on the persona (styleProfile syncs to Supabase).
  // Add class → Paste deck text stays as the manual fallback.
  const importedRefs = new Set(selPlans.map(pl => pl.sourceRef).filter(Boolean));
  const openSlides = () => {
    setShowSlides(s => !s);
    setSlidesErr(""); setSlideDecks(null); setDeckSel(new Set()); setSlidesProg(null);
    setSlidesFolder(selected?.styleProfile?.slidesFolder || "");
  };
  const listSlideDecks = async () => {
    setSlidesErr("");
    if (!parseDriveId(slidesFolder)) { setSlidesErr("Paste the coach's Drive folder link, a Slides deck link, or its ID."); return; }
    setSlidesBusy("list");
    try {
      const token = await getSlidesToken();
      // The pasted link may be a whole folder OR one deck — Drive tells us which.
      const target = await resolveDriveTarget(token, slidesFolder);
      const decks = target.kind === "presentation" ? [target.deck] : await listPresentations(token, target.id);
      setSlideDecks(decks);
      setDeckSel(new Set(decks.filter(d => ![...importedRefs].some(ref => ref === d.id || ref.startsWith(`${d.id}#`))).map(d => d.id)));
      if ((selected?.styleProfile?.slidesFolder || "") !== slidesFolder.trim())
        commitPersonas(personas.map(p => p.id === selectedId ? { ...p, styleProfile: { ...(p.styleProfile || {}), slidesFolder: slidesFolder.trim() } } : p));
      if (!decks.length) setSlidesErr("No Google Slides decks found in that folder.");
    } catch (e) { setSlidesErr(`Couldn't read that link: ${e.message || e}`); }
    finally { setSlidesBusy(""); }
  };
  const importSlideDecks = async () => {
    // No Supabase check up front any more: the deterministic parser handles most
    // slides with no Edge Function at all, so refusing the whole import here would
    // block work that no longer needs a server. Slides that the parser defers are
    // reported individually below if persona-ai isn't reachable.
    const canDefer = !!(supabaseEnabled && supabase);
    const chosen = (slideDecks || []).filter(d => deckSel.has(d.id));
    if (!chosen.length) { setSlidesErr("Select at least one deck to import."); return; }
    setSlidesErr(""); setSlidesBusy("import");
    const added = []; const failed = []; let skipped = 0; let parsedCount = 0;
    try {
      const token = await getSlidesToken();
      // A deck often holds a whole HISTORY of classes — one class per slide. Pull each
      // deck's text, split it into per-slide class plans, and extract each slide on its
      // own (the extractor handles ONE class at a time; a whole multi-class deck returns
      // no usable plan). Per-slide sourceRef ("<deckId>#s<N>") dedupes at the slide level.
      const units = [];
      for (const d of chosen) {
        let text = "";
        try { ({ text } = await fetchPresentationText(token, d.id)); }
        catch (e) { failed.push(`${d.name} — ${e.message || e}`); continue; }
        const slides = splitDeckSlides(text);
        console.log(`[slides-import] "${d.name}" — ${text.trim().length} chars, ${slides.length} slide(s)`);
        if (!text.trim()) { failed.push(`${d.name} — no readable text (deck may be image-based; the Slides API can't read words inside pictures)`); continue; }
        for (const s of slides) {
          const ref = slides.length > 1 ? `${d.id}#s${s.n}` : d.id;
          units.push({ deck: d, n: s.n, multi: slides.length > 1, text: s.text, ref, date: slideDate(s.text) });
        }
      }
      // Drop already-imported slides, then drop the ones that plainly aren't classes
      // (title cards, hype quotes, playlists) — those used to cost a full LLM call each
      // just to return zero blocks, and the free tier is metered per REQUEST.
      const unseen = units.filter(u => !importedRefs.has(u.ref));
      const classy = unseen.filter(u => looksLikeClassSlide(u.text));
      skipped += unseen.length - classy.length;

      // Turn a plan payload from either path into the corpus row shape.
      const rowFor = (u, data, via = "llm", conf = 0) => ({
        // "google_slides", not "slides" — persona_plans' CHECK constraint allows only
        // google_slides | manual | jungle, and the wrong value made every imported
        // plan fail to sync, then vanish on the next hydrate. See store.planSource.
        id: store.newId(), personaId: selectedId, source: "google_slides", sourceRef: u.ref,
        title: data.title || `${u.deck.name}${u.multi ? ` (slide ${u.n})` : ""}`,
        classType: (data.classType || "").trim(), focus: data.focus || "",
        planDate: u.date || (u.deck.modifiedTime || "").slice(0, 10),
        plan: { blocks: data.plan.blocks, _extract: extractMeta(via, conf) },
      });
      // Persist what's extracted so far. A long import used to hold everything in
      // memory until the very end — closing the tab at slide 15 of 18 lost the lot.
      const flush = () => { if (added.length) commitPlans([...plans, ...added]); };

      // ── DETERMINISTIC PASS (spec §4.3.1 / infra I2) ─────────────────────────
      // These decks are HOUSE FORMATS: S360, GC and Enduro repeat the same private
      // notation every week. Parse each slide locally first and only send what the
      // parser could NOT confidently read to Gemini. Every slide that parses here
      // costs zero quota, returns instantly, and — the point — is REPRODUCIBLE:
      // re-importing a deck yields byte-identical output, so the derived style
      // profile can no longer drift just because the model felt different today.
      //
      // The parser defers rather than guessing, so a low score means "ask the
      // model", never "emit a half-understood plan".
      // Per-coach hints (§4.3.2): this coach's OWN corpus — their movement
      // vocabulary, class types and block labels — is evidence about their
      // notation, so slides the generic rules would defer can often be read for
      // free. The share grows with every import, which is what makes the model a
      // cold-start tool rather than the steady-state engine.
      const hints = deriveHints(plans.filter(pl => pl.personaId === selectedId),
                                movements.filter(m => m.personaId === selectedId));
      const todo = [];
      for (const u of classy) {
        const p = parsePlanText(u.text, { classTypeHint: "", title: u.deck.name, hints,
                                          blueprints: selected?.styleProfile?.blueprints || null });
        if (p.confidence >= PARSE_THRESHOLD && p.plan.blocks.length) {
          added.push(rowFor(u, p, "parser", p.confidence));
          parsedCount++;
        } else {
          todo.push(u);
        }
      }
      if (parsedCount) {
        console.log(`[slides-import] parsed ${parsedCount}/${classy.length} slide(s) locally — ${todo.length} deferred to persona-ai`);
        flush();        // crash-safe: the free slides are already banked
      }
      // Deferred slides with nowhere to defer to. Report them rather than dropping
      // them silently — an unimported slide the coach never hears about is the same
      // class of bug as a plan that syncs into the void.
      if (todo.length && !canDefer) {
        failed.push(`${todo.length} class${todo.length===1?"":"es"} couldn't be read automatically. Open ${todo.length===1?"it":"them"} in Slides, copy the text, and use Add class → Paste class text.`);
        todo.length = 0;
      }
      // Batch WITHIN a deck: slide numbers and the deck title hint are per-deck.
      const batches = [];
      for (const d of chosen) {
        const mine = todo.filter(u => u.deck.id === d.id);
        for (let i = 0; i < mine.length; i += SLIDE_BATCH) batches.push({ deck: d, units: mine.slice(i, i + SLIDE_BATCH) });
      }

      // One call per batch, falling back to one call per slide if the batch fails —
      // so batching is a quota optimisation that can never cost us an import.
      const extractOne = async (u) => {
        const { data, error } = await supabase.functions.invoke("persona-ai", { body: { task: "extract", text: u.text.slice(0, 120000), title: u.deck.name } });
        if (error) throw new Error(await fnErrorMessage(error));
        if (data?.error) throw new Error(data.error);
        return (data?.plan?.blocks || []).length ? [{ u, data }] : [];
      };
      const extractBatch = async (b) => {
        if (b.units.length === 1) return extractOne(b.units[0]);
        const { data, error } = await supabase.functions.invoke("persona-ai", { body: {
          task: "extract_batch", title: b.deck.name,
          slides: b.units.map(u => ({ n: u.n, text: u.text.slice(0, 120000) })),
        } });
        if (error) throw new Error(await fnErrorMessage(error));
        if (data?.error) throw new Error(data.error);
        if (!Array.isArray(data?.plans)) throw new Error("batch response had no plans array");
        // Map each returned plan back to its slide by number.
        return data.plans.map(p => { const u = b.units.find(x => x.n === p.n); return u ? { u, data: p } : null; }).filter(Boolean);
      };

      let done = 0;
      outer:
      for (let bi = 0; bi < batches.length; bi++) {
        const b = batches[bi];
        const label = b.units.length > 1
          ? `${b.deck.name} · slides ${b.units[0].n}–${b.units[b.units.length - 1].n}`
          : (b.units[0].multi ? `${b.deck.name} · slide ${b.units[0].n}` : b.deck.name);
        setSlidesProg({ done, total: todo.length, current: label });

        let got = null;
        for (let attempt = 0; ; attempt++) {
          try { got = await extractBatch(b); break; }
          catch (e) {
            const msg = e?.message || String(e);
            // Daily cap: every remaining call fails the same way. Stop the whole import
            // now and say so, instead of burning ~3 min of pointless waiting per batch.
            if (DAILY_QUOTA_GONE.test(msg)) {
              failed.push(`free Gemini DAILY quota is exhausted — it resets around midnight US Pacific. ${added.length} plan${added.length === 1 ? "" : "s"} imported before it ran out; re-run the import after the reset and already-imported slides will be skipped automatically`);
              break outer;
            }
            if (RATE_LIMITED.test(msg) && attempt < 6) {
              const wait = (retryAfterSecs(msg) || 30) + 2;
              setSlidesProg({ done, total: todo.length, current: `${label} — free-tier limit, waiting ${wait}s…`, waiting: true });
              await new Promise(r => setTimeout(r, wait * 1000));
              continue;
            }
            // The batch itself failed (bad JSON, truncation, a model hiccup). Retry the
            // slides one at a time so one awkward slide can't sink its four neighbours.
            if (b.units.length > 1) {
              for (const u of b.units) {
                try { const r = await extractOne(u); r.length ? added.push(rowFor(u, r[0].data)) : skipped++; }
                catch (e2) { failed.push(`${b.deck.name} s${u.n} — ${e2?.message || e2}`); }
                await new Promise(r => setTimeout(r, 800));
              }
              got = null;
            } else {
              failed.push(`${b.deck.name}${b.units[0].multi ? ` s${b.units[0].n}` : ""} — ${msg}`);
              got = [];
            }
            break;
          }
        }
        if (got) {
          got.forEach(({ u, data }) => added.push(rowFor(u, data)));
          skipped += b.units.length - got.length;   // slides the model found no workout on
        }
        done += b.units.length;
        flush();                                    // crash-safe: persist each batch
        if (bi < batches.length - 1) await new Promise(r => setTimeout(r, 800)); // gentle pace
      }
    } catch (e) { failed.push(`${e.message || e}`); }
    setSlidesProg(null); setSlidesBusy("");
    if (added.length) {
      commitPlans([...plans, ...added]);
      const ct = added.find(pl => pl.classType)?.classType;
      if (ct) setActiveCT(ct);
      setDeckSel(new Set());
    }
    const skipNote = skipped ? `, skipped ${skipped} non-class slide${skipped === 1 ? "" : "s"}` : "";
    // Report the split. It is the honest accounting of what this import actually
    // cost — and the only place a coach can see that most of their deck was read
    // for free, reproducibly, without a model in the loop.
    const aiCount = added.length - parsedCount;
    const viaNote = parsedCount
      ? ` (${parsedCount} read by the built-in parser${aiCount > 0 ? `, ${aiCount} by AI` : ""}, no AI quota used${aiCount > 0 ? " on those" : ""})`
      : "";
    if (failed.length) setSlidesErr(`Imported ${added.length} plan${added.length === 1 ? "" : "s"}${skipNote}${viaNote}. Failed: ${failed.join(" · ")}`);
    else if (added.length) { setSlidesErr(`Imported ${added.length} plan${added.length === 1 ? "" : "s"}${skipNote}${viaNote}.`); setShowSlides(false); }
    else setSlidesErr(`Nothing imported${skipNote || " — no class plans found in the selected deck(s)"}.`);
  };

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{flexShrink:0,padding:isMobile?"14px 16px":"20px 28px",borderBottom:`1px solid var(--border)`,display:"flex",alignItems:"center",gap:"12px"}}>
        <button onClick={onBack} aria-label="Back" data-tap style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",alignItems:"center"}}><ArrowLeft size={18}/></button>
        <div style={{flex:1,minWidth:0}}>
          <p style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:"2px"}}>COACHES</p>
          <p style={{fontSize:"12px",color:"var(--muted)"}}>Every coach's classes, style and formats — Jungle learns them and drafts new classes to match</p>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:isMobile?"16px":"24px 28px"}}>
        {/* A failed plan sync used to be console-only, so the corpus could silently
            stop persisting. Say it out loud — the plans are safe locally, but the
            coach needs to know they only exist on this device. */}
        {planSyncErr && (
          <div style={{maxWidth:"1200px",margin:"0 auto 16px",padding:"10px 14px",borderRadius:"8px",
                       border:"1px solid #F59E0B55",background:"#F59E0B14",fontSize:"12px",color:"var(--text)",lineHeight:"1.5"}}>
            <strong>These plans haven’t synced to your account yet.</strong> They’re saved on this
            device and Jungle will keep retrying, so nothing is lost — but they won’t appear on
            another device until the sync succeeds. <span style={{color:"var(--muted)"}}>({planSyncErr.msg})</span>
          </div>
        )}
        <div style={{maxWidth:"1200px",margin:"0 auto",display:"grid",gridTemplateColumns:isTablet?"1fr":"320px 1fr",gap:"20px",alignItems:"start"}}>

          {/* ── Left: create + persona list ─────────────────────────────── */}
          <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
            <div style={{...P_CARD,padding:"16px"}}>
              <p style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"10px"}}>Add a coach</p>
              <Input placeholder="Name — e.g. Coach Mike" value={form.name}
                     onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={{marginBottom:"8px"}}/>
              <Select value={form.kind} aria-label="What kind of coach profile this is" onChange={e=>setForm(f=>({...f,kind:e.target.value}))} style={{marginBottom:"8px"}}>
                {store.PERSONA_KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </Select>
              <Input placeholder="Description (optional)" value={form.description}
                     onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={{marginBottom:"10px"}}/>
              <Btn onClick={createPersona} style={{width:"100%",justifyContent:"center"}}><Plus size={14}/> Add coach</Btn>
            </div>

            {personas.length === 0 ? (
              <div style={{...P_CARD,padding:"16px",textAlign:"center"}}>
                <p style={{fontSize:"12px",color:"var(--muted)",lineHeight:"1.6",marginBottom:"12px"}}>No coaches yet. Add one above, or load a sample coach to see how it works.</p>
                <Btn variant="ghost" onClick={seedSample} style={{width:"100%",justifyContent:"center"}}><Zap size={14}/> Load sample coach</Btn>
              </div>
            ) : (
              <div style={{...P_CARD,overflow:"hidden"}}>
                {personas.map(p => {
                  const on = p.id === selectedId;
                  return (
                    <div key={p.id} onClick={()=>{setSelectedId(p.id);setActiveCT(null);setEditHead(false);}}
                      style={{display:"flex",alignItems:"center",gap:"10px",padding:"12px 14px",cursor:"pointer",
                              borderBottom:"1px solid var(--border)",
                              background:on?"color-mix(in srgb, var(--accent) 10%, transparent)":"transparent"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:"13px",fontWeight:on?"700":"600",color:on?"var(--accent)":"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                        <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>
                          <span style={{color:KIND_COLOR[p.kind]||"var(--muted)",fontWeight:"700",textTransform:"uppercase",letterSpacing:"0.5px"}}>{KIND_LABEL[p.kind]||p.kind}</span>
                          {"  ·  "}{countFor(p.id)} class{countFor(p.id)===1?"":"es"}
                        </div>
                      </div>
                      {/* `aria-label`, not `title`: a title is last-resort in the
                          name computation and never reaches a touch device, so this
                          announced as a bare "button" — on a control that deletes a
                          coach and everything extracted from their decks. */}
                      <button onClick={e=>{e.stopPropagation();removePersona(p.id);}} aria-label={`Delete coach ${p.name}`} title="Delete persona"
                        style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",padding:"4px"}}><Trash2 size={14}/></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right: selected coach detail ────────────────────────────── */}
          {!selected ? (
            <div style={{...P_CARD,padding:"40px 24px",textAlign:"center",color:"var(--muted)"}}>
              <Users size={28} style={{opacity:0.5,marginBottom:"10px"}}/>
              <p style={{fontSize:"13px"}}>Pick a coach to see their class types and classes.</p>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
              {/* Persona head (editable) */}
              <div style={{...P_CARD,padding:"18px 20px"}}>
                {editHead ? (
                  <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                    <Input value={headForm.name} onChange={e=>setHeadForm(f=>({...f,name:e.target.value}))} placeholder="Persona name"/>
                    <Input value={headForm.description} onChange={e=>setHeadForm(f=>({...f,description:e.target.value}))} placeholder="Description"/>
                    <div style={{display:"flex",gap:"8px"}}><Btn onClick={saveHead}><Check size={14}/> Save</Btn><Btn variant="ghost" onClick={()=>setEditHead(false)}>Cancel</Btn></div>
                  </div>
                ) : (
                  <div style={{display:"flex",alignItems:"flex-start",gap:"10px"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"6px"}}>
                        <h2 style={{fontSize:"20px",fontWeight:"800",color:"var(--text)",margin:0}}>{selected.name}</h2>
                        <Tag color={KIND_COLOR[selected.kind]||"var(--navy)"}>{KIND_LABEL[selected.kind]||selected.kind}</Tag>
                      </div>
                      {selected.description && <p style={{fontSize:"13px",color:"var(--muted)",lineHeight:"1.6"}}>{selected.description}</p>}
                    </div>
                    <button onClick={()=>{setHeadForm({name:selected.name,description:selected.description||""});setEditHead(true);}}
                      style={{background:"none",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"12px",fontWeight:"600",padding:"5px 10px"}}>Edit</button>
                  </div>
                )}
                <div style={{display:"flex",alignItems:"center",gap:"10px",marginTop:"14px",flexWrap:"wrap"}}>
                  <Btn variant="ghost" onClick={()=>setShowAddPlan(s=>!s)} style={{padding:"6px 12px"}}><Plus size={13}/> Add class</Btn>
                  <button onClick={openSlides} style={{display:"inline-flex",alignItems:"center",gap:"6px",background:"transparent",border:`1px solid ${showSlides?"var(--accent)":"var(--border)"}`,borderRadius:"6px",cursor:"pointer",color:showSlides?"var(--accent)":"var(--muted)",fontSize:"12px",fontWeight:"600",padding:"6px 12px"}}><Upload size={13}/> Import from Google Slides</button>
                </div>
                {showSlides && (!slidesEnabled ? (
                  <p style={{fontSize:"12px",color:"var(--muted)",marginTop:"10px",lineHeight:"1.6",background:"var(--navy)",borderRadius:"8px",padding:"10px 12px"}}>Google Slides import isn't switched on for this version of Jungle. Use <b>Add class → Paste class text</b> instead — copy the text from your slides and paste it in.</p>
                ) : (
                  <div style={{marginTop:"12px",padding:"14px",background:"var(--navy)",borderRadius:"10px",border:"1px solid var(--border)"}}>
                    <p style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:"8px"}}>Import from this coach's Google Slides</p>
                    <div style={{display:"flex",gap:"8px",flexWrap:isMobile?"wrap":"nowrap"}}>
                      <Input placeholder="Drive folder link or a single deck link — drive.google.com/drive/folders/… or docs.google.com/presentation/d/…" value={slidesFolder}
                             onChange={e=>setSlidesFolder(e.target.value)} style={{flex:"1 1 240px"}}/>
                      <Btn onClick={listSlideDecks} disabled={!!slidesBusy} style={{flexShrink:0}}>
                        {slidesBusy==="list" ? <Loader size={14} style={{animation:"spin 1s linear infinite"}}/> : <Search size={14}/>} {slidesBusy==="list" ? "Listing…" : "List decks"}
                      </Btn>
                    </div>
                    {slideDecks && slideDecks.length > 0 && (
                      <div style={{marginTop:"10px"}}>
                        <div style={{maxHeight:"220px",overflowY:"auto",border:"1px solid var(--border)",borderRadius:"8px",background:"var(--bg)"}}>
                          {slideDecks.map(d => {
                            const done = importedRefs.has(d.id);
                            const on = deckSel.has(d.id);
                            return (
                              <label key={d.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"8px 12px",borderBottom:"1px solid var(--border)",cursor:"pointer",opacity:done&&!on?0.55:1}}>
                                <input type="checkbox" checked={on} disabled={slidesBusy==="import"}
                                  onChange={()=>setDeckSel(s=>{const n=new Set(s); if(n.has(d.id)) n.delete(d.id); else n.add(d.id); return n;})}/>
                                <span style={{flex:1,minWidth:0,fontSize:"12px",color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.name}</span>
                                {done && <Tag color="var(--navy)">imported</Tag>}
                                <span style={{fontSize:"11px",color:"var(--muted)",flexShrink:0}}>{(d.modifiedTime||"").slice(0,10)}</span>
                              </label>
                            );
                          })}
                        </div>
                        <div style={{display:"flex",gap:"8px",marginTop:"10px",alignItems:"center",flexWrap:"wrap"}}>
                          <Btn onClick={importSlideDecks} disabled={!!slidesBusy || deckSel.size===0}>
                            {slidesBusy==="import" ? <Loader size={14} style={{animation:"spin 1s linear infinite"}}/> : <Zap size={14}/>}
                            {slidesBusy==="import" && slidesProg ? ` Reading class ${slidesProg.done+1} of ${slidesProg.total}…` : ` Import ${deckSel.size} deck${deckSel.size===1?"":"s"}`}
                          </Btn>
                          {slidesBusy==="import" && slidesProg && <span style={{fontSize:"11px",color:"var(--muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"260px"}}>{slidesProg.current}</span>}
                        </div>
                      </div>
                    )}
                    {slidesErr && <p style={{fontSize:"12px",color:"var(--accent)",margin:"8px 0 0",lineHeight:"1.5"}}>{slidesErr}</p>}
                    <p style={{fontSize:"11px",color:"var(--muted)",marginTop:"8px",lineHeight:"1.5"}}>Jungle reads each deck from Google Slides (view-only — nothing is changed) and turns it into classes. Decks you've already brought in are skipped.</p>
                  </div>
                ))}
              </div>

              {showAddPlan && (
                <div style={{...P_CARD,padding:"16px",background:"var(--navy)"}}>
                  <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
                    {[["text","Paste class text"],["json","Paste JSON"]].map(([m,lbl]) => {
                      const on = planMode === m;
                      return (
                        <button key={m} onClick={()=>{setPlanMode(m);setPlanErr("");}} style={{
                          padding:"5px 12px",borderRadius:"7px",cursor:"pointer",fontSize:"12px",fontWeight:on?"700":"600",
                          border:`1px solid ${on?"var(--accent)":"var(--border)"}`,
                          background:on?"color-mix(in srgb, var(--accent) 13%, transparent)":"transparent",
                          color:on?"var(--accent)":"var(--muted)"}}>{lbl}</button>
                      );
                    })}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr 1fr",gap:"8px",marginBottom:"8px"}}>
                    <Input placeholder="Title (optional)" value={planForm.title} onChange={e=>setPlanForm(f=>({...f,title:e.target.value}))}/>
                    <Input placeholder="Class type (S360…)" value={planForm.classType} onChange={e=>setPlanForm(f=>({...f,classType:e.target.value}))}/>
                    <Input placeholder="Focus (optional)" value={planForm.focus} onChange={e=>setPlanForm(f=>({...f,focus:e.target.value}))}/>
                  </div>
                  <textarea placeholder={planMode==="text"
                    ? "Paste the class as text — Jungle reads the exercises, sets and reps for you."
                    : 'For developers: paste a class object — { "blocks": [ { "label":"…", "role":"primary_lift", "scheme":{…}, "exercises":[…] } ] }'}
                    value={planForm.json} onChange={e=>setPlanForm(f=>({...f,json:e.target.value}))}
                    style={{width:"100%",boxSizing:"border-box",minHeight:"120px",padding:"10px 12px",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:"8px",color:"var(--text)",fontSize:"12px",fontFamily:planMode==="json"?"monospace":"inherit",outline:"none",resize:"vertical"}}/>
                  {planErr && <p style={{fontSize:"12px",color:"var(--accent)",margin:"8px 0 0"}}>{planErr}</p>}
                  <div style={{display:"flex",gap:"8px",marginTop:"10px",alignItems:"center"}}>
                    {planMode==="text"
                      ? <Btn onClick={extractAndAdd} disabled={planBusy}>{planBusy ? <Loader size={14} style={{animation:"spin 1s linear infinite"}}/> : <Zap size={14}/>} {planBusy ? "Reading…" : "Read this class"}</Btn>
                      : <Btn onClick={addPlan}><Check size={14}/> Save class</Btn>}
                    <Btn variant="ghost" onClick={()=>{setShowAddPlan(false);setPlanErr("");}}>Cancel</Btn>
                  </div>
                </div>
              )}

              {classTypes.length === 0 ? (
                /* D3 cold start. This screen used to be a dead end that told a
                   new coach to go and import something — at exactly the moment
                   they are deciding whether this product is for them. Now they
                   can name the class they teach, pick the shape it takes, and
                   have a draft in the Builder before importing anything. */
                <div style={{...P_CARD,padding:"22px 24px"}}>
                  <p style={{fontSize:"14px",fontWeight:"700",color:"var(--text)",marginBottom:"4px"}}>Start with a class this coach teaches</p>
                  <p style={{fontSize:"12px",color:"var(--muted)",lineHeight:"1.6",marginBottom:"14px"}}>
                    Name it however they do — S360, Engine, Saturday Grind. Then pick the shape it usually takes.
                    You can change every part of it afterwards, and it will reshape itself once their real classes come in.
                  </p>
                  <Input placeholder="Class type — e.g. S360" value={coldCT}
                         onChange={e=>setColdCT(e.target.value)} style={{marginBottom:"12px",maxWidth:"320px"}}/>
                  <div style={{display:"flex",gap:"10px",flexWrap:"wrap"}}>
                    {BLUEPRINT_PRESETS.map(p => (
                      <button key={p.name} onClick={()=>startClassTypeFromPreset(p)} disabled={!coldCT.trim()}
                        title={coldCT.trim() ? `Use the ${p.name} shape for ${coldCT.trim()}` : "Name the class type first"}
                        style={{textAlign:"left",padding:"12px 14px",borderRadius:"10px",border:"1px solid var(--border)",
                                background:"var(--navy)",cursor:coldCT.trim()?"pointer":"not-allowed",
                                opacity:coldCT.trim()?1:0.5,maxWidth:"260px"}}>
                        <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"3px"}}>{p.name}</div>
                        <div style={{fontSize:"11px",color:"var(--muted)",lineHeight:"1.4"}}>{shapeChips(p.slots)}</div>
                      </button>
                    ))}
                  </div>
                  <p style={{fontSize:"11px",color:"var(--muted)",marginTop:"14px",lineHeight:"1.5"}}>
                    Already have their classes written down? <b>Add class</b> reads them straight in, and Jungle learns the real shape from those instead.
                  </p>
                </div>
              ) : (
                <>
                  {/* Class-type tabs */}
                  <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                    {classTypes.map(ct => {
                      const on = ct === curCT;
                      const n = selPlans.filter(pl => classTypeOf(pl) === ct).length;
                      return (
                        <button key={ct} onClick={()=>setActiveCT(ct)} style={{
                          padding:"7px 14px",borderRadius:"8px",cursor:"pointer",fontSize:"13px",fontWeight:on?"700":"600",
                          border:`1px solid ${on?"var(--accent)":"var(--border)"}`,
                          background:on?"color-mix(in srgb, var(--accent) 13%, transparent)":"var(--card)",
                          color:on?"var(--accent)":"var(--text)"}}>{ct} <span style={{opacity:0.6,fontWeight:"600"}}>· {n}</span></button>
                      );
                    })}
                  </div>

                  {/* Class-type profile */}
                  <div style={{...P_CARD,padding:"18px 20px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px",gap:"12px",flexWrap:"wrap"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
                        <p style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px"}}>{curCT} — learned style <span style={{color:"var(--text)"}}>· {prof.planCount} class{prof.planCount===1?"":"es"}</span></p>
                        <Tag color={category==="strength"?"var(--accent)":"#8B5CF6"}>{CLASS_CATEGORY_LABEL[category]}</Tag>
                        <span style={{fontSize:"11px",color:"var(--muted)"}}>Drafts as: <b style={{color:"var(--text)"}}>{getLibrary()[builderClass]?.label||builderClass}</b></span>
                      </div>
                      <Btn onClick={()=>{setGenErr("");setShowGen(s=>!s);}} style={{padding:"7px 14px"}}><Zap size={14}/> Generate draft</Btn>
                    </div>
                    {showGen && (
                      <div data-testid="gen-panel" style={{marginBottom:"14px",padding:"14px",background:"var(--navy)",borderRadius:"10px",border:"1px solid var(--border)"}}>
                        {/* D4 — pick, never prompt (§9.3). Each card drafts on
                            the spot from the coach's own shape and movements:
                            no model, no network, and the same click twice gives
                            the same class. The effect line under each name is
                            what this asks the coach to trust — a preset that
                            cannot say what it changes is a prompt with a nicer
                            name. Only shown when there IS a shape to transform;
                            without one there is nothing honest to promise. */}
                        {blueprint && (
                          <>
                            <p style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:"8px"}}>New {curCT} class — pick one</p>
                            <div data-testid="gen-presets" style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(190px,1fr))",gap:"8px",marginBottom:"12px"}}>
                              {GENERATION_PRESETS.map(p => {
                                const effect = describePresetEffect(p, blueprint);
                                return (
                                  <button key={p.key} onClick={()=>draftFromShape(p)}
                                    style={{textAlign:"left",padding:"11px 13px",borderRadius:"9px",border:"1px solid var(--border)",
                                            background:"var(--card)",cursor:"pointer"}}>
                                    <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"3px"}}>{p.name}</div>
                                    <div style={{fontSize:"11px",color:"var(--muted)",lineHeight:"1.45"}}>{p.body}</div>
                                    {effect && <div style={{fontSize:"10px",fontWeight:"700",color:"var(--accent)",marginTop:"5px",letterSpacing:"0.3px"}}>{effect}</div>}
                                  </button>
                                );
                              })}
                            </div>
                            {ctMoves.length === 0 && (
                              <p style={{fontSize:"11px",color:"#E0B85B",marginBottom:"10px",lineHeight:"1.5"}}>
                                No movements saved for {curCT} yet, so these open the class named and timed with the sections empty — ready to fill from the Library.
                              </p>
                            )}
                          </>
                        )}

                        {/* The written brief survives, demoted. It is the only
                            way to ask for something the presets do not cover,
                            and it is the path that needs the model — so it is no
                            longer what a coach meets first. */}
                        <details>
                          <summary style={{cursor:"pointer",fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:"8px"}}>
                            {blueprint ? "…or write a brief" : `New ${curCT} class — brief`}
                          </summary>
                          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"2fr 1fr",gap:"8px",margin:"8px 0"}}>
                            <Input placeholder="Focus — e.g. Deadlift · Engine · Upper hypertrophy" value={brief.focus} onChange={e=>setBrief(b=>({...b,focus:e.target.value}))}/>
                            <Input placeholder="Duration (min)" type="number" value={brief.durationMin} onChange={e=>setBrief(b=>({...b,durationMin:e.target.value}))}/>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                            <Input placeholder="Week X (periodized, optional)" type="number" value={brief.weekX} onChange={e=>setBrief(b=>({...b,weekX:e.target.value}))}/>
                            <Input placeholder="of N weeks (optional)" type="number" value={brief.weekN} onChange={e=>setBrief(b=>({...b,weekN:e.target.value}))}/>
                          </div>
                          <div style={{display:"flex",gap:"8px",marginTop:"10px",alignItems:"center",flexWrap:"wrap"}}>
                            <Btn onClick={generateForCT} disabled={genBusy}>{genBusy ? <Loader size={14} style={{animation:"spin 1s linear infinite"}}/> : <Zap size={14}/>} {genBusy ? "Generating…" : "Generate in style"}</Btn>
                            <Btn variant="ghost" onClick={draftFromRecent}><Layers size={13}/> Draft from recent</Btn>
                          </div>
                          <p style={{fontSize:"11px",color:"var(--muted)",marginTop:"8px",lineHeight:"1.5"}}>Grounded on this coach's {curCT} structure, schemes and movement vocabulary. Opens as an editable draft in the Builder.</p>
                        </details>
                        {genErr && <p style={{fontSize:"12px",color:"var(--accent)",margin:"8px 0 0"}}>{genErr}</p>}
                      </div>
                    )}
                    <PersonaProfilePanel prof={prof} extracted={extracted}/>
                    {recentGens.length > 0 && (
                      <div style={{marginTop:"14px",paddingTop:"14px",borderTop:"1px solid var(--border)"}}>
                        <p style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:"8px"}}>Recently generated · {recentGens.length}</p>
                        <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                          {recentGens.slice(0,4).map(g => (
                            <div key={g.id} style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"12px"}}>
                              <span style={{flex:1,minWidth:0,color:"var(--text)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{g.title}</span>
                              <span style={{color:"var(--muted)",fontSize:"11px",flexShrink:0}}>{g.createdAt ? new Date(g.createdAt).toLocaleDateString() : ""}</span>
                              <button onClick={()=>onDraftToBuilder(planToStages(g.plan), g.title, builderClass)} title="Re-open this draft in the Builder" style={{background:"none",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"11px",fontWeight:"600",padding:"3px 8px",flexShrink:0}}>Reopen</button>
                            </div>
                          ))}
                        </div>
                        <p style={{fontSize:"10px",color:"var(--muted)",marginTop:"8px",lineHeight:"1.5"}}>New generations are steered to differ from these.</p>
                      </div>
                    )}
                  </div>

                  {/* Class shape — the coach's format, editable (§9.1) */}
                  {/* Draftable whenever there IS a shape, not only once the
                      catalog has movements. A brand-new coach's draft is the
                      shape with empty slots — the class skeleton, named and
                      timed, ready to fill from the Library one click away.
                      Gating this on movements is what made D3 a dead end: the
                      preset could be picked and then did nothing. */}
                  <ClassShapeCard blueprint={blueprint} classType={curCT} onSave={saveBlueprint}
                                  onDraft={draftFromShape} draftable={!!blueprint}
                                  emptyCatalog={ctMoves.length === 0}/>

                  {/* Movement catalog */}
                  <div style={{...P_CARD,padding:"18px 20px"}}>
                    <p style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"6px"}}>Movements <span style={{color:"var(--text)"}}>· {ctMoves.length}</span>{(() => { const n = ctMoves.filter(m=>!(m.equip&&m.equip.trim())).length; return n>0 ? <span style={{color:"#E0B85B"}}> · {n} need equipment</span> : null; })()}</p>
                    <p style={{fontSize:"11px",color:"var(--muted)",marginBottom:"12px"}}>Aggregated from this coach's {curCT} plans. Editable — rename to merge variants, set equipment. Counts &amp; scheme are derived, and so is membership: a movement leaves this list by leaving the plans that use it.</p>
                    <MovementCatalog movements={ctMoves} classType={curCT} onChange={changeMovement}/>
                  </div>

                  {/* Movements kept only by their edits. Its own card, not a
                      section of the one above: that card is scoped to a class
                      type and these rows belong to none. */}
                  {orphanMoves.length > 0 && (
                    <div style={{...P_CARD,padding:"18px 20px"}}>
                      <p style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"6px"}}>Not in any plan <span style={{color:"var(--text)"}}>· {orphanMoves.length}</span></p>
                      <p style={{fontSize:"11px",color:"var(--muted)",marginBottom:"12px"}}>Kept because they carry your edits — equipment, a kind, an alias or a cue. Nothing in this coach's plans uses them now, so nothing will bring them back and Jungle won't draft them. Delete one if you don't want it kept.</p>
                      <OrphanedMovements movements={orphanMoves} onDelete={deleteMovement}/>
                    </div>
                  )}

                  {/* Plans for this class type */}
                  <div style={{...P_CARD,padding:"18px 20px"}}>
                    <p style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"12px"}}>{curCT} classes <span style={{color:"var(--text)"}}>· {ctPlans.length}</span></p>
                    {ctPlans.map(pl => {
                      const nBlocks = (pl.plan?.blocks || []).length;
                      return (
                        <div key={pl.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"12px 0",borderTop:"1px solid var(--border)"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)"}}>{pl.title}</div>
                            {/* "blocks" is our word, not a coach's (UI-UX §4). */}
                            <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>{[pl.focus].filter(Boolean).join(" · ")}{pl.focus?"  ·  ":""}{nBlocks} section{nBlocks===1?"":"s"} · {SOURCE_LABEL[pl.source] || pl.source}</div>
                          </div>
                          {/* Thirteen buttons on this screen read "Edit" to a screen
                              reader — one per movement, one per plan, one for the
                              header. The plan's title is what tells them apart. */}
                          <button onClick={()=>setEditingPlan(pl)} aria-label={`Edit plan ${pl.title}`} style={{background:"none",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"12px",fontWeight:"600",padding:"5px 10px"}}>Edit</button>
                          <Btn variant="ghost" onClick={()=>onDraftToBuilder(planToStages(pl.plan), pl.title, builderClass)} aria-label={`Draft ${pl.title} into the Builder`} style={{padding:"6px 12px"}}><Layers size={13}/> Draft</Btn>
                          <button onClick={()=>removePlan(pl.id)} aria-label={`Remove plan ${pl.title}`} title="Remove plan" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",padding:"4px"}}><Trash2 size={14}/></button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {editingPlan && <PersonaPlanEditor plan={editingPlan} initial={planEditDraft} onSave={savePlanEdit} onClose={closePlanEditor}/>}
    </div>
  );
}

// Per-class-type derived profile: structure skeleton, scheme mix, defaults, plus
// the qualitative conventions/vocabulary carried from LLM extraction.
function PersonaProfilePanel({ prof, extracted }) {
  const chips = (label, arr) => (Array.isArray(arr) && arr.length) ? (
    <div style={{marginBottom:"12px"}}>
      <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",marginBottom:"6px"}}>{label}</div>
      <div>{arr.map((x,i)=><span key={i} style={P_CHIP}>{x}</span>)}</div>
    </div>
  ) : null;
  const restEntries = Object.entries(prof.defaults?.restByRole || {});
  return (
    <div>
      {/* "FOCUS" + value ran together as "FOCUSstrength" — the all-caps label
          needs to read as a label, so it gets a colon and real spacing. */}
      {extracted.focus && <div style={{marginBottom:"12px"}}><span style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",marginRight:"8px"}}>Focus:</span><span style={{fontSize:"13px",fontWeight:"700",color:"var(--accent)",textTransform:"capitalize"}}>{extracted.focus}</span></div>}
      {prof.structure?.length ? (
        <div style={{marginBottom:"12px"}}>
          <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",marginBottom:"6px"}}>Structure</div>
          <div>{prof.structure.map((s,i)=><span key={i} style={P_CHIP}>{ROLE_LABEL[s.role]||s.role} <span style={{opacity:0.6}}>×{s.plans}</span></span>)}</div>
        </div>
      ) : null}
      {prof.schemes?.length ? (
        <div style={{marginBottom:"12px"}}>
          <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",marginBottom:"6px"}}>Schemes</div>
          <div>{prof.schemes.map((s,i)=><span key={i} style={P_CHIP}>{schemeTypeLabel(s.type)} <span style={{opacity:0.6}}>×{s.count}</span></span>)}</div>
        </div>
      ) : null}
      {chips("Conventions", extracted.conventions)}
      {chips("Vocabulary", extracted.vocabulary)}
      {(prof.defaults?.rir != null || prof.defaults?.rpe != null || restEntries.length) ? (
        <div>
          <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",marginBottom:"6px"}}>Defaults</div>
          <div>
            {prof.defaults?.rir != null && <span style={P_CHIP}>RIR {prof.defaults.rir}</span>}
            {prof.defaults?.rpe != null && <span style={P_CHIP}>RPE {prof.defaults.rpe}</span>}
            {restEntries.map(([role,sec])=><span key={role} style={P_CHIP}>{ROLE_LABEL[role]||role} rest {fmtRest(sec)}</span>)}
          </div>
        </div>
      ) : null}
      {/* This line greets a coach whose class type exists but has no plans
          behind it yet — the cold-start path — so it is a first-impression
          surface. It read "Add classs" (three s) until session 9. */}
      {!prof.structure?.length && !prof.schemes?.length && !extracted.conventions?.length && (
        <p style={{fontSize:"13px",color:"var(--muted)"}}>Add {prof.classType} classes and Jungle works out the structure, schemes and defaults from them.</p>
      )}
    </div>
  );
}

// ── Class shape (§9.1) ───────────────────────────────────────────────────────
// A coach's format, held in their hands and changeable. Recommended from their
// own corpus, then theirs — the derivation is a convenience, never an authority.
//
// Called "class shape" on screen, never "blueprint" (§11): the coach reads the
// outcome, not the mechanism.
const SLOT_ROLES = ["warmup", "primary_lift", "superset", "circuit", "finisher", "recovery", "cooldown"];
const shapeChips = slots => (slots || []).map(s => s.label || s.key).join(" · ");

function ClassShapeCard({ blueprint, classType, onSave, onDraft, draftable, emptyCatalog = false }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState([]);
  const start = () => { setRows((blueprint?.slots || []).map(s => ({ ...s, categories: [...(s.categories || [])] }))); setEditing(true); };
  const commit = () => {
    const slots = rows.filter(r => (r.label || r.key || "").trim())
                      .map(r => ({ ...r, key: (r.key || r.label || "").trim(), label: (r.label || r.key || "").trim() }));
    if (!slots.length) return;
    // Saving marks it `edited`, which is what permanently protects it from
    // being regenerated over on the next recompute.
    onSave({ classType, name: blueprint?.name || classType, source: "edited", slots });
    setEditing(false);
  };
  const move = (i, d) => setRows(rs => { const n = [...rs]; const j = i + d; if (j < 0 || j >= n.length) return rs; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const patch = (i, k, v) => setRows(rs => rs.map((r, x) => x === i ? { ...r, [k]: v } : r));
  const toggleCat = (i, c) => setRows(rs => rs.map((r, x) => x !== i ? r
    : { ...r, categories: (r.categories || []).includes(c) ? r.categories.filter(y => y !== c) : [...(r.categories || []), c] }));

  // Cold start: no corpus and nothing saved. Presets are PICKED, not prompted.
  if (!blueprint && !editing) return (
    <div style={{...P_CARD,padding:"18px 20px"}}>
      <p style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"6px"}}>{classType} — class shape</p>
      <p style={{fontSize:"12px",color:"var(--muted)",marginBottom:"12px"}}>How this class is built, in order. Start from one of these and change anything — or add plans and it&rsquo;s worked out from them.</p>
      <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
        {BLUEPRINT_PRESETS.map(p => (
          <button key={p.name} onClick={()=>{ setRows(p.slots.map(s=>({...s,categories:[...s.categories]}))); setEditing(true); }}
            style={{textAlign:"left",padding:"10px 12px",borderRadius:"10px",border:"1px solid var(--border)",background:"var(--navy)",cursor:"pointer",maxWidth:"260px"}}>
            <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)",marginBottom:"3px"}}>{p.name}</div>
            <div style={{fontSize:"11px",color:"var(--muted)",lineHeight:"1.4"}}>{shapeChips(p.slots)}</div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{...P_CARD,padding:"18px 20px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",flexWrap:"wrap",marginBottom:"6px"}}>
        <p style={{fontSize:"12px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px"}}>{classType} — class shape</p>
        {!editing && (
          <div style={{display:"flex",gap:"8px"}}>
            {/* Wrapped, NOT passed bare: `onDraft` now takes an optional preset,
                and a bare handler hands it a MouseEvent instead. */}
            {draftable && <Btn variant="ghost" onClick={()=>onDraft()} style={{padding:"6px 12px"}}
              title={emptyCatalog ? "Opens this shape in the Builder with the sections named and timed, ready to fill" : "Fill this shape with this coach's own movements"}>
              <Layers size={13}/> {emptyCatalog ? "Start a class from this shape" : "Draft from this shape"}</Btn>}
            <Btn variant="ghost" onClick={start} style={{padding:"6px 12px"}}>Change</Btn>
          </div>
        )}
      </div>

      {!editing && (
        <>
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"8px"}}>
            {(blueprint.slots || []).map((s,i) => (
              <span key={i} style={{...P_CHIP,background:"var(--navy)",color:"var(--text)",margin:0}}>{s.label || s.key}
                <span style={{color:"var(--muted)",fontWeight:"600"}}> · {ROLE_LABEL[s.role]||s.role}</span></span>
            ))}
          </div>
          {/* Honest provenance: say how much of their history this actually describes. */}
          <p style={{fontSize:"11px",color:"var(--muted)"}}>
            {blueprint.source === "edited" ? "Your shape — saved, and kept as you left it."
              : blueprint.matched != null ? `Suggested from ${blueprint.matched} of your ${blueprint.total} ${classType} class${blueprint.total===1?"":"es"}. Change anything.`
              : "A starting point. Change anything."}
          </p>
          {/* §13 Q7: the edit stands, the divergence is shown, nothing is auto-applied. */}
          {blueprint.contradiction && (
            <div style={{marginTop:"10px",padding:"10px 12px",borderRadius:"8px",border:"1px solid #E0B85B",background:"color-mix(in srgb, #E0B85B 10%, transparent)"}}>
              <p style={{fontSize:"12px",color:"var(--text)",fontWeight:"600",marginBottom:"3px"}}>Your recent classes have been running a different shape.</p>
              <p style={{fontSize:"11px",color:"var(--muted)",marginBottom:"8px"}}>{shapeChips(blueprint.contradiction.slots)}</p>
              <Btn variant="ghost" onClick={()=>onSave({ ...blueprint.contradiction, source:"edited" })} style={{padding:"4px 10px"}}>Use this instead</Btn>
            </div>
          )}
        </>
      )}

      {editing && (
        <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
          {rows.map((r,i) => (
            <div key={i} style={{padding:"10px 12px",background:"var(--navy)",borderRadius:"10px"}}>
              <div style={{display:"flex",gap:"6px",alignItems:"center",marginBottom:"8px"}}>
                <Input value={r.label||""} onChange={e=>patch(i,"label",e.target.value)} placeholder="What this part is called" style={{flex:1}}/>
                {/* "↑" IS text, so these pass the unnamed-button rule while telling
                    a screen reader nothing but "up arrow". Reordering the shape of a
                    class is exactly the operation you need to know the position for. */}
                <button onClick={()=>move(i,-1)} aria-label={`Move section ${i+1} up`} title="Move up" style={{background:"none",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",padding:"5px 8px",fontSize:"12px"}}>↑</button>
                <button onClick={()=>move(i,1)} aria-label={`Move section ${i+1} down`} title="Move down" style={{background:"none",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",padding:"5px 8px",fontSize:"12px"}}>↓</button>
                <button onClick={()=>setRows(rs=>rs.filter((_,x)=>x!==i))} aria-label={`Remove section ${i+1}`} title="Remove" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",padding:"4px"}}><Trash2 size={13}/></button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px",marginBottom:"8px"}}>
                {/* Five of these render at once, each announcing as a bare
                    "combobox" — the same defect the Schedule's add-class modal had,
                    where three indistinguishable dropdowns decided which DAY a
                    recurring class ran. */}
                <Select aria-label={`Section ${i+1} role`} value={r.role||"circuit"} onChange={e=>patch(i,"role",e.target.value)}>
                  {SLOT_ROLES.map(x => <option key={x} value={x}>{ROLE_LABEL[x]||x}</option>)}
                </Select>
                <Input type="number" value={r.minutes??""} onChange={e=>patch(i,"minutes",Number(e.target.value)||0)} placeholder="Minutes"/>
                <Input type="number" value={r.movementCount??""} onChange={e=>patch(i,"movementCount",Number(e.target.value)||0)} placeholder="How many moves"/>
              </div>
              <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",marginBottom:"5px"}}>What goes in here</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
                {CATEGORIES.map(c => { const on = (r.categories||[]).includes(c); return (
                  <button key={c} onClick={()=>toggleCat(i,c)} style={{padding:"3px 9px",borderRadius:"12px",border:`1px solid ${on?"var(--accent)":"var(--border)"}`,background:on?"color-mix(in srgb, var(--accent) 14%, transparent)":"transparent",color:on?"var(--accent)":"var(--muted)",fontSize:"11px",fontWeight:"600",cursor:"pointer"}}>{MOVEMENT_CATEGORY_LABEL[c]}</button>
                );})}
              </div>
            </div>
          ))}
          <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
            <Btn variant="ghost" onClick={()=>setRows(rs=>[...rs,{key:"",label:"",role:"circuit",minutes:10,movementCount:4,schemeDefault:"",categories:[]}])}><Plus size={13}/> Add a part</Btn>
            <Btn onClick={commit}><Check size={13}/> Save shape</Btn>
            <Btn variant="ghost" onClick={()=>setEditing(false)}>Cancel</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// Common equipment for the movement-catalog quick-pick (one tap instead of
// typing). Free-text stays available for anything off-list.
const CATALOG_EQUIP = ["barbell","dumbbell","kettlebell","bodyweight","band","machine","cable","erg","box"];

// Editable movement catalog for one class type. Rename folds variants (old name
// kept as an alias so aggregation re-maps its occurrences); equipment + notes are
// free; the per-class-type count and typical scheme are derived (read-only).
// A filter box appears past a handful of rows; missing equipment is flagged
// because it grounds generation.
function MovementCatalog({ movements, classType, onChange }) {
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({ name:"", equip:"", aliases:"", notes:"", category:"" });
  const [q, setQ] = useState("");
  if (!movements.length) return <p style={{fontSize:"13px",color:"var(--muted)"}}>No movements catalogued for {classType} yet — they populate from this class type's plans.</p>;
  const start = m => { setEditId(m.id); setDraft({ name:m.name, equip:m.equip||"", aliases:(m.aliases||[]).join(", "), notes:m.meta?.notes||"", category:categoryOf(m) }); };
  const save = m => {
    const name = draft.name.trim() || m.name;
    const aliases = draft.aliases.split(",").map(s=>s.trim()).filter(Boolean);
    if (name.toLowerCase() !== m.name.toLowerCase() && !aliases.some(a=>a.toLowerCase()===m.name.toLowerCase())) aliases.push(m.name);
    // The category the coach picked is stored as an OVERRIDE in meta, never in
    // the derived `category` field — so re-aggregation refreshes the derivation
    // without ever overwriting their decision. Picking the value the rules
    // already derived is not an override, so it is not recorded as one; that
    // keeps the row free to improve as the rules do.
    const picked = draft.category.trim();
    const meta = { ...(m.meta||{}), notes:draft.notes.trim() };
    if (picked && picked !== m.category) meta.category = picked; else delete meta.category;
    onChange({ ...m, name, equip:draft.equip.trim(), aliases, meta });
    setEditId(null);
  };
  const needle = q.trim().toLowerCase();
  const filtered = needle ? movements.filter(m => {
    const cat = categoryOf(m);
    return (`${m.name} ${(m.aliases||[]).join(" ")} ${m.equip||""} ${cat} ${MOVEMENT_CATEGORY_LABEL[cat]||""}`).toLowerCase().includes(needle);
  }) : movements;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"2px"}}>
      {movements.length > 5 && (
        <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px"}}>
          <Input value={q} onChange={e=>setQ(e.target.value)} placeholder={`Filter ${movements.length} movements — name, alias, equipment or kind`} style={{flex:1}}/>
          {needle && <span style={{fontSize:"11px",color:"var(--muted)",flexShrink:0,whiteSpace:"nowrap"}}>{filtered.length} of {movements.length}</span>}
        </div>
      )}
      {filtered.length === 0 && <p style={{fontSize:"12px",color:"var(--muted)",padding:"8px 0"}}>No movements match “{q}”.</p>}
      {filtered.map(m => editId === m.id ? (
        <div key={m.id} style={{padding:"12px",background:"var(--navy)",borderRadius:"10px",margin:"4px 0"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"8px"}}>
            <Input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} placeholder="Movement name"/>
            <Input value={draft.equip} onChange={e=>setDraft(d=>({...d,equip:e.target.value}))} placeholder="Equipment"/>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"8px"}}>
            {CATALOG_EQUIP.map(eq => { const on = draft.equip.trim().toLowerCase()===eq; return (
              <button key={eq} onClick={()=>setDraft(d=>({...d,equip:on?"":eq}))} style={{padding:"3px 9px",borderRadius:"12px",border:`1px solid ${on?"var(--accent)":"var(--border)"}`,background:on?"color-mix(in srgb, var(--accent) 14%, transparent)":"transparent",color:on?"var(--accent)":"var(--muted)",fontSize:"11px",fontWeight:"600",cursor:"pointer",textTransform:"capitalize"}}>{eq}</button>
            );})}
          </div>
          <div style={{fontSize:"11px",fontWeight:"700",color:"var(--muted)",marginBottom:"5px"}}>What kind of movement is this?</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"8px"}}>
            {CATEGORIES.map(c => { const on = draft.category===c; return (
              <button key={c} onClick={()=>setDraft(d=>({...d,category:on?"":c}))} style={{padding:"3px 9px",borderRadius:"12px",border:`1px solid ${on?"var(--accent)":"var(--border)"}`,background:on?"color-mix(in srgb, var(--accent) 14%, transparent)":"transparent",color:on?"var(--accent)":"var(--muted)",fontSize:"11px",fontWeight:"600",cursor:"pointer"}}>{MOVEMENT_CATEGORY_LABEL[c]}</button>
            );})}
          </div>
          <Input value={draft.aliases} onChange={e=>setDraft(d=>({...d,aliases:e.target.value}))} placeholder="Aliases (comma-separated)" style={{marginBottom:"8px"}}/>
          <Input value={draft.notes} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))} placeholder="Notes / cue" style={{marginBottom:"10px"}}/>
          <div style={{display:"flex",gap:"8px"}}><Btn onClick={()=>save(m)}><Check size={13}/> Save</Btn><Btn variant="ghost" onClick={()=>setEditId(null)}>Cancel</Btn></div>
        </div>
      ) : (
        <div key={m.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 0",borderTop:"1px solid var(--border)"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)"}}>{m.name}{m.equip ? <span style={{fontSize:"11px",fontWeight:"600",color:"var(--muted)",marginLeft:"8px"}}>{m.equip}</span> : <span style={{fontSize:"10px",fontWeight:"600",color:"#E0B85B",marginLeft:"8px"}}>needs equipment</span>}
              {/* Same amber flag as missing equipment: a blank category is an honest
                  gap the coach can close in one tap, not a wrong guess to discover later. */}
              {categoryOf(m) ? <span style={{fontSize:"11px",fontWeight:"600",color:"var(--muted)",marginLeft:"8px"}}>{MOVEMENT_CATEGORY_LABEL[categoryOf(m)]}</span> : <span style={{fontSize:"10px",fontWeight:"600",color:"#E0B85B",marginLeft:"8px"}}>needs category</span>}</div>
            <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>
              {(m.classTypes?.[classType]||0)}× in {classType}
              {fmtScheme(m.commonScheme) && <span> · {fmtScheme(m.commonScheme)}</span>}
              {m.meta?.notes && <span> · {m.meta.notes}</span>}
            </div>
          </div>
          {/* One Edit per catalogued movement — eleven on the sample coach.
              Without the movement's name these are eleven identical "Edit"s. */}
          <button onClick={()=>start(m)} aria-label={`Edit ${m.name}`} style={{background:"none",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"12px",fontWeight:"600",padding:"4px 10px"}}>Edit</button>
          {/* There is deliberately no delete here. The catalogue is RE-DERIVED
              from the plans on every recompute — which any other movement's save,
              or any plan edit, triggers — so deleting a row removed it from the
              screen AND from storage, survived a reload, and then came back the
              moment the coach edited something else. It could never work: this
              list is filtered to rows with at least one occurrence, so every row
              the button appeared on was guaranteed to be re-derived. A tombstone
              would make the button honest but the LIST dishonest — the catalogue
              would stop saying what the corpus contains, which is its entire
              promise, while the movement stayed visible in the plan editor. So
              membership follows the plans, and the explainer above says so. */}
        </div>
      ))}
    </div>
  );
}

// The movements a coach edited and then stopped programming. The ONLY surface in
// the product where deleting a catalogue row does what it says: these have no
// occurrences, so `aggregateMovements` has nothing to re-derive them from and
// the delete holds. Every other row is rebuilt from the plans on the next
// recompute, which is why the main catalogue offers no delete at all.
//
// Deliberately read-only apart from that. Editing a row nothing uses would only
// deepen the reason it is being kept; the two honest actions are to leave it or
// to let it go.
function OrphanedMovements({ movements, onDelete }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"2px"}}>
      {movements.map(m => (
        <div key={m.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 0",borderTop:"1px solid var(--border)"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:"13px",fontWeight:"700",color:"var(--text)"}}>{m.name}
              {m.equip && <span style={{fontSize:"11px",fontWeight:"600",color:"var(--muted)",marginLeft:"8px"}}>{m.equip}</span>}
              {categoryOf(m) && <span style={{fontSize:"11px",fontWeight:"600",color:"var(--muted)",marginLeft:"8px"}}>{MOVEMENT_CATEGORY_LABEL[categoryOf(m)]}</span>}
            </div>
            {/* Name what is actually being kept, so "delete" is an informed
                choice rather than a guess about what would be lost. The fallback
                says the equipment and kind above are ALL there is, rather than
                restating the card's own heading. */}
            <div style={{fontSize:"11px",color:"var(--muted)",marginTop:"2px"}}>
              {[(m.aliases||[]).length ? `also called ${(m.aliases||[]).join(", ")}` : "", m.meta?.notes || ""]
                .filter(Boolean).join(" · ") || "nothing else saved on it"}
            </div>
          </div>
          {/* Named, like the catalogue's Edit buttons — without the movement's
              name these announce as identical "button"s that delete one each. */}
          <button onClick={()=>onDelete(m.id)} aria-label={`Delete ${m.name} from the catalogue`} title="Delete movement" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex",padding:"4px"}}><Trash2 size={13}/></button>
        </div>
      ))}
    </div>
  );
}

// Full plan editor (blocks + exercises) — maximal editability before a plan
// grounds generation. Modal over a deep-copied draft; Save writes back the plan.
// `initial` restores an in-flight edit the coach discarded and then undid. It is
// NOT the pristine copy — that always comes from `plan`, so reopening a restored
// draft still knows it is dirty and can be discarded (and undone) a second time.
function PersonaPlanEditor({ plan, initial = null, onSave, onClose }) {
  const vw = useWindowWidth(); const isMobile = vw < 640;
  const [title, setTitle] = useState(initial?.title ?? plan.title ?? "");
  const [classType, setClassType] = useState(initial?.classType ?? plan.classType ?? "");
  const [focus, setFocus] = useState(initial?.focus ?? plan.focus ?? "");
  const [blocks, setBlocks] = useState(() =>
    JSON.parse(JSON.stringify(initial?.blocks ?? plan.plan?.blocks ?? [])));

  // ── Discarding an edit is the one loss this dialog can still cause ──────────
  //
  // This panel renders one row per section and one field row per movement —
  // measured on the sample coach's plan in the running app, 35 buttons and 82
  // fields, all of it in local state. It had FOUR ways out (backdrop, Escape,
  // the ✕, Cancel) and all four threw the lot away in silence. The backdrop is
  // the one that matters: it is the whole screen outside a 720px panel, and
  // hitting it is a miss, not a decision.
  //
  // An undo rather than a confirm, for the reason in ui/toast.jsx: a confirm
  // taxes the many closes the coach meant in order to catch the rare one they
  // did not. Guarding on `dirty` means an untouched open — look at a plan, close
  // it — stays instant and silent, which is the common case by a distance.
  //
  // Pristine is captured once from `plan`, so it survives every re-render and
  // cannot drift as the coach types. The blocks comparison is a stringify: the
  // state was deep-cloned out of this same value, and JSON round-tripping
  // preserves key order, so an edit typed and then typed back is correctly NOT
  // dirty.
  const pristine = useRef({
    title: plan.title || "", classType: plan.classType || "", focus: plan.focus || "",
    blocks: JSON.stringify(plan.plan?.blocks || []),
  }).current;
  const dirty = title !== pristine.title || classType !== pristine.classType
             || focus !== pristine.focus || JSON.stringify(blocks) !== pristine.blocks;
  // `useDialog` holds onClose in a ref it refreshes every render, so handing it
  // a new closure each time is safe and it always sees the current `dirty`.
  const requestClose = () => onClose(dirty ? { title, classType, focus, blocks } : null);
  const dlg = useDialog(requestClose, "Edit plan");
  const upBlock  = (i, patch) => setBlocks(bs => bs.map((b,j)=>j===i?{...b,...patch}:b));
  const upScheme = (i, patch) => setBlocks(bs => bs.map((b,j)=>j===i?{...b,scheme:{...(b.scheme||{}),...patch}}:b));
  const upEx     = (i,k,patch) => setBlocks(bs => bs.map((b,j)=> j===i ? {...b,exercises:(b.exercises||[]).map((e,m)=>m===k?{...e,...patch}:e)} : b));
  const addEx    = i => setBlocks(bs => bs.map((b,j)=>j===i?{...b,exercises:[...(b.exercises||[]),{name:"",reps:""}]}:b));
  const rmEx     = (i,k) => setBlocks(bs => bs.map((b,j)=>j===i?{...b,exercises:(b.exercises||[]).filter((_,m)=>m!==k)}:b));
  const addBlock = () => setBlocks(bs => [...bs,{label:"New block",role:"circuit",scheme:{},exercises:[]}]);
  const rmBlock  = i => setBlocks(bs => bs.filter((_,j)=>j!==i));
  const move     = (i,d) => setBlocks(bs => { const n=[...bs]; const j=i+d; if(j<0||j>=n.length) return n; [n[i],n[j]]=[n[j],n[i]]; return n; });
  const num = v => { const n = parseInt(v,10); return Number.isNaN(n) ? undefined : n; };
  const numF = v => { const n = parseFloat(v); return Number.isNaN(n) ? undefined : n; }; // RPE allows halves (7.5)
  const iconBtn = { background:"var(--navy)",border:"1px solid var(--border)",borderRadius:"6px",cursor:"pointer",color:"var(--muted)",fontSize:"13px",fontWeight:"700",padding:"3px 9px",lineHeight:1 };
  const lbl = { fontSize:"10px",fontWeight:"700",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.5px",display:"block",marginBottom:"3px" };
  return (
    <div onClick={requestClose} style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:isMobile?"12px":"40px 20px",overflowY:"auto"}}>
      <div {...dlg} onClick={e=>e.stopPropagation()} style={{...P_CARD,width:"100%",maxWidth:"720px",padding:isMobile?"16px":"24px",outline:"none"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
          <h3 style={{fontSize:"16px",fontWeight:"800",color:"var(--text)",margin:0}}>Edit plan</h3>
          <button onClick={requestClose} aria-label="Close edit plan" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",display:"flex"}}><X size={18}/></button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"2fr 1fr 1fr",gap:"8px",marginBottom:"16px"}}>
          {/* These three carry no placeholder, and their <label>s are unassociated
              decoration, so all three announced as a bare "textbox". */}
          <div><label style={lbl}>Title</label><Input aria-label="Plan title" value={title} onChange={e=>setTitle(e.target.value)}/></div>
          <div><label style={lbl}>Class type</label><Input aria-label="Class type" value={classType} onChange={e=>setClassType(e.target.value)}/></div>
          <div><label style={lbl}>Focus</label><Input aria-label="Plan focus" value={focus} onChange={e=>setFocus(e.target.value)}/></div>
        </div>

        {blocks.map((b,i) => (
          <div key={i} style={{border:"1px solid var(--border)",borderRadius:"10px",padding:"12px",marginBottom:"12px"}}>
            <div style={{display:"flex",gap:"6px",alignItems:"center",marginBottom:"10px"}}>
              <Input value={b.label||""} onChange={e=>upBlock(i,{label:e.target.value})} placeholder="Block label" style={{flex:1}}/>
              {/* This dialog renders one of these rows per section and one field row
                  per movement, so on the sample coach's plan it is 29 buttons and 33
                  fields with no accessible name between them. Every label below names
                  its POSITION, because that is the only thing that distinguishes an
                  otherwise identical control from the fifteen next to it. */}
              <button onClick={()=>move(i,-1)} aria-label={`Move section ${i+1} up`} title="Move up" style={iconBtn}>↑</button>
              <button onClick={()=>move(i,1)} aria-label={`Move section ${i+1} down`} title="Move down" style={iconBtn}>↓</button>
              <button onClick={()=>rmBlock(i)} aria-label={`Remove section ${i+1}`} title="Remove block" style={{...iconBtn,color:"var(--accent)"}}><Trash2 size={13}/></button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1.2fr 1fr 0.6fr 0.6fr 0.6fr 0.8fr",gap:"6px",marginBottom:"10px"}}>
              {/* The visible <label>s are not associated with their controls — no
                  htmlFor, no wrapping — so they are decoration to an assistive
                  technology. aria-label rather than htmlFor/id because these render
                  inside a map and every id would have to be made unique by hand. */}
              <div><label style={lbl}>Role</label>
                <Select aria-label={`Section ${i+1} role`} value={b.role||"circuit"} onChange={e=>upBlock(i,{role:e.target.value})}>
                  {["warmup","primary_lift","superset","circuit","finisher","recovery","cooldown"].map(r=><option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </Select>
              </div>
              <div><label style={lbl}>Scheme</label>
                <Select aria-label={`Section ${i+1} scheme`} value={b.scheme?.type||""} onChange={e=>upScheme(i,{type:e.target.value||undefined})}>
                  <option value="">—</option>
                  {["sets_reps","rounds","time","interval","amrap"].map(t=><option key={t} value={t}>{schemeTypeLabel(t)}</option>)}
                </Select>
              </div>
              <div><label style={lbl}>Sets</label><Input aria-label={`Section ${i+1} sets`} type="number" value={b.scheme?.sets??""} onChange={e=>upScheme(i,{sets:num(e.target.value)})}/></div>
              <div><label style={lbl}>RIR</label><Input aria-label={`Section ${i+1} reps in reserve`} type="number" value={b.scheme?.rir??""} onChange={e=>upScheme(i,{rir:num(e.target.value)})}/></div>
              <div><label style={lbl}>RPE</label><Input aria-label={`Section ${i+1} rate of perceived exertion`} type="number" step="0.5" value={b.scheme?.rpe??""} onChange={e=>upScheme(i,{rpe:numF(e.target.value)})}/></div>
              <div><label style={lbl}>Rest (s)</label><Input aria-label={`Section ${i+1} rest in seconds`} type="number" value={b.scheme?.rest_sec??""} onChange={e=>upScheme(i,{rest_sec:num(e.target.value)})}/></div>
            </div>
            {(b.exercises||[]).map((ex,k) => (
              <div key={k} style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr auto":"1.6fr 1fr 0.9fr 1.2fr auto",gap:"6px",marginBottom:"6px",alignItems:"center"}}>
                <Input value={ex.name||""} onChange={e=>upEx(i,k,{name:e.target.value})} placeholder="Movement"/>
                <Input value={ex.equip||""} onChange={e=>upEx(i,k,{equip:e.target.value})} placeholder="Equip"/>
                <Input value={ex.reps!=null?String(ex.reps):""} onChange={e=>upEx(i,k,{reps:e.target.value})} placeholder="Reps"/>
                {!isMobile && <Input value={ex.regression||""} onChange={e=>upEx(i,k,{regression:e.target.value})} placeholder="Regression"/>}
                <button onClick={()=>rmEx(i,k)} aria-label={ex.name ? `Remove ${ex.name} from section ${i+1}` : `Remove movement ${k+1} from section ${i+1}`} title="Remove" style={{...iconBtn,color:"var(--accent)"}}><X size={13}/></button>
              </div>
            ))}
            <button onClick={()=>addEx(i)} aria-label={`Add a movement to section ${i+1}`} style={{...iconBtn,marginTop:"4px",padding:"5px 10px",fontSize:"12px"}}>+ exercise</button>
          </div>
        ))}

        <Btn variant="ghost" onClick={addBlock} style={{width:"100%",justifyContent:"center",marginBottom:"16px"}}><Plus size={14}/> Add block</Btn>
        <div style={{display:"flex",gap:"8px",justifyContent:"flex-end"}}>
          <Btn variant="ghost" onClick={requestClose}>Cancel</Btn>
          <Btn onClick={()=>onSave({ ...plan, title, classType, focus, plan:{ ...(plan.plan||{}), blocks } })}><Check size={14}/> Save plan</Btn>
        </div>
      </div>
    </div>
  );
}
