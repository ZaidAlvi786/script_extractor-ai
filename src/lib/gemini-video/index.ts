/**
 * Gemini Native Video Analysis
 *
 * Uploads a local video file to Gemini's Files API, waits for it to become
 * ACTIVE, then calls generateContent with the file as input. Gemini watches
 * the video natively (up to 30fps internally) — dramatically higher motion
 * fidelity than sending sampled still frames.
 *
 * Env vars:
 *   GEMINI_API_KEY          Required. Get one at https://aistudio.google.com/apikey
 *   GEMINI_VIDEO_MODEL      Optional. Default: "gemini-2.5-flash"
 *   GEMINI_FILE_POLL_MS     Optional. Poll interval while file is PROCESSING. Default: 2000ms
 *   GEMINI_FILE_TIMEOUT_MS  Optional. Hard timeout for processing. Default: 120000ms (2 min)
 */

import { GoogleGenAI } from "@google/genai";
import { statSync, existsSync } from "fs";

const DEFAULT_MODEL = process.env.GEMINI_VIDEO_MODEL ?? "gemini-2.5-flash";
const POLL_MS = parseInt(process.env.GEMINI_FILE_POLL_MS ?? "2000", 10);
const PROCESSING_TIMEOUT_MS = parseInt(
  process.env.GEMINI_FILE_TIMEOUT_MS ?? "120000",
  10
);

// 2 GB is the Gemini per-file limit. We additionally cap at 100 MB to match
// the Python download limit (videos above that wouldn't be usable anyway).
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const isGeminiNativeEnabled = (): boolean =>
  !!process.env.GEMINI_API_KEY;

type GeminiFile = {
  name?: string;
  uri?: string;
  state?: string;
  mimeType?: string;
};

type AnalyzeResult = {
  content: string;
  fileUri: string;
  fileName: string;
};

/** Infer mime type from filename extension. Gemini requires this on upload. */
function mimeTypeFromPath(path: string): string {
  const ext = path.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    m4v: "video/x-m4v",
  };
  return map[ext] ?? "video/mp4";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Upload a local file to Gemini and wait until its `state` becomes ACTIVE
 * (meaning Gemini has finished ingesting/indexing the video).
 */
async function uploadAndWait(
  ai: GoogleGenAI,
  filePath: string,
  mimeType: string
): Promise<GeminiFile> {
  console.log(`[gemini-video] Uploading ${filePath} (${mimeType})...`);
  const t0 = Date.now();

  let file = (await ai.files.upload({
    file: filePath,
    config: { mimeType },
  })) as GeminiFile;

  console.log(
    `[gemini-video] Uploaded in ${((Date.now() - t0) / 1000).toFixed(1)}s. state=${file.state}, name=${file.name}`
  );

  if (!file.name) {
    throw new Error("Gemini upload returned no file name");
  }

  // Poll until ACTIVE (or failure)
  const pollStart = Date.now();
  const name = file.name; // captured before loop so TS knows it's defined
  while (file.state === "PROCESSING") {
    if (Date.now() - pollStart > PROCESSING_TIMEOUT_MS) {
      throw new Error(
        `Gemini file processing exceeded ${PROCESSING_TIMEOUT_MS}ms — giving up`
      );
    }
    await sleep(POLL_MS);
    file = (await ai.files.get({ name })) as GeminiFile;
  }

  if (file.state !== "ACTIVE") {
    throw new Error(`Gemini file not ACTIVE, final state: ${file.state}`);
  }

  console.log(
    `[gemini-video] File ACTIVE after ${((Date.now() - t0) / 1000).toFixed(1)}s total`
  );
  return file;
}

/**
 * Best-effort delete of a previously uploaded Gemini file.
 * Files auto-expire in 48h — this just frees quota sooner.
 */
async function deleteFile(ai: GoogleGenAI, name: string): Promise<void> {
  try {
    await ai.files.delete({ name });
  } catch (e: any) {
    // Non-fatal — file will auto-expire in 48h anyway
    console.warn(`[gemini-video] Could not delete file ${name}:`, e?.message ?? e);
  }
}

/**
 * Upload a video file and analyze it with Gemini using the given prompts.
 * Returns the model's text response. Cleans up the uploaded file after.
 *
 * @throws if GEMINI_API_KEY missing, file not found/too large, or Gemini errors.
 */
