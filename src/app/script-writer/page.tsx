"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  PenLine,
  Loader2,
  Send,
  Copy,
  Check,
  Wand2,
  Hash,
  Film,
  Star,
  Play,
  ImageIcon,
  RefreshCw,
  AlertCircle,
  Upload,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type PhaseRole = "hook" | "context" | "curiosity" | "payoff" | "cta" | "payoff_cta";

interface ScriptPhase {
  phase: number;
  name: string;
  duration: string;
  role?: PhaseRole;
  script: string;
  visual: string;
  motion: string;
  veo3Prompt: string;
  characterImagePrompt: string;
}

const ROLE_BADGE: Record<PhaseRole, { label: string; className: string }> = {
  hook:        { label: "HOOK",         className: "text-rose-300 bg-rose-500/10 border-rose-500/30" },
  context:     { label: "CONTEXT",      className: "text-amber-300 bg-amber-500/10 border-amber-500/30" },
  curiosity:   { label: "CURIOSITY",    className: "text-violet-300 bg-violet-500/10 border-violet-500/30" },
  payoff:      { label: "PAYOFF",       className: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" },
  cta:         { label: "CTA",          className: "text-cyan-300 bg-cyan-500/10 border-cyan-500/30" },
  payoff_cta:  { label: "PAYOFF + CTA", className: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" },
};

interface ScriptResult {
  title: string;
  description: string;
  caption: string;
  hook: string;
  cta: string;
  hashtags: { youtube: string[]; instagram: string[]; tiktok: string[] };
  phases: ScriptPhase[];
}

// Chat message — either the creator's brief / refinement or an assistant reply.
type ChatMessage =
  | { role: "user"; text: string; ts: number }
  | { role: "assistant"; script: ScriptResult; ts: number };

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function CopyChip({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-400 hover:text-white transition-all"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

const PHASE_BORDER = [
  "border-primary/40 bg-primary/5",
  "border-blue-500/40 bg-blue-500/5",
  "border-orange-500/40 bg-orange-500/5",
  "border-green-500/40 bg-green-500/5",
];

// ─── Page ─────────────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve({ base64: result.slice(comma + 1), mime: file.type || "image/jpeg" });
    };
    reader.readAsDataURL(file);
  });
}

