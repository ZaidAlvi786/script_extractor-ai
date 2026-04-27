import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { openrouter } from "@/lib/openrouter";

export const maxDuration = 120;

// ─── Types ────────────────────────────────────────────────────────────────────

type WriteRequest = {
  character?: string;       // main character / subject description
  scriptType?: string;      // niche, format, vibe (e.g. "POV reaction comedy")
  audience?: string;        // free-form audience descriptor
  durationSec?: number;     // total target runtime in seconds
  referenceUrl?: string;    // optional reference video URL
  notes?: string;           // free-form extra direction
  refineFeedback?: string;  // optional follow-up feedback for refinement
  previousScript?: any;     // previously-generated script JSON for refinement
};

// ─── System Prompt ────────────────────────────────────────────────────────────

const TARGET_AUDIENCE_DEFAULT =
  "Western (United States / United Kingdom / Western Europe). Colloquial English cadence, references and humor that resonate in those markets.";

function buildPhaseTimings(totalSec: number) {
  // Default short-form pacing — proportional to total runtime.
  // Pattern Interrupt 15%, Build 30%, Climax 35%, CTA 20% (rounded, sums to total).
  const p1 = Math.max(2, Math.round(totalSec * 0.15));
  const p2 = Math.max(2, Math.round(totalSec * 0.30));
  const p3 = Math.max(2, Math.round(totalSec * 0.35));
  const p4 = Math.max(2, totalSec - p1 - p2 - p3);
  let cursor = 0;
  const make = (name: string, secs: number) => {
    const start = cursor;
    cursor += secs;
    return { name, label: `${start}s-${cursor}s`, seconds: secs };
  };
  return [
    make("Pattern Interrupt", p1),
    make("Build Tension", p2),
    make("Climax / Reveal", p3),
    make("Call to Action", p4),
  ];
}

