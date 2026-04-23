"use client";

import { motion } from "framer-motion";
import { Sparkles, Scan } from "lucide-react";
import VideoAnalyzer from "@/components/VideoAnalyzer";

export default function AnalyzePage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12 md:py-24 space-y-12" suppressHydrationWarning>
      {/* Hero */}
      <section className="text-center space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium"
        >
          <Scan className="w-4 h-4" />
          <span>AI Forensics Agent</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl md:text-6xl font-extrabold max-w-4xl mx-auto leading-[1.1]"
        >
          Reverse-Engineer Any{" "}
          <span className="text-primary italic">Viral</span> Video
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-gray-400 text-lg max-w-2xl mx-auto"
        >
          Paste a video URL and our AI agent will extract the full script,
          identify what makes it go viral, generate character prompts, and give
          you a step-by-step replication blueprint.
        </motion.p>
      </section>

      {/* Analyzer */}
      <VideoAnalyzer />
    </div>
  );
}
