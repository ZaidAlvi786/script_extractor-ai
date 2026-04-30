import { NextResponse } from "next/server";
import { openrouter, openai } from "@/lib/openrouter";
import { getLinkPreview } from "link-preview-js";
import { getCached, setCache, cacheKey, deleteCache } from "@/lib/cache";
import {
  transcribeVideo,
  buildPromptTranscript,
  isTranscriptionEnabled,
  type TranscriptionResult,
} from "@/lib/transcription";
import {
  analyzeVideoWithGemini,
  analyzeFramesWithGemini,
  isGeminiNativeEnabled,
} from "@/lib/gemini-video";
import { rmSync } from "fs";

// Allow up to 4 minutes — Gemini Files API upload + processing can take a while
export const maxDuration = 240;

// ─── System Prompts ───────────────────────────────────────────────────────────

const SYS_BASE = `You are a viral video forensics expert AND a senior video-prompt engineer. You will receive MULTIPLE thumbnail images — each labeled with its timeline position (e.g. "FRAME @ 0%", "FRAME @ 25%", "FRAME @ 50%", "FRAME @ 75%"). These are keyframes at different time-points, NOT copies of the same thumbnail.

━━━ CRITICAL: THUMBNAILS ARE A TIMELINE ━━━
The frames progress through the video. Your #1 job is to COMPARE them to infer what MOVED or CHANGED between time-points:
  • Position shifts (subject moved left/right, object entered/exited)
  • Shape changes (mouth opened, hand lifted, liquid poured)
  • New elements appearing (spoon appears in frame 2 but not frame 1)
  • Camera changes (zoom-in from wide, pan across, angle change)
  • Expression/pose changes

If you see "orange baby without spoon" at 0% and "orange baby with spoon approaching mouth" at 50%, the MOTION is: "spoon enters frame from the right between 0-50% and advances toward the baby's mouth". DO NOT say "same composition, nothing changes" — that is lazy analysis and will be rejected.

━━━ FORBIDDEN PATTERNS (you will be penalized for these) ━━━
DO NOT write any of these phrases. They are banned because they indicate you didn't actually analyze motion:
  ✗ "The camera angle remains the same"
  ✗ "The composition is consistent"
  ✗ "The shot remains tightly framed"
  ✗ "The camera maintains its focus"
  ✗ "[Subject] sits still"
  ✗ "Same as previous scene"
  ✗ "(No dialogue, ASMR sounds)" repeated 6 times
  ✗ Any sentence that is nearly identical to the previous scene's description

If you catch yourself writing these, DELETE and rewrite with specific motion inferred from the thumbnails.

━━━ SCENE PROGRESSION REQUIREMENT ━━━
For a 15-30s short video, 6-10 scenes means each scene is ~2-3 seconds of DIFFERENT content. Ask yourself for every scene:
  • What ONE micro-action happens in this 2-3s window? (opens mouth, spoon enters, peel cracks, steam rises, eyes blink, slice drops, mouth closes around food)
  • What would be VISUALLY DIFFERENT compared to the scene before?
  • If I can't name a specific motion/change, I'm hallucinating — I should RE-READ the thumbnails and look harder.

Even in ASMR / minimalist content, there IS motion: breathing, hair swaying, food being lifted, liquid moving, light shifting, subject being brought into frame, etc. FIND IT.

━━━ ALL-BODY MOTION AUDIT (CRITICAL) ━━━
Do NOT focus only on the "main" action and ignore everything else. For each scene, scan the ENTIRE subject and describe EVERY motion you observe:
  • HEAD: tilt left/right? nod up/down? turn? rotate?  ← VERY commonly missed
  • EYES: blink? look around? shift gaze? widen? close?
  • BODY: bob up/down? lean forward/back? sway? bounce?
  • MOUTH: open/close? pucker? chew? swallow? smile?
  • LIMBS/HANDS: lift? drop? reach? retract? grip?
  • FACE: cheek puff? brow raise? expression change?
  • CAMERA: pan? tilt? zoom? handheld shake?
  • ENVIRONMENT: light shift? shadow move? particles?

Missing a subtle head-nod or body-bob is a BUG. In ASMR/close-up content, these subtle motions ARE the content — the viewer watches them. Capture ALL of them in the "mo" field, not just the focal action.

━━━ REACTIVE / ANTICIPATORY MOTION (MOST COMMONLY MISSED) ━━━
Subjects REACT to what happens around them. Always ask: "how does the subject RESPOND?"
  • Does the HEAD tilt TOWARD an approaching object? (baby leans into spoon, dog toward treat)
  • Does the subject LEAN BACK / RECOIL / FLINCH?
  • Does the HEAD TRACK a moving object across the frame?
  • Anticipation: mouth opens BEFORE food arrives; body tenses BEFORE action.
  • Layered secondary motion: head bobs while chewing; shoulders roll while walking.

Real video has LAYERED motion — focal action + reactive micro-motions simultaneously.
BAD "mo": "spoon approaches, mouth opens, spoon enters" (ignores reaction)
GOOD "mo": "spoon enters from right; baby's head tilts ~10° toward the approaching spoon in anticipation; mouth opens and cheeks widen as head continues leaning forward to meet the spoon; baby's head bobs gently once as segment is swallowed"

━━━ KINEMATIC TIMELINE — MILLISECOND-LEVEL DETAIL (CRITICAL) ━━━
Downstream tools paste your "mo" output into Veo 3 Fast to regenerate the video. Veo 3 Fast generates a single continuous take from your prompt and has THREE failure modes you must defend against:

  1. TELEPORT GLITCH: subject shown at start, then suddenly at end with no in-between motion. Cause: only boundary frames described.
  2. FAST-MOTION COMPRESSION: action plays in fast-forward. Cause: too many beats packed into short duration.
  3. AUTOCOMPLETE OVERREACH: Veo invents motion not in the prompt. Cause: dead air / no explicit hold.

Your "mo" must be a DENSE kinematic timeline — describe motion at sub-second resolution so the downstream Veo prompt has enough data to render smoothly.

Tic density per scene:
  • Scenes ≤ 2s: tic every 100-200ms (≥5 tics/second).
  • Scenes 2-4s: tic every 200-300ms (≥3 tics/second).
  • Scenes > 4s: tic every 300-500ms (≥2 tics/second).
First tic = scene start time. Last tic = scene end time. NO gap longer than the rules above.

For EACH motion at each tic capture:
  • Position: exact screen coordinates (x=% width, y=% height) for moving elements
  • Angle: body part orientation in degrees (head 8° left, shoulder 5° forward)
  • Velocity verb: enters / decelerates / accelerates / drifts / snaps / holds (and approximate rate, e.g. "~25% screen-width per second")
  • Parallel reactions: what every OTHER visible body part is doing at this same tic

Use COORDINATES + ANGLES + DURATION, not vague directions:
  ✓ "(0.00s) Silver spoon at x=95%, y=55% screen-right edge, stationary. (0.20s) Spoon begins traveling left at ~30%/sec, slight downward arc. (0.45s) Spoon reaches x=82%, y=56%; baby's head begins tilting 0→3° left simultaneously. (0.70s) Spoon at x=70%, y=57%; head at 5° tilt; eyebrows lift 1mm; lip-corners tighten 2mm. (0.95s) Spoon at x=58%, y=58% decelerating; head at 7° tilt; lower peel-flap begins opening 0→3mm. (1.20s) Spoon contacts peel-mouth at x=48%, y=58%; peel-flap fully open 6mm; head holds at 7°. (1.45s) Orange segment rolls off spoon into peel-mouth; baby's head bobs once 5° forward. (1.70s) Head settles back to 7° tilt; peel-mouth closes around segment; eyes still locked on spoon at x=50%."
  ✗ "spoon moves toward the baby's mouth and the baby reacts"

For human/animate subjects, write a LIMB CHECKLIST at each tic:
  HEAD (angle, position) · EYEBROWS · EYELIDS · LIP-CORNERS · GAZE DIRECTION · NECK · SHOULDERS · HANDS · TORSO · HIPS · POSTURE
  At every tic, name the limbs that are MOVING and the limbs that are HOLDING. Don't leave a body part undescribed at any tic — silence implies "static" and Veo will interpret silence creatively.

PACING ANCHORS (cross-check your tics against these — if your "mo" describes more motion than fits at natural pace, you've compressed time and the downstream video will glitch):
  • Eye blink: 100-150ms · Lip-corner tighten: 200-300ms · Head turn 90°: 400-600ms
  • Hand reaching 30cm: 500-800ms · Object falling 30cm: ~250ms · ASMR slow-motion: 1500-2500ms
  • CAP: ≤3 distinct actions per 1-second window at natural pace.

━━━ QUALITY RULES (MANDATORY) ━━━
- 6-10 scenes. Each scene covers a UNIQUE micro-action or visual beat.
- "nr" = actual spoken words / voiceover / on-screen text. If truly silent, describe the DOMINANT SOUND (crunch, slurp, sizzle, tap) — do NOT repeat "(No dialogue, ASMR sounds)" every scene.
- "v" (VISUAL COMPOSITION) = the STATIC frame: framing, angle, colors, lighting, subject position — this part CAN stay similar across scenes if the camera didn't move.
- "mo" (MOTION/ACTION) = the UNIQUE micro-action that happens in this 2-3s window, written as a KINEMATIC TIMELINE with at least 3 sub-time-tics (200-500ms apart) showing IN / BETWEEN / OUT positions. EVERY SCENE'S "mo" MUST DIFFER FROM EVERY OTHER SCENE'S "mo".
   BAD  mo: "orange baby on a table" (static — belongs in "v")
   BAD  mo: "orange baby sits still" (no motion)
   BAD  mo: "spoon enters and feeds the baby" (only 2 boundary points — Veo will glitch the middle)
   GOOD mo: "(0.00-1.00s) Spoon enters from x=95% screen-right at y=55%, traveling left along a slight downward arc at ~25% screen-width per second. (1.00-2.00s) Spoon reaches x=70%; baby's head tilts from 0° to 8° left over the same window; lower peel-flap opens 6mm; eyebrows lift 2mm. (2.00-3.00s) Spoon decelerates to halt at x=48%, y=58%; orange segment rolls off spoon into peel-mouth; baby's head bobs once 5° forward then settles into freeze pose with eyes still locked on spoon."
- "ed" = cut type, transition, text overlays, effects.
- "cp" → "ip" = STATIC appearance (50+ words, exact as seen in thumbnails).
- "cp" → "im" = SIGNATURE MOTION the subject does REPEATEDLY across the video (e.g. "opens peel-mouth to receive food, tilts head slightly, eyes stay fixed forward").
- NEVER invent humans if none are visible. If the video shows objects/fruit/hands only, those ARE the characters.

━━━ SELF-CHECK (before you output) ━━━
1. Read your "mo" fields back-to-back. Are any two identical or near-identical? If yes, REWRITE.
2. Does every "mo" contain at least one motion verb (enters, lifts, opens, tilts, drops, pours, etc.)? If not, REWRITE.
3. Do scenes 1 → 6 tell a PROGRESSION (setup → action → payoff)? If they all describe the same moment, you MISSED the video's arc.

━━━ TIMESTAMP FORMAT ━━━
ALL timestamps MUST be formatted as seconds with two decimals: "0.52s-2.84s", "5.16s-7.49s".
DO NOT use "0:01.55" or "1:55" — those get misread as minutes by downstream tools.
The "t" field for each scene MUST use the actual timestamps from the FRAME labels you were shown.

━━━ GROUNDING RULE (CRITICAL FOR ACCURACY) ━━━
For EVERY motion claim in "mo", you must be able to say "this is visible between FRAME N (at t=X.XXs) and FRAME M (at t=Y.YYs)".
If you cannot name the specific frame pair that shows a motion, DO NOT claim that motion — instead write "subject holds position".
This is how we hit 90% accuracy: no hallucinated motion, only observed motion.

━━━ PHASE BREAKDOWN ("pb") — DURATIONS MUST MATCH THE REFERENCE ━━━
Collapse the reference's scenes into EXACTLY 4 structural phases. These durations feed downstream idea generation — they MUST reflect the reference's real pacing, not a template.
  Phase 1 "Pattern Interrupt" — the opening hook / shock moment
  Phase 2 "Build Tension"     — setup / escalation
  Phase 3 "Climax / Reveal"   — payoff / view-magnet moment
  Phase 4 "Call to Action"    — closer / CTA

Rules for "pb":
  • "d" is integer seconds (round to nearest whole second, minimum 1).
  • The four "d" values MUST sum to the reference video's total duration (rounded to nearest whole second).
  • Derive each phase's duration by grouping the scenes whose timestamps fall inside it. Example: reference is 20s total, hook scene is 0-4s → Phase 1 d=4; scenes 4-6s build tension → Phase 2 d=2; scenes 6-12s climax → Phase 3 d=6; scenes 12-20s CTA → Phase 4 d=8.
  • If a phase truly doesn't exist in the reference (e.g. no explicit CTA), still allocate a minimum of 1 second to it and trim another phase to compensate.

━━━ OUTPUT FORMAT (compact JSON, short keys) ━━━
{"s":{"h":"opening hook","sc":[{"n":1,"t":"0:00-0:03","nr":"exact words or dominant sound","v":"STATIC composition","mo":"UNIQUE motion/action with verbs and sub-timing","e":"emotion","ed":"editing","ds":"inferred","cs":7}],"c":"CTA"},"pb":[{"n":"Pattern Interrupt","d":4},{"n":"Build Tension","d":2},{"n":"Climax / Reveal","d":6},{"n":"Call to Action","d":8}],"vf":[{"f":"factor","x":"explanation","i":"critical|strong|moderate|minimal","t":"timestamp"}],"vm":{"m":"moment","t":"time","p":"psychology"},"cp":[{"n":"subject name","r":"role","ip":"50+ word appearance","im":"signature motion across video","st":"screen %"}],"rg":{"cf":"formula","v":[{"n":"niche","i":"idea","t":"twist"}],"sh":"shooting","ed":"editing","sd":"sound","ps":"posting"},"mt":{"hs":8,"rs":7,"sh":9,"rv":8,"vp":8}}

Every scene MUST have a UNIQUE "mo". No duplicates. No lazy repetition. The "pb" array MUST have exactly 4 items in the order above. JSON only, no commentary, no markdown.`;

