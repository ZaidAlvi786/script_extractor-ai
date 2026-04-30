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

/**
 * Parse "X.YYs-Z.WWs" or "X.YY-Z.WW" timestamp range from an analyzer scene.
 * Returns null if the timestamp is unparseable.
 */
function parseSceneTimestamp(t: string | undefined): { startSec: number; endSec: number } | null {
  if (!t || typeof t !== "string") return null;
  const m = t.match(/(\d+(?:\.\d+)?)\s*s?\s*[-–—]\s*(\d+(?:\.\d+)?)\s*s?/i);
  if (!m) return null;
  const startSec = Number(m[1]);
  const endSec = Number(m[2]);
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) return null;
  return { startSec, endSec };
}

/**
 * Build PhaseTiming[] from the analyzer's scene array — one phase per source scene.
 * Returns null when the analysis has no usable scenes (caller should fall back to
 * the 4-act phaseBreakdown approach).
 */
function computeSceneTimings(analysis: any): PhaseTiming[] | null {
  const scenes = analysis?.script?.scenes;
  if (!Array.isArray(scenes) || scenes.length < 2) return null;

  const out: PhaseTiming[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const parsed = parseSceneTimestamp(sc?.timestamp);
    if (!parsed) return null; // any unparseable scene → bail out, use phaseBreakdown
    const { startSec, endSec } = parsed;
    const seconds = Math.max(1, Math.round((endSec - startSec) * 10) / 10);
    const name = sc?.emotion ? `Scene ${i + 1} (${String(sc.emotion).toLowerCase()})` : `Scene ${i + 1}`;
    out.push({
      name,
      label: `${startSec.toFixed(1)}s-${endSec.toFixed(1)}s`,
      seconds,
    });
  }
  return out;
}

