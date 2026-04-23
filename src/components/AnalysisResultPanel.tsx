"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Flame, Star, Zap, Eye, Target, Users, Clapperboard, BookOpen, Lightbulb, Wand2, Loader2, Mic, Download, Sparkles, RefreshCw, ChevronDown, ChevronUp, Film, Hash, Play, ImageIcon, Video, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptHook {
  timestamp: number;
  text: string;
  type: "question" | "pattern_interrupt" | "emotional_spike";
}

interface AnalysisData {
  script: {
    hook: string;
    scenes: {
      sceneNumber: number;
      timestamp: string;
      narration: string;
      visuals: string;
      motion?: string;
      emotion: string;
      editingNotes: string;
      dialogueSource?: "transcript" | "inferred";
      confidenceScore?: number;
    }[];
    cta: string;
  };
  viralFactors: {
    factor: string;
    explanation: string;
    impact: "critical" | "strong" | "moderate" | "minimal";
    timestamp: string;
  }[];
  viewMagnet: {
    moment: string;
    timestamp: string;
    psychology: string;
  };
  characterPrompts: {
    name: string;
    role: string;
    imagePrompt: string;
    motionPrompt?: string;
    screenTime: string;
  }[];
  replicationGuide: {
    coreFormula: string;
    variations: {
      niche: string;
      idea: string;
      twist: string;
    }[];
    shootingGuide: string;
    editingGuide: string;
    soundDesign: string;
    postingStrategy: string;
  };
  metrics: {
    hookStrength: number;
    retentionScore: number;
    shareability: number;
    replayValue: number;
    overallViralPotential: number;
  };
  transcript?: {
    fullText: string;
    segments: TranscriptSegment[];
    language?: string;
    duration?: number;
    hooks?: TranscriptHook[];
    keywords?: string[];
  };
}

interface AnalysisResultPanelProps {
  data: AnalysisData;
}

interface IdeaPhase {
  phase: number;
  title: string;
  duration: string;
  script: string;
  visual: string;
  motion?: string;       // NEW: motion/action with verbs + timing
  videoPrompt?: string;  // NEW: ready-to-paste video-generator prompt
}

interface VideoIdea {
  id: number;
  title: string;
  angle: string;
  hook: string;
  emotion: string;
  audience: string;
  viralScore: number;
  phases: IdeaPhase[];
  hashtags: { instagram: string[]; tiktok: string[]; youtube: string[] };
  cta: string;
}

const STATIC_TABS = [
  { id: "script", label: "Script", icon: Clapperboard },
  { id: "viral", label: "Viral Factors", icon: Flame },
  { id: "characters", label: "Characters", icon: Users },
  { id: "blueprint", label: "Blueprint", icon: Lightbulb },
  { id: "remix", label: "Remix & Generate", icon: Wand2 },
  { id: "ideas", label: "30 Ideas", icon: Sparkles },
];
const TRANSCRIPT_TAB = { id: "transcript", label: "Transcript", icon: Mic };

const impactColors: Record<string, string> = {
  critical: "from-red-500 to-orange-500",
  strong: "from-orange-400 to-yellow-400",
  moderate: "from-blue-400 to-cyan-400",
  minimal: "from-gray-400 to-gray-500",
};

const impactBgColors: Record<string, string> = {
  critical: "bg-red-500/10 border-red-500/30 text-red-400",
  strong: "bg-orange-500/10 border-orange-500/30 text-orange-400",
  moderate: "bg-blue-500/10 border-blue-500/30 text-blue-400",
  minimal: "bg-gray-500/10 border-gray-500/30 text-gray-400",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-400 hover:text-white transition-all"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function MetricRing({ value, label, icon: Icon }: { value: number; label: string; icon: any }) {
  const percentage = value * 10;
  const circumference = 2 * Math.PI * 20;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const color = value >= 8 ? "#22c55e" : value >= 6 ? "#eab308" : value >= 4 ? "#f97316" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="20" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
          <circle
            cx="22" cy="22" r="20" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            strokeLinecap="round" className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color }}>{value}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
        <Icon className="w-3 h-3" />
        {label}
      </div>
    </div>
  );
}

