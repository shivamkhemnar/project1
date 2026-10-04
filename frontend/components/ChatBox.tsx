"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { Send, Copy, ThumbsUp, ThumbsDown, Loader2, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import CitationPill from "./CitationPill";
import { apiFeedback, apiQuery, type ChatMessage } from "@/lib/api";
import { uid, formatMs } from "@/lib/utils";

export default function ChatBox({ onSources }: { onSources: (s: any[], focusIdx?: number) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: uid(), role: "assistant", content: "👋 Hi, I'm **DocuMind AI**. Upload documents, then ask me anything — I'll answer with clickable **page citations**.", sources: [] }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeCite, setActiveCite] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const streamText = (full: string, id: string) =>
    new Promise<void>((resolve) => {
      let i = 0;
      const step = Math.max(2, Math.round(full.length / 90));
      const t = setInterval(() => {
        i += step;
        const slice = full.slice(0, i);
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: slice, streaming: i < full.length } : m)));
        if (i >= full.length) { clearInterval(t); resolve(); }
      }, 18);
    });

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const um: ChatMessage = { id: uid(), role: "user", content: q };
    setMessages((p) => [...p, um]);
    const aid = uid();
    setMessages((p) => [...p, { id: aid, role: "assistant", content: "", streaming: true, sources: [] }]);
    try {
      const history = [...messages, um].slice(-8).map((m) => ({ role: m.role, content: m.content }));
      const res = await apiQuery(q, history);
      await streamText(res.answer, aid);
      setMessages((prev) => prev.map((m) => (m.id === aid ? { ...m, sources: res.sources, latency_ms: res.latency_ms, streaming: false } : m)));
      onSources(res.sources || [], 0);
    } catch (e: any) {
      const msg = e?.message || "Query failed";
      setMessages((prev) => prev.map((m) => (m.id === aid ? { ...m, content: `⚠️ ${msg}`, streaming: false } : m)));
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Sparkles size={16} className="text-violet-300" />
        <span className="text-sm font-semibold">RAG Chat</span>
        <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">hybrid BM25 + vector · memory 8 turns</span>
      </div>

      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${m.role === "user" ? "border-cyan-300/30 bg-cyan-500/20" : "border-indigo-300/30 bg-indigo-500/20"}`}>
                {m.role === "user" ? <User size={14} /> : <Sparkles size={14} className="text-indigo-200" />}
              </div>
              <div className={`max-w-[85%] rounded-2xl border px-3.5 py-2.5 ${m.role === "user" ? "border-cyan-200/20 bg-cyan-500/10" : "border-white/10 bg-white/[0.05]"}`}>
                {m.content === "" && m.streaming ? (
                  <div className="space-y-2 py-1">
                    <div className="h-3 w-48 animate-pulse rounded bg-white/10" />
                    <div className="h-3 w-36 animate-pulse rounded bg-white/10" />
                  </div>
                ) : (
                  <div className={`prose-docu text-sm ${m.streaming ? "chat-stream" : ""}`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex, rehypeHighlight]}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                )}
                {!!m.sources?.length && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/10 pt-2">
                    {m.sources.map((s, i) => (
                      <CitationPill key={i} page={s.page_number} file={s.file_name}
                        active={activeCite === `${m.id}-${i}`}
                        onClick={() => { setActiveCite(`${m.id}-${i}`); onSources(m.sources || [], i); }} />
                    ))}
                    {m.latency_ms != null && <span className="ml-auto text-[11px] text-slate-500">{formatMs(m.latency_ms)}</span>}
                  </div>
                )}
                {m.role === "assistant" && m.content && !m.streaming && (
                  <div className="mt-1.5 flex items-center gap-1 opacity-70 hover:opacity-100">
                    <button className="rounded p-1 hover:bg-white/10" title="Copy"
                      onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Copied"); }}>
                      <Copy size={13} />
                    </button>
                    <button className="rounded p-1 hover:bg-white/10" title="Good"
                      onClick={() => { apiFeedback(m.id, "up", messages.find((x) => x.role === "user")?.content || ""); toast.success("Thanks for the feedback!"); }}>
                      <ThumbsUp size={13} />
                    </button>
                    <button className="rounded p-1 hover:bg-white/10" title="Bad"
                      onClick={() => { apiFeedback(m.id, "down"); toast.message("Feedback recorded"); }}>
                      <ThumbsDown size={13} />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 focus-within:border-indigo-400/60">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Ask about your documents… (supports Markdown + LaTeX: $E=mc^2$)"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500" />
          <motion.button whileTap={{ scale: 0.92 }} onClick={send} disabled={busy || !input.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-glass disabled:opacity-40">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