export default function ScriptWriterPage() {
  // Brief form state
  const [storyDetail, setStoryDetail] = useState("");
  const [character, setCharacter] = useState("");
  const [scriptType, setScriptType] = useState("");
  const [durationSec, setDurationSec] = useState(30);
  const [audience, setAudience] = useState("Western (US / UK / Western Europe)");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [notes, setNotes] = useState("");

  // Character reference image
  const [characterImageFile, setCharacterImageFile] = useState<File | null>(null);
  const [characterImagePreview, setCharacterImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Conversation state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refineText, setRefineText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!characterImageFile) {
      setCharacterImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(characterImageFile);
    setCharacterImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [characterImageFile]);

  const handleImagePick = (file: File | null) => {
    if (!file) {
      setCharacterImageFile(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image is over 4 MB — pick a smaller one.");
      return;
    }
    setError(null);
    setCharacterImageFile(file);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const lastScript = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant") return m.script;
    }
    return null;
  })();

  const buildBasePayload = async () => {
    const payload: Record<string, unknown> = {
      character,
      scriptType,
      audience,
      durationSec,
      referenceUrl,
      notes,
      storyDetail,
    };
    if (characterImageFile) {
      const { base64, mime } = await fileToBase64(characterImageFile);
      payload.characterImageBase64 = base64;
      payload.characterImageMime = mime;
    }
    return payload;
  };

  // ── Initial generate ──
  const handleGenerate = async () => {
    if (!storyDetail.trim() && !character.trim() && !scriptType.trim() && !notes.trim()) {
      setError("Tell me at least the story, the character, or the script type before generating.");
      return;
    }

    const briefSummary = [
      storyDetail.trim() && `Story: ${storyDetail.trim()}`,
      scriptType.trim() && `Type: ${scriptType.trim()}`,
      character.trim() && `Character: ${character.trim()}`,
      characterImageFile && `Character image: attached (${characterImageFile.name})`,
      `Duration: ${durationSec}s · Flow phases ≤8s each`,
      `Audience: ${audience}`,
      referenceUrl.trim() && `Reference: ${referenceUrl.trim()}`,
      notes.trim() && `Notes: ${notes.trim()}`,
    ]
      .filter(Boolean)
      .join("\n");

    setMessages((m) => [...m, { role: "user", text: briefSummary, ts: Date.now() }]);
    setLoading(true);
    setError(null);

    try {
      const payload = await buildBasePayload();
      const res = await fetch("/api/script-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to generate script");
      setMessages((m) => [...m, { role: "assistant", script: json.script, ts: Date.now() }]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Refine the latest script ──
  const handleRefine = async () => {
    if (!refineText.trim() || !lastScript) return;

    const feedback = refineText.trim();
    setMessages((m) => [...m, { role: "user", text: feedback, ts: Date.now() }]);
    setRefineText("");
    setLoading(true);
    setError(null);

    try {
      const payload = await buildBasePayload();
      payload.refineFeedback = feedback;
      payload.previousScript = lastScript;
      const res = await fetch("/api/script-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to refine script");
      setMessages((m) => [...m, { role: "assistant", script: json.script, ts: Date.now() }]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 md:py-20 space-y-10" suppressHydrationWarning>
      {/* Hero */}
      <section className="text-center space-y-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium"
        >
          <PenLine className="w-4 h-4" />
          <span>AI Script Writer</span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl md:text-5xl font-extrabold leading-[1.1]"
        >
          From <span className="text-primary italic">story</span> to <span className="text-primary italic">Flow-ready</span> script
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-gray-500 text-sm md:text-base max-w-2xl mx-auto"
        >
          Drop a story, attach the character — get a viral-tuned script split into ≤8s phases with title, captions, hashtags and Flow prompts that lock the same character across every clip.
        </motion.p>
      </section>

      {/* Brief form (only visible until first generation) */}
      {messages.length === 0 && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-6 md:p-8 space-y-5"
        >
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Tell me about it
          </h2>

          <Field label="Your story / brief" required>
            <textarea
              value={storyDetail}
              onChange={(e) => setStoryDetail(e.target.value)}
              placeholder="What happens in the video? Who's in it? What's the punch?
e.g. A guy unboxes 'premium' AliExpress headphones, pumps himself up on the camera — turns out the speaker is just a kazoo. Twist reveal at the end with him deadpan staring at it."
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
            />
          </Field>

          <Field label="Character reference image (highly recommended)">
            <div className="flex items-start gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleImagePick(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              {characterImagePreview ? (
                <div className="relative">
                  <img
                    src={characterImagePreview}
                    alt="Character reference"
                    className="w-24 h-24 rounded-xl object-cover border border-white/10"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCharacterImageFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500/90 hover:bg-red-500 flex items-center justify-center text-white shadow-lg"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 rounded-xl border-2 border-dashed border-white/15 hover:border-primary/50 hover:bg-primary/5 flex flex-col items-center justify-center gap-1 text-gray-500 hover:text-primary transition-all"
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-[10px] font-medium">Upload</span>
                </button>
              )}
              <p className="text-xs text-gray-500 leading-relaxed flex-1">
                Attach a clear face photo of the character. The AI locks every Flow phase to this exact person so the character stays consistent across all clips. PNG / JPG / WebP, ≤4 MB.
              </p>
            </div>
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Character description (optional)">
              <textarea
                value={character}
                onChange={(e) => setCharacter(e.target.value)}
                placeholder="e.g. mid-30s British barista with stubble, cynical eyes, faded green apron, dry humor"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
              />
            </Field>

            <Field label="Script type / niche">
              <textarea
                value={scriptType}
                onChange={(e) => setScriptType(e.target.value)}
                placeholder="e.g. POV reaction comedy, first-person tutorial, dark-humor monologue, ASMR food close-up"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
              />
            </Field>

            <Field label="Duration">
              <select
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              >
                {[15, 20, 25, 30, 45, 60].map((s) => (
                  <option key={s} value={s} className="bg-black">
                    {s} seconds
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Target audience">
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </Field>

            <Field label="Reference link (optional)">
              <input
                value={referenceUrl}
                onChange={(e) => setReferenceUrl(e.target.value)}
                placeholder="A reel/short to take stylistic cues from"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </Field>

            <Field label="Extra notes (optional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tone, pacing constraints, must-include lines, brand mentions…"
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-black font-bold hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all shadow-lg shadow-primary/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Writing your script…
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Generate Script
                </>
              )}
            </button>
          </div>
        </motion.section>
      )}

      {/* Conversation */}
      {messages.length > 0 && (
        <section className="space-y-6">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <UserBubble key={`u-${i}`} text={m.text} />
            ) : (
              <AssistantBubble key={`a-${i}`} script={m.script} />
            )
          )}

          {loading && (
            <div className="glass-xs rounded-2xl p-5 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <p className="text-sm text-gray-400">Writing the next pass…</p>
            </div>
          )}

          <div ref={messagesEndRef} />

          {/* Refine input */}
          {lastScript && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-3xl p-4 space-y-3"
            >
              <div className="flex items-start gap-3">
                <textarea
                  value={refineText}
                  onChange={(e) => setRefineText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRefine();
                  }}
                  placeholder="Refine: tighten the hook, swap the CTA, make it more dry-humor, change the location… (⌘/Ctrl + Enter to send)"
                  rows={2}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
                />
                <button
                  onClick={handleRefine}
                  disabled={!refineText.trim()}
                  className="px-4 py-3 rounded-xl bg-primary text-black font-bold hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:hover:scale-100 transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => {
                  setMessages([]);
                  setError(null);
                  setRefineText("");
                }}
                className="text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                Start over with a new brief
              </button>
            </motion.div>
          )}
        </section>
      )}

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1">
        {label}
        {required && <span className="text-primary">*</span>}
      </label>
      {children}
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="ml-auto max-w-2xl glass-xs rounded-2xl rounded-br-sm p-4 border border-white/5"
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">You</p>
      <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">{text}</p>
    </motion.div>
  );
}

