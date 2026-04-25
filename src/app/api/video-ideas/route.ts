import { NextResponse } from "next/server";
import { openrouter } from "@/lib/openrouter";
import { getCached, setCache, cacheKey } from "@/lib/cache";

export const maxDuration = 120;

// ─── System Prompt ────────────────────────────────────────────────────────────

const DEFAULT_COUNT = 20;
const TAGS_PER_PLATFORM = 6;

type PhaseTiming = { name: string; label: string; seconds: number };

const DEFAULT_PHASES: PhaseTiming[] = [
  { name: "Pattern Interrupt", label: "0s-3s",  seconds: 3  },
  { name: "Build Tension",     label: "3s-12s", seconds: 9  },
  { name: "Climax / Reveal",   label: "12s-22s", seconds: 10 },
  { name: "Call to Action",    label: "22s-30s", seconds: 8  },
];

/**
 * Turn the analyzer's phaseBreakdown into concrete start-end labels for the prompt.
 * Falls back to DEFAULT_PHASES when the analysis didn't produce a usable breakdown.
 */
function computePhaseTimings(
  breakdown: Array<{ name?: string; duration?: number }> | undefined
): PhaseTiming[] {
  if (!Array.isArray(breakdown) || breakdown.length !== 4) return DEFAULT_PHASES;
  const defaultsByIndex = DEFAULT_PHASES;
  let cursor = 0;
  const out: PhaseTiming[] = [];
  for (let i = 0; i < 4; i++) {
    const secs = Math.max(1, Math.round(Number(breakdown[i]?.duration) || 0));
    if (!secs) return DEFAULT_PHASES;
    const start = cursor;
    const end = cursor + secs;
    cursor = end;
    out.push({
      name: String(breakdown[i]?.name || defaultsByIndex[i].name),
      label: `${start}s-${end}s`,
      seconds: secs,
    });
  }
  return out;
}