function buildSystemPrompt(
  totalSec: number,
  audience: string,
  phases: ReturnType<typeof buildPhaseTimings>
): string {
  const phaseRules = phases
    .map(
      (p, i) =>
        `  • Phase ${i + 1} "${p.name}" — du="${p.label}" (${p.seconds}s). ${
          i === 0
            ? "First-frame hook: must visually arrest within the first 0.5s."
            : i === 3
              ? "Closer/CTA. Keeps the same character; resolves the beat; ends on a clean stop."
              : "Continues the same character and setting — only the ACTION advances."
        }`
    )
    .join("\n");

  return `You are a legendary short-form video script writer for the ${audience}. You write hooks that stop scrolls, scripts that hold attention to the last second, and Veo 3 video prompts so precise they generate the EXACT phase requested without drifting.

━━━ TARGET AUDIENCE ━━━
${audience}
Cadence and slang must feel native to this audience. No generic AI-speak, no awkward translations, no over-formal English. Hooks must work in Reels / Shorts / TikTok feeds for that market specifically.

━━━ TOTAL RUNTIME ━━━
The script is exactly ${totalSec} seconds, divided into 4 phases:
${phaseRules}

━━━ VEO 3 PHASE-PROMPT RULES (STRICT — VIOLATIONS RUIN GENERATION) ━━━
Each phase's "vp" (Veo 3 prompt) MUST follow these rules:
  1. ONLY describes the action that happens within THIS phase's duration window. NEVER anticipates, foreshadows, or completes beats from later phases.
  2. Starts at the phase's first frame and ends at its last frame. The final sentence describes the closing beat — Veo MUST stop there. Use language like "Scene ends with [exact final beat]." or "Final frame: [exact composition]."
  3. EXPLICITLY states the duration (e.g. "${phases[0].seconds}-second clip"). This stops Veo from extending the action beyond the phase.
  4. Never says things like "then…", "afterwards…", "later…", "and finally…", "they continue to…" — those phrases make Veo extend the clip beyond its window.
  5. Maintains visual continuity with the OTHER phases (same character appearance, same setting, same lighting) — but the action itself is sealed inside this phase.
  6. Uses concrete motion verbs (enters, tilts, leans, exhales, blinks, glances, retracts, lifts, drops, widens, opens, closes). No abstract emotion verbs without a physical anchor.

━━━ NATURAL-REALISM RULES (MANDATORY in EVERY phase prompt) ━━━
The character must look REAL, not animated, not theatrical:
  • Skin tone: even, naturally lit, slight redness in cheeks/nose if the lighting is warm. Never airbrushed-flat. Never over-saturated, never green/yellow tinted.
  • Facial expressions: micro-expressions (eyebrow ~2-4mm lift, slight nostril flare, lip-corner tighten, blink). NEVER cartoonish wide-eyes, NEVER agape jaw, NEVER theatrical smile/frown unless explicitly justified by the beat.
  • Body language: grounded posture, shoulders relaxed, weight on one foot, hands rest naturally. Movements have prep-frames and follow-through (not snap-jump motion).
  • Eyes: catch-light visible, natural blink rate (~1 per 2-4s of clip), gaze settles on a real focal point — not staring through the camera, not darting unnaturally.
  • Voice / dialogue: matched to the character's archetype, conversational pacing, breath audible at sentence breaks, no over-enunciation.
  • Lighting: soft key light + subtle fill, shadows fall naturally on the cheekbone / jawline. No flat ring-light look unless the niche demands it.
  • End every "vp" with: "Photorealistic, cinematic naturalism, subtle micro-expression, grounded body language, soft natural lighting, shallow depth of field, 50mm lens, 24fps. No cartoonish exaggeration, no theatrical acting, no over-saturated color, no plastic skin, no warping, no morphing, no text overlays."

━━━ CHARACTER IMAGE PROMPT (per-phase) ━━━
Every phase also has a "ci" — a 50-90 word still-image prompt for the character at that phase's beat. Same realism rules. End with: "Photorealistic, hyper-detailed, cinematic naturalism, subtle expression, soft natural lighting, shallow depth of field, 9:16 vertical portrait. No theatrical pose, no over-saturated color, no plastic skin, no text, no watermark."

━━━ DELIVERABLES (compact JSON, short keys) ━━━
{
  "ti": "scroll-stopping title — 5-9 words, includes a hook trigger (number, contradiction, or curiosity gap)",
  "ds": "60-90 word YouTube/IG description — first sentence is the hook, includes the niche keywords, includes a soft CTA",
  "cp": "30-50 word IG/TikTok caption — punchier than ds, ends with 1 question or CTA",
  "hk": "the opening spoken hook — exactly the words the character says in the first 1-2 seconds",
  "tg": {
    "yt": ["#tag", "#tag", "#tag", "#tag", "#tag", "#tag"],
    "ig": ["#tag", "#tag", "#tag", "#tag", "#tag", "#tag"],
    "tt": ["#tag", "#tag", "#tag", "#tag", "#tag", "#tag"]
  },
  "ct": "final spoken CTA",
  "ph": [
    {
      "n": 1,
      "tl": "${phases[0].name}",
      "du": "${phases[0].label}",
      "sc": "exact spoken words + on-screen text overlay",
      "vi": "static composition — framing, angle, lighting, subject position",
      "mo": "motion/action with verbs and sub-timing within this phase only",
      "vp": "Veo 3 prompt obeying the phase-prompt rules above. 80-130 words. Includes duration, scene-end statement, realism tail.",
      "ci": "character image prompt obeying the realism rules above. 50-90 words including the realism tail."
    },
    { "n": 2, "tl": "${phases[1].name}", "du": "${phases[1].label}", "sc": "...", "vi": "...", "mo": "...", "vp": "...", "ci": "..." },
    { "n": 3, "tl": "${phases[2].name}", "du": "${phases[2].label}", "sc": "...", "vi": "...", "mo": "...", "vp": "...", "ci": "..." },
    { "n": 4, "tl": "${phases[3].name}", "du": "${phases[3].label}", "sc": "...", "vi": "...", "mo": "...", "vp": "...", "ci": "..." }
  ]
}

OUTPUT RULES:
- JSON only, no markdown, no commentary.
- Every "vp" MUST end with the natural-realism tail above.
- Every "ci" MUST end with the image realism tail above.
- The 4 phases MUST use these exact "tl" and "du" values — do not alter them.
- Hashtags: 6 per platform, niche-specific not generic, no repeats across the 6.`;
}

function buildUserBrief(req: WriteRequest, totalSec: number): string {
  const lines: string[] = [];
  lines.push("━━━ BRIEF FROM CREATOR ━━━");
  lines.push(`Total runtime: ${totalSec}s`);
  if (req.scriptType?.trim()) lines.push(`Script type / niche: ${req.scriptType.trim()}`);
  if (req.character?.trim()) lines.push(`Main character / subject:\n${req.character.trim()}`);
  if (req.referenceUrl?.trim()) lines.push(`Reference (style cue, do NOT copy): ${req.referenceUrl.trim()}`);
  if (req.notes?.trim()) lines.push(`Extra direction:\n${req.notes.trim()}`);

  if (req.previousScript && req.refineFeedback?.trim()) {
    lines.push("");
    lines.push("━━━ PREVIOUS SCRIPT (regenerate, applying the feedback below) ━━━");
    lines.push(JSON.stringify(req.previousScript).slice(0, 4000));
    lines.push("");
    lines.push("━━━ CREATOR FEEDBACK — APPLY THIS ━━━");
    lines.push(req.refineFeedback.trim());
    lines.push("");
    lines.push("Rewrite the FULL JSON in the same schema. Keep what worked, fix what the creator called out.");
  } else {
    lines.push("");
    lines.push("Write the full JSON now. Hooks first, payoff in Phase 3, CTA in Phase 4. Make every Veo 3 prompt strictly self-contained for its phase.");
  }
  return lines.join("\n");
}

