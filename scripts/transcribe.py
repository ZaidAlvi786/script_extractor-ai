#!/usr/bin/env python3
"""
Transcription + Keyframe Extraction script.

Uses faster-whisper (primary) or openai-whisper (fallback) for audio,
and ffmpeg to sample N visual keyframes spaced evenly across the video.
Both are returned so the analyze pipeline can feed the AI:
  - Exact narration + timing (audio)
  - Real motion captured across time (frames)

Usage:
    python transcribe.py <video_url_or_path> [model_size] [frame_count]

    model_size:  tiny | base | small | medium | large-v2  (default: base)
    frame_count: integer, number of keyframes to extract       (default: 10)
                 Pass 0 to skip frame extraction.

Output:
    JSON on stdout:
    {
      "fullText":  "...",
      "segments":  [{"start": 0.0, "end": 2.1, "text": "..."}],
      "language":  "en",
      "duration":  62.4,
      "frames":    [{"timestamp": 6.2, "dataUrl": "data:image/jpeg;base64,..."}]
    }

Errors are printed to stderr and the process exits with code 1.
"""

import sys
import json
import os
import tempfile
import shutil
import subprocess
import base64
import urllib.request
import urllib.error


# ─── Helpers ──────────────────────────────────────────────────────────────────

def is_url(s: str) -> bool:
    return s.startswith("http://") or s.startswith("https://")


def _format_segments(raw_segments) -> list[dict]:
    out = []
    for seg in raw_segments:
        if isinstance(seg, dict):
            out.append({
                "start": round(float(seg.get("start", 0)), 2),
                "end":   round(float(seg.get("end", 0)), 2),
                "text":  seg.get("text", "").strip(),
            })
        else:
            out.append({
                "start": round(float(seg.start), 2),
                "end":   round(float(seg.end), 2),
                "text":  seg.text.strip(),
            })
    return [s for s in out if s["text"]]


# ─── Download ─────────────────────────────────────────────────────────────────

MAX_BYTES = 100 * 1024 * 1024  # 100 MB hard limit


def _download_with_urllib(url: str, dest: str) -> bool:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            content_length = resp.headers.get("Content-Length")
            if content_length and int(content_length) > MAX_BYTES:
                return False
            received = 0
            with open(dest, "wb") as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    received += len(chunk)
                    if received > MAX_BYTES:
                        return False
                    f.write(chunk)
        return os.path.getsize(dest) > 0
    except Exception:
        return False


