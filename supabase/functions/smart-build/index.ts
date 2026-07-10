// Jungle — LLM proxy (Supabase Edge Function). Holds the model key server-side.
// Handles two tasks: task:"class" (default) builds a class; task:"brand" recommends a color scheme.
// Provider swappable via secrets: LLM_PROVIDER = gemini | openai | anthropic (default gemini),
// GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY, LLM_MODEL (optional).
// Only authenticated users can call it (Supabase verifies the JWT by default).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLASS_SYSTEM = `You are a fitness class programmer for a gym app.
Given a coach's plain-English description, output ONLY a JSON object (no markdown, no prose) shaped exactly:
{"name": string, "stages": [{"name": string, "type": one of ["warmup","circuit","strength","cardio","engine","power","core","recovery","stretch","cooldown"], "durMin": number, "exercises": [{"n": string, "s": string, "r": string, "rest": string}]}]}
Rules: 3-6 stages; 3-6 exercises per stage; realistic durMin that sums close to any requested total; s=sets, r=reps or duration, rest=rest interval (may be ""); always include a warmup first and a cooldown/stretch last; keep exercises safe and standard.`;

const BRAND_SYSTEM = `You are a brand designer for boutique gyms. Given a gym description, output ONLY a JSON object (no markdown, no prose):
{"name": string, "accent": "#RRGGBB", "vibe": one of ["energetic","luxury","bold","natural","calm"], "mode": "dark"|"light", "preset": one of ["canopy","pulse","atelier"], "note": one short sentence explaining the choice}
Choose an accent hex that fits the gym's energy, discipline and audience. Use "pulse" for high-energy/competitive brands, "atelier" for luxury/editorial, "canopy" for natural/wellness. Prefer "dark" mode unless the brand is clearly light and airy.`;

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

async function gemini(system: string, prompt: string) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const model = Deno.env.get("LLM_MODEL") || "gemini-2.5-flash";
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
      }),
    },
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || "Gemini error");
  return extractJson(d?.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
}

async function openai(system: string, prompt: string) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const model = Deno.env.get("LLM_MODEL") || "gpt-4o-mini";
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || "OpenAI error");
  return extractJson(d?.choices?.[0]?.message?.content || "{}");
}

async function anthropic(system: string, prompt: string) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const model = Deno.env.get("LLM_MODEL") || "claude-haiku-4-5";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 1500, system, messages: [{ role: "user", content: prompt }] }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || "Anthropic error");
  return extractJson(d?.content?.[0]?.text || "{}");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { prompt, task } = await req.json();
    if (!prompt || !String(prompt).trim()) return json({ error: "Missing prompt" }, 400);
    const system = task === "brand" ? BRAND_SYSTEM : CLASS_SYSTEM;
    const provider = (Deno.env.get("LLM_PROVIDER") || "gemini").toLowerCase();
    const call = provider === "openai" ? openai : provider === "anthropic" ? anthropic : gemini;
    const out = await call(system, prompt);
    if (task === "brand") {
      if (!out || !out.accent) throw new Error("Model returned an unexpected shape");
    } else if (!out || !Array.isArray(out.stages)) {
      throw new Error("Model returned an unexpected shape");
    }
    return json(out, 200);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
