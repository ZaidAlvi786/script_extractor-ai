/** A single spoken segment from the transcription engine. */
export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

/** A detected hook moment extracted from the transcript. */
export type TranscriptHook = {
  timestamp: number;
  text: string;
  type: "question" | "pattern_interrupt" | "emotional_spike";
};

/**
 * A keyframe extracted from the video at a specific timestamp.
 * Used by the analyze pipeline to give the vision AI real motion context
 * (instead of only YouTube's default thumbnails).
 */
export type ExtractedFrame = {
  /** Seconds from start of video where the frame was sampled. */
  timestamp: number;
  /** Base64 JPEG data URL — directly usable as image_url in OpenAI/OpenRouter vision calls. */
  dataUrl: string;
};

/** Full result returned by the transcription layer. */
export type TranscriptionResult = {
  fullText: string;
  segments: TranscriptSegment[];
  /** BCP-47 language code detected by the model (e.g. "en"). */
  language?: string;
  /** Total audio duration in seconds. */
  duration?: number;
  /** Lightweight hook/retention analysis derived from the transcript. */
  hooks?: TranscriptHook[];
  /** Top recurring keywords extracted from the transcript. */
  keywords?: string[];
  /** Visual keyframes sampled evenly across the video timeline. */
  frames?: ExtractedFrame[];
  /**
   * Local filesystem path to the downloaded video. Present when Python succeeded
   * in downloading via yt-dlp. The caller is responsible for cleaning up `tempDir`
   * after it's done with the file (the Python side intentionally leaves it behind
   * so Node can upload it to Gemini's Files API for native video analysis).
   */
  videoPath?: string;
  /** Parent temp directory that should be recursively deleted when done. */
  tempDir?: string;
};
