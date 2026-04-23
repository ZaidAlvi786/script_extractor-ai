/**
 * Transcription + Keyframe Extraction Layer
 *
 * Executes the local Python script as a child process. The script runs
 * faster-whisper on the audio AND samples N keyframes from the video via ffmpeg.
 * Both are returned as one payload for the analyze pipeline.
 * Never throws — all errors are caught and logged; callers receive null.
 *
 * Environment variables:
 *   TRANSCRIPTION_ENABLED    "true" to opt-in (default: false for production safety)
 *   WHISPER_MODEL            Model size: tiny | base | small | medium | large-v2 (default: base)
 *   PYTHON_BIN               Python executable path (default: python3)
 *   TRANSCRIPTION_TIMEOUT    Hard kill timeout in ms (default: 180000)
 *   FRAME_EXTRACTION_COUNT   Number of visual keyframes to sample (default: 10, 0 to disable)
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import type {
  TranscriptionResult,
  TranscriptHook,
  TranscriptSegment,
  ExtractedFrame,
} from "./types";

export type {
  TranscriptionResult,
  TranscriptSegment,
  TranscriptHook,
  ExtractedFrame,
} from "./types";

// ─── Config ───────────────────────────────────────────────────────────────────

const SCRIPT_PATH = join(process.cwd(), "scripts", "transcribe.py");
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? "base";
const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";
const TIMEOUT_MS = parseInt(process.env.TRANSCRIPTION_TIMEOUT ?? "180000", 10);
const FRAME_COUNT = parseInt(process.env.FRAME_EXTRACTION_COUNT ?? "10", 10);

/** Set TRANSCRIPTION_ENABLED=true in .env to activate this layer. */
export const isTranscriptionEnabled = (): boolean =>
  process.env.TRANSCRIPTION_ENABLED === "true";

// ─── Hook / Keyword Extraction ────────────────────────────────────────────────

/**
 * Lightweight analysis over transcript segments.
 * Detects questions, pattern interrupts, and emotional spikes.
 * Extracts top recurring keywords.
 */
