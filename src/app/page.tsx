"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Search, Loader2 } from "lucide-react";
import IdeaGrid from "@/components/IdeaGrid";
import ScriptModal from "@/components/ScriptModal";

export default function Home() {
  const [niche, setNiche] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [customIdea, setCustomIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [selectedIdea, setSelectedIdea] = useState<string | null>(null);
  const [script, setScript] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!niche) return;

    setLoading(true);
    setIdeas([]); // Reset ideas for a new search
    try {
      const response = await fetch("/api/ideas", {
        method: "POST",
        body: JSON.stringify({ niche, videoUrl, customIdea }),
      });
      const data = await response.json();
      setIdeas(data.ideas || []);
    } catch (error) {
      console.error("Error fetching ideas:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleShowMore = async () => {
    if (!niche || loadingMore) return;

    setLoadingMore(true);
    try {
      const response = await fetch("/api/ideas", {
        method: "POST",
        body: JSON.stringify({ 
          niche, 
          videoUrl, 
          customIdea,
          existingCount: ideas.length 
        }),
      });
      const data = await response.json();
      setIdeas((prev) => [...prev, ...(data.ideas || [])]);
    } catch (error) {
      console.error("Error fetching more ideas:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSelectIdea = async (idea: string) => {
    setSelectedIdea(idea);
    setIsModalOpen(true);
    setScript(null); // Reset script while loading

    try {
      const response = await fetch("/api/script", {
        method: "POST",
        body: JSON.stringify({ idea }),
      });
      const data = await response.json();
      setScript(data.script);
    } catch (error) {
      console.error("Error fetching script:", error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 md:py-24 space-y-12 md:space-y-20" suppressHydrationWarning>
      {/* Hero Section */}
      <section className="text-center space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium"
          suppressHydrationWarning
        >
          <Sparkles className="w-4 h-4" />
          <span>AI-Powered Content Engine</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-3xl sm:text-5xl md:text-7xl font-extrabold max-w-4xl mx-auto leading-[1.1]"
        >
          Generate <span className="text-primary italic">Viral</span> Instagram Content in Seconds
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-gray-400 text-base sm:text-lg md:text-xl max-w-2xl mx-auto px-4"
        >
          Stop staring at a blank screen. Enter your niche and let our AI generate high-performing hooks, scripts, and visual guides.
        </motion.p>

        {/* Input Area */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="max-w-3xl mx-auto mt-12 space-y-6"
          suppressHydrationWarning
        >
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="relative group" suppressHydrationWarning>
              <Search className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors w-5 h-5" />
              <input
                type="text"
                placeholder="Enter your niche (e.g. Cat Story, AI SaaS, Fitness)..."
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="w-full h-16 pl-12 sm:pl-14 pr-16 sm:pr-40 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-white/10 transition-all text-base sm:text-lg"
              />
              <button
                type="submit"
                disabled={loading || !niche}
                className="absolute right-2 top-2 bottom-2 px-3 sm:px-8 bg-primary text-black font-bold rounded-xl hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                aria-label="Generate Ideas"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 sm:hidden" />
                    <span className="hidden sm:inline">Generate Ideas</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-col gap-4" suppressHydrationWarning>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-gray-400 hover:text-primary transition-colors flex items-center justify-center gap-2 w-fit mx-auto"
              >
                {showAdvanced ? "Hide Advanced Options" : "Show Advanced Options (Link & Style)"}
              </button>

              {showAdvanced && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2"
                  suppressHydrationWarning
                >
                  <div className="space-y-2 text-left" suppressHydrationWarning>
                    <label className="text-xs font-bold text-gray-500 uppercase px-2">Reference Video Link</label>
                    <input
                      type="text"
                      placeholder="Paste Instagram/YouTube link..."
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm"
                    />
                  </div>
                  <div className="space-y-2 text-left" suppressHydrationWarning>
                    <label className="text-xs font-bold text-gray-500 uppercase px-2">Specific Style / Idea</label>
                    <input
                      type="text"
                      placeholder="e.g. Funny revenge, High-fashion, ASMR..."
                      value={customIdea}
                      onChange={(e) => setCustomIdea(e.target.value)}
                      className="w-full h-12 px-4 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-sm"
                    />
                  </div>
                </motion.div>
              )}
            </div>
          </form>
        </motion.div>
      </section>

      {/* Ideas Section */}
      {(ideas.length > 0 || loading) && (
        <section className="space-y-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl sm:text-3xl font-bold break-words min-w-0">
              Trending Ideas for <span className="text-primary italic">"{niche}"</span>
            </h2>
            <div className="h-px flex-1 mx-8 bg-gradient-to-r from-white/20 to-transparent hidden md:block" />
          </div>
          
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="glass h-48 rounded-3xl animate-pulse flex flex-col p-6 gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/5" />
                  <div className="h-4 bg-white/5 rounded-full w-3/4" />
                  <div className="h-4 bg-white/5 rounded-full w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-12">
              <IdeaGrid ideas={ideas} onSelect={handleSelectIdea} />
              
              <div className="flex justify-center">
                <button
                  onClick={handleShowMore}
                  disabled={loadingMore}
                  className="px-12 py-4 bg-white/5 border border-white/10 rounded-2xl font-bold hover:bg-white/10 hover:border-primary/50 transition-all flex items-center gap-3 group disabled:opacity-50"
                  id="show-more-button"
                >
                  {loadingMore ? (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  ) : (
                    <>
                      <span className="group-hover:text-primary transition-colors text-lg">Show More Viral Ideas</span>
                      <Sparkles className="w-5 h-5 text-primary group-hover:scale-125 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </section>
      )}


      {/* Script Modal */}
      <ScriptModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        script={script}
      />
    </div>
  );
}
