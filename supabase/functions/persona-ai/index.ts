// Jungle — Coach-persona LLM proxy (Supabase Edge Function, workstream D chunk 2).
// Holds the model key server-side. Handles two persona tasks:
//   task:"extract"  — raw class-plan deck text  → structured { title, classType, focus, plan:{blocks} }
//   task:"generate" — coach + class-type profile + catalog + few-shot past plans + brief
//                     → a NEW on-style plan { title, plan:{blocks} }
//
// This mirrors the extraction shape the client already understands (planToStages /
// personaAggregate) so an extracted or generated plan drops straight into a persona
// or the Builder. It is the server-side upgrade of the deterministic "Generate draft".
//
// Provider is swappable via project secrets. It defaults to the SAME free path as
// smart-build (Google Gemini 2.5 Flash — free tier), so no new key/cost during
// testing. Upgrade persona to Claude later without touching smart-build by setting
// PERSONA_LLM_PROVIDER=anthropic (+ ANTHROPIC_API_KEY):
//   PERSONA_LLM_PROVIDER  = gemini | anthropic | openai
//       (default: PERSONA_LLM_PROVIDER, else the shared LLM_PROVIDER, else gemini)
//   PERSONA_LLM_MODEL     = model id (default per provider: gemini-2.5-flash /
//                           claude-opus-4-8 / gpt-4o-mini)
//   GEMINI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY   (same keys as smart-build)
// Only authenticated users can call it (Supabase verifies the JWT by default).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// The one plan/block schema both tasks share. Kept verbatim in both prompts so the
// model always emits exactly what personaAggregate + planToStages consume.
const BLOCK_SCHEMA = `A plan is { "blocks": [ Block, ... ] }. Each Block:
{
  "label": string,        // block label as written, e.g. "Warm Up", "M1", "A1+A2", "C1"
  "role": one of ["warmup","primary_lift","superset","circuit","finisher","recovery","cooldown"],
  "rotation": string,     // superset / rotation note (e.g. "A1+A2 antagonist, 3 rounds") or ""
  "scheme": {
    "type": one of ["sets_reps","rounds","time","interval","amrap"],
    "sets": number | null,
    "reps": [numbers] | [],   // rep ladder, e.g. [12,10,10,8]; [] if not rep-based
    "rir": number | null,     // reps in reserve
    "rpe": number | null,     // rate of perceived exertion 1-10; a range like "RPE 7-8" -> its midpoint 7.5
    "rest_sec": number | null,// rest between sets/rounds, in SECONDS
    "note": string            // scheme note, e.g. "1st set as primer", "AMRAP 8min", tempo codes like "31X1"
  },
  "exercises": [
    {
      "name": string,       // canonical movement name
      "equip": string,      // "barbell" | "DB" | "KB" | "erg" | "sled" | "bodyweight" | "" (unknown)
      "reps": string,       // per-exercise reps if it differs from the block scheme, else ""
      "per_side": boolean,  // true if reps are per side
      "regression": string, // easier variant if noted, else ""
      "target": string      // target/goal if noted (distance, calories, time), else ""
    }
  ]
}`;

