import { NextResponse } from "next/server";
import { openrouter } from "@/lib/openrouter";
import { getLinkPreview } from "link-preview-js";
import { getCached, setCache, cacheKey } from "@/lib/cache";

export async function POST(req: Request) {
  try {
    const { niche, videoUrl, customIdea } = await req.json();

    // Check cache
    const key = cacheKey("ideas", niche, videoUrl || "", customIdea || "");
    const cached = getCached(key);
    if (cached) return NextResponse.json(cached);

    // Compact metadata
    let meta = "";
    if (videoUrl && videoUrl.startsWith("http")) {
      try {
        const p = await getLinkPreview(videoUrl, {
          timeout: 5000, followRedirects: "follow",
          headers: { "user-agent": "googlebot" },
        }) as any;
        meta = [p.title, p.description].filter(Boolean).join(" - ");
      } catch { /* skip */ }
    }

    // Use lite model for ideas — it's just a list, doesn't need heavy reasoning
    const response = await openrouter.chat.completions.create({
      model: "google/gemini-2.0-flash-lite-001",
      temperature: 0.7,
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `Generate viral Instagram reel ideas. Mirror user tone. Diverse variations. JSON only.`
        },
        {
          role: "user",
          content: `30 ideas for "${niche}"${meta ? `. Ref: ${meta}` : ""}${customIdea ? `. Style: ${customIdea}` : ""}
{"ideas":["..."]}`
        }
      ],
      response_format: { type: "json_object" },
    });

    let content = response.choices[0].message.content || "";
    content = content.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();

    try {
      const data = JSON.parse(content);
      setCache(key, data);
      return NextResponse.json(data);
    } catch {
      return NextResponse.json({ ideas: [] });
    }
  } catch (error) {
    console.error("Ideas error:", error);
    return NextResponse.json({ error: "Failed to generate ideas" }, { status: 500 });
  }
}