export default function AnalysisResultPanel({ data }: AnalysisResultPanelProps) {
  const [activeTab, setActiveTab] = useState("script");

  // ── Ideas state lives here so it persists across tab switches ──────────────
  const [ideas, setIdeas]             = useState<VideoIdea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasError, setIdeasError]   = useState<string | null>(null);
  const [ideasDone, setIdeasDone]     = useState(false);

  const generateIdeas = async (skipCache = false) => {
    setIdeasLoading(true);
    setIdeasError(null);
    try {
      const res = await fetch("/api/video-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: data, skipCache }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to generate ideas");
      setIdeas(json.ideas ?? []);
      setIdeasDone(true);
    } catch (err: any) {
      setIdeasError(err.message);
    } finally {
      setIdeasLoading(false);
    }
  };

  // Auto-generate the first time the user opens the Ideas tab
  useEffect(() => {
    if (activeTab === "ideas" && !ideasDone && !ideasLoading) {
      generateIdeas(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div className="space-y-8">
      {/* Metrics Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-3xl p-6"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Target className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400">Viral Scorecard</h3>
        </div>
        <div className="flex justify-around flex-wrap gap-4">
          <MetricRing value={data.metrics?.hookStrength || 0} label="Hook" icon={Zap} />
          <MetricRing value={data.metrics?.retentionScore || 0} label="Retention" icon={Eye} />
          <MetricRing value={data.metrics?.shareability || 0} label="Shares" icon={Star} />
          <MetricRing value={data.metrics?.replayValue || 0} label="Replay" icon={BookOpen} />
          <MetricRing value={data.metrics?.overallViralPotential || 0} label="Viral" icon={Flame} />
        </div>
      </motion.div>

      {/* View Magnet Highlight */}
      {data.viewMagnet && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-purple-500/5 to-transparent p-6"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-[64px] -z-10" />
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🧲</span>
            <h3 className="text-sm font-bold uppercase tracking-widest text-primary">View Magnet Moment</h3>
            <span className="ml-auto text-xs text-primary/60 font-mono">{data.viewMagnet.timestamp}</span>
          </div>
          <p className="text-white text-lg font-medium mb-2">{data.viewMagnet.moment}</p>
          <p className="text-gray-400 text-sm leading-relaxed">{data.viewMagnet.psychology}</p>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
        {[...STATIC_TABS, ...(data.transcript ? [TRANSCRIPT_TAB] : [])].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? "bg-primary text-black shadow-lg shadow-primary/20"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.id === "transcript" && (
                <span className="ml-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                  AI
                </span>
              )}
              {tab.id === "ideas" && ideasDone && ideas.length > 0 && (
                <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                  {ideas.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "script" && <ScriptTab script={data.script} />}
          {activeTab === "viral" && <ViralFactorsTab factors={data.viralFactors} />}
          {activeTab === "characters" && <CharactersTab characters={data.characterPrompts} />}
          {activeTab === "blueprint" && <BlueprintTab guide={data.replicationGuide} />}
          {activeTab === "remix" && <RemixTab originalAnalysis={data} />}
          {activeTab === "ideas" && (
            <IdeasLabTab
              ideas={ideas}
              loading={ideasLoading}
              error={ideasError}
              onRefresh={() => generateIdeas(true)}
            />
          )}
          {activeTab === "transcript" && data.transcript && (
            <TranscriptTab transcript={data.transcript} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * Build a dense, self-contained video-generator prompt for ONE scene.
 * Format is optimized for Veo 3.1 / Kling / Runway / Sora — a single paragraph
 * that combines composition + motion + tone + realism modifiers, ≤ 8 seconds.
 *
 * Key lessons from Veo/Kling prompting:
 *   • Single paragraph, no bullet points or line breaks (models read structure as overlay text).
 *   • Put SUBJECT + ACTION first, then camera/lighting, then style modifiers at the end.
 *   • Motion verbs ("tilts", "leans", "opens") are MUCH stronger signal than adjectives.
 *   • Realism keywords at the end prevent AI glitches/warping (the #1 Veo complaint).
 */
function buildScenePrompt(scene: AnalysisData["script"]["scenes"][number]): string {
  const parts: string[] = [];

  // 1. Composition (who/where/how framed)
  if (scene.visuals) {
    parts.push(scene.visuals.trim().replace(/\s+/g, " "));
  }

  // 2. Motion (what moves, when, in what order) — this is the load-bearing part
  if (scene.motion) {
    parts.push(scene.motion.trim().replace(/\s+/g, " "));
  }

  // 3. Emotional mood
  if (scene.emotion) {
    parts.push(`Mood: ${scene.emotion}.`);
  }

  // 4. Realism + smoothness modifiers — prevents the warping/glitching/jittering
  //    that video generators default to. These are "known good" Veo/Kling keywords.
  parts.push(
    "Shot in cinematic photorealism with smooth natural motion, accurate physics, " +
    "consistent anatomy, stable subject identity across the clip, shallow depth of field, " +
    "soft film grain, shot on 50mm lens, 24fps, warm color grading. " +
    "No morphing, no warping, no glitching, no artifacts, no text overlays."
  );

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function ScenePromptBlock({
  scene,
}: {
  scene: AnalysisData["script"]["scenes"][number];
}) {
  const prompt = buildScenePrompt(scene);
  if (!prompt) return null;

  return (
    <div className="pt-2 border-t border-white/5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400 flex items-center gap-1">
          <Wand2 className="w-2.5 h-2.5" /> Video Prompt (Veo 3.1 / Kling / Runway — ≤ 8s)
        </span>
        <CopyButton text={prompt} />
      </div>
      <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/15">
        <p className="text-purple-100/85 text-xs leading-relaxed font-mono">
          {prompt}
        </p>
      </div>
    </div>
  );
}

/* ─── Tab: Script ──────────────────────────────────────────── */
function ScriptTab({ script }: { script: AnalysisData["script"] }) {
  // Full script includes motion so pasting into a video-generator is one-shot
  const fullScript = `HOOK: ${script.hook}\n\n${script.scenes?.map(
    (s) =>
      `[Scene ${s.sceneNumber}] ${s.timestamp}\n` +
      `Narration: ${s.narration}\n` +
      `Composition: ${s.visuals}\n` +
      (s.motion ? `Motion: ${s.motion}\n` : "") +
      `Emotion: ${s.emotion}\n` +
      `Editing: ${s.editingNotes}`
  ).join("\n\n")}\n\nCTA: ${script.cta}`;

  // A compact "video-generator prompt" variant that concatenates all motion
  // into a single dense paragraph — ideal for Kling/Motif/Runway which want
  // one prompt, not a multi-scene script.
  const videoPromptScript = script.scenes
    ?.map((s, i) => {
      const motion = s.motion || "subject holds position";
      return `Shot ${i + 1} (${s.timestamp}): ${s.visuals}. ${motion}`;
    })
    .join(" ");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-bold">Full Script Reconstruction</h3>
        <div className="flex gap-2">
          <CopyButton text={fullScript} />
          {videoPromptScript && videoPromptScript.length > 20 && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(videoPromptScript);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-xs text-purple-300 transition-all"
              title="Copy a dense motion-rich paragraph — ready for Kling / Motif / Runway"
            >
              <Wand2 className="w-3 h-3" />
              Copy Video Prompt
            </button>
          )}
        </div>
      </div>

      {/* Hook */}
      <div className="glass rounded-2xl p-5 border-l-4 border-primary">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🪝</span>
          <span className="text-xs font-bold uppercase tracking-widest text-primary">The Hook</span>
        </div>
        <p className="text-white text-lg font-medium">{script.hook}</p>
      </div>

      {/* Scenes */}
      <div className="space-y-3">
        {script.scenes?.map((scene, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-xs rounded-2xl p-5 space-y-3"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                  {scene.sceneNumber}
                </div>
                <span className="text-xs font-mono text-gray-500">{scene.timestamp}</span>
                {scene.dialogueSource === "transcript" && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25">
                    transcript
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {scene.confidenceScore != null && (
                  <span className="text-[9px] font-mono text-gray-600">
                    conf {scene.confidenceScore}/10
                  </span>
                )}
                <span className="text-xs px-3 py-1 rounded-full bg-white/5 text-gray-400 border border-white/10">
                  {scene.emotion}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Narration</span>
                <p className="text-gray-200 text-sm leading-relaxed">{scene.narration}</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Composition</span>
                <p className="text-gray-200 text-sm leading-relaxed">{scene.visuals}</p>
              </div>
            </div>
            {scene.motion && (
              <div className="pt-2 border-t border-white/5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400 flex items-center gap-1">
                  <Play className="w-2.5 h-2.5" /> Motion / Action
                </span>
                <p className="text-orange-200/80 text-sm mt-1 leading-relaxed">{scene.motion}</p>
              </div>
            )}
            {/* Per-scene Veo-ready video prompt — paste into Veo/Kling/Runway/Sora */}
            <ScenePromptBlock scene={scene} />
            {scene.editingNotes && (
              <div className="pt-2 border-t border-white/5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Editing Notes</span>
                <p className="text-gray-400 text-xs mt-1">{scene.editingNotes}</p>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* CTA */}
      <div className="glass rounded-2xl p-5 border-l-4 border-green-500">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🚀</span>
          <span className="text-xs font-bold uppercase tracking-widest text-green-400">Call to Action</span>
        </div>
        <p className="text-white text-lg font-medium">{script.cta}</p>
      </div>
    </div>
  );
}

/* ─── Tab: Viral Factors ───────────────────────────────────── */
function ViralFactorsTab({ factors }: { factors: AnalysisData["viralFactors"] }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">Why This Goes Viral</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {factors?.map((factor, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="glass-xs rounded-2xl p-5 space-y-3 hover:border-white/20 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-white font-semibold">{factor.factor}</h4>
              <span className={`text-[10px] px-2.5 py-1 rounded-full border font-bold uppercase tracking-wider whitespace-nowrap ${impactBgColors[factor.impact] || impactBgColors.moderate}`}>
                {factor.impact}
              </span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">{factor.explanation}</p>
            {factor.timestamp && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-mono">⏱ {factor.timestamp}</span>
              </div>
            )}
            {/* Impact bar */}
            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${impactColors[factor.impact] || impactColors.moderate}`}
                style={{
                  width: factor.impact === "critical" ? "100%" : factor.impact === "strong" ? "75%" : factor.impact === "moderate" ? "50%" : "25%",
                }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─── Tab: Characters ──────────────────────────────────────── */
function CharactersTab({ characters }: { characters: AnalysisData["characterPrompts"] }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">Character AI Prompts</h3>
      <div className="space-y-4">
        {characters?.map((char, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass rounded-2xl overflow-hidden"
          >
            <div className="p-5 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/30 to-purple-500/30 flex items-center justify-center text-2xl">
                    🎭
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-lg">{char.name}</h4>
                    <p className="text-gray-500 text-xs">{char.role} · {char.screenTime}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-primary">Image Generation Prompt</span>
                <CopyButton text={char.imagePrompt} />
              </div>
              <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                <p className="text-gray-300 text-sm leading-relaxed font-mono">{char.imagePrompt}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─── Tab: Blueprint ───────────────────────────────────────── */
function BlueprintTab({ guide }: { guide: AnalysisData["replicationGuide"] }) {
  const fullBlueprint = `CORE FORMULA: ${guide.coreFormula}\n\nSHOOTING GUIDE:\n${guide.shootingGuide}\n\nEDITING GUIDE:\n${guide.editingGuide}\n\nSOUND DESIGN:\n${guide.soundDesign}\n\nPOSTING STRATEGY:\n${guide.postingStrategy}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Replication Blueprint</h3>
        <CopyButton text={fullBlueprint} />
      </div>

      {/* Core Formula */}
      <div className="relative overflow-hidden glass rounded-2xl p-6 border-l-4 border-yellow-500">
        <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/10 rounded-full blur-[48px] -z-10" />
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🧬</span>
          <span className="text-xs font-bold uppercase tracking-widest text-yellow-400">Core Formula</span>
        </div>
        <p className="text-white text-lg font-semibold">{guide.coreFormula}</p>
      </div>

      {/* Variations */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold uppercase tracking-widest text-gray-400">Niche Variations</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {guide.variations?.map((v, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className="glass-xs rounded-2xl p-4 space-y-2 hover:border-primary/30 transition-colors"
            >
              <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold">
                {v.niche}
              </span>
              <p className="text-white text-sm font-medium">{v.idea}</p>
              <p className="text-gray-500 text-xs">{v.twist}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Production Guides */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GuideSection icon="📹" title="Shooting Guide" content={guide.shootingGuide} />
        <GuideSection icon="✂️" title="Editing Guide" content={guide.editingGuide} />
        <GuideSection icon="🎵" title="Sound Design" content={guide.soundDesign} />
        <GuideSection icon="📱" title="Posting Strategy" content={guide.postingStrategy} />
      </div>
    </div>
  );
}

function GuideSection({ icon, title, content }: { icon: string; title: string; content: string }) {
  return (
    <div className="glass-xs rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">{title}</h4>
      </div>
      <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{content}</p>
    </div>
  );
}

/* ─── Tab: Remix & Generate ─────────────────────────────────── */
interface RemixScene {
  sceneNumber: number;
  timestamp: string;
  narration: string;
  videoPrompt: string;
  emotion: string;
  editingNotes: string;
}

interface RemixData {
  title: string;
  scenes: RemixScene[];
  hook: string;
  cta: string;
  style: string;
  music: string;
}

function RemixTab({ originalAnalysis }: { originalAnalysis: AnalysisData }) {
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [remix, setRemix] = useState<RemixData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!instructions.trim()) return;
    setLoading(true);
    setError(null);
    setRemix(null);

    try {
      const response = await fetch("/api/remix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalAnalysis,
          userInstructions: instructions.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to generate");
      setRemix(data.remix);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const allVideoPrompts = remix?.scenes?.map(
    (s) => `Scene ${s.sceneNumber} (${s.timestamp}):\n${s.videoPrompt}`
  ).join("\n\n") || "";

  const fullScript = remix ? `TITLE: ${remix.title}\nSTYLE: ${remix.style}\nMUSIC: ${remix.music}\n\nHOOK: ${remix.hook}\n\n${remix.scenes?.map(
    (s) => `[Scene ${s.sceneNumber}] ${s.timestamp}\nNarration: ${s.narration}\nVideo Prompt: ${s.videoPrompt}\nEmotion: ${s.emotion}\nEditing: ${s.editingNotes}`
  ).join("\n\n")}\n\nCTA: ${remix.cta}` : "";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-bold">Remix This Video</h3>
        <p className="text-gray-500 text-sm">Describe your changes — different characters, setting, style, or niche. The AI will generate a new script with <strong className="text-primary">video generation prompts</strong> for each scene.</p>
      </div>

      {/* Instructions Input */}
      <div className="space-y-3">
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={"Example: Make it about a cat in a cozy living room instead of an orange. Use warm autumn colors, make the cat character fluffy and orange. Add dramatic slow-mo moments. Change the style to cinematic and moody..."}
          className="w-full h-32 p-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-white/10 transition-all text-sm resize-none placeholder:text-gray-600"
        />
        <button
          onClick={handleGenerate}
          disabled={loading || !instructions.trim()}
          className="w-full h-12 bg-gradient-to-r from-primary to-purple-500 text-white font-bold rounded-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Generating Your Version...</>
          ) : (
            <><Wand2 className="w-5 h-5" /> Generate Remixed Script + Video Prompts</>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-xs rounded-2xl p-5 space-y-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/5" />
                <div className="h-3 bg-white/5 rounded-full w-24" />
              </div>
              <div className="h-3 bg-white/5 rounded-full w-full" />
              <div className="h-3 bg-white/5 rounded-full w-4/5" />
              <div className="h-12 bg-white/5 rounded-xl w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {remix && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Title & Style */}
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xl font-bold text-white">{remix.title}</h4>
              <CopyButton text={fullScript} />
            </div>
            <div className="flex flex-wrap gap-3">
              {remix.style && (
                <span className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                  🎨 {remix.style}
                </span>
              )}
              {remix.music && (
                <span className="text-xs px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
                  🎵 {remix.music}
                </span>
              )}
            </div>
          </div>

          {/* Copy All Video Prompts button */}
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold uppercase tracking-widest text-gray-400">Scene-by-Scene Video Prompts</h4>
            <CopyButton text={allVideoPrompts} />
          </div>

          {/* Hook */}
          <div className="glass rounded-2xl p-5 border-l-4 border-primary">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🪝</span>
              <span className="text-xs font-bold uppercase tracking-widest text-primary">Hook</span>
            </div>
            <p className="text-white text-lg font-medium">{remix.hook}</p>
          </div>

          {/* Scenes */}
          <div className="space-y-4">
            {remix.scenes?.map((scene, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-xs rounded-2xl overflow-hidden"
              >
                {/* Scene Header */}
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                        {scene.sceneNumber}
                      </div>
                      <span className="text-xs font-mono text-gray-500">{scene.timestamp}</span>
                    </div>
                    <span className="text-xs px-3 py-1 rounded-full bg-white/5 text-gray-400 border border-white/10">
                      {scene.emotion}
                    </span>
                  </div>

                  {/* Narration */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Narration / Voiceover</span>
                    <p className="text-gray-200 text-sm leading-relaxed">{scene.narration}</p>
                  </div>

                  {/* Editing Notes */}
                  {scene.editingNotes && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Editing</span>
                      <p className="text-gray-400 text-xs">{scene.editingNotes}</p>
                    </div>
                  )}
                </div>

                {/* Video Generation Prompt — highlighted section */}
                <div className="p-5 bg-gradient-to-r from-primary/5 to-purple-500/5 border-t border-primary/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
                      <Wand2 className="w-3 h-3" />
                      Video Generation Prompt
                    </span>
                    <CopyButton text={scene.videoPrompt} />
                  </div>
                  <div className="p-3 rounded-xl bg-black/30 border border-primary/10">
                    <p className="text-gray-300 text-sm leading-relaxed font-mono">{scene.videoPrompt}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* CTA */}
          <div className="glass rounded-2xl p-5 border-l-4 border-green-500">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🚀</span>
              <span className="text-xs font-bold uppercase tracking-widest text-green-400">Call to Action</span>
            </div>
            <p className="text-white text-lg font-medium">{remix.cta}</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* ─── Tab: Transcript ───────────────────────────────────────── */

const hookTypeLabel: Record<TranscriptHook["type"], string> = {
  question: "Question",
  pattern_interrupt: "Pattern Interrupt",
  emotional_spike: "Emotional Spike",
};

const hookTypeBadge: Record<TranscriptHook["type"], string> = {
  question: "bg-blue-500/10 border-blue-500/30 text-blue-400",
  pattern_interrupt: "bg-orange-500/10 border-orange-500/30 text-orange-400",
  emotional_spike: "bg-red-500/10 border-red-500/30 text-red-400",
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildSRT(segments: TranscriptSegment[]): string {
  const pad = (n: number, z = 2) => String(n).padStart(z, "0");
  const ts = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.round((s % 1) * 1000);
    return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms, 3)}`;
  };
  return segments.map((seg, i) => `${i + 1}\n${ts(seg.start)} --> ${ts(seg.end)}\n${seg.text}`).join("\n\n");
}

function TranscriptTab({ transcript }: { transcript: NonNullable<AnalysisData["transcript"]> }) {
  const srt = buildSRT(transcript.segments);

  const handleDownloadSRT = () => {
    const blob = new Blob([srt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcript.srt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-bold">Audio Transcript</h3>
          <p className="text-gray-500 text-sm mt-0.5">
            Ground-truth speech extracted by local Whisper inference
            {transcript.language && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400 font-mono uppercase">
                {transcript.language}
              </span>
            )}
            {transcript.duration != null && (
              <span className="ml-2 text-xs text-gray-600">{transcript.duration.toFixed(1)}s</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <CopyButton text={transcript.fullText} />
          <button
            onClick={handleDownloadSRT}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-400 hover:text-white transition-all"
          >
            <Download className="w-3 h-3" />
            SRT
          </button>
        </div>
      </div>

      {/* Keywords */}
      {transcript.keywords && transcript.keywords.length > 0 && (
        <div className="glass-xs rounded-2xl p-4 space-y-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Top Keywords
          </span>
          <div className="flex flex-wrap gap-2 mt-2">
            {transcript.keywords.map((kw) => (
              <span
                key={kw}
                className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Hook moments */}
      {transcript.hooks && transcript.hooks.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-bold uppercase tracking-widest text-gray-400">
            Detected Hook Moments
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {transcript.hooks.slice(0, 8).map((hook, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
                className="glass-xs rounded-xl p-3 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-500">{formatTime(hook.timestamp)}</span>
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${hookTypeBadge[hook.type]}`}>
                    {hookTypeLabel[hook.type]}
                  </span>
                </div>
                <p className="text-gray-300 text-sm leading-snug">{hook.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Full transcript — full text block */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Full Text
          </span>
          <CopyButton text={transcript.fullText} />
        </div>
        <div className="p-5">
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-mono">
            {transcript.fullText || "No speech detected."}
          </p>
        </div>
      </div>

      {/* Timed segments */}
      {transcript.segments.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-bold uppercase tracking-widest text-gray-400">
            Timed Segments ({transcript.segments.length})
          </h4>
          <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
            {transcript.segments.map((seg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.4) }}
                className="flex gap-3 group"
              >
                <span className="shrink-0 font-mono text-[11px] text-gray-600 pt-0.5 w-20 text-right group-hover:text-gray-400 transition-colors">
                  {formatTime(seg.start)} →
                </span>
                <p className="text-gray-400 text-sm leading-relaxed group-hover:text-gray-200 transition-colors">
                  {seg.text}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Tab: Ideas Lab ────────────────────────────────────────── */

const EMOTION_COLORS: Record<string, string> = {
  curiosity:    "bg-blue-500/15 border-blue-500/30 text-blue-400",
  shock:        "bg-red-500/15 border-red-500/30 text-red-400",
  humor:        "bg-yellow-500/15 border-yellow-500/30 text-yellow-400",
  inspiration:  "bg-green-500/15 border-green-500/30 text-green-400",
  fear:         "bg-orange-500/15 border-orange-500/30 text-orange-400",
  nostalgia:    "bg-purple-500/15 border-purple-500/30 text-purple-400",
  rage:         "bg-rose-500/15 border-rose-500/30 text-rose-400",
  awe:          "bg-cyan-500/15 border-cyan-500/30 text-cyan-400",
};
const EMOTION_DOT: Record<string, string> = {
  curiosity: "bg-blue-400", shock: "bg-red-400", humor: "bg-yellow-400",
  inspiration: "bg-green-400", fear: "bg-orange-400", nostalgia: "bg-purple-400",
  rage: "bg-rose-400", awe: "bg-cyan-400",
};
const PHASE_COLORS = [
  "border-primary/50 bg-primary/5",
  "border-blue-500/50 bg-blue-500/5",
  "border-orange-500/50 bg-orange-500/5",
  "border-green-500/50 bg-green-500/5",
];

function buildFullScript(idea: VideoIdea): string {
  const phases = idea.phases
    .map(
      (p) =>
        `── PHASE ${p.phase}: ${p.title.toUpperCase()} (${p.duration}) ──\n` +
        `SCRIPT: ${p.script}\nVISUAL: ${p.visual}`
    )
    .join("\n\n");
  const tags = [
    `Instagram: ${idea.hashtags.instagram.join(" ")}`,
    `TikTok:    ${idea.hashtags.tiktok.join(" ")}`,
    `YouTube:   ${idea.hashtags.youtube.join(" ")}`,
  ].join("\n");
  return (
    `★ ${idea.title}\nAngle: ${idea.angle}\nHook: "${idea.hook}"\n` +
    `Emotion: ${idea.emotion} | Audience: ${idea.audience}\n\n` +
    `${phases}\n\nCTA: ${idea.cta}\n\n── HASHTAGS ──\n${tags}`
  );
}

/* ─── Phase Video Generator ────────────────────────────────── */

/**
 * Client-side Ken Burns animation using Canvas + MediaRecorder.
 * Generates a short video from a still image with cinematic pan/zoom —
 * exactly what CapCut & other short-form editors do, but automated.
 * Each phase uses a different motion style so a 4-phase clip feels varied.
 */
async function renderKenBurnsVideo(
  imageSrc: string,
  opts: { durationSec: number; width: number; height: number; phaseIndex: number }
): Promise<string> {
  const { durationSec, width, height, phaseIndex } = opts;

  // Load image (crossOrigin so canvas stays untainted for captureStream)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not load image (CORS). Try regenerating."));
    el.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported in this browser");

  // Motion presets — one per phase so a 4-phase script has 4 different feels
  const presets = [
    { startZoom: 1.0,  endZoom: 1.25, startX: 0,    startY: 0,    endX: -0.05, endY: -0.05 }, // push-in diagonal
    { startZoom: 1.2,  endZoom: 1.0,  startX: 0.05, startY: 0,    endX: 0,     endY: 0     }, // pull-out pan-left
    { startZoom: 1.1,  endZoom: 1.3,  startX: -0.03, startY: 0.03, endX: 0.03, endY: -0.03 }, // slow push + drift
    { startZoom: 1.25, endZoom: 1.05, startX: 0,    startY: -0.04, endX: 0,    endY: 0.04  }, // pull-out vertical
  ];
  const motion = presets[phaseIndex % presets.length];

  // Cover-fit the image into the canvas (no letterboxing)
  const imgAspect = img.width / img.height;
  const canvasAspect = width / height;
  let drawW: number, drawH: number;
  if (imgAspect > canvasAspect) {
    drawH = height;
    drawW = height * imgAspect;
  } else {
    drawW = width;
    drawH = width / imgAspect;
  }

  // MediaRecorder setup
  const stream = canvas.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
    ? "video/webm;codecs=vp8"
    : "video/webm";

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingDone = new Promise<string>((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size < 1000) {
        reject(new Error("Recording produced an empty clip"));
        return;
      }
      resolve(URL.createObjectURL(blob));
    };
    recorder.onerror = (e: any) => reject(new Error(`Recorder error: ${e?.error?.message ?? "unknown"}`));
  });

  recorder.start();

  // Animate — ease-in-out over durationSec
  const startTime = performance.now();
  const totalMs = durationSec * 1000;

  const draw = (now: number) => {
    const t = Math.min((now - startTime) / totalMs, 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad

    const zoom = motion.startZoom + (motion.endZoom - motion.startZoom) * eased;
    const offX = motion.startX + (motion.endX - motion.startX) * eased;
    const offY = motion.startY + (motion.endY - motion.startY) * eased;

    const scaledW = drawW * zoom;
    const scaledH = drawH * zoom;
    const dx = (width - scaledW) / 2 + offX * width;
    const dy = (height - scaledH) / 2 + offY * height;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, dx, dy, scaledW, scaledH);

    if (t < 1) {
      requestAnimationFrame(draw);
    } else {
      // Small tail so recorder flushes the last frame cleanly
      setTimeout(() => recorder.stop(), 100);
    }
  };

  requestAnimationFrame(draw);

  return recordingDone;
}

type GenStep = "idle" | "generating-image" | "image-ready" | "generating-video" | "video-ready" | "error";

function PhaseVideoGenerator({ phase, ideaTitle }: { phase: IdeaPhase; ideaTitle: string }) {
  const [step, setStep] = useState<GenStep>("idle");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use the video-ready prompt when available (it's dense + motion-aware);
  // fall back to composition + motion when the AI skipped the vp field.
  const imagePrompt = (phase.videoPrompt && phase.videoPrompt.length > 20)
    ? `${phase.videoPrompt}. Photorealistic, cinematic lighting, vertical 9:16 portrait.`
    : `${phase.visual}${phase.motion ? ` — ${phase.motion}` : ""}. Scene from "${ideaTitle}". Photorealistic, cinematic, vertical 9:16.`;

  const handleGenerateImage = async () => {
    setStep("generating-image");
    setError(null);
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: imagePrompt, aspectRatio: "portrait" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image generation failed");
      setImageUrl(data.imageUrl);
      setStep("image-ready");
    } catch (err: any) {
      setError(err.message);
      setStep("error");
    }
  };

  const handleGenerateVideo = async () => {
    if (!imageUrl) return;
    setStep("generating-video");
    setError(null);
    try {
      const blobUrl = await renderKenBurnsVideo(imageUrl, {
        durationSec: 5,
        width: 720,
        height: 1280,
        phaseIndex: phase.phase - 1,
      });
      setVideoUrl(blobUrl);
      setStep("video-ready");
    } catch (err: any) {
      setError(err.message || "Animation failed. Try a different browser.");
      setStep("error");
    }
  };

  const handleReset = () => {
    setStep("idle");
    setImageUrl(null);
    setVideoUrl(null);
    setError(null);
  };

  // Idle — show generate button
  if (step === "idle") {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); handleGenerateImage(); }}
        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-primary/20 to-purple-500/20 border border-primary/30 text-[10px] font-bold text-primary hover:from-primary/30 hover:to-purple-500/30 transition-all"
      >
        <Video className="w-3 h-3" />
        Generate Clip
      </button>
    );
  }

  // Generating image
  if (step === "generating-image") {
    return (
      <div className="mt-2 flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/15">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <div>
          <p className="text-[11px] text-primary font-semibold">Generating scene image...</p>
          <p className="text-[10px] text-gray-500">Pollinations.ai (free) · usually 5-15s</p>
        </div>
      </div>
    );
  }

  // Image ready — show preview + option to animate
  if (step === "image-ready" && imageUrl) {
    return (
      <div className="mt-2 space-y-2">
        <div className="relative rounded-xl overflow-hidden border border-primary/20">
          <img src={imageUrl} alt="Generated scene" className="w-full max-h-48 object-cover" />
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 flex items-center justify-between">
            <span className="text-[10px] text-white/70 font-medium flex items-center gap-1">
              <ImageIcon className="w-3 h-3" /> Scene Image
            </span>
            <div className="flex gap-1.5">
              <a
                href={imageUrl}
                download={`scene-p${phase.phase}.png`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="px-2 py-1 rounded-md bg-white/10 text-[9px] text-white hover:bg-white/20 transition-all flex items-center gap-1"
              >
                <Download className="w-2.5 h-2.5" /> Save
              </a>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleGenerateVideo(); }}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-primary to-purple-500 text-[11px] font-bold text-white hover:opacity-90 transition-all shadow-lg shadow-primary/20"
          >
            <Play className="w-3.5 h-3.5" />
            Animate to Video (Free)
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleReset(); }}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-[11px] text-gray-400 hover:bg-white/10 transition-all"
          >
            Reset
          </button>
        </div>
      </div>
    );
  }

  // Generating video
  if (step === "generating-video") {
    return (
      <div className="mt-2 space-y-2">
        {imageUrl && (
          <div className="rounded-xl overflow-hidden border border-primary/20 opacity-60">
            <img src={imageUrl} alt="Source" className="w-full max-h-32 object-cover" />
          </div>
        )}
        <div className="flex items-center gap-2 p-3 rounded-xl bg-purple-500/5 border border-purple-500/15">
          <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
          <div>
            <p className="text-[11px] text-purple-400 font-semibold">Animating with cinematic motion...</p>
            <p className="text-[10px] text-gray-500">Rendering 5s clip with pan/zoom — 100% free, runs in your browser</p>
          </div>
        </div>
      </div>
    );
  }

  // Video ready
  if (step === "video-ready" && videoUrl) {
    return (
      <div className="mt-2 space-y-2">
        <div className="relative rounded-xl overflow-hidden border border-green-500/30 bg-black">
          <video
            src={videoUrl}
            controls
            autoPlay
            muted
            loop
            playsInline
            className="w-full max-h-64"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <div className="flex gap-2">
          <a
            href={videoUrl}
            download={`clip-p${phase.phase}.webm`}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-500/20 border border-green-500/30 text-[11px] font-bold text-green-400 hover:bg-green-500/30 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Download Clip (.webm)
          </a>
          <button
            onClick={(e) => { e.stopPropagation(); handleReset(); }}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-[11px] text-gray-400 hover:bg-white/10 transition-all"
          >
            New
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (step === "error") {
    return (
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-[11px] text-red-400">{error}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleReset(); }}
          className="text-[11px] text-gray-400 hover:text-white transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  return null;
}

function IdeaCard({ idea, index }: { idea: VideoIdea; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const emotionKey = idea.emotion?.toLowerCase() ?? "curiosity";
  const emotionClass = EMOTION_COLORS[emotionKey] ?? EMOTION_COLORS.curiosity;
  const dotClass    = EMOTION_DOT[emotionKey]    ?? EMOTION_DOT.curiosity;
  const scoreColor  =
    idea.viralScore >= 9 ? "text-green-400" :
    idea.viralScore >= 7 ? "text-yellow-400" :
    idea.viralScore >= 5 ? "text-orange-400" : "text-red-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.035, 0.55) }}
      className="glass-xs rounded-2xl overflow-hidden border border-white/5 hover:border-white/15 transition-colors"
    >
      {/* Always-visible header */}
      <div className="p-5 cursor-pointer select-none" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
              {idea.id}
            </div>
            <div className="min-w-0">
              <h4 className="text-white font-bold text-sm leading-snug">{idea.title}</h4>
              <p className="text-gray-500 text-xs mt-0.5 leading-relaxed line-clamp-2">{idea.angle}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-gray-500" />
              <span className={`text-sm font-bold ${scoreColor}`}>{idea.viralScore}/10</span>
            </div>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border flex items-center gap-1 ${emotionClass}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
              {idea.emotion}
            </span>
          </div>
        </div>

        {/* Hook preview */}
        <div className="mt-3 p-3 rounded-xl bg-primary/5 border border-primary/15">
          <p className="text-primary text-xs font-semibold italic leading-relaxed">"{idea.hook}"</p>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px] text-gray-600 flex items-center gap-1.5">
            <Users className="w-3 h-3" />{idea.audience}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-gray-500">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? "Collapse" : "Show phases & tags"}
          </span>
        </div>
      </div>

      {/* Expandable body */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4">

              {/* Phases */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Phase-by-Phase Script</span>
                {idea.phases.map((phase, pi) => (
                  <div key={pi} className={`rounded-xl p-4 border-l-2 ${PHASE_COLORS[pi % PHASE_COLORS.length]} space-y-2`}>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white">{phase.phase}</span>
                      <span className="text-xs font-bold text-white">{phase.title}</span>
                      <span className="ml-auto text-[10px] font-mono text-gray-500">{phase.duration}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">Script</span>
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
                    {phase.videoPrompt && (
                      <div className="space-y-1 p-2 rounded-lg bg-purple-500/5 border border-purple-500/15">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-purple-400 flex items-center gap-1">
                            <Wand2 className="w-2.5 h-2.5" /> Video Prompt (paste into Kling/Motif/Runway)
                          </span>
                          <CopyButton text={phase.videoPrompt} />
                        </div>
                        <p className="text-purple-100/80 text-xs leading-relaxed font-mono">{phase.videoPrompt}</p>
                      </div>
                    )}
                    <PhaseVideoGenerator phase={phase} ideaTitle={idea.title} />
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/20">
                <span className="text-[9px] font-bold uppercase tracking-widest text-green-500 block mb-1">CTA</span>
                <p className="text-green-300 text-xs font-medium">{idea.cta}</p>
              </div>

              {/* Hashtags */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Platform Hashtags</span>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-pink-400 uppercase tracking-wider">
                      <Film className="w-3 h-3" /> Instagram Reels
                    </span>
                    <CopyButton text={idea.hashtags.instagram.join(" ")} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {idea.hashtags.instagram.map((tag) => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">{tag}</span>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
                      <Hash className="w-3 h-3" /> TikTok
                    </span>
                    <CopyButton text={idea.hashtags.tiktok.join(" ")} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {idea.hashtags.tiktok.map((tag) => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{tag}</span>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                      <Star className="w-3 h-3" /> YouTube Shorts
                    </span>
                    <CopyButton text={idea.hashtags.youtube.join(" ")} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {idea.hashtags.youtube.map((tag) => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <CopyButton text={buildFullScript(idea)} />
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface IdeasLabTabProps {
  ideas: VideoIdea[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function IdeasLabTab({ ideas, loading, error, onRefresh }: IdeasLabTabProps) {
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all"
    ? ideas
    : ideas.filter((idea) => idea.emotion?.toLowerCase() === filter);

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-5 glass rounded-2xl">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <div>
            <p className="text-white text-sm font-semibold">Generating 30 viral ideas...</p>
            <p className="text-gray-500 text-xs mt-0.5">Analysing viral DNA · Crafting scripts · Writing hashtags</p>
          </div>
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="glass-xs rounded-2xl p-5 space-y-3 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white/5" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-white/5 rounded-full w-2/3" />
                <div className="h-2.5 bg-white/5 rounded-full w-1/2" />
              </div>
              <div className="w-10 h-5 bg-white/5 rounded-full" />
            </div>
            <div className="h-10 bg-white/5 rounded-xl w-full" />
          </div>
        ))}
      </div>
    );
  }

  /* ── Error ── */
  if (error) {
    return (
      <div className="space-y-4">
        <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
        <button
          onClick={onRefresh}
          className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-300 hover:bg-white/10 transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  /* ── Results ── */
  const emotionsPresent = [
    "all",
    ...Array.from(new Set(ideas.map((i) => i.emotion?.toLowerCase()).filter(Boolean))),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {ideas.length} Viral Script Ideas
          </h3>
          <p className="text-gray-500 text-xs mt-0.5">
            Click any card to expand phases, script &amp; platform hashtags
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-400 hover:bg-white/10 hover:text-white transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Ideas
        </button>
      </div>

      {/* Emotion filter chips */}
      <div className="flex gap-2 flex-wrap">
        {emotionsPresent.map((em) => {
          const active = filter === em;
          const base = "px-3 py-1.5 rounded-xl text-xs font-semibold capitalize border transition-all ";
          const cls = active
            ? em === "all"
              ? base + "bg-primary text-black border-primary"
              : base + (EMOTION_COLORS[em] ?? "bg-white/10 text-white border-white/20")
            : base + "bg-white/5 text-gray-500 border-white/8 hover:text-gray-300";
          return (
            <button key={em} onClick={() => setFilter(em)} className={cls}>
              {em === "all" ? `All (${ideas.length})` : em}
            </button>
          );
        })}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-8">No ideas match this filter.</p>
        ) : (
          filtered.map((idea, i) => <IdeaCard key={idea.id} idea={idea} index={i} />)
        )}
      </div>
    </div>
  );
}