const EXTRACT_SYSTEM = `You convert a boutique-fitness class plan (pasted slide-deck text or coach notes) into ONE structured JSON object. Output ONLY the JSON — no markdown fences, no prose.

Shape:
{
  "title": string,      // short plan title, e.g. "S360 — Deadlift (Hypertrophy)"
  "classType": string,  // the class format/type, e.g. "S360", "GC", "Enduro" (use the caller's hint if given)
  "focus": string,      // the day's focus, e.g. "Deadlift — Hypertrophy", "Engine", "Week 11/24"
  "plan": ${"{ \"blocks\": [ ... ] }"}
}

${BLOCK_SCHEMA}

Rules:
- Preserve rep ladders exactly ("12-10-10-8" -> reps:[12,10,10,8]). "3x10" -> sets:3, reps:[10]. "4 x 8-10" -> sets:4, reps:[8], note:"8-10 reps".
- Roles: warmups -> "warmup"; the main barbell/primary movement -> "primary_lift"; antagonist/paired supersets (A1+A2, B1+B2 — pair them even when the word "superset" never appears) -> "superset" with the pairing in "rotation"; conditioning circuits / AMRAP / intervals -> "circuit"; closing finishers -> "finisher"; cooldowns -> "cooldown".
- Numbers land in their FIELD, not in notes: rest in rest_sec (minutes -> SECONDS), RIR in rir, RPE in rpe (a range like "RPE 7-8" -> 7.5). Tempo codes ("31X1", "3-1-X-1") go in scheme.note.
- Every distinct movement line/station is ONE exercise, in source order — never merge two movements into one name, never split one movement into two. Distances, calories, meters and time caps go in that exercise's "target" (e.g. "500m", "15 cal", "40s on"); "each side"/"e/s" -> per_side:true; an easier option ("or", "scale to", "regression:") -> "regression".
- Ignore non-programming content: title/branding slides, hype quotes, logistics, playlists, coach bios. Extract ONLY the workout.
- Use the caller's classType hint when provided. NEVER invent exercises that are not in the source text; keep each exercise's name as the coach wrote it (expand only obvious abbreviations like "DB"/"KB"/"BB").`;

const GENERATE_SYSTEM = `You draft a NEW class plan in a specific coach's established style. Output ONLY a JSON object — no markdown fences, no prose.

You are given (as a JSON payload in the user message): the coach and class type, its training "category" (strength | conditioning | endurance | mixed), the coach's derived block STRUCTURE and SCHEME conventions for that class type, their movement vocabulary ("catalog"), a few of their past plans as style references ("examples"), and a "brief" for the new class.

Produce a new plan that:
- follows the coach's typical block structure and ORDER for this class type,
- reuses their scheme conventions (sets / rep ladders / RIR / RPE / rest, superset rotations, intervals / AMRAP where they use them),
- draws movements primarily from the provided catalog vocabulary (close variants are allowed when the brief demands, but prefer catalog names),
- honors the brief (focus, target duration; for periodized formats respect the given week X of N),
- is realistic, safe, and coherent for a single class.

CATEGORY DISCIPLINE — respect the payload's "category"; never turn a strength class into a metcon or vice versa:
- "strength": the primary_lift and superset blocks MUST be resistance/strength movements (barbell, dumbbell, kettlebell, machine, bodyweight strength). Do NOT put steady-state cardio (rower/erg, run, bike, ski, sled intervals) in those blocks — cardio only belongs in a warmup or an optional finisher.
- "conditioning" / "endurance": center the work on circuits, intervals, AMRAP, ergs/runs; strength movements appear only as accessory or finisher volume, not as the spine.
- Match the category to what the coach's own examples show.

NOVELTY — the payload's "recent" lists classes ALREADY recommended to this coach for this class type (title, focus, movements). Produce something meaningfully DIFFERENT from every entry: choose a different primary lift / focus and rotate the movement selection so the coach is not handed the same class again. Do not reuse a recent title, and avoid leaning on the same primary movements as the most recent entries. Stay within the coach's style and category while varying the specifics.

Output the SAME shape the extractor produces:
{ "title": string, "plan": ${"{ \"blocks\": [ ... ] }"} }

${BLOCK_SCHEMA}`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function extractJson(text: string) {
  let t = (text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

// opts.think:false disables Gemini 2.5's default thinking pass — extraction of a
// long deck otherwise runs 100s+ and can blow the Edge Function gateway timeout
// (~150s), which the client sees as a bare non-2xx. Extraction is transcription,
// not reasoning; it doesn't need thinking and it DOES need to finish.
type LlmOpts = { temperature?: number; think?: boolean };
async function gemini(system: string, prompt: string, opts: LlmOpts = {}) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const model = Deno.env.get("PERSONA_LLM_MODEL") || "gemini-2.5-flash";
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: opts.temperature ?? 0.7,
          ...(opts.think === false ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    },
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || "Gemini error");
  return extractJson(d?.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
}

async function openai(system: string, prompt: string, opts: LlmOpts = {}) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const model = Deno.env.get("PERSONA_LLM_MODEL") || "gpt-4o-mini";
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || "OpenAI error");
  return extractJson(d?.choices?.[0]?.message?.content || "{}");
}

