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

━━━ VEO 3 FAST PHASE-PROMPT RULES (VIRAL-GRADE — STRICT) ━━━
You are writing for Veo 3 Fast inside Google Flow. The goal is NOT "no glitches" alone — the goal is a viral-grade cinematic clip that looks like it came from a top studio short, the kind that hits a million views. The top AI video creators write prompts like a DOP's shot list: cinema camera + lens + film stock + lighting + atmosphere + kinematic timing + sensory detail + emotional anchor — woven into one dense paragraph. That's what makes Veo render with depth, mood, and film-grade texture instead of soft AI-generic look.

Defend against three failure modes WHILE pushing for cinematic quality:
  FAILURE A — TELEPORT GLITCH (boundary-frames-only prompt → Veo invents middle).
  FAILURE B — FAST-MOTION COMPRESSION (too many beats packed in → Veo speeds up).
  FAILURE C — AUTOCOMPLETE OVERREACH (dead air → Veo invents extra actions/cuts).

Each phase's "vp" MUST be 6 sections, 200-280 words total:

  1. CINEMATIC ATMOSPHERE LOCK (1-2 sentences — THE QUALITY MULTIPLIER):
     Open with the cinematic identity. Mandatory:
       • CAMERA + LENS: real cinema camera (Arri Alexa Mini, RED Komodo 6K, Sony Venice 2) + real lens (Cooke S4 32mm, Sigma Art 50mm f/1.4, Leica Summilux 35mm) + aperture (f/1.8 / f/2.8 / f/4) + framing.
       • FILM STOCK / GRADE: pick a real aesthetic that fits the niche — "Kodak Vision3 250D film grain with subtle halation", "Portra 400 emulation milky highlights", "A24 muted naturalism with green-shadow lift", "Wong Kar-wai saturated neon palette", "60s Kodachrome warm reds", "modern HDR commercial polish with crushed blacks".
       • LIGHTING: motivated 3-point with direction + color temp (3200K / 5600K / mixed) + quality (hard / soft / wraparound). Example: "warm tungsten key from camera-left at 45°, cool 5600K window fill, rim from above separating subject from black".
       • ATMOSPHERE: visible layer in air — fog / dust motes / steam / neon haze / blue-hour beams.
       • COLOR PALETTE: 2-3 dominant tones.
     Aspect ratio: 9:16 vertical (always).

  2. OPENING FRAME LOCK (1 sentence): subject AS FROZEN AT t=0.0s within that atmosphere — body part positions, eye direction. NO motion verbs yet.

  3. KINEMATIC TIMELINE — DENSE TICS (the bulk):
     Walk with timestamped tics. Density: phases ≤4s → 4+ tics/sec; 4-8s → 2+ tics/sec; >8s → 1+ tic/sec. First tic = t=0.0s. Last tic = clip end. For each moving element at each tic: position (x=%, y=%), angle, velocity verb, AND parallel reactive body-part motion. CAP: max 3 distinct actions per 1-second window — if more, REMOVE actions, never compress. Real-world tempo anchors: eye blink 100-150ms, lip-corner tighten 200-300ms, head turn 90° 400-600ms, hand reaching 30cm 500-800ms, slow-motion ASMR 1500-2500ms.

  4. SENSORY + EMOTIONAL ANCHORS (2 sentences):
     SOUND DESIGN: ambient + subject-specific micro-sound (Veo silent but this pushes texture rendering). TEXTURE: tactile description of 1-2 key materials. EMOTIONAL ANCHOR: the feeling tied to a specific facial cue.

  5. ANTI-AUTOCOMPLETE HOLD (1-2 sentences, MANDATORY):
     Substitute [N] with THIS phase's actual seconds. If motion completes before clip end, append: "From t=X.Xs to t=[N].0s: hold the final frame — subject frozen in pose described, breathing micro-motion only, no further action, no camera change, no new elements entering frame." Then literally: "Final frame at t=[N].0s: [exact static composition — every body part position, every gaze, every prop]."

  6. ANTI-GLITCH TAIL (verbatim, replace [N] with phase seconds):
     "[N]-second single continuous take. Render ONLY what is described between t=0.0s and t=[N].0s. Do not invent additional actions, do not extend beyond the timeline, do not add unprompted reactions or camera moves, do not animate elements not listed. Smooth interpolation between every described position, viral-grade cinematic photorealism, film-stock grain texture, accurate physics, consistent anatomy, stable subject identity, motivated lighting, shallow depth of field, 24fps. No cuts, no transitions, no jumps, no teleporting, no fast-motion, no morphing, no warping, no glitching, no plastic skin, no AI-generic look, no theatrical exaggeration, no over-saturated color, no text overlays."

━━━ HIGH-QUALITY VEO PROMPT — STUDY THIS EXAMPLE OF THE STANDARD ━━━
Every "vp" must read at this calibre:

