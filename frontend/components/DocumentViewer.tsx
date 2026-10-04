"use client";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Quote } from "lucide-react";

export type ViewerSource = { file_name: string; page_number: number; excerpt: string; score: number };

export default function DocumentViewer({ sources, focus }: { sources: ViewerSource[]; focus: number }) {
  return (
    <div className="glass flex h-full flex-col overflow-hidden">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-sm font-semibold">Document Previewer</p>
        <p className="text-[11px] text-slate-400">{sources.length ? `${sources.length} cited sources · click a pill to jump` : "Citations will appear here after you ask a question"}</p>
      </div>
      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-4">
        <AnimatePresence>
          {sources.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center text-sm text-slate-400">
              <FileText className="mx-auto mb-2 text-slate-500" />
              No sources yet. Try: “Summarize the key risks” or “What is the termination clause?”
            </motion.div>
          )}
          {sources.map((s, i) => {
            const isFocus = i === focus;
            return (
              <motion.div key={i} id={`src-${i}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border p-3.5 text-sm transition-all ${isFocus ? "border-indigo-300/60 bg-indigo-500/15 shadow-glass" : "border-white/10 bg-white/[0.03]"}`}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isFocus ? "bg-indigo-500/40 text-white" : "bg-white/10 text-slate-300"}`}>
                    Source {i + 1} · Page {s.page_number}
                  </span>
                  <span className="truncate text-[11px] text-slate-400">{s.file_name}</span>
                  <span className="ml-auto text-[11px] text-slate-500">score {s.score?.toFixed(2)}</span>
                </div>
                <div className="flex gap-1.5 text-slate-300">
                  <Quote size={13} className="mt-0.5 shrink-0 text-indigo-300" />
                  <p className="leading-relaxed">
                    {highlightExcerpt(s.excerpt)}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function highlightExcerpt(text: string) {
  // naive highlight: wrap numbers / key terms
  const parts = text.split(/(\d+\.?\d*%|\$[\d,]+|\b\d+\b)/g);
  return parts.map((p, i) =>
    /^\d/.test(p) || p.includes("%") || p.includes("$") ? <mark key={i} className="hl">{p}</mark> : <span key={i}>{p}</span>
  );
}