export async function analyzeVideoWithGemini(
  videoPath: string,
  systemPrompt: string,
  userPrompt: string,
  opts?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<AnalyzeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  // Catch the extremely common "read I as l" typo before we send the request.
  // Valid Google API keys start with "AIza" (capital-A, capital-I, lowercase-z-a).
  if (!apiKey.startsWith("AIza")) {
    throw new Error(
      `GEMINI_API_KEY looks malformed. Google keys start with "AIza" ` +
      `(capital-A, capital-I, lowercase-z, lowercase-a). Your key starts with ` +
      `"${apiKey.slice(0, 4)}". Re-copy it from https://aistudio.google.com/apikey ` +
      `using the clipboard button.`
    );
  }

  if (!existsSync(videoPath)) {
    throw new Error(`Video file not found at: ${videoPath}`);
  }

  const size = statSync(videoPath).size;
  if (size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Video too large (${Math.round(size / 1024 / 1024)} MB > ${Math.round(
        MAX_UPLOAD_BYTES / 1024 / 1024
      )} MB)`
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const mimeType = mimeTypeFromPath(videoPath);
  const model = opts?.model ?? DEFAULT_MODEL;
  const temperature = opts?.temperature ?? 0.2;
  const maxOutputTokens = opts?.maxTokens ?? 6000;

  const file = await uploadAndWait(ai, videoPath, mimeType);
  if (!file.uri || !file.name) {
    throw new Error("Gemini file missing uri/name after ACTIVE state");
  }

  try {
    console.log(
      `[gemini-video] Generating with ${model} — video duration ~${(size / 1024 / 1024).toFixed(2)}MB`
    );
    const t0 = Date.now();

    // Gemini's generateContent accepts fileData for uploaded video files.
    // System instruction goes via config.systemInstruction (not inside contents).
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { fileData: { fileUri: file.uri, mimeType } },
            { text: userPrompt },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        temperature,
        maxOutputTokens,
      },
    });

    const text = response.text ?? "";
    console.log(
      `[gemini-video] Generated in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${text.length} chars`
    );

    return {
      content: text,
      fileUri: file.uri,
      fileName: file.name,
    };
  } finally {
    // Always clean up the uploaded file (fire-and-forget, non-blocking)
    void deleteFile(ai, file.name);
  }
}

/**
 * Analyze a sequence of still frames with Gemini directly (no Files API upload).
 * Used when we only have extracted frame images (not a full video file) and want
 * to bypass OpenRouter's tight free-tier credit limits.
 *
 * Each frame is sent as an inline base64 image followed by a timestamp label,
 * so Gemini sees them as a flipbook/timeline.
 *
 * @throws if GEMINI_API_KEY missing or Gemini returns an error.
 */
export async function analyzeFramesWithGemini(
  frames: Array<{ dataUrl: string; timestamp: number }>,
  systemPrompt: string,
  userPrompt: string,
  opts?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<{ content: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  if (!apiKey.startsWith("AIza")) {
    throw new Error(
      `GEMINI_API_KEY looks malformed (must start with "AIza"). Starts with "${apiKey.slice(0, 4)}".`
    );
  }
  if (!frames.length) {
    throw new Error("analyzeFramesWithGemini called with zero frames");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = opts?.model ?? DEFAULT_MODEL;
  const temperature = opts?.temperature ?? 0.2;
  const maxOutputTokens = opts?.maxTokens ?? 6000;

  // Build parts: frame label text + inline image, repeated, then the user prompt at the end.
  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    parts.push({
      text: `━━━ FRAME ${i + 1} / ${frames.length}  @  ${f.timestamp.toFixed(2)}s ━━━`,
    });

    // dataUrl format: "data:image/jpeg;base64,<base64>"
    const match = f.dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) {
      throw new Error(`Frame ${i + 1} has malformed dataUrl (expected data:image/*;base64,...)`);
    }
    const [, mimeType, base64] = match;
    parts.push({ inlineData: { mimeType, data: base64 } });
  }

  parts.push({ text: userPrompt });

  console.log(
    `[gemini-video] Direct-frames call with ${model}, ${frames.length} frames, maxTokens=${maxOutputTokens}`
  );
  const t0 = Date.now();

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: systemPrompt,
      temperature,
      maxOutputTokens,
    },
  });

  const text = response.text ?? "";
  console.log(
    `[gemini-video] Direct-frames generated in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${text.length} chars`
  );

  return { content: text };
}