"Cinematic medium close-up of a young chef in a dimly-lit Tokyo ramen shop, shot on Arri Alexa Mini with a 50mm Cooke S4 anamorphic at f/1.8, 9:16 vertical. Kodak Vision3 250D film grain with subtle halation in highlights. Lighting: warm tungsten key from camera-left at 3200K creating a soft cheekbone shadow, cool 5600K rim from a paper window cutting through steam, dim practical from a hanging bulb behind. Atmosphere: visible kitchen steam drifting upward in slow vertical columns, dust motes catching the rim light. Color palette: deep umber browns and amber broth highlights against a charcoal background. (t=0.0s) Chef centered, holding an iron ladle at chest height; head neutral; eyes calm on the bowl below; right wrist locked. (t=0.4s) Right wrist begins rotating ~25° forward at constant rate; broth flows in a thin amber stream from ladle to bowl; eyes track the pour; left hand steadies the bowl rim. (t=0.9s) Stream reaches mid-bowl; chef's chin lifts 2°; eyebrows soften; rim light catches steam rising. (t=1.3s) Wrist completes rotation, ladle empties; lip-corners tighten 2mm in quiet pride; left hand releases the bowl. (t=1.6s) Ladle settles on stone counter; eyes lift to meet camera; shoulders relax 3mm. From t=1.6s to t=2.0s: hold the final frame — chef centered, eyes locked on camera, ladle resting flat, bowl steaming, breathing micro-motion only. Final frame at t=2.0s: chef's eyes meeting camera with calm certainty, ladle on stone, bowl steaming, steam rising in a single column. Sound design: low refrigeration hum, soft viscous broth pour, single ceramic clink at t=1.6s. Texture: matte iron ladle with patina, fine porcelain bowl with hairline glaze cracking, broth showing fat-globule reflections. The clip captures the quiet pride of a craftsperson finishing their work and meeting the audience without a word. 2.0-second single continuous take. Render ONLY what is described between t=0.0s and t=2.0s. Do not invent additional actions, do not extend beyond the timeline, do not add unprompted reactions or camera moves, do not animate elements not listed. Smooth interpolation between every described position, viral-grade cinematic photorealism, film-stock grain texture, accurate physics, consistent anatomy, stable subject identity, motivated lighting, shallow depth of field, 24fps. No cuts, no transitions, no jumps, no teleporting, no fast-motion, no morphing, no warping, no glitching, no plastic skin, no AI-generic look, no theatrical exaggeration, no over-saturated color, no text overlays."

That example is ~270 words. Yours should be 200-280 words at the same level of cinematic specificity.

BANNED PHRASES inside "vp" (each one creates a temporal gap or invites autocomplete):
  • "then…", "afterwards…", "later…", "and finally…", "soon after…", "eventually…"
  • "the camera reveals", "cut to", "scene shifts", "we see", "pan to", "we then…"
  • "they continue to…", "the action progresses to…"
  • Vague speed: "quickly", "slowly", "fast", "rapidly" — replace with velocity ("25% screen-width per second") or duration ("over 600ms").
Replace ALL with explicit timestamped tics ("(t=1.2s) ...; (t=1.6s) ...").

Cross-phase continuity: the character's appearance, wardrobe, environment, and lighting must be IDENTICAL across all 4 phases — only the timestamped action advances. Each phase's "vp" must REPEAT the character/setting description in section 1 so Veo doesn't drift between clips.

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
      "vp": "Viral-grade Veo 3 Fast prompt 200-280 words. 6 sections: (1) cinematic atmosphere lock — real cinema camera + lens + film stock + lighting + atmosphere + color palette; (2) opening frame lock at t=0.0s; (3) dense timestamped kinematic timeline; (4) sensory + emotional anchors (sound design, texture, feeling); (5) hold + 'Final frame at t=N.0s: ...'; (6) verbatim anti-glitch tail. Match the example calibre.",
      "ci": "character image prompt obeying the realism rules above. 50-90 words including the realism tail."
    },
    { "n": 2, "tl": "${phases[1].name}", "du": "${phases[1].label}", "sc": "...", "vi": "...", "mo": "...", "vp": "...", "ci": "..." },
    { "n": 3, "tl": "${phases[2].name}", "du": "${phases[2].label}", "sc": "...", "vi": "...", "mo": "...", "vp": "...", "ci": "..." },
    { "n": 4, "tl": "${phases[3].name}", "du": "${phases[3].label}", "sc": "...", "vi": "...", "mo": "...", "vp": "...", "ci": "..." }
  ]
}

OUTPUT RULES:
- JSON only, no markdown, no commentary.
- Every "vp" MUST contain ALL 6 sections in order: cinematic atmosphere lock → opening frame lock → kinematic timeline → sensory+emotional anchors → hold → anti-glitch tail.
- Every "vp" MUST name a real cinema camera + lens + film stock or grade in section 1. NO generic "cinematic" — use Arri/RED/Sony/Cooke/Sigma/Leica + Vision3/Portra/A24/Wong-Kar-wai-style names. Atmosphere layer (fog/dust/steam/neon/blue-hour) and 2-3 color palette must appear.
- Every "vp" MUST contain DENSE timestamped tics — at least ${Math.max(4, phases[0].seconds * 3)} tics for Phase 1 (≥3 per second). First tic = t=0.0s. Last tic = phase duration.
- Every "vp" MUST include SOUND DESIGN line, TEXTURE line, and EMOTIONAL ANCHOR line.
- Every "vp" MUST include the HOLD instruction (if motion completes early) AND the "Final frame at t=N.0s:" line AND the verbatim anti-glitch tail.
- Every "vp" MUST be 200-280 words. This is non-negotiable — shorter prompts produce AI-generic output, not viral-grade.
- Every "vp" obeys the pacing cap: ≤3 distinct actions per 1-second window at natural human/physical tempo.
- Every "vp" MUST contain ZERO banned phrases ("then", "afterwards", "later", "and finally", "cut to", "we see", "scene shifts", "pan to", "soon after", "quickly", "slowly", "rapidly").
- Every "ci" MUST end with the image realism tail above.
- The 4 phases MUST use these exact "tl" and "du" values — do not alter them.
- Each phase's "vp" must repeat the character/setting description so visual continuity holds across phases.
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
      maxOutputTokens: 16000,
      // Disable thinking — see gemini-video/index.ts comment.
      thinkingConfig: { thinkingBudget: 0 },
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
