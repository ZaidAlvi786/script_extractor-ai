import { NextResponse } from "next/server";
import { openrouter } from "@/lib/openrouter";

export const maxDuration = 120;

const SYS = `You are a viral video production expert. Given an analyzed video's viral formula and the user's custom instructions, create a NEW video script that follows the SAME viral pattern but with the user's modifications.

OUTPUT RULES:
- Generate 6-10 scenes minimum
- Each scene MUST include a "vp" (video prompt) — a detailed prompt that works in AI video generators (Runway, Kling, Pika, Sora). The video prompt must describe: exact visual composition, camera movement, lighting, colors, character appearance/action, environment, mood, and style. Write it as a single continuous prompt paragraph, 40-80 words.
- Each scene MUST include "nr" (narration/voiceover text — the actual words to be spoken or shown as text overlay)
- Keep the same viral structure: strong hook → tension → climax → CTA

OUTPUT compact JSON with SHORT KEYS:
{"title":"Video title","sc":[{"n":1,"t":"0:00-0:03","nr":"Exact voiceover or text overlay words for this scene","vp":"Cinematic close-up of a young woman with curly brown hair, wearing a white linen dress, slowly turning to face camera with wide eyes, golden hour sunlight streaming through a kitchen window, warm amber tones, shallow depth of field, 85mm lens feel, slight camera push-in, photorealistic style","e":"curiosity","ed":"Jump cut from black, text: 'Watch this...'"}],"hook":"The opening hook line","cta":"Closing call-to-action","style":"Overall visual style description for consistency across all scenes","music":"Music/sound design recommendation"}

RULES: 6-10 scenes. Every "vp" must be 40-80 words and ready to paste into ANY AI video generator. Be extremely specific about visuals — no vague descriptions. JSON only.`;

export async function POST(req: Request) {
  try {
    const { originalAnalysis, userInstructions } = await req.json();

    if (!userInstructions?.trim()) {
      return NextResponse.json({ error: "Please provide your customization instructions" }, { status: 400 });
    }

    // Build context from original analysis
    let context = "";
    if (originalAnalysis) {
      const s = originalAnalysis.script;
      const rg = originalAnalysis.replicationGuide;
      context = `ORIGINAL VIDEO PATTERN:
- Hook: ${s?.hook || "N/A"}
- Scenes: ${s?.scenes?.length || 0} scenes
- CTA: ${s?.cta || "N/A"}
- Core Formula: ${rg?.coreFormula || "N/A"}
- View Magnet: ${originalAnalysis.viewMagnet?.moment || "N/A"}
- Viral Metrics: Hook ${originalAnalysis.metrics?.hookStrength}/10, Viral ${originalAnalysis.metrics?.overallViralPotential}/10`;
    }

    const response = await openrouter.chat.completions.create({
      model: "google/gemini-2.0-flash-001",
      temperature: 0.4,
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYS },
        {
          role: "user",
          content: `${context ? context + "\n\n" : ""}USER'S CUSTOM INSTRUCTIONS:\n${userInstructions}\n\nGenerate a complete remixed video script with AI video generation prompts for EVERY scene. Each video prompt must be detailed enough to paste directly into Runway/Kling/Pika and get the exact visual the user wants.`
        },
      ],
      response_format: { type: "json_object" },
    });

    let content = response.choices[0].message.content || "";
    content = content.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();

    try {
      const raw = JSON.parse(content);
      // Expand short keys
      const remix = {
        title: raw.title || "Remixed Video",
        scenes: (raw.sc || []).map((s: any) => ({
          sceneNumber: s.n,
          timestamp: s.t,
          narration: s.nr,
          videoPrompt: s.vp,
          emotion: s.e,
          editingNotes: s.ed,
        })),
        hook: raw.hook || "",
        cta: raw.cta || "",
        style: raw.style || "",
        music: raw.music || "",
      };
      return NextResponse.json({ remix });
    } catch {
      return NextResponse.json({ error: "AI returned invalid data. Try again." }, { status: 500 });
    }
  } catch (error) {
    console.error("Remix error:", error);
    return NextResponse.json({ error: "Failed to generate remix." }, { status: 500 });
  }
}
