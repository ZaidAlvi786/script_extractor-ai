"use client";

import { motion } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";

interface IdeaGridProps {
  ideas: string[];
  onSelect: (idea: string) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05, // Faster stagger for large lists
    },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

export default function IdeaGrid({ ideas, onSelect }: IdeaGridProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      {ideas.map((idea, index) => (
        <motion.div
          key={`${idea}-${index}`} // Ensure unique keys
          variants={itemVariants}
          whileHover={{ y: -5, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect(idea)}
          className="glass p-6 rounded-3xl cursor-pointer group hover:border-primary/50 transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mb-4 group-hover:bg-primary/30 transition-colors">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <p className="text-lg font-medium leading-relaxed group-hover:text-primary transition-colors">
              {idea}
            </p>
          </div>
          <div className="mt-8 flex items-center gap-2 text-primary text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
            Generate Script <ArrowRight className="w-4 h-4" />
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