function CopyActionButton({
  label,
  sublabel,
  text,
  variant,
}: {
  label: string;
  sublabel: string;
  text: string;
  variant: "primary" | "ghost";
}) {
  const [copied, setCopied] = useState(false);
  const base =
    "flex-1 flex flex-col items-start gap-0.5 px-4 py-3 rounded-xl border transition-all text-left";
  const tone =
    variant === "primary"
      ? "bg-primary/15 border-primary/40 hover:bg-primary/25 text-white"
      : "bg-white/5 border-white/10 hover:bg-white/10 text-gray-200";
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className={`${base} ${tone}`}
    >
      <span className="flex items-center gap-2 text-sm font-bold">
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        {copied ? "Copied" : label}
      </span>
      <span className="text-[10px] text-gray-400 leading-tight">{sublabel}</span>
    </button>
  );
}

function AssistantBubble({ script }: { script: ScriptResult }) {
  const fullScriptText = buildFullScriptText(script);
  const spokenScriptText = buildSpokenScriptText(script);
  const flowPromptsText = buildFlowPromptsText(script);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-3xl p-6 md:p-8 space-y-6 border border-primary/15"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
            Script Writer
          </span>
        </div>
        <CopyChip text={fullScriptText} label="Copy whole script" />
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Title</span>
        <h3 className="text-white font-extrabold text-xl md:text-2xl leading-tight">
          {script.title}
        </h3>
      </div>

      {/* Hook */}
      {script.hook && (
        <div className="p-4 rounded-xl bg-primary/5 border border-primary/15">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary block mb-1">
            Spoken Hook
          </span>
          <p className="text-white text-sm font-semibold italic leading-relaxed">"{script.hook}"</p>
        </div>
      )}

      {/* Description + caption */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/8 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Description</span>
            <CopyChip text={script.description} />
          </div>
          <p className="text-gray-300 text-xs leading-relaxed">{script.description}</p>
        </div>
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/8 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Caption</span>
            <CopyChip text={script.caption} />
          </div>
          <p className="text-gray-300 text-xs leading-relaxed">{script.caption}</p>
        </div>
      </div>

      {/* Phases */}
      <div className="space-y-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Phase-by-Phase Script
        </span>
        {script.phases.map((p, i) => (
          <PhaseCard key={p.phase} phase={p} accentIdx={i} />
        ))}
      </div>

      {/* CTA */}
      {script.cta && (
        <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/20">
          <span className="text-[10px] font-bold uppercase tracking-widest text-green-500 block mb-1">
            Spoken CTA
          </span>
          <p className="text-green-300 text-sm font-medium">{script.cta}</p>
        </div>
      )}

      {/* Hashtags */}
      <div className="space-y-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Platform Hashtags
        </span>
        <HashtagRow
          icon={<Star className="w-3 h-3" />}
          color="red"
          label="YouTube Shorts"
          tags={script.hashtags.youtube}
        />
        <HashtagRow
          icon={<Film className="w-3 h-3" />}
          color="pink"
          label="Instagram Reels"
          tags={script.hashtags.instagram}
        />
        <HashtagRow
          icon={<Hash className="w-3 h-3" />}
          color="cyan"
          label="TikTok"
          tags={script.hashtags.tiktok}
        />
      </div>

      {/* Copy actions */}
      <div className="pt-4 border-t border-white/5 space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Copy
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <CopyActionButton
            variant="primary"
            label="Whole script"
            sublabel="Title, captions, all phases, prompts, hashtags"
            text={fullScriptText}
          />
          <CopyActionButton
            variant="ghost"
            label="Spoken dialogue"
            sublabel="Just the lines to film, with phase + role"
            text={spokenScriptText}
          />
          <CopyActionButton
            variant="ghost"
            label="Flow prompts"
            sublabel={`All ${script.phases.length} per-phase Flow prompts`}
            text={flowPromptsText}
          />
        </div>
      </div>
    </motion.div>
  );
}