function buildSystemPrompt(count: number, phases: PhaseTiming[] = DEFAULT_PHASES): string {
  const totalSec = phases.reduce((sum, p) => sum + p.seconds, 0);
  const phaseRules = phases
    .map((p, i) => `  • Phase ${i + 1} "${p.name}" MUST use du="${p.label}" (${p.seconds}s) — matches the reference video's ${p.name.toLowerCase()} pacing.`)
    .join("\n");
  const [p1, p2, p3, p4] = phases;
  return `You are a viral content strategy genius AND a senior video-prompt engineer. Your ONE JOB is to extract the CREATIVE MECHANIC (the specific visual gimmick/formula/trick) from a reference video and clone it ${count} times with a DIFFERENT subject inside the same mechanic — and write prompts that feed real AI video generators (Kling, Motif, Runway) correctly.

━━━ MOTION IS EVERYTHING ━━━
A composition description alone ("orange baby on a table, spoon nearby") produces a FROZEN image when fed to a video model. You MUST describe WHAT MOVES.

Every phase needs TWO separate things:
  • "vi" = STATIC composition — framing, angle, colors, lighting, subject position
  • "mo" = MOTION / ACTION — what moves, how, in what order, using motion verbs

For the orange-baby reference:
  BAD  vi: "orange baby sits on wooden table"   mo: "orange baby is on a table" ❌ (mo is static)
  GOOD vi: "macro close-up, 50mm lens, orange baby centered on light wood, brown blurred background, soft warm side light"
  GOOD mo: "(0.0-0.8s) Silver spoon enters from right, carrying a small orange segment. (0.8-1.8s) The orange baby tilts its head up and its bottom peel-flap slowly opens like a mouth. (1.8-2.8s) Spoon delivers the segment into the mouth opening. (2.8-3.5s) The peel-mouth closes around the segment, baby's head tilts slightly with satisfaction."

━━━ WHAT IS A "CREATIVE MECHANIC"? ━━━
It is the specific, visible, reproducible TRICK that makes the reference video unique. Not the niche. Not the topic. The exact visual/narrative formula.

Examples (study these carefully — this is the level of specificity required):

REF: "Orange peeled and shaped into a baby body being fed with a silver spoon, close-up, brown blurred background"
  → Mechanic: "[FRUIT/FOOD] carved/shaped into a tiny baby figure with big cartoon eyes, being spoon-fed, close-up macro shot, soft blurred warm background"
  → Ideas: banana-baby, mango-baby, apple-baby, avocado-baby, potato-baby, bread-baby, cheese-baby, kiwi-baby, strawberry-baby, pear-baby, watermelon-slice-baby, pineapple-baby...

REF: "A hand slowly pours honey onto a stack of pancakes in slow motion, drone-top-down angle, golden hour light"
  → Mechanic: "[LIQUID] poured slowly in slow-mo over [STACKED FOOD], top-down shot, warm light"
  → Ideas: maple-syrup on waffles, chocolate on churros, ketchup on burger stack, caramel on cheesecake, sauce on pasta stack...

REF: "Man drops Mentos into Coke from above, camera catches explosion, reaction shot"
  → Mechanic: "[TRIGGER ITEM] dropped into [REACTIVE LIQUID], slow-mo explosion, surprised reaction"
  → Ideas: baking soda in vinegar, pop rocks in soda, alka-seltzer in water, dry ice in soapy water...

REF: "Mini-Cooper parallel-parking itself into an impossibly tiny gap, time-lapse"
  → Mechanic: "[VEHICLE] performing an [IMPOSSIBLE PRECISION MOVE], time-lapse, dramatic music"
  → Ideas: truck backing into warehouse dock, forklift stacking pallets, semi-truck U-turn, bike-through-crowd weave...

━━━ YOUR METHOD ━━━
STEP 1 — Read the reference breakdown and write ONE SENTENCE describing the creative mechanic, with the swappable subject in [BRACKETS]. The bracketed token is the ONLY thing that changes across ${count} ideas.

STEP 2 — Generate ${count} clones. For each, pick a new subject that fits the bracketed slot, keep EVERY other visual/tonal/emotional element identical to the reference. Same camera angle. Same lighting. Same pacing. Same emotional beat. Same background style. Only the subject changes.

STEP 3 — Do NOT drift into "related" content. A "healthy-food explainer" becomes banana/apple/kiwi explainers — NOT cooking tutorials, NOT grocery hauls, NOT workout videos.

━━━ RULES ━━━
1. Every "vi" (visual) field must describe the SAME shot composition as the reference — only the subject inside it differs
2. Every "sc" (script) must match the reference's tone and cadence
3. 4 phases per idea (${p1.name} / ${p2.name} / ${p3.name} / ${p4.name}), each 2-3 concrete sentences
4. ${TAGS_PER_PLATFORM} hashtags per platform (ig/tt/yt), tuned to the specific subject swap

━━━ PHASE DURATIONS (MANDATORY — MATCH THE REFERENCE VIDEO) ━━━
The reference video's pacing produced these phase durations. Total runtime: ${totalSec}s. Every idea you generate MUST use EXACTLY these "du" values — they are not flexible:
${phaseRules}
Do NOT shorten or lengthen phases. If the reference's Phase 1 is ${p1.seconds}s, every idea's Phase 1 is ${p1.seconds}s. Scripts, motion, and video prompts must fit within their phase's duration.

━━━ MECHANIC MUST CAPTURE MOTION TOO ━━━
The mechanic isn't just "what it looks like" — it's "what it DOES". Write the mechanic as: "[SUBJECT] + [signature motion the subject performs]".
  Example: "[FOOD ITEM] carved into a baby figure with oversized eyes, being spoon-fed — the baby opens its peel-mouth to receive each bite, tilts head in satisfaction, filmed in macro close-up with warm blurred background"

━━━ OUTPUT (compact JSON, short keys) ━━━
Each idea has a "ci" field (character image prompt) AND a "ph" array. Each phase has FOUR fields: "sc" (script/words), "vi" (static composition), "mo" (motion/action with verbs + timing + reactive motion), "vp" (Veo-ready video prompt).

━━━ "ci" FORMAT (character image prompt — for DALL-E 3 / Midjourney / Imagen) ━━━
"ci" is ONE dense paragraph, 50-90 words, describing the idea's main character/subject as a still image. Structured as:
  1. Subject identity and physical form — exact shape, proportions, materials/textures, facial features, expression, pose
  2. Wardrobe/surface details + environment/background + lighting (direction, color, quality) + camera framing (close-up / medium / wide) + lens hint (50mm, 85mm macro)
  3. MANDATORY quality tail: "Photorealistic, hyper-detailed, cinematic color grading, shallow depth of field, studio-grade sharpness, 9:16 vertical portrait. No text, no watermark, no distortion, consistent anatomy."

"ci" describes ONE hero still of that idea's character — not a scene in motion.

━━━ "vp" FORMAT (CRITICAL — video will glitch without these keywords) ━━━
"vp" is ONE self-contained paragraph for Veo 3.1 / Kling / Runway / Sora, 60-100 words, structured as:
  1. Subject + composition (who, framing, lighting, background)
  2. Motion with verbs and reactive micro-motions (head tilts toward, leans, anticipation beats, layered secondary motion)
  3. MANDATORY realism tail: "Shot in cinematic photorealism with smooth natural motion, accurate physics, consistent anatomy, stable subject identity, shallow depth of field, soft film grain, 50mm lens, 24fps. No morphing, no warping, no glitching, no artifacts, no text overlays."

The realism tail is NOT optional — without it, Veo produces warped anatomy and motion artifacts.

{"mechanic":"one-sentence mechanic with [SWAPPABLE] in brackets, including the signature motion","ideas":[{"id":1,"ti":"title","an":"angle","hk":"opening line","em":"curiosity","au":"viewer","vs":9,"ci":"character image prompt, 50-90 words with mandatory quality tail","ph":[{"n":1,"tl":"${p1.name}","du":"${p1.label}","sc":"exact words + text overlay","vi":"STATIC composition — framing, angle, lighting","mo":"MOTION — focal action + reactive micro-motions (head tilt, body lean, anticipation)","vp":"Veo-ready dense paragraph 60-100 words including the mandatory realism tail above"},{"n":2,"tl":"${p2.name}","du":"${p2.label}","sc":"...","vi":"...","mo":"...","vp":"..."},{"n":3,"tl":"${p3.name}","du":"${p3.label}","sc":"...","vi":"...","mo":"...","vp":"..."},{"n":4,"tl":"${p4.name}","du":"${p4.label}","sc":"...","vi":"...","mo":"...","vp":"..."}],"tg":{"ig":["#..."],"tt":["#..."],"yt":["#..."]},"ct":"CTA"}]}

CRITICAL:
- Generate ALL ${count} ideas. Same mechanic + same motion pattern, DIFFERENT subject.
- Every idea MUST have a "ci" field ending with the quality tail above.
- Every phase MUST have all four fields: sc, vi, mo, vp.
- Every "vp" MUST end with the realism tail (exact wording above).
- Every "mo" includes LAYERED motion — focal action + reactive/anticipatory motion.
- JSON only, no commentary, no markdown.`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildAnalysisContext(analysis: any, count: number): string {
  const s = analysis?.script;
  const rg = analysis?.replicationGuide;
  const vf = analysis?.viralFactors;
  const vm = analysis?.viewMagnet;
  const cp = analysis?.characterPrompts;

  const topFactors = (vf || [])
    .filter((f: any) => f.impact === "critical" || f.impact === "strong")
    .slice(0, 3)
    .map((f: any) => `• ${f.factor}: ${f.explanation}`)
    .join("\n");

  // Full scene breakdown — BOTH composition (visuals) and motion per scene
  const sceneBlock = (s?.scenes || [])
    .slice(0, 8)
    .map(
      (sc: any) =>
        `  ${sc.sceneNumber ?? "?"}. [${sc.timestamp ?? ""}] (${sc.emotion ?? "?"})\n` +
        `     Narration: "${(sc.narration ?? "").slice(0, 150)}"\n` +
        `     COMPOSITION (static): ${(sc.visuals ?? "").slice(0, 220)}\n` +
        `     MOTION (what moves): ${(sc.motion ?? "(not captured)").slice(0, 260)}`
    )
    .join("\n");

  // Character/subject — appearance AND signature motion
  const subjectBlock = (cp || [])
    .slice(0, 3)
    .map(
      (c: any) =>
        `  • ${c.name} (${c.role}, ${c.screenTime})\n` +
        `    APPEARANCE: ${(c.imagePrompt ?? "").slice(0, 260)}\n` +
        `    SIGNATURE MOTION: ${(c.motionPrompt ?? "(not captured)").slice(0, 200)}`
    )
    .join("\n");

  return `━━━ REFERENCE VIDEO — STUDY ITS CREATIVE MECHANIC ━━━

HOOK: "${s?.hook || "N/A"}"
CORE FORMULA (from analysis): ${rg?.coreFormula || "N/A"}
VIEW MAGNET MOMENT: "${vm?.moment || "N/A"}"
  → Why it works: ${vm?.psychology || "N/A"}
CTA: "${s?.cta || "N/A"}"

MAIN VISIBLE SUBJECT(S) — THIS IS WHAT GETS SWAPPED:
${subjectBlock || "  (none detected)"}

FULL SCENE BREAKDOWN — THE VISUAL FORMULA TO CLONE:
${sceneBlock || "  (none)"}

Top Viral Factors:
${topFactors || "N/A"}

Shooting Style: ${rg?.shootingGuide || "N/A"}
Sound Design: ${rg?.soundDesign || "N/A"}

━━━ YOUR TASK ━━━
1. Read the VISUAL descriptions above and the MAIN SUBJECT section. Identify the CREATIVE MECHANIC — the specific visual trick/gimmick. The subject(s) listed above is the variable that changes; everything else (composition, framing, lighting, pacing, tone, emotional beat) is FIXED.
   Example: if the main subject is "an orange carved into a baby being fed with a spoon", the mechanic is "[FOOD ITEM] carved into a baby figure being spoon-fed, macro shot, blurred warm background".

2. Write your extracted mechanic as ONE sentence with the swappable element in [BRACKETS], and put it in the "mechanic" field of your JSON.

3. Generate ${count} ideas. Every idea is the SAME mechanic with a DIFFERENT thing in the brackets. Do NOT change the composition, lighting, or tone. Only the subject.

4. Each idea's "vi" (visual) field must describe the SAME shot as the reference with the new subject plugged in. Each "sc" (script) matches the reference's tone and length.`;
}

function expandIdeas(raw: any): any[] {
  return (raw?.ideas || []).map((idea: any) => ({
    id: idea.id ?? 0,
    title: idea.ti ?? "",
    angle: idea.an ?? "",
    hook: idea.hk ?? "",
    emotion: idea.em ?? "curiosity",
    audience: idea.au ?? "",
    viralScore: Number(idea.vs ?? 7),
    characterImage: idea.ci ?? "",
    phases: (idea.ph || []).map((p: any) => ({
      phase: p.n ?? 1,
      title: p.tl ?? "",
      duration: p.du ?? "",
      script: p.sc ?? "",
      visual: p.vi ?? "",
      motion: p.mo ?? "",        // NEW: motion/action with verbs + timing
      videoPrompt: p.vp ?? "",   // NEW: ready-to-paste video-generator prompt
    })),
    hashtags: {
      instagram: idea.tg?.ig ?? [],
      tiktok: idea.tg?.tt ?? [],
      youtube: idea.tg?.yt ?? [],
    },
    cta: idea.ct ?? "",
  }));
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const {
      videoUrl,
      analysis,
      skipCache,
      count: rawCount,
      excludeTitles,
      phaseBreakdown,
    } = await req.json();

    if (!analysis) {
      return NextResponse.json({ error: "Analysis data is required" }, { status: 400 });
    }

    const exclude: string[] = Array.isArray(excludeTitles) ? excludeTitles.filter(Boolean) : [];
    const isAppend = exclude.length > 0;
    const count = Math.max(1, Math.min(30, Number(rawCount) || (isAppend ? 10 : DEFAULT_COUNT)));

    const key = cacheKey("video-ideas", videoUrl || "unknown");

    // Only serve/write cache for the initial (non-append) default-sized call.
    const useCache = !isAppend && count === DEFAULT_COUNT;

    if (useCache && !skipCache) {
      const cached = getCached(key);
      if (cached) {
        // Backward-compat: older cache entries may be a bare ideas array
        if (Array.isArray(cached)) {
          return NextResponse.json({ ideas: cached, mechanic: null });
        }
        return NextResponse.json(cached);
      }
    }

    const context = buildAnalysisContext(analysis, count);
    const excludeBlock = exclude.length
      ? `\n━━━ ALREADY-GENERATED IDEAS — DO NOT REPEAT ━━━\nThe user already has these ${exclude.length} ideas. Your ${count} new ideas MUST use COMPLETELY DIFFERENT bracketed subjects. No variations, no synonyms, no near-duplicates.\nExisting titles:\n${exclude.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}\n`
      : "";

    // response_format is intentionally omitted — Gemini via OpenRouter stalls on
    // JSON-mode enforcement and times out. The system prompt's "JSON only" is enough.
    const response = await openrouter.chat.completions.create({
      model: "google/gemini-2.0-flash-001",
      temperature: 0.65,
      max_tokens: 7000,
      messages: [
        { role: "system", content: buildSystemPrompt(count, computePhaseTimings(phaseBreakdown)) },
        {
          role: "user",
          content: `${context}${excludeBlock}

Now generate ALL ${count} ideas.

CHECKLIST before you write each idea:
  ✓ Did I extract the exact creative mechanic (visual gimmick/trick) into the "mechanic" field with [BRACKETS] around the swappable part?
  ✓ Is each of my ${count} ideas literally the same mechanic with a different thing in the brackets?
  ✓ Is every "vi" field describing the SAME shot composition as the reference, just with the new subject plugged in?
  ✓ Am I keeping lighting, camera angle, background, and emotional beat IDENTICAL to the reference?
  ✓ Am I changing ONLY the bracketed subject across ideas?
  ✓ Does every idea have a "ci" character image prompt ending with the quality tail?${exclude.length ? "\n  ✓ Is every new subject completely different from the already-generated titles listed above?" : ""}

If the reference is an orange carved into a baby being fed, my ideas are: banana-baby, mango-baby, apple-baby, avocado-baby, bread-baby, cheese-baby... NOT "other cute food videos" or "fruit recipes".

Output only the JSON object — no markdown, no explanation.`,
        },
      ],
    });

    let content = response.choices[0].message.content || "";

    // Strip markdown code fences Gemini sometimes adds despite instructions
    content = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // Extract outermost JSON object if model wrapped it in prose
    const firstBrace = content.indexOf("{");
    const lastBraceAll = content.lastIndexOf("}");
    if (firstBrace > 0 && lastBraceAll > firstBrace) {
      content = content.slice(firstBrace, lastBraceAll + 1);
    }

    let raw: any = null;
    try {
      raw = JSON.parse(content);
    } catch {
      // Salvage truncated output: walk the "ideas" array and keep every fully-closed object
      const match = content.match(/"ideas"\s*:\s*\[/);
      if (match) {
        const start = match.index! + match[0].length;
        const objects: string[] = [];
        let depth = 0;
        let inString = false;
        let escape = false;
        let objStart = -1;

        for (let i = start; i < content.length; i++) {
          const ch = content[i];
          if (escape) { escape = false; continue; }
          if (ch === "\\") { escape = true; continue; }
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (ch === "{") {
            if (depth === 0) objStart = i;
            depth++;
          } else if (ch === "}") {
            depth--;
            if (depth === 0 && objStart !== -1) {
              objects.push(content.slice(objStart, i + 1));
              objStart = -1;
            }
          }
        }

        const parsed: any[] = [];
        for (const o of objects) {
          try { parsed.push(JSON.parse(o)); } catch { /* skip bad */ }
        }
        if (parsed.length > 0) {
          raw = { ideas: parsed };
          console.warn(`[video-ideas] Salvaged ${parsed.length} ideas from truncated response`);
        }
      }

      if (!raw) {
        console.error("[video-ideas] JSON parse failed. Raw preview:", content.slice(0, 500));
        return NextResponse.json(
          { error: "AI returned invalid data. Try again." },
          { status: 500 }
        );
      }
    }

    const ideas = expandIdeas(raw);
    const mechanic = typeof raw?.mechanic === "string" ? raw.mechanic : null;

    if (ideas.length === 0) {
      return NextResponse.json({ error: "AI returned no ideas. Try again." }, { status: 500 });
    }

    if (mechanic) {
      console.log(`[video-ideas] Extracted mechanic: ${mechanic}`);
    }

    const payload = { ideas, mechanic };
    if (useCache) setCache(key, payload);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Video ideas error:", error);
    return NextResponse.json({ error: "Failed to generate ideas." }, { status: 500 });
  }
}