function buildSystemPrompt(count: number, phases: PhaseTiming[] = DEFAULT_PHASES): string {
  const totalSec = phases.reduce((sum, p) => sum + p.seconds, 0);
  const phaseRules = phases
    .map((p, i) => `  • Phase ${i + 1} "${p.name}" MUST use du="${p.label}" (${p.seconds}s) — matches the reference video's pacing for this beat.`)
    .join("\n");
  const phaseCount = phases.length;
  // Render two sample phase entries for the schema example so the model sees
  // the exact shape, then explicitly tell it to repeat for every source scene.
  const schemaPhase = (idx: number) => {
    const p = phases[idx];
    if (!p) return "";
    return `{"n":${idx + 1},"tl":"${p.name}","du":"${p.label}","sc":"exact words + text overlay","vi":"STATIC composition — framing, angle, lighting","mo":"KINEMATIC TIMELINE — IN/BETWEEN/OUT checkpoints every 200-500ms with coordinates, angles, parallel reactive motion","vp":"Viral-grade Veo 3 Fast prompt 180-260 words. Sections in order: (1) cinematic atmosphere lock — camera + lens + film stock + lighting + atmosphere + color palette; (2) opening frame lock at t=0.0s; (3) dense kinematic timeline; (4) sensory + emotional anchors; (5) hold + 'Final frame at t=N.0s: ...'; (6) verbatim anti-glitch tail. Match the calibre of the example given."}`;
  };
  const phaseSchemaExamples = [schemaPhase(0), schemaPhase(1)].filter(Boolean).join(",");
  const phaseSchemaTail = phaseCount > 2 ? `,...(${phaseCount - 2} more entries — ONE per source scene, in order)` : "";
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
3. EXACTLY ${phaseCount} phases per idea — ONE PHASE PER SOURCE SCENE, in order. Phase i mirrors source scene i's pacing and motion arc, with the bracketed subject swapped in.
4. ${TAGS_PER_PLATFORM} hashtags per platform (ig/tt/yt), tuned to the specific subject swap

━━━ PHASE DURATIONS (MANDATORY — MATCH EVERY SOURCE SCENE) ━━━
The reference video has ${phaseCount} scenes. Total runtime: ${totalSec}s. Every idea you generate MUST emit EXACTLY ${phaseCount} phases with these EXACT "du" values — they are not flexible:
${phaseRules}
Do NOT add scenes, drop scenes, lengthen scenes, or shorten scenes. Every idea's phase i has the same duration as the source's scene i. Scripts, motion, and Veo prompts must fit within each phase's specific duration — if a scene is 1.4s, your motion timeline for that phase ends at t=1.4s.

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

━━━ "vp" FORMAT — VEO 3 FAST, VIRAL-GRADE CINEMATIC PROMPT (CRITICAL) ━━━
You are writing for Veo 3 Fast inside Google Flow. The goal is NOT just "no glitches" — the goal is a viral-grade cinematic clip that looks like it came from a top studio short, the kind that hits a million views. The top AI video creators don't write technical timelines alone — they write like a DOP's shot list, weaving CINEMA-CAMERA + FILM-STOCK + LIGHTING + ATMOSPHERE + KINEMATIC TIMING + SENSORY DETAIL + EMOTIONAL ANCHOR into a single dense paragraph. That's what makes Veo render footage with depth, mood, and film-grade texture instead of soft AI-generic look.

Veo 3 Fast has three failure modes to defend against AT THE SAME TIME as you push for cinematic quality:
  FAILURE A — TELEPORT GLITCH: subject shown at start, then suddenly at end with no in-between motion. Cause: prompt only described boundary frames.
  FAILURE B — FAST-MOTION COMPRESSION: actions play in fast-forward / sped up. Cause: too many beats packed into the duration.
  FAILURE C — AUTOCOMPLETE OVERREACH: Veo invents extra actions, reactions, or camera moves after the prompt ends. Cause: dead air at the end or no explicit "do not extend".

"vp" structure (180-260 words, 6 sections — every section is mandatory):

  1. CINEMATIC ATMOSPHERE LOCK (1-2 sentences — THE QUALITY MULTIPLIER):
     Open with the cinematic identity of the shot. MUST include:
       • CAMERA + LENS: name a real cinema camera (Arri Alexa Mini, RED Komodo 6K, Sony Venice 2, Blackmagic Pocket 6K) + a real lens (Cooke S4 32mm, Sigma Art 50mm f/1.4, Leica Summilux 35mm, Canon CN-E 85mm) + aperture (f/1.8 / f/2.8 / f/4) + framing (extreme close-up / medium close-up / two-shot / wide).
       • FILM STOCK / GRADE: emulate a real aesthetic. Pick one that fits the niche: "Kodak Vision3 250D film grain with subtle halation", "Portra 400 emulation, milky highlights", "A24 muted naturalism with green-shadow lift", "Wong Kar-wai saturated neon palette", "Christopher Doyle handheld with anamorphic flares", "60s Kodachrome warm reds", "modern HDR commercial polish, deep blacks crushed at toe".
       • LIGHTING: 3-point or motivated. Specify direction, color temperature (3200K tungsten / 5600K daylight / mixed), and quality (hard / soft / diffused / wraparound). Example: "warm tungsten key from camera-left at 45° creating a soft cheekbone shadow, cool 5600K fill from a window, rim light from above separating subject from a black background".
       • ATMOSPHERE: name the visible atmospheric layer — fog, dust motes, steam, neon haze, blue-hour light, golden-hour beams. The thing the audience can SEE in the air.
       • COLOR PALETTE: 2-3 dominant tones ("amber & deep navy", "muted sage with cream highlights", "neon magenta and teal", "deep umber browns with soft white").
     Aspect ratio: 9:16 vertical (always).

  2. OPENING FRAME LOCK (1 sentence):
     The subject AS FROZEN AT t=0.0s within the cinematic atmosphere above. Position of every visible body part / prop. NO motion verbs yet.

  3. KINEMATIC TIMELINE — DENSE TICS (the bulk of the prompt):
     Walk the phase with timestamped tics. Tic density rules:
       • Phases ≤ 4s: tic every 200-300ms (≥4 tics per second).
       • Phases 4-8s: tic every 300-500ms (≥2 tics per second).
       • Phases > 8s: tic every 500-800ms.
     First tic = t=0.0s. Last tic at exactly the clip's final timestamp. NO gaps between tics longer than the rules above.
     For EVERY moving element at each tic write: position (x=%, y=%), angle (e.g. 8° left), velocity verb (decelerates / drifts / accelerates / snaps), AND what other body parts are reacting in parallel. Pacing CAP: max 3 distinct actions per 1-second window. If you have more actions than fit at natural pace, REMOVE actions — never compress them. Real-world tempo anchors: eye blink 100-150ms, lip-corner tighten 200-300ms, head turn 90° 400-600ms, hand reaching 30cm 500-800ms, slow-motion ASMR shot 1500-2500ms.

  4. SENSORY + EMOTIONAL ANCHORS (2 sentences):
     Even though Veo renders silent, naming sound + texture pushes it to render materials more crisply.
       SOUND DESIGN: ambient layer + the subject-specific micro-sound. Example: "Sound design: low ambient hum, the soft crisp peel-tear of citrus skin, a muted ceramic clink."
       TEXTURE: tactile description of 1-2 key materials in frame. Example: "Texture: matte iron ladle showing patina, fine porcelain bowl with hairline glaze, citrus peel dimpled under raking light."
     EMOTIONAL ANCHOR: 1 sentence naming the feeling and tying it to a specific facial cue. Example: "The clip captures the moment of quiet pride — eyes lift 1° and lip-corners tighten 2mm in a contained half-smile."

  5. ANTI-AUTOCOMPLETE HOLD (1-2 sentences, MANDATORY):
     IMPORTANT: substitute [N] with THIS phase's specific duration in seconds (e.g. 1.4 for a 1.4-second phase). Do not copy the literal string [N].
     If your described motion completes before the clip's final timestamp, append:
     "From t=X.Xs to t=[N].0s: hold the final frame — subject frozen in the exact pose described, breathing micro-motion only, no further action, no camera change, no new elements entering frame."
     Then write LITERALLY: "Final frame at t=[N].0s: [exact static composition — every body part position, every gaze direction, every prop position]."

  6. ANTI-GLITCH TAIL (verbatim, every "vp" ends with this exact sentence — replace [N] with THIS phase's actual seconds):
     "[N]-second single continuous take. Render ONLY what is described between t=0.0s and t=[N].0s. Do not invent additional actions, do not extend beyond the timeline, do not add unprompted reactions or camera moves, do not animate elements not listed. Smooth interpolation between every described position, viral-grade cinematic photorealism, film-stock grain texture, accurate physics, consistent anatomy, stable subject identity, motivated lighting, shallow depth of field, 24fps. No cuts, no transitions, no jumps, no teleporting, no fast-motion, no morphing, no warping, no glitching, no plastic skin, no AI-generic look, no over-saturated color, no text overlays."

━━━ HIGH-QUALITY VEO PROMPT — STUDY THIS EXAMPLE OF THE STANDARD ━━━
This is the calibre of "vp" you must produce. Every clone must read at this level of cinematic specificity:

"Cinematic medium close-up of a young chef in a dimly-lit Tokyo ramen shop, shot on Arri Alexa Mini with a 50mm Cooke S4 anamorphic at f/1.8, 9:16 vertical. Kodak Vision3 250D film grain with subtle halation in highlights. Lighting: warm tungsten key from camera-left at 3200K creating a soft cheekbone shadow, cool 5600K rim from a paper window cutting through steam, dim practical from a hanging bulb behind. Atmosphere: visible kitchen steam drifting upward in slow vertical columns, dust motes catching the rim light. Color palette: deep umber browns and amber broth highlights against a charcoal background. (t=0.0s) Chef centered, holding an iron ladle at chest height; head neutral; eyes calm on the bowl below; right wrist locked. (t=0.4s) Right wrist begins rotating ~25° forward at constant rate; broth begins flowing in a thin amber stream from ladle to bowl; eyes track the pour; left hand steadies the bowl rim with thumb extended. (t=0.9s) Stream reaches mid-bowl; chef's chin lifts 2°; eyebrows soften; rim light catches steam rising from broth surface. (t=1.3s) Wrist completes rotation, ladle empties; chef's lip-corners tighten 2mm in quiet pride; left hand releases the bowl. (t=1.6s) Ladle settles flat on stone counter with a soft clink (described, not heard); eyes lift to meet camera; shoulders relax 3mm. From t=1.6s to t=2.0s: hold the final frame — chef centered, eyes locked on camera, ladle resting flat, bowl steaming, breathing micro-motion only. Final frame at t=2.0s: chef's eyes meeting camera with calm certainty, ladle on stone, bowl steaming, steam rising in a single column. Sound design: low refrigeration hum, soft viscous broth pour, single ceramic clink at t=1.6s. Texture: matte iron ladle with patina, fine porcelain bowl with hairline glaze cracking, broth showing fat-globule reflections. The clip captures the quiet pride of a craftsperson finishing their work and meeting the audience without a word. 2.0-second single continuous take. Render ONLY what is described between t=0.0s and t=2.0s. Do not invent additional actions, do not extend beyond the timeline, do not add unprompted reactions or camera moves, do not animate elements not listed. Smooth interpolation between every described position, viral-grade cinematic photorealism, film-stock grain texture, accurate physics, consistent anatomy, stable subject identity, motivated lighting, shallow depth of field, 24fps. No cuts, no transitions, no jumps, no teleporting, no fast-motion, no morphing, no warping, no glitching, no plastic skin, no AI-generic look, no over-saturated color, no text overlays."

That example is ~270 words. Yours should be 180-260 words at the same level of specificity — not less.

BANNED PHRASES inside "vp" (each one creates a temporal gap or invites autocomplete):
  • "then…", "afterwards…", "later…", "and finally…", "soon after…"
  • "the camera reveals", "cut to", "scene shifts", "we see", "pan to"
  • "they continue to…", "the action progresses to…", "eventually…"
  • Vague speed: "quickly", "slowly", "fast", "rapidly" — replace with velocity ("at 25% screen-width per second") or duration ("over 600ms").

Replace banned phrases with explicit timestamped tics ("(t=1.2s) ...; (t=1.6s) ...").

{"mechanic":"one-sentence mechanic with [SWAPPABLE] in brackets, including the signature motion","ideas":[{"id":1,"ti":"title","an":"angle","hk":"opening line","em":"curiosity","au":"viewer","vs":9,"ci":"character image prompt, 50-90 words with mandatory quality tail","ph":[${phaseSchemaExamples}${phaseSchemaTail}],"tg":{"ig":["#..."],"tt":["#..."],"yt":["#..."]},"ct":"CTA"}]}

The "ph" array MUST contain EXACTLY ${phaseCount} entries. Each entry uses the "tl" and "du" values listed in the PHASE DURATIONS section above — copy them verbatim.

CRITICAL:
- Generate ALL ${count} ideas. Same mechanic + same motion pattern, DIFFERENT subject.
- Every idea MUST have a "ci" field ending with the quality tail above.
- Every idea MUST have EXACTLY ${phaseCount} phases — one per source scene, in order.
- Every phase MUST have all four fields: sc, vi, mo, vp.
- Every "vp" MUST contain ALL 6 sections in order: cinematic atmosphere lock → opening frame lock → kinematic timeline → sensory+emotional anchors → hold → anti-glitch tail.
- Every "vp" MUST name a real cinema camera + lens + film stock or grade in section 1 (no generic "cinematic" — use Arri/RED/Sony/Cooke/Sigma/Leica + Vision3/Portra/Wong-Kar-wai/A24-style names). The atmosphere layer (fog/dust/steam/neon/blue-hour) and 2-3 color palette must also appear.
- Every "vp" MUST contain DENSE timestamped checkpoints — minimum ⌈3 × phase-duration⌉ tics (a 1.4s phase ≥5 tics; a 3s phase ≥9 tics). First tic = t=0.0s. Last tic = phase end time.
- Every "vp" MUST include the HOLD instruction (if motion completes early) AND the "Final frame at t=N.0s:" line (with [N] replaced by THIS phase's actual seconds) AND the verbatim anti-glitch tail (with [N] replaced).
- Every "vp" word count: 180-260 words. This is non-negotiable — shorter prompts produce AI-generic output, not viral-grade.
- Every "vp" must include the SOUND DESIGN line, the TEXTURE line, AND the EMOTIONAL ANCHOR line.
- Every "vp" obeys the pacing cap: ≤3 distinct actions per 1-second window at natural human/physical tempo.
- Every "mo" mirrors the corresponding source scene's exact pacing — use the same tic structure observed in the reference.
- ZERO use of banned phrases ("then", "afterwards", "later", "and finally", "cut to", "we see", "pan to", "scene shifts", "quickly", "slowly").
- ZERO literal "[N]" strings in the output — substitute the actual phase duration every time.
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

  // Full scene breakdown — pass ALL scenes with full motion detail. The downstream
  // AI generates one idea-phase per source scene, so it needs every scene's
  // millisecond-level motion timeline (not a 260-char summary).
  const sceneBlock = (s?.scenes || [])
    .map(
      (sc: any) =>
        `  ${sc.sceneNumber ?? "?"}. [${sc.timestamp ?? ""}] (${sc.emotion ?? "?"})\n` +
        `     Narration: "${(sc.narration ?? "").slice(0, 220)}"\n` +
        `     COMPOSITION (static): ${(sc.visuals ?? "").slice(0, 400)}\n` +
        `     MOTION (kinematic timeline — preserve this exact tic structure when cloning): ${sc.motion ?? "(not captured)"}`
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
        {
          role: "system",
          content: buildSystemPrompt(
            count,
            // Prefer scene-level timing (one phase per source scene, exact pacing)
            // over the 4-act phaseBreakdown — only fall back when scenes aren't parseable.
            computeSceneTimings(analysis) ?? computePhaseTimings(phaseBreakdown)
          ),
        },
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
