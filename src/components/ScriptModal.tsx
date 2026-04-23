"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, Download, Share2 } from "lucide-react";
import { useState } from "react";

interface ScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  script: {
    hook: string;
    body: string;
    cta: string;
    visuals: string;
  } | null;
}

export default function ScriptModal({ isOpen, onClose, script }: ScriptModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!script) return;
    const fullText = `HOOK: ${script.hook}\n\nBODY: ${script.body}\n\nCTA: ${script.cta}\n\nVISUALS: ${script.visuals}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="glass relative w-full max-w-2xl max-h-[85vh] rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl shadow-primary/10"
          >
            {/* Header */}
            <div className="p-8 border-b border-white/10 flex items-center justify-between shrink-0">
              <h2 className="text-2xl font-bold text-primary">Viral Script</h2>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full glass flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar">
              {script && (
                <>
                  <Section title="The Hook" content={script.hook} icon="🪝" />
                  <Section title="The Body" content={script.body} icon="📝" />
                  <Section title="Call to Action" content={script.cta} icon="🚀" />
                  <Section title="Visual Guidelines" content={script.visuals} icon="🎬" />
                </>
              )}
            </div>

            {/* Footer / Actions */}
            <div className="p-8 border-t border-white/10 bg-white/5 flex flex-wrap gap-4 shrink-0">
              <button
                onClick={handleCopy}
                className="flex-1 min-w-[140px] px-6 py-3 bg-primary text-black font-bold rounded-2xl flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-primary/20"
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                {copied ? "Copied!" : "Copy Full Script"}
              </button>
              <div className="flex gap-4">
                <button className="w-12 h-12 glass rounded-2xl flex items-center justify-center hover:bg-white/10 transition-colors">
                  <Download className="w-5 h-5" />
                </button>
                <button className="w-12 h-12 glass rounded-2xl flex items-center justify-center hover:bg-white/10 transition-colors">
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Section({ title, content, icon }: { title: string; content: string; icon: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400">{title}</h3>
      </div>
      <div className="glass-xs p-5 rounded-2xl">
        <p className="text-gray-100 leading-relaxed text-lg">{content}</p>
      </div>
    </div>
  );
}