def _download_with_ytdlp(url: str, dest: str) -> bool:
    """
    yt-dlp download — handles YouTube, TikTok, Instagram, etc.
    We request video+audio combined because we need frames too.
    Instagram/TikTok in particular need a real UA and retries to avoid rate-limit stalls.
    """
    try:
        import yt_dlp  # type: ignore
    except ImportError:
        print("[download] yt-dlp not installed", file=sys.stderr)
        return False

    # Real-browser-looking UA — Instagram aggressively throttles "python/yt-dlp" UAs
    browser_ua = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    )

    ydl_opts = {
        "format": "best[ext=mp4][filesize<100M]/best[filesize<100M]/best",
        "outtmpl": dest,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,            # stop flooding stderr with "% of MiB ETA..."
        "noplaylist": True,
        "max_filesize": MAX_BYTES,
        "postprocessors": [],
        # Robust networking — the orig code had none of these
        "socket_timeout": 20,          # fail fast if the server stalls
        "retries": 3,                  # yt-dlp internal retries
        "fragment_retries": 3,
        "http_headers": {
            "User-Agent": browser_ua,
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.google.com/",
        },
        # Prevent indefinite hang on slow sources (kbps floor)
        "throttled_rate": "100K",
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        if not os.path.exists(dest):
            base = os.path.splitext(dest)[0]
            for ext in (".mp4", ".webm", ".mkv", ".m4a", ".mp3", ".wav", ".ogg"):
                candidate = base + ext
                if os.path.exists(candidate):
                    shutil.move(candidate, dest)
                    break
        success = os.path.exists(dest) and os.path.getsize(dest) > 1024
        if success:
            print(f"[download] yt-dlp OK: {os.path.getsize(dest) // 1024}KB", file=sys.stderr)
        else:
            print("[download] yt-dlp produced no file", file=sys.stderr)
        return success
    except Exception as e:
        # Log the specific error — this was being silently swallowed before
        print(f"[download] yt-dlp failed: {type(e).__name__}: {str(e)[:200]}", file=sys.stderr)
        return False


def _extract_direct_url_with_ytdlp(url: str) -> str | None:
    """
    Ask yt-dlp for the direct media URL without downloading.
    Useful as a fallback — we can then pass that URL to urllib for a simpler download.
    """
    try:
        import yt_dlp  # type: ignore
    except ImportError:
        return None
    try:
        with yt_dlp.YoutubeDL({
            "quiet": True, "no_warnings": True, "noplaylist": True,
            "format": "best[ext=mp4]/best",
            "http_headers": {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            },
        }) as ydl:
            info = ydl.extract_info(url, download=False)
            return info.get("url") or (info.get("formats", [{}])[-1] or {}).get("url")
    except Exception as e:
        print(f"[download] extract_info failed: {type(e).__name__}: {str(e)[:200]}", file=sys.stderr)
        return None


def acquire_video_file(input_str: str) -> tuple[str, bool]:
    if not is_url(input_str):
        if not os.path.exists(input_str):
            raise RuntimeError(f"Local file not found: {input_str}")
        return input_str, False

    tmp_dir = tempfile.mkdtemp(prefix="whisper_")
    dest = os.path.join(tmp_dir, "video.mp4")

    # Strategy 1: yt-dlp (handles platform sites like Instagram/TikTok/YouTube)
    if _download_with_ytdlp(input_str, dest):
        return dest, True

    # Strategy 2: yt-dlp for URL extraction + urllib for the actual fetch.
    # Sometimes yt-dlp's downloader gets rate-limited but the resolved CDN URL
    # is fetchable directly via plain HTTP.
    direct_url = _extract_direct_url_with_ytdlp(input_str)
    if direct_url and _download_with_urllib(direct_url, dest):
        print("[download] urllib via yt-dlp-resolved URL OK", file=sys.stderr)
        return dest, True

    # Strategy 3: urllib on the original URL (only works for direct video links)
    if _download_with_urllib(input_str, dest):
        print("[download] urllib OK", file=sys.stderr)
        return dest, True

    shutil.rmtree(tmp_dir, ignore_errors=True)
    raise RuntimeError(f"Could not download video from: {input_str}")


# ─── Frame Extraction (ffmpeg) ────────────────────────────────────────────────

def _probe_duration(file_path: str) -> float | None:
    """Use ffprobe to get video duration in seconds."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", file_path],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except Exception:
        pass
    return None


def extract_keyframes(file_path: str, count: int, duration: float | None) -> list[dict]:
    """
    Sample `count` frames evenly across the video. Returns list of
    {"timestamp": seconds_float, "dataUrl": "data:image/jpeg;base64,..."}.

    Frames are capped at 720px wide to keep the stdout payload manageable
    while still giving the vision AI enough detail to see motion.
    Silently returns [] if ffmpeg isn't available.
    """
    if count <= 0:
        return []
    if shutil.which("ffmpeg") is None:
        return []

    dur = duration if (duration and duration > 0) else _probe_duration(file_path)
    if not dur or dur <= 0:
        return []

    # Sample inside the video (skip absolute 0 and end — often black)
    # timestamps = [dur * (i + 0.5) / count for i in range(count)]
    # Actually, for accurate progression analysis, spread more evenly including
    # near-start and near-end so the timeline is fully covered.
    if count == 1:
        timestamps = [dur * 0.5]
    else:
        # First frame at ~5%, last frame at ~95%, linear spread between.
        start_pct = 0.05
        end_pct = 0.95
        timestamps = [
            dur * (start_pct + (end_pct - start_pct) * i / (count - 1))
            for i in range(count)
        ]

    tmp_dir = tempfile.mkdtemp(prefix="frames_")
    frames: list[dict] = []
    try:
        for idx, ts in enumerate(timestamps):
            out_path = os.path.join(tmp_dir, f"frame_{idx:02d}.jpg")
            # -ss before -i = fast seek; -frames:v 1 = one frame; -q:v 3 = good JPEG quality
            # scale width to 720 but preserve AR (-1 keeps divisibility)
            proc = subprocess.run(
                [
                    "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                    "-ss", f"{ts:.2f}", "-i", file_path,
                    "-frames:v", "1",
                    "-vf", "scale='min(720,iw)':-2",
                    "-q:v", "3",
                    out_path,
                ],
                capture_output=True, timeout=30,
            )
            if proc.returncode != 0 or not os.path.exists(out_path):
                continue
            try:
                with open(out_path, "rb") as fh:
                    data = fh.read()
                if len(data) < 500:  # sanity: likely a black/broken frame
                    continue
                b64 = base64.b64encode(data).decode("ascii")
                frames.append({
                    "timestamp": round(ts, 2),
                    "dataUrl": f"data:image/jpeg;base64,{b64}",
                })
            except Exception:
                continue
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    return frames


# ─── Transcription ────────────────────────────────────────────────────────────

def transcribe_faster_whisper(file_path: str, model_size: str) -> dict:
    from faster_whisper import WhisperModel  # type: ignore

    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments_iter, info = model.transcribe(
        file_path,
        beam_size=5,
        vad_filter=True,
    )
    segments = _format_segments(list(segments_iter))
    full_text = " ".join(s["text"] for s in segments)
    return {
        "fullText": full_text.strip(),
        "segments": segments,
        "language": getattr(info, "language", "unknown"),
        "duration": round(float(getattr(info, "duration", 0)), 2),
    }


def transcribe_openai_whisper(file_path: str, model_size: str) -> dict:
    import whisper  # type: ignore

    size_map = {"large-v2": "large", "large-v3": "large"}
    wsize = size_map.get(model_size, model_size)
    model = whisper.load_model(wsize)
    result = model.transcribe(file_path)
    segments = _format_segments(result.get("segments", []))
    return {
        "fullText": result.get("text", "").strip(),
        "segments": segments,
        "language": result.get("language", "unknown"),
        "duration": None,
    }


def transcribe(file_path: str, model_size: str) -> dict:
    errors = []
    try:
        return transcribe_faster_whisper(file_path, model_size)
    except ImportError:
        errors.append("faster-whisper not installed")
    except Exception as e:
        errors.append(f"faster-whisper error: {e}")

    try:
        return transcribe_openai_whisper(file_path, model_size)
    except ImportError:
        errors.append("openai-whisper not installed")
    except Exception as e:
        errors.append(f"openai-whisper error: {e}")

    raise RuntimeError(
        "No transcription backend available. "
        "Install faster-whisper: pip install faster-whisper  "
        f"Errors: {'; '.join(errors)}"
    )


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: transcribe.py <url_or_path> [model_size] [frame_count]"}),
              file=sys.stderr)
        sys.exit(1)

    input_str = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "base"
    try:
        frame_count = int(sys.argv[3]) if len(sys.argv) > 3 else 10
    except ValueError:
        frame_count = 10

    file_path = None
    is_temp = False
    tmp_parent = None

    try:
        file_path, is_temp = acquire_video_file(input_str)
        if is_temp:
            tmp_parent = os.path.dirname(file_path)

        transcript_result: dict
        try:
            transcript_result = transcribe(file_path, model_size)
        except Exception as e:
            print(f"[transcribe] skipping transcription: {e}", file=sys.stderr)
            transcript_result = {
                "fullText": "",
                "segments": [],
                "language": None,
                "duration": _probe_duration(file_path),
            }

        try:
            frames = extract_keyframes(
                file_path,
                frame_count,
                transcript_result.get("duration"),
            )
            transcript_result["frames"] = frames
            print(f"[frames] extracted {len(frames)}/{frame_count}", file=sys.stderr)
        except Exception as e:
            print(f"[frames] extraction error: {e}", file=sys.stderr)
            transcript_result["frames"] = []

        # Leave the downloaded video on disk so the Node.js side can upload it
        # to Gemini's Files API for native video analysis. Node owns cleanup.
        if is_temp and os.path.exists(file_path):
            transcript_result["videoPath"] = file_path
            transcript_result["tempDir"] = tmp_parent

        print(json.dumps(transcript_result))

    except Exception as e:
        # On error, clean up any temp dir we created — Node never saw the path
        if is_temp and tmp_parent and os.path.isdir(tmp_parent):
            shutil.rmtree(tmp_parent, ignore_errors=True)
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