function PhaseCard({ phase, accentIdx }: { phase: ScriptPhase; accentIdx: number }) {
  const badge = phase.role ? ROLE_BADGE[phase.role] : null;
  return (
    <div className={`rounded-xl p-4 border-l-2 ${PHASE_BORDER[accentIdx % PHASE_BORDER.length]} space-y-3`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-bold text-white">
          {phase.phase}
        </span>
        <span className="text-sm font-bold text-white">{phase.name}</span>
        {badge && (
          <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${badge.className}`}>
            {badge.label}
          </span>
        )}
        <span className="ml-auto text-[10px] font-mono text-gray-500">{phase.duration}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">Spoken Script</span>
          <p className="text-gray-200 text-xs leading-relaxed">{phase.script}</p>
        </div>
        <div className="space-y-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">Composition</span>
          <p className="text-gray-400 text-xs leading-relaxed italic">{phase.visual}</p>
        </div>
      </div>

      {phase.motion && (
        <div className="space-y-1 pt-1 border-t border-white/5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-orange-400 flex items-center gap-1">
            <Play className="w-2.5 h-2.5" /> Motion / Action
          </span>
          <p className="text-orange-200/80 text-xs leading-relaxed">{phase.motion}</p>
        </div>
      )}

      {phase.veo3Prompt && (
        <div className="space-y-1 p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/15">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-purple-400 flex items-center gap-1.5">
              <Wand2 className="w-2.5 h-2.5" /> Veo 3 Prompt — phase-locked
            </span>
            <CopyChip text={phase.veo3Prompt} />
          </div>
          <p className="text-purple-100/80 text-[11px] leading-relaxed font-mono">{phase.veo3Prompt}</p>
        </div>
      )}

      {phase.characterImagePrompt && (
        <div className="space-y-1 p-2.5 rounded-lg bg-pink-500/5 border border-pink-500/15">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-pink-400 flex items-center gap-1.5">
              <ImageIcon className="w-2.5 h-2.5" /> Character Image Prompt
            </span>
            <CopyChip text={phase.characterImagePrompt} />
          </div>
          <p className="text-pink-100/80 text-[11px] leading-relaxed font-mono">
            {phase.characterImagePrompt}
          </p>
        </div>
      )}
    </div>
  );
}

function HashtagRow({
  icon,
  color,
  label,
  tags,
}: {
  icon: React.ReactNode;
  color: "red" | "pink" | "cyan";
  label: string;
  tags: string[];
}) {
  const colorMap = {
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    pink: "text-pink-400 bg-pink-500/10 border-pink-500/20",
    cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${colorMap[color].split(" ")[0]}`}>
          {icon} {label}
        </span>
        <CopyChip text={tags.join(" ")} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className={`text-[10px] px-2 py-0.5 rounded-full border ${colorMap[color]}`}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Copy-text builders ───────────────────────────────────────────────────────

function roleLabelFor(p: ScriptPhase): string {
  return p.role ? ROLE_BADGE[p.role].label : p.name.toUpperCase();
}

function buildFullScriptText(s: ScriptResult): string {
  const phases = s.phases
    .map(
      (p) =>
        `── PHASE ${p.phase}: ${p.name.toUpperCase()} [${roleLabelFor(p)}] (${p.duration}) ──\n` +
        `SCRIPT: ${p.script}\n` +
        `VISUAL: ${p.visual}\n` +
        (p.motion ? `MOTION: ${p.motion}\n` : "") +
        (p.veo3Prompt ? `FLOW PROMPT: ${p.veo3Prompt}\n` : "") +
        (p.characterImagePrompt ? `CHARACTER IMAGE: ${p.characterImagePrompt}\n` : "")
    )
    .join("\n");

  const tags = [
    `YouTube: ${s.hashtags.youtube.join(" ")}`,
    `Instagram: ${s.hashtags.instagram.join(" ")}`,
    `TikTok: ${s.hashtags.tiktok.join(" ")}`,
  ].join("\n");

  return (
    `★ ${s.title}\n` +
    (s.hook ? `Hook: "${s.hook}"\n` : "") +
    `\nDESCRIPTION:\n${s.description}\n` +
    `\nCAPTION:\n${s.caption}\n\n` +
    `${phases}\n` +
    (s.cta ? `CTA: ${s.cta}\n\n` : "\n") +
    `── HASHTAGS ──\n${tags}\n`
  );
}

function buildSpokenScriptText(s: ScriptResult): string {
  const lines = s.phases
    .map((p) => `[${p.duration} · ${roleLabelFor(p)}] ${p.script}`)
    .join("\n\n");
  return `★ ${s.title}\n\n${lines}${s.cta ? `\n\n[CTA] ${s.cta}` : ""}\n`;
}

function buildFlowPromptsText(s: ScriptResult): string {
  return s.phases
    .map(
      (p) =>
        `── PHASE ${p.phase}: ${roleLabelFor(p)} (${p.duration}) ──\n${p.veo3Prompt}\n`
    )
    .join("\n");
}