function analyzeTranscript(
  segments: TranscriptSegment[]
): { hooks: TranscriptHook[]; keywords: string[] } {
  const hooks: TranscriptHook[] = [];
  const freq: Record<string, number> = {};
  const STOP_WORDS = new Set([
    "the", "and", "that", "this", "with", "have", "from", "they",
    "will", "what", "when", "your", "just", "like", "about", "into",
  ]);

  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;

    // Questions → hook signal
    if (text.includes("?")) {
      hooks.push({ timestamp: seg.start, text, type: "question" });
    }

    // Short punchy phrases (pattern interrupts)
    const isShort = text.split(/\s+/).length <= 5;
    const isPunchy =
      /[!]$/.test(text) ||
      /^(wait|but|stop|no|yes|wow|look|watch|here|now|ready|listen)\b/i.test(text);
    if (isShort && isPunchy) {
      hooks.push({ timestamp: seg.start, text, type: "pattern_interrupt" });
    }

    // Emotional spikes — ALL CAPS words or emphatic punctuation
    if (/[A-Z]{3,}/.test(text) || /!{2,}/.test(text)) {
      hooks.push({ timestamp: seg.start, text, type: "emotional_spike" });
    }

    // Keyword frequency
    for (const raw of text.split(/\s+/)) {
      const word = raw.toLowerCase().replace(/[^a-z]/g, "");
      if (word.length >= 5 && !STOP_WORDS.has(word)) {
        freq[word] = (freq[word] ?? 0) + 1;
      }
    }
  }

  // Deduplicate hooks by timestamp + type
  const seen = new Set<string>();
  const uniqueHooks = hooks.filter((h) => {
    const k = `${h.type}:${Math.floor(h.timestamp)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const keywords = Object.entries(freq)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);

  return { hooks: uniqueHooks, keywords };
}

// ─── Python Process ───────────────────────────────────────────────────────────

function runWhisperScript(input: string): Promise<TranscriptionResult | null> {
  return new Promise((resolve) => {
    if (!existsSync(SCRIPT_PATH)) {
      console.warn("[transcription] Script not found at:", SCRIPT_PATH);
      resolve(null);
      return;
    }

    // Pass frame count as third arg so Python also extracts keyframes
    const proc = spawn(
      PYTHON_BIN,
      [SCRIPT_PATH, input, WHISPER_MODEL, String(FRAME_COUNT)],
      { env: { ...process.env } }
    );

    // Frames as base64 can push stdout to several MB — accumulate as Buffer chunks
    // and concat at close (more efficient than string concatenation for large payloads)
    const stdoutChunks: Buffer[] = [];
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      console.warn(`[transcription] Killed after ${TIMEOUT_MS}ms timeout`);
      resolve(null);
    }, TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        const preview = stderr.slice(0, 300).trim();
        console.warn(`[transcription] Script exited with code ${code}. stderr: ${preview}`);
        resolve(null);
        return;
      }

      const stdout = Buffer.concat(stdoutChunks).toString("utf8");

      try {
        const raw = JSON.parse(stdout.trim());
        if (raw.error) {
          console.warn("[transcription] Script returned error:", raw.error);
          resolve(null);
          return;
        }

        const segments: TranscriptSegment[] = (raw.segments ?? []).map(
          (s: any): TranscriptSegment => ({
            start: Number(s.start ?? 0),
            end: Number(s.end ?? 0),
            text: String(s.text ?? "").trim(),
          })
        );

        const frames: ExtractedFrame[] = Array.isArray(raw.frames)
          ? raw.frames
              .filter(
                (f: any) =>
                  f && typeof f.dataUrl === "string" && f.dataUrl.startsWith("data:image/")
              )
              .map((f: any) => ({
                timestamp: Number(f.timestamp ?? 0),
                dataUrl: String(f.dataUrl),
              }))
          : [];

        const { hooks, keywords } = analyzeTranscript(segments);

        const framePreview = frames.length
          ? ` +${frames.length} frames (${Math.round(
              frames.reduce((n, f) => n + f.dataUrl.length, 0) / 1024
            )}KB total)`
          : " +0 frames";
        console.log(
          `[transcription] Done. ${segments.length} segments, lang=${raw.language ?? "?"}${framePreview}`
        );

        resolve({
          fullText: String(raw.fullText ?? "").trim(),
          segments,
          language: raw.language ?? undefined,
          duration: raw.duration != null ? Number(raw.duration) : undefined,
          hooks,
          keywords,
          frames,
          videoPath: typeof raw.videoPath === "string" ? raw.videoPath : undefined,
          tempDir: typeof raw.tempDir === "string" ? raw.tempDir : undefined,
        });
      } catch (e) {
        console.warn(
          "[transcription] Failed to parse script output. size=",
          stdout.length,
          "preview:",
          stdout.slice(0, 200)
        );
        resolve(null);
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      console.warn("[transcription] spawn error:", err.message);
      resolve(null);
    });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Transcribe a video from a URL (or local path).
 * The Python script handles platform URL downloads via yt-dlp and direct links.
 *
 * @returns TranscriptionResult or null if transcription is unavailable / fails.
 */
export async function transcribeVideo(
  videoUrl: string
): Promise<TranscriptionResult | null> {
  try {
    return await runWhisperScript(videoUrl);
  } catch (err) {
    console.warn("[transcription] Unexpected error:", err);
    return null;
  }
}

// ─── SRT Export ───────────────────────────────────────────────────────────────

/**
 * Convert a TranscriptionResult to SRT subtitle format.
 *
 * @example
 * const srt = toSRT(transcript);
 * // → "1\n00:00:00,000 --> 00:00:02,100\nHello world\n\n2\n..."
 */
export function toSRT(result: TranscriptionResult): string {
  const formatTime = (s: number): string => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.round((s % 1) * 1000);
    return [
      String(h).padStart(2, "0"),
      String(m).padStart(2, "0"),
      String(sec).padStart(2, "0"),
    ].join(":") + "," + String(ms).padStart(3, "0");
  };

  return result.segments
    .map((seg, i) =>
      `${i + 1}\n${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.text}`
    )
    .join("\n\n");
}

/**
 * Build a compact, LLM-friendly transcript string for prompt injection.
 * Limits segment count to keep prompt size reasonable.
 */
export function buildPromptTranscript(
  result: TranscriptionResult,
  maxSegments = 60
): string {
  const lines = result.segments
    .slice(0, maxSegments)
    .map((s) => `[${s.start.toFixed(1)}s → ${s.end.toFixed(1)}s] ${s.text}`);

  const truncated = result.segments.length > maxSegments;
  return lines.join("\n") + (truncated ? "\n[...transcript truncated...]" : "");
}
