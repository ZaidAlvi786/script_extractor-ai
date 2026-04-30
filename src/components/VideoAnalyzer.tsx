"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, AlertCircle, Link2, RefreshCw } from "lucide-react";
import AnalysisResultPanel from "./AnalysisResultPanel";

/**
 * Lenient URL normalizer — accepts "instagram.com/reel/...", "www.youtube.com/...",
 * "youtu.be/abc", etc. Adds https:// when no scheme is present so users don't have to.
 */
function normalizeVideoUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  // Already has a scheme (http://, https://, ftp://, etc.) — leave it alone
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  // "//example.com/..." → use https
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

export default function VideoAnalyzer() {
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);

  const handleAnalyze = async (e?: React.FormEvent, forceRefresh = false) => {
    if (e) e.preventDefault();
    const normalized = normalizeVideoUrl(videoUrl);
    if (!normalized) return;
    // Reflect the normalized form in the input so the user sees what we sent
    if (normalized !== videoUrl) setVideoUrl(normalized);

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: normalized,
          skipCache: forceRefresh,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Analysis failed");
      }

      setAnalysis(data.analysis);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-12">
      {/* Input Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto"
      >
        <form onSubmit={(e) => handleAnalyze(e, false)} className="space-y-4">
          <div className="relative group" suppressHydrationWarning>
            <Link2 className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors w-5 h-5" />
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Paste any Instagram Reel, TikTok, or YouTube Shorts URL..."
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="w-full h-16 pl-12 sm:pl-14 pr-16 sm:pr-44 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-white/10 transition-all text-base sm:text-lg"
              required
            />
            <button
              type="submit"
              disabled={loading || !videoUrl.trim()}
              className="absolute right-2 top-2 bottom-2 px-3 sm:px-8 bg-primary text-black font-bold rounded-xl hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
              aria-label="Analyze Video"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span className="hidden sm:inline">Analyze Video</span>
                </>
              )}
            </button>
          </div>

          {/* Supported platforms */}
          <div className="flex items-center justify-center gap-6 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
              Instagram Reels
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              TikTok
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              YouTube Shorts
            </span>
          </div>
        </form>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-3xl mx-auto p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading State */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-4xl mx-auto space-y-8"
          >
            <div className="text-center space-y-4">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 mx-auto rounded-full border-2 border-transparent border-t-primary border-r-primary/50"
              />
              <div className="space-y-2">
                <p className="text-white font-semibold text-lg">Analyzing Video DNA...</p>
                <motion.p
                  key="analyzing"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="text-gray-500 text-sm"
                >
                  Running 5-layer deep forensic analysis
                </motion.p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="glass rounded-2xl p-6 space-y-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/5" />
                    <div className="h-4 bg-white/5 rounded-full w-1/3" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-white/5 rounded-full w-full" />
                    <div className="h-3 bg-white/5 rounded-full w-4/5" />
                    <div className="h-3 bg-white/5 rounded-full w-3/5" />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {analysis && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-5xl mx-auto space-y-4"
          >
            {/* Re-analyze button */}
            <div className="flex justify-end">
              <button
                onClick={() => handleAnalyze(undefined, true)}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-400 hover:text-white hover:bg-white/10 hover:border-primary/30 transition-all group"
              >
                <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                Re-analyze (Fresh)
              </button>
            </div>

            <AnalysisResultPanel data={analysis} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {!analysis && !loading && !error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="max-w-2xl mx-auto text-center space-y-6 pt-8"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: "📝", title: "Script Extraction", desc: "Full scene-by-scene script reconstruction" },
              { icon: "🔥", title: "Viral Analysis", desc: "What makes it go viral & view magnets" },
              { icon: "🎭", title: "Character Prompts", desc: "AI image prompts for every character" },
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + i * 0.1 }}
                className="glass-xs rounded-2xl p-5 space-y-3 text-center"
              >
                <span className="text-3xl">{feature.icon}</span>
                <h4 className="text-white font-semibold text-sm">{feature.title}</h4>
                <p className="text-gray-500 text-xs">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
          <p className="text-gray-600 text-xs">
            Paste any video URL above and let the AI Forensics Agent dissect it
          </p>
        </motion.div>
      )}
    </div>
  );
}
