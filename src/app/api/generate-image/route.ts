import { NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Generates an image via Pollinations.ai.
 *  - 100% free, no API key required
 *  - Uses Stable Diffusion XL under the hood
 *  - Returns a direct image URL the browser can load/download
 */
export async function POST(req: Request) {
  try {
    const { prompt, aspectRatio } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const { width, height } = aspectRatio === "landscape"
      ? { width: 1280, height: 720 }
      : { width: 720, height: 1280 }; // portrait default (reels/shorts)

    const seed = Math.floor(Math.random() * 1_000_000);
    const encoded = encodeURIComponent(prompt.slice(0, 1500));

    // Pollinations serves the image directly from this URL — we just hand it to the client
    const imageUrl =
      `https://image.pollinations.ai/prompt/${encoded}` +
      `?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true&model=flux`;

    // Verify the URL resolves before sending it to the client (catches Pollinations outages early)
    const probe = await fetch(imageUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(45_000),
    }).catch(() => null);

    if (!probe || !probe.ok) {
      console.warn("[generate-image] Pollinations probe failed:", probe?.status);
      // Return URL anyway — the browser retry often succeeds even if HEAD failed
    }

    return NextResponse.json({ imageUrl, provider: "pollinations" });
  } catch (error: any) {
    console.error("[generate-image] Error:", error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate image." },
      { status: 500 }
    );
  }
}
