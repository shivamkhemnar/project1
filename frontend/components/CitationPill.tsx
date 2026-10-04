"use client";
import { BookOpen } from "lucide-react";
import { motion } from "framer-motion";

export default function CitationPill({
  page, file, active, onClick
}: { page: number; file?: string; active?: boolean; onClick?: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      title={file}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
        active
          ? "border-indigo-300/60 bg-indigo-500/30 text-white shadow-glass"
          : "border-white/15 bg-white/[0.06] text-indigo-200 hover:bg-indigo-500/20"
      }`}
    >
      <BookOpen size={11} />
      [Page {page}]
    </motion.button>
  );
}