async function anthropic(system: string, prompt: string, _opts: LlmOpts = {}) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  // Default to the latest Claude. Opus 4.8 rejects temperature / budget_tokens, so
  // we send neither — the grounding in the prompt does the steering.
  const model = Deno.env.get("PERSONA_LLM_MODEL") || "claude-opus-4-8";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 4096, system, messages: [{ role: "user", content: prompt }] }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || "Anthropic error");
  // Find the first text block (defensive: skips thinking blocks if ever enabled).
  const block = Array.isArray(d?.content) ? d.content.find((b: { type?: string }) => b?.type === "text") : null;
  return extractJson(block?.text || "{}");
}

// Normalize whatever the model returns into { title, classType, focus, plan:{blocks} }.
function normalizePlan(out: Record<string, unknown>) {
  const rawPlan = (out?.plan && typeof out.plan === "object") ? out.plan as Record<string, unknown>
                : Array.isArray(out?.blocks) ? out
                : {};
  const blocks = Array.isArray((rawPlan as { blocks?: unknown }).blocks) ? (rawPlan as { blocks: unknown[] }).blocks : [];
  return {
    title: typeof out?.title === "string" ? out.title : "",
    classType: typeof out?.classType === "string" ? out.classType : "",
    focus: typeof out?.focus === "string" ? out.focus : "",
    plan: { blocks },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const task = body?.task === "generate" ? "generate" : "extract";

    let system: string, prompt: string;
    if (task === "extract") {
      const text = String(body?.text || "").trim();
      // v rides on this cheap validation error so a deploy can be detected without an LLM call.
      if (!text) return json({ error: "Missing deck text to extract", v: 4 }, 400);
      system = EXTRACT_SYSTEM;
      const hints = [
        body?.classType ? `classType hint: ${body.classType}` : "",
        body?.title ? `title hint: ${body.title}` : "",
        body?.focus ? `focus hint: ${body.focus}` : "",
      ].filter(Boolean).join("\n");
      prompt = `${hints ? hints + "\n\n" : ""}Deck text to extract:\n"""\n${text}\n"""`;
    } else {
      // generate — the client sends the derived profile, catalog and few-shot examples.
      if (!body?.classType) return json({ error: "Missing classType to generate" }, 400);
      system = GENERATE_SYSTEM;
      const payload = {
        coach: body?.persona || {},
        classType: body.classType,
        category: body?.category || "mixed",
        brief: body?.brief || {},
        profile: body?.profile || {},
        catalog: Array.isArray(body?.catalog) ? body.catalog : [],
        examples: Array.isArray(body?.examples) ? body.examples : [],
        recent: Array.isArray(body?.recent) ? body.recent : [],
      };
      prompt = `Generate a new "${body.classType}" class in this coach's style. Payload:\n${JSON.stringify(payload)}`;
    }

    // Default free: persona-specific override → the shared smart-build provider → gemini.
    const provider = (Deno.env.get("PERSONA_LLM_PROVIDER") || Deno.env.get("LLM_PROVIDER") || "gemini").toLowerCase();
    const call = provider === "openai" ? openai : provider === "gemini" ? gemini : anthropic;
    // Extraction = faithful transcription: low temperature, no thinking pass (speed).
    const opts: LlmOpts = task === "extract" ? { temperature: 0.2, think: false } : {};
    let out;
    try {
      out = await call(system, prompt, opts);
    } catch (e) {
      // One retry for transient provider blips (free-tier rate limits, overload).
      const msg = String((e as Error)?.message || e);
      if (!/429|quota|rate ?limit|overloaded|unavailable|try again|internal/i.test(msg)) throw e;
      await new Promise((res) => setTimeout(res, 2500));
      out = await call(system, prompt, opts);
    }
    const normalized = normalizePlan(out || {});
    if (!normalized.plan.blocks.length) throw new Error("Model returned no blocks");
    return json(normalized, 200);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
