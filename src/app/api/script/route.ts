import { NextResponse } from "next/server";
import { openrouter } from "@/lib/openrouter";
import { getCached, setCache, cacheKey } from "@/lib/cache";

export async function POST(req: Request) {
  try {
    const { idea } = await req.json();

    // Check cache
    const key = cacheKey("script", idea);
    const cached = getCached(key);
    if (cached) return NextResponse.json({ script: cached });

    // Use lite model — script generation is creative but not complex
    const response = await openrouter.chat.completions.create({
      model: "google/gemini-2.0-flash-lite-001",
      temperature: 0.5,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: `Viral reel script writer. Concise, visual, punchy. JSON only.`
        },
        {
          role: "user",
          content: `Script for: "${idea}"
{"h":"hook","b":"body","c":"cta","v":"visuals"}`
        }
      ],
      response_format: { type: "json_object" },
    });

    let content = response.choices[0].message.content || "";
    content = content.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();

    try {
      const raw = JSON.parse(content);
      // Expand short keys to full keys
      const script = {
        hook: raw.h || raw.hook || "",
        body: raw.b || raw.body || "",
        cta: raw.c || raw.cta || "",
        visuals: raw.v || raw.visuals || "",
      };
      setCache(key, script);
      return NextResponse.json({ script });
    } catch {
      return NextResponse.json({ 
        script: {
          hook: "Try generating again!",
          body: "Creating the perfect story flow...",
          cta: "Hit Generate for a fresh script!",
          visuals: "Fast cuts and catchy captions."
        }
      });
    }
  } catch (error) {
    console.error("Script error:", error);
    return NextResponse.json({ error: "Failed to generate script" }, { status: 500 });
  }
}