// ─── Output expansion ─────────────────────────────────────────────────────────

function expandScript(raw: any): any {
  if (!raw) return null;
  return {
    title: String(raw.ti ?? ""),
    description: String(raw.ds ?? ""),
    caption: String(raw.cp ?? ""),
    hook: String(raw.hk ?? ""),
    cta: String(raw.ct ?? ""),
    hashtags: {
      youtube: Array.isArray(raw.tg?.yt) ? raw.tg.yt : [],
      instagram: Array.isArray(raw.tg?.ig) ? raw.tg.ig : [],
      tiktok: Array.isArray(raw.tg?.tt) ? raw.tg.tt : [],
    },
    phases: Array.isArray(raw.ph)
      ? raw.ph.map((p: any) => ({
          phase: Number(p?.n ?? 0),
          name: String(p?.tl ?? ""),
          duration: String(p?.du ?? ""),
          script: String(p?.sc ?? ""),
          visual: String(p?.vi ?? ""),
          motion: String(p?.mo ?? ""),
          veo3Prompt: String(p?.vp ?? ""),
          characterImagePrompt: String(p?.ci ?? ""),
        }))
      : [],
  };
}

// ─── Model calls ──────────────────────────────────────────────────────────────

async function callGeminiDirect(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  if (!apiKey.startsWith("AIza")) throw new Error("GEMINI_API_KEY malformed (must start with AIza)");

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_VIDEO_MODEL ?? "gemini-2.5-flash";

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.75,
      maxOutputTokens: 8000,
    },
  });
  return response.text ?? "";
}

async function callOpenRouter(systemPrompt: string, userPrompt: string): Promise<string> {
  const r = await openrouter.chat.completions.create({
    model: "google/gemini-2.5-flash",
    temperature: 0.75,
    max_tokens: 6000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  return r.choices[0].message.content || "";
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body: WriteRequest = await req.json();
    if (!body.character?.trim() && !body.scriptType?.trim() && !body.notes?.trim()) {
      return NextResponse.json(
        { error: "Provide at least a character, a script type, or notes." },
        { status: 400 }
      );
    }

    const totalSec = Math.max(8, Math.min(90, Math.round(Number(body.durationSec) || 30)));
    const audience = body.audience?.trim() || TARGET_AUDIENCE_DEFAULT;
    const phases = buildPhaseTimings(totalSec);
    const systemPrompt = buildSystemPrompt(totalSec, audience, phases);
    const userPrompt = buildUserBrief(body, totalSec);

    let content = "";
    let usedProvider = "";

    // Path 1: direct Gemini
    if (process.env.GEMINI_API_KEY) {
      try {
        content = await callGeminiDirect(systemPrompt, userPrompt);
        usedProvider = "gemini-direct";
      } catch (err: any) {
        console.warn(`[script-writer] Gemini direct failed: ${err?.message ?? err}. Falling back to OpenRouter.`);
      }
    }

    // Path 2: OpenRouter fallback
    if (!content) {
      try {
        content = await callOpenRouter(systemPrompt, userPrompt);
        usedProvider = "openrouter";
      } catch (err: any) {
        console.error(`[script-writer] OpenRouter failed: ${err?.message ?? err}`);
        return NextResponse.json(
          { error: "Both Gemini and OpenRouter failed. Check API keys / credits." },
          { status: 502 }
        );
      }
    }

    // Strip markdown fences and isolate JSON
    content = content
      .replace(/^\s*```json\s*/i, "")
      .replace(/^\s*```\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace > 0 && lastBrace > firstBrace) {
      content = content.slice(firstBrace, lastBrace + 1);
    }

    let raw: any;
    try {
      raw = JSON.parse(content);
    } catch (err: any) {
      console.error(`[script-writer] JSON parse failed (${usedProvider}). Length=${content.length}. Head: ${content.slice(0, 300)}\n...Tail: ${content.slice(-300)}`);
      return NextResponse.json(
        { error: "AI returned invalid JSON. Try again." },
        { status: 500 }
      );
    }

    const script = expandScript(raw);
    if (!script.phases || script.phases.length !== 4) {
      return NextResponse.json(
        { error: `AI returned ${script.phases?.length ?? 0} phases, expected 4. Try again.` },
        { status: 500 }
      );
    }

    return NextResponse.json({ script, provider: usedProvider });
  } catch (error: any) {
    console.error("[script-writer] error:", error);
    return NextResponse.json({ error: "Failed to generate script." }, { status: 500 });
  }
}