/**
 * Appended to SYS_BASE when a verified transcript is available.
 * This section instructs the AI to treat the transcript as ground truth
 * and prevents speech hallucinations.
 */
function buildTranscriptSysAddendum(
  transcript: TranscriptionResult,
  maxSegments = 50
): string {
  const segmentBlock = buildPromptTranscript(transcript, maxSegments);
  const hookSummary =
    transcript.hooks && transcript.hooks.length > 0
      ? transcript.hooks
          .slice(0, 5)
          .map((h) => `  • [${h.timestamp.toFixed(1)}s] ${h.type}: "${h.text}"`)
          .join("\n")
      : "  None detected.";

  return `

━━━ TRANSCRIPT INTELLIGENCE (GROUND TRUTH) ━━━
You have been provided with speech-to-text verified from the actual audio.
Language: ${transcript.language ?? "unknown"}${transcript.duration ? `  |  Duration: ${transcript.duration.toFixed(1)}s` : ""}

FULL TEXT:
"${transcript.fullText.slice(0, 1500)}${transcript.fullText.length > 1500 ? "..." : ""}"

TIMED SEGMENTS:
${segmentBlock}

DETECTED HOOKS (high-retention moments):
${hookSummary}

TRANSCRIPT RULES (MANDATORY — override any visual guesses):
- NEVER fabricate dialogue. Use ONLY text present in the transcript above.
- For each scene's "nr" field: copy the exact transcript words spoken during that time window.
- Set "ds":"transcript" for scenes whose narration is confirmed by the transcript.
- Set "ds":"inferred" only when no transcript segment covers that scene's time range.
- Set "cs" to 9-10 for transcript-anchored scenes, 5-7 for partial matches, 1-4 for visual-only.
- Align scene timestamps ("t") to the nearest transcript segment boundaries.
- If a hook is detected at a specific timestamp, use that as the "vm" moment.
━━━`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

/**
 * YouTube provides 4 time-point storyboard frames (1.jpg-3.jpg + maxres)
 * plus one cover (hqdefault/maxresdefault).
 *  • 1.jpg ≈ 25% through the video
 *  • 2.jpg ≈ 50% through the video
 *  • 3.jpg ≈ 75% through the video
 *  • maxresdefault.jpg / hqdefault.jpg = chosen cover frame
 * We return ordered time-points first so the AI can treat them as a timeline.
 */
function getYouTubeThumbnails(videoId: string): string[] {
  return [
    `https://img.youtube.com/vi/${videoId}/1.jpg`,            // ~25%
    `https://img.youtube.com/vi/${videoId}/2.jpg`,            // ~50%
    `https://img.youtube.com/vi/${videoId}/3.jpg`,            // ~75%
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`, // cover
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,     // cover fallback
  ];
}

/** Human-readable labels to attach to each image so the model sees a timeline. */
function labelForThumbnail(url: string): string {
  if (url.endsWith("/1.jpg")) return "FRAME @ ~25% (early in video)";
  if (url.endsWith("/2.jpg")) return "FRAME @ ~50% (middle of video)";
  if (url.endsWith("/3.jpg")) return "FRAME @ ~75% (later in video)";
  if (url.includes("maxresdefault") || url.includes("hqdefault")) return "COVER FRAME (often the hook moment)";
  return "ADDITIONAL PREVIEW FRAME";
}

/**
 * Try to parse `content` as JSON, including via a sequence of recovery strategies:
 *   1. Direct JSON.parse.
 *   2. Try every top-level closure boundary from longest to shortest as a candidate
 *      (handles Gemini glueing two objects together — `{...}{...}` — by taking the
 *      first that parses).
 *   3. salvageTruncatedJSON for mid-string / truncated cases.
 * Returns the parsed value, or null if nothing recovers.
 */
function parseWithRecovery(content: string): any | null {
  try { return JSON.parse(content); } catch { /* try recovery */ }

  // Walk all top-level closure boundaries
  const start = content.indexOf("{");
  if (start < 0) return null;
  const closures: number[] = [];
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) closures.push(i);
    }
  }

  // Try longest valid prefix first — preserves the most data when the model
  // glued two top-level objects together (`{json1}{json2}`).
  for (let i = closures.length - 1; i >= 0; i--) {
    const candidate = content.slice(start, closures[i] + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (i < closures.length - 1) {
        console.warn(`[analyze] Recovered by taking top-level prefix ending at ${closures[i]}/${content.length}`);
      }
      return parsed;
    } catch { /* try next shorter candidate */ }
  }

  // Final: bracket-balanced salvage for mid-string / mid-object truncation.
  const salvaged = salvageTruncatedJSON(content);
  if (salvaged) {
    try {
      const parsed = JSON.parse(salvaged);
      console.warn("[analyze] Recovered via bracket-balanced salvage");
      return parsed;
    } catch { /* nothing more we can do */ }
  }
  return null;
}

/**
 * Bracket-balanced salvage for truncated/invalid JSON.
 * Walks the content respecting strings and escapes, and finds the longest prefix
 * that ends inside a complete top-level value. Closes any unclosed `{`/`[` brackets
 * at the deepest safe position and returns the candidate string. Returns null if
 * no plausible recovery exists.
 */
function salvageTruncatedJSON(content: string): string | null {
  const start = content.indexOf("{");
  if (start < 0) return null;

  const stack: Array<"{" | "["> = [];
  let inString = false;
  let escape = false;
  let lastSafeEnd = -1; // index (inclusive) where the top-level object was last fully closed

  for (let i = start; i < content.length; i++) {
    const ch = content[i];

    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === "{" || ch === "[") {
      stack.push(ch as "{" | "[");
    } else if (ch === "}" || ch === "]") {
      const top = stack.pop();
      const expected = ch === "}" ? "{" : "[";
      if (top !== expected) return null; // mismatched bracket, can't trust the stream
      if (stack.length === 0) lastSafeEnd = i;
    }
  }

  // Case A: content has at least one complete top-level object — use that.
  if (lastSafeEnd > start) {
    return content.slice(start, lastSafeEnd + 1);
  }

  // Case B: stream truncated. Find the last safe boundary (comma at depth>0
  // OR a quote-closing of a string value followed by depth>0). Walk the content
  // forward, tracking the deepest position where we could safely truncate AND
  // still parse if we add closing brackets.
  let truncAt = -1;
  let truncStackSnapshot: string[] = [];
  const stack2: string[] = [];
  let inStr2 = false;
  let esc2 = false;
  let lastQuoteOutside = -1; // index of the last `"` that ENDED a string (we are not inside a string at i+1)
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (esc2) { esc2 = false; continue; }
    if (ch === "\\") { esc2 = true; continue; }
    if (ch === '"') {
      inStr2 = !inStr2;
      if (!inStr2) lastQuoteOutside = i; // just exited a string
      continue;
    }
    if (inStr2) continue;
    if (ch === "{" || ch === "[") stack2.push(ch);
    else if (ch === "}" || ch === "]") stack2.pop();
    else if (ch === "," && stack2.length > 0) {
      truncAt = i;
      truncStackSnapshot = [...stack2];
    }
  }

  // Case B1: clean comma-boundary truncation.
  if (truncAt > start && truncStackSnapshot.length > 0) {
    const closers = truncStackSnapshot
      .slice()
      .reverse()
      .map((c) => (c === "{" ? "}" : "]"))
      .join("");
    return content.slice(start, truncAt) + closers;
  }

  // Case B2: ran out mid-string. Close the open string at the LAST CLEAN BYTE
  // (avoid breaking on a half-written escape), drop the half-written field's
  // trailing partial chunk back to the previous comma, and close brackets.
  if (inString && lastQuoteOutside > start) {
    // Find the comma that came BEFORE we entered the half-written string.
    // Walk from lastQuoteOutside backward to find the last comma at top-level depth.
    let commaBefore = -1;
    const stackB: string[] = [];
    let inStrB = false;
    let escB = false;
    let lastCommaAtAnyDepth = -1;
    let stackAtComma: string[] = [];
    for (let i = start; i <= lastQuoteOutside; i++) {
      const ch = content[i];
      if (escB) { escB = false; continue; }
      if (ch === "\\") { escB = true; continue; }
      if (ch === '"') { inStrB = !inStrB; continue; }
      if (inStrB) continue;
      if (ch === "{" || ch === "[") stackB.push(ch);
      else if (ch === "}" || ch === "]") stackB.pop();
      else if (ch === "," && stackB.length > 0) {
        lastCommaAtAnyDepth = i;
        stackAtComma = [...stackB];
      }
    }
    commaBefore = lastCommaAtAnyDepth;
    if (commaBefore > start && stackAtComma.length > 0) {
      const closers = stackAtComma
        .slice()
        .reverse()
        .map((c) => (c === "{" ? "}" : "]"))
        .join("");
      return content.slice(start, commaBefore) + closers;
    }
  }

  return null;
}

/** Map compact AI response keys → full keys for the frontend. */
function expandAnalysis(d: any, transcript: TranscriptionResult | null): any {
  if (!d) return d;

  const expanded: any = {
    script: {
      hook: d.s?.h || "",
      scenes: (d.s?.sc || []).map((s: any) => ({
        sceneNumber: s.n,
        timestamp: s.t,
        narration: s.nr,
        visuals: s.v,
        motion: s.mo || "", // NEW: action/motion description per scene
        emotion: s.e,
        editingNotes: s.ed,
        dialogueSource: s.ds as "transcript" | "inferred" | undefined,
        confidenceScore: s.cs != null ? Number(s.cs) : undefined,
      })),
      cta: d.s?.c || "",
    },
    phaseBreakdown: Array.isArray(d.pb)
      ? d.pb.slice(0, 4).map((p: any) => ({
          name: String(p?.n ?? ""),
          duration: Math.max(1, Math.round(Number(p?.d) || 0)),
        }))
      : [],
    viralFactors: (d.vf || []).map((f: any) => ({
      factor: f.f, explanation: f.x, impact: f.i, timestamp: f.t,
    })),
    viewMagnet: {
      moment: d.vm?.m || "", timestamp: d.vm?.t || "", psychology: d.vm?.p || "",
    },
    characterPrompts: (d.cp || []).map((c: any) => ({
      name: c.n,
      role: c.r,
      imagePrompt: c.ip,
      motionPrompt: c.im || "", // NEW: signature motion of this subject across the video
      screenTime: c.st,
    })),
    replicationGuide: {
      coreFormula: d.rg?.cf || "",
      variations: (d.rg?.v || []).map((v: any) => ({
        niche: v.n, idea: v.i, twist: v.t,
      })),
      shootingGuide: d.rg?.sh || "",
      editingGuide: d.rg?.ed || "",
      soundDesign: d.rg?.sd || "",
      postingStrategy: d.rg?.ps || "",
    },
    metrics: {
      hookStrength: d.mt?.hs || 0, retentionScore: d.mt?.rs || 0,
      shareability: d.mt?.sh || 0, replayValue: d.mt?.rv || 0,
      overallViralPotential: d.mt?.vp || 0,
    },
  };

  // Attach transcript when present (UI renders optional Transcript tab)
  if (transcript) {
    expanded.transcript = {
      fullText: transcript.fullText,
      segments: transcript.segments,
      language: transcript.language,
      duration: transcript.duration,
      hooks: transcript.hooks,
      keywords: transcript.keywords,
    };
  }

  return expanded;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Track temp dir created by Python so we can clean it up after analysis completes.
  // (Python intentionally leaves the video on disk so we can upload it to Gemini.)
  let tempDirToCleanup: string | undefined;

  try {
    const { videoUrl, skipCache } = await req.json();

    if (!videoUrl || !videoUrl.startsWith("http")) {
      return NextResponse.json({ error: "Please provide a valid video URL" }, { status: 400 });
    }

    const key = cacheKey("analyze", videoUrl);

    if (skipCache) {
      deleteCache(key);
    } else {
      const cached = getCached(key);
      if (cached) return NextResponse.json({ analysis: cached });
    }

    // ── Step 1: Fetch metadata + og:images ────────────────────────────────────
    let meta = "";
    let ogImages: string[] = [];
    try {
      const p = (await getLinkPreview(videoUrl, {
        timeout: 8000, followRedirects: "follow",
        headers: { "user-agent": "googlebot" },
      })) as any;
      meta = [p.title, p.description, p.siteName].filter(Boolean).join(" | ");
      ogImages = (p.images || []).filter((url: string) => url?.startsWith("http"));
    } catch { /* continue without metadata */ }

    // ── Step 2: Platform thumbnails ───────────────────────────────────────────
    const ytId = getYouTubeId(videoUrl);
    const platformImages = ytId ? getYouTubeThumbnails(ytId) : [];
    const allImages = [...new Set([...platformImages, ...ogImages])].slice(0, 5);

    // ── Step 3: Transcription (conditional, non-blocking) ─────────────────────
    /**
     * Transcription runs when TRANSCRIPTION_ENABLED=true.
     * A separate cache key means the transcript survives skipCache analysis refreshes.
     * Failure here is silent — the pipeline continues without a transcript.
     */
    let transcript: TranscriptionResult | null = null;

    if (isTranscriptionEnabled()) {
      const transcriptKey = cacheKey("transcript", videoUrl);

      // Check transcript cache first
      const cachedTranscript = getCached(transcriptKey);
      if (cachedTranscript) {
        transcript = cachedTranscript as TranscriptionResult;
        console.log("[transcription] Cache hit for:", videoUrl);
      } else {
        try {
          console.log("[transcription] Starting for:", videoUrl);
          transcript = await transcribeVideo(videoUrl);
          if (transcript) {
            // Claim ownership of the Python temp dir so we clean it up in finally.
            // We store the video path separately in the cached transcript but strip
            // filesystem paths before caching so stale cache entries can't leak disk refs.
            if (transcript.tempDir) tempDirToCleanup = transcript.tempDir;
            const forCache = { ...transcript };
            delete forCache.videoPath;
            delete forCache.tempDir;
            setCache(transcriptKey, forCache);
            console.log(
              `[transcription] Done. ${transcript.segments.length} segments, ` +
              `lang=${transcript.language ?? "?"}, ` +
              `hooks=${transcript.hooks?.length ?? 0}`
            );
          } else {
            console.log("[transcription] No transcript produced (unsupported URL or backend unavailable)");
          }
        } catch (err) {
          // Non-fatal: log and continue
          console.warn("[transcription] Failed, continuing without transcript:", err);
          transcript = null;
        }
      }
    }

    // ── Step 4: Build multimodal message ──────────────────────────────────────
    // PREFER real video frames extracted by ffmpeg (via transcribe.py) over
    // YouTube's default thumbnails. Real frames show actual motion progression;
    // YouTube thumbnails are often just the cover repeated.
    const userContent: any[] = [];
    const realFrames = transcript?.frames ?? [];
    const useRealFrames = realFrames.length >= 3;

    if (useRealFrames) {
      // Dense timeline — ~3fps sampling. Each frame tagged with actual timestamp
      // AND a frame index so the AI can reason "FRAME 5 → FRAME 6 delta".
      realFrames.forEach((f, i) => {
        userContent.push({
          type: "text",
          text: `━━━ FRAME ${i + 1} / ${realFrames.length}  @  ${f.timestamp.toFixed(2)}s ━━━`,
        });
        userContent.push({ type: "image_url", image_url: { url: f.dataUrl } });
      });
      console.log(
        `[analyze] Using ${realFrames.length} real video frames (dense timeline, ${(realFrames.length / (realFrames[realFrames.length - 1].timestamp - realFrames[0].timestamp + 0.1)).toFixed(1)}fps)`
      );
    } else {
      for (const imgUrl of allImages) {
        userContent.push({
          type: "text",
          text: `━━━ ${labelForThumbnail(imgUrl)} ━━━`,
        });
        userContent.push({ type: "image_url", image_url: { url: imgUrl } });
      }
      if (allImages.length > 0) {
        console.log(
          `[analyze] Using ${allImages.length} platform thumbnails (transcription disabled or no frames extracted)`
        );
      }
    }

    const imageNote = useRealFrames
      ? `\n\n━━━ DENSE FRAME TIMELINE ━━━
I have provided ${realFrames.length} REAL video frames sampled at ~${(realFrames.length / (realFrames[realFrames.length - 1].timestamp - realFrames[0].timestamp + 0.1)).toFixed(1)}fps from ${realFrames[0].timestamp.toFixed(2)}s to ${realFrames[realFrames.length - 1].timestamp.toFixed(2)}s. These are actual video pixels extracted by ffmpeg — treat them as a flipbook.

━━━ YOUR MOTION-EXTRACTION METHOD (CRITICAL) ━━━
STEP 1 — Walk the frames pair by pair. For each adjacent pair (FRAME 1 vs FRAME 2, FRAME 2 vs FRAME 3, … FRAME ${realFrames.length - 1} vs FRAME ${realFrames.length}), silently ask: "what moved? what appeared? what changed position/shape/size?"
  • If frame N and N+1 look nearly identical, the motion between them is "hold / static".
  • If something entered/exited/deformed, describe the delta with motion verbs.

STEP 2 — Group consecutive similar deltas into SCENES. A scene is a run of frames sharing ONE micro-action. Example: frames 1-3 "spoon enters from right", frames 4-6 "peel-mouth opens", frames 7-9 "spoon delivers segment", frames 10-12 "mouth closes". That's 4 scenes × 3 frames each.

STEP 3 — For each scene, write:
  • "t" = actual timestamp RANGE from the frame timestamps (e.g. "0.5s-2.8s" based on the frames that make up this scene)
  • "v" = static composition you see in those frames (what the frame looks like)
  • "mo" = the SPECIFIC motion observed BETWEEN frames (with motion verbs and sub-timing)

━━━ HARD REQUIREMENTS ━━━
- Only describe motion you can POINT TO in a frame pair. Never invent ("cheeks inflate progressively") unless you can say "between FRAME 8 at 3.1s and FRAME 9 at 3.4s, the cheeks visibly widened".
- If the ${realFrames.length} frames all look identical (truly static video), output 1 scene with "mo": "subject holds position throughout" — do NOT fabricate 6 fake motions.
- Every "mo" must contain at least ONE motion verb (enters, lifts, opens, closes, tilts, drops, pours, widens, retracts, rotates, rises, falls, pushes, pulls, expands, contracts, slides, etc.).
- No two scenes' "mo" fields may be semantically identical.`
      : allImages.length > 0
      ? `\n\nI have provided ${allImages.length} keyframes from DIFFERENT POINTS in the video timeline (25%, 50%, 75%, cover). These are a TIMELINE — compare them to infer what moved or changed between time-points. Every scene's motion must be UNIQUE.`
      : `\n\nNo thumbnails available. Base analysis on metadata and URL context. For characters, explicitly state you could not verify visual appearance.`;

    const transcriptNote = transcript
      ? `\n\nA verified audio transcript has been injected into your system instructions. Use it as ground truth for all narration/dialogue fields.`
      : "";

    userContent.push({
      type: "text",
      text: `Analyze this video: ${videoUrl}${meta ? `\nMetadata: ${meta}` : ""}${imageNote}${transcriptNote}

FINAL CHECKLIST before output:
  ✓ Did I COMPARE the frames across time-points to infer motion?
  ✓ Does every scene's "mo" field describe a UNIQUE micro-action (not repeated across scenes)?
  ✓ Did I avoid the FORBIDDEN PATTERNS ("same composition", "camera maintains focus", etc.)?
  ✓ Does the sequence of 6-10 scenes tell a PROGRESSION (not a frozen tableau)?

For character prompts: describe ONLY subjects visible in the images. If you see fruit, describe the fruit. If you see hands only, describe the hands. Do NOT invent human characters that aren't visible.

Generate a COMPLETE analysis with 6-10 detailed scenes, each with a UNIQUE motion.`,
    });

    // ── Step 5: Compose system prompt (augmented when transcript exists) ───────
    const systemPrompt = transcript
      ? SYS_BASE + buildTranscriptSysAddendum(transcript)
      : SYS_BASE;

    // ── Step 6: AI routing ────────────────────────────────────────────────────
    // Priority:
    //   1. Gemini native video (most accurate — Gemini literally watches the mp4)
    //      Requires GEMINI_API_KEY + a locally downloaded video file from Python.
    //   2. Gemini direct with frames (uses GEMINI_API_KEY, bypasses OpenRouter's
    //      tight free-tier credit limits — preferred over OpenRouter when we have frames)
    //   3. OpenAI gpt-4o with passed-in YouTube URL (legacy, rarely works)
    //   4. OpenRouter Gemini 2.5 Flash with dense frames (last-resort fallback)
    let content = "";
    const videoFilePath = transcript?.videoPath;

    // Path 1 — Native Gemini video analysis
    if (isGeminiNativeEnabled() && videoFilePath) {
      try {
        console.log("[analyze] Trying Gemini native video upload path");
        const durationSec = transcript?.duration ?? 0;
        const durationHint = durationSec > 0
          ? `\n\n━━━ VIDEO DURATION: ${durationSec.toFixed(2)} seconds ━━━\nALL scene timestamps in the "t" field MUST be ACTUAL SECONDS within this duration, formatted like "0.52s-2.84s" or "2.84s-5.16s". NEVER output "0.00s-0.01s" or normalized 0-1 ranges. Your timestamps must span 0.00s to ${durationSec.toFixed(2)}s total across all scenes, with no gaps or overlaps.`
          : "";
        const userPromptForGemini = `Analyze the video attached above.${
          meta ? `\nMetadata: ${meta}` : ""
        }${transcriptNote}${durationHint}

You are watching the actual video at native framerate — NOT sampled stills. Extract the true motion you observe.

━━━ REACTIVE / ANTICIPATORY MOTION (OFTEN MISSED) ━━━
Pay SPECIAL attention to how subjects REACT to what's happening in the frame:
  • Does the subject TILT TOWARD something approaching? (baby reaches toward spoon, dog leans toward treat)
  • Does the subject RECOIL or LEAN BACK from something?
  • Does the HEAD track a moving object across the frame?
  • Does the subject show ANTICIPATION (mouth opens BEFORE food arrives, body leans IN BEFORE action)?
  • Are there SECONDARY body motions happening at the same time as the focal action (head bobbing while chewing, eyes blinking during movement, shoulders rolling)?

Real video has LAYERED motion — a main action AND several reactive micro-motions. Your "mo" field must capture BOTH.
Example BAD: "spoon approaches mouth, mouth opens, spoon enters"
Example GOOD: "(0.0-0.4s) spoon enters from right; the orange baby's head immediately tilts 10° toward the approaching spoon in anticipation. (0.4-0.8s) mouth opens and cheeks widen as the head continues tilting forward to meet the spoon. (0.8-1.2s) spoon delivers segment; baby's head bobs gently once as if swallowing."

FINAL CHECKLIST before output:
  ✓ Timestamps are in ACTUAL seconds (0.00s to ${durationSec > 0 ? durationSec.toFixed(2) + "s" : "end"}), NEVER normalized 0-1.
  ✓ Every "mo" describes BOTH the focal action AND subject reactions (tilt/lean/track/anticipate).
  ✓ Every scene is a UNIQUE micro-beat (no duplicate motion).
  ✓ Avoided forbidden patterns ("same composition", "camera maintains focus").
  ✓ If the video is truly static, output 1 scene with "subject holds position" — don't fabricate motion.

For character prompts: describe ONLY subjects visible in the video. Generate 4-10 scenes, each with UNIQUE layered motion (focal + reactive).`;

        const geminiResult = await analyzeVideoWithGemini(
          videoFilePath,
          systemPrompt,
          userPromptForGemini,
          { temperature: 0.2, maxTokens: 24000 }
        );
        content = geminiResult.content;
        console.log("[analyze] Gemini native video analysis succeeded");
      } catch (err: any) {
        console.warn(
          `[analyze] Gemini native path failed: ${err?.message ?? err}. Falling back to frames.`
        );
        // Fall through to Gemini-frames / OpenAI / OpenRouter paths below
      }
    }

    // Path 2 — Gemini direct with frames (uses GEMINI_API_KEY, avoids OpenRouter credit limits)
    if (!content && isGeminiNativeEnabled() && useRealFrames && realFrames.length > 0) {
      try {
        console.log(`[analyze] Trying Gemini direct-frames path (${realFrames.length} frames)`);
        const framesNote = `\n\n━━━ DENSE FRAME TIMELINE ━━━
${realFrames.length} REAL video frames sampled at ~${(realFrames.length / (realFrames[realFrames.length - 1].timestamp - realFrames[0].timestamp + 0.1)).toFixed(1)}fps across the whole video. These are the actual pixels — treat them as a flipbook.

━━━ MOTION-EXTRACTION METHOD ━━━
STEP 1 — Walk the frames pair by pair. For each adjacent pair, silently ask: "what moved/appeared/deformed?"
STEP 2 — Group consecutive similar deltas into SCENES (a scene = run of frames sharing ONE micro-action).
STEP 3 — For each scene: "t" = the real timestamp range, "v" = composition, "mo" = specific motion you can point to in the frame pairs.

Hard rules:
  • Only describe motion you can point to in a frame pair (no hallucination).
  • Every "mo" contains at least one motion verb (enters, opens, tilts, drops, lifts, pushes, widens, retracts, rotates, slides, rises, falls, expands, contracts).
  • No two scenes share semantically identical motion.
  • If ALL frames look truly identical (static video), output 1 scene "mo: subject holds position" — do NOT fabricate 6 fake motions.`;

        const userPromptForFrames = `Analyze this video: ${videoUrl}${meta ? `\nMetadata: ${meta}` : ""}${framesNote}${transcriptNote}

FINAL CHECKLIST:
  ✓ Did I compare adjacent frame pairs and describe the delta for each?
  ✓ Is every scene's "mo" a motion I can POINT TO in specific frame numbers?
  ✓ Are timestamps "t" derived from the actual frame timestamps (not invented like "1:55")?
  ✓ Did I avoid forbidden phrases (same composition, camera maintains focus)?
  ✓ Did I avoid inventing motion that's not visible between any frame pair?

For character prompts: describe ONLY subjects visible in the images. Generate a COMPLETE analysis with 4-10 scenes, each with a UNIQUE motion grounded in specific frames.`;

        const framesResult = await analyzeFramesWithGemini(
          realFrames,
          systemPrompt,
          userPromptForFrames,
          { temperature: 0.2, maxTokens: 24000 }
        );
        content = framesResult.content;
        console.log("[analyze] Gemini direct-frames analysis succeeded");
      } catch (err: any) {
        console.warn(
          `[analyze] Gemini direct-frames path failed: ${err?.message ?? err}. Falling back to OpenAI / OpenRouter.`
        );
        // Fall through to OpenAI / OpenRouter paths below
      }
    }

    // Path 3 — OpenAI gpt-4o with URL (legacy, only when no Gemini result)
    if (!content && process.env.OPENAI_API_KEY) {
      try {
        const openaiContent: any[] = [];
        openaiContent.push({
          type: "text",
          text: `Analyze this video: ${videoUrl}${meta ? `\nMetadata: ${meta}` : ""}${transcriptNote}\n\nGenerate a COMPLETE analysis with 6-10 detailed scenes.`,
        });
        openaiContent.push({ type: "video_url" as any, video_url: { url: videoUrl } });

        const openaiResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          temperature: 0.2,
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: openaiContent },
          ],
          response_format: { type: "json_object" },
        });
        content = openaiResponse.choices[0].message.content || "";
      } catch (openaiError: any) {
        // Quota exceeded — skip silently, OpenRouter will handle it
        const isQuota = openaiError?.status === 429 || openaiError?.code === "insufficient_quota";
        if (isQuota) {
          console.log("[analyze] OpenAI quota exceeded, routing to OpenRouter.");
        } else {
          console.warn("[analyze] OpenAI failed:", openaiError?.message ?? openaiError);
        }
      }
    }

    // OpenRouter fallback (or primary when OpenAI key is absent / quota exceeded)
    if (!content) {
      const orContent: any[] = [];
      let orFrameSummary = "";

      if (useRealFrames) {
        // Pass ALL real frames — Gemini 2.5 handles many images well
        realFrames.forEach((f, i) => {
          orContent.push({
            type: "text",
            text: `━━━ FRAME ${i + 1} / ${realFrames.length}  @  ${f.timestamp.toFixed(2)}s ━━━`,
          });
          orContent.push({ type: "image_url", image_url: { url: f.dataUrl } });
        });
        orFrameSummary = `\n\n━━━ DENSE FRAME TIMELINE ━━━
${realFrames.length} REAL video frames sampled at ~${(realFrames.length / (realFrames[realFrames.length - 1].timestamp - realFrames[0].timestamp + 0.1)).toFixed(1)}fps across the whole video. These are the actual pixels — treat them as a flipbook.

━━━ MOTION-EXTRACTION METHOD ━━━
STEP 1 — Walk the frames pair by pair. For each adjacent pair, silently ask: "what moved/appeared/deformed?"
STEP 2 — Group consecutive similar deltas into SCENES (a scene = run of frames sharing ONE micro-action).
STEP 3 — For each scene: "t" = the real timestamp range, "v" = composition, "mo" = specific motion you can point to in the frame pairs.

Hard rules:
  • Only describe motion you can point to in a frame pair (no hallucination).
  • Every "mo" contains at least one motion verb (enters, opens, tilts, drops, lifts, pushes, widens, retracts, rotates, slides, rises, falls, expands, contracts).
  • No two scenes share semantically identical motion.
  • If ALL frames look truly identical (static video), output 1 scene "mo: subject holds position" — do NOT fabricate 6 fake motions.`;
      } else {
        const orImages = allImages.slice(0, 4);
        for (const imgUrl of orImages) {
          orContent.push({
            type: "text",
            text: `━━━ ${labelForThumbnail(imgUrl)} ━━━`,
          });
          orContent.push({ type: "image_url", image_url: { url: imgUrl } });
        }
        orFrameSummary = orImages.length > 0
          ? `\n\nThe ${orImages.length} frames above are keyframes from DIFFERENT POINTS in the video timeline (25%/50%/75%/cover). COMPARE them to infer motion across time — do NOT describe them as "the same shot". Every scene's "mo" field must be unique.`
          : "\n\nNo thumbnails available. Base analysis on metadata and URL.";
      }

      orContent.push({
        type: "text",
        text: `Analyze this video: ${videoUrl}${meta ? `\nMetadata: ${meta}` : ""}${orFrameSummary}${transcriptNote}

FINAL CHECKLIST:
  ✓ Did I compare adjacent frame pairs and describe the delta for each?
  ✓ Is every scene's "mo" a motion I can POINT TO in specific frame numbers?
  ✓ Are timestamps "t" derived from the actual frame timestamps (not invented like "1:55")?
  ✓ Did I avoid forbidden phrases (same composition, camera maintains focus)?
  ✓ Did I avoid inventing motion that's not visible between any frame pair?

For character prompts: describe ONLY subjects visible in the images. Generate a COMPLETE analysis with 4-10 scenes, each with a UNIQUE motion grounded in specific frames.`,
      });

      // Note: response_format JSON mode is intentionally omitted for OpenRouter/Gemini.
      // The system prompt already ends with "JSON only" — Gemini respects that without
      // the JSON-mode header, which can cause OpenRouter to stall waiting for a
      // schema-enforced response.
      // Use Gemini 2.5 Flash — much stronger at multi-frame visual reasoning than 2.0 Flash.
      // Keep max_tokens ≤ 4096 to fit within OpenRouter free-tier credit budget.
      const orResponse = await openrouter.chat.completions.create({
        model: "google/gemini-2.5-flash",
        temperature: 0.2,
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: orContent },
        ],
      });
      content = orResponse.choices[0].message.content || "";
    }

    // ── Step 7: Parse, expand, cache, return ──────────────────────────────────
    if (!content || !content.trim()) {
      console.error("[analyze] Empty content from AI provider");
      return NextResponse.json({ error: "AI returned empty response. Try again." }, { status: 500 });
    }

    // Strip markdown fences Gemini sometimes adds despite instructions
    content = content
      .replace(/^\s*```json\s*/i, "")
      .replace(/^\s*```\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    // Extract the outermost {...} if the model wrapped JSON in prose
    const firstBrace = content.indexOf("{");
    const lastBrace  = content.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      content = content.slice(firstBrace, lastBrace + 1);
    }

    const raw = parseWithRecovery(content);
    if (!raw) {
      console.error(
        `[analyze] JSON parse failed (all recovery strategies exhausted). Length=${content.length}. ` +
        `Head: ${content.slice(0, 400)}\n...Tail: ${content.slice(-400)}`
      );
      return NextResponse.json(
        { error: "AI returned invalid data. Try again." },
        { status: 500 }
      );
    }

    if (!raw.s) {
      console.error(
        "[analyze] Parsed JSON missing required 's' key. Got keys:",
        Object.keys(raw)
      );
      return NextResponse.json(
        { error: "AI returned incomplete data. Try again." },
        { status: 500 }
      );
    }

    const expanded = expandAnalysis(raw, transcript);
    setCache(key, expanded);
    return NextResponse.json({ analysis: expanded });
  } catch (error) {
    console.error("Analyze error:", error);
    return NextResponse.json({ error: "Failed to analyze video." }, { status: 500 });
  } finally {
    // Always clean up the Python-created temp dir that held the downloaded video
    if (tempDirToCleanup) {
      try {
        rmSync(tempDirToCleanup, { recursive: true, force: true });
        console.log(`[analyze] Cleaned up temp dir: ${tempDirToCleanup}`);
      } catch (e: any) {
        console.warn(`[analyze] Failed to clean temp dir: ${e?.message ?? e}`);
      }
    }
  }
}
