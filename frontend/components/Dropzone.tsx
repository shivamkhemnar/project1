"use client";
import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloudUpload, FileText, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { apiUpload } from "@/lib/api";

type Item = { name: string; size: number; pct: number; status: "uploading" | "parsing" | "done" | "error"; detail?: string };

export default function Dropzone({ onIndexed }: { onIndexed?: () => void }) {
  const [drag, setDrag] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: File[]) => {
    const valid = files.filter((f) => /\.(pdf|docx|txt)$/i.test(f.name));
    if (valid.length !== files.length) toast.error("Only PDF, DOCX, TXT are supported");
    if (!valid.length) return;
    setItems(valid.map((f) => ({ name: f.name, size: f.size, pct: 0, status: "uploading" })));
    try {
      const res = await apiUpload(valid, (pct) => {
        setItems((prev) => prev.map((it) => ({ ...it, pct, status: pct >= 100 ? "parsing" : "uploading" })));
      });
      // parsing micro-animation
      await new Promise((r) => setTimeout(r, 700));
      setItems((prev) =>
        prev.map((it, i) => {
          const r = res.results?.[i];
          const ok = r && r.status === "indexed";
          if (!ok && res.results?.length) {
            toast.error(`"${it.name}": ${r?.error || r?.status || "indexing failed"}`);
          }
          return { ...it, pct: 100, status: ok ? "done" : "error", detail: ok ? `${r.chunks ?? 0} chunks · ${r.pages ?? 0} pages` : (r?.error || r?.status || "failed") };
        })
      );
      const failed = (res.results || []).filter((r: any) => r.status !== "indexed").length;
      if (!failed) toast.success(`${valid.length} file(s) indexed`);
      onIndexed?.();
    } catch (e: any) {
      const msg = e?.message || "Upload failed";
      setItems((prev) => prev.map((it) => ({ ...it, status: "error", detail: msg })));
      toast.error(msg);
    }
  }, [onIndexed]);

  return (
    <div>
      <motion.div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(Array.from(e.dataTransfer.files)); }}
        onClick={() => inputRef.current?.click()}
        animate={{ borderColor: drag ? "rgba(129,140,248,.9)" : "rgba(255,255,255,.12)", scale: drag ? 1.01 : 1 }}
        className="cursor-pointer rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center backdrop-blur-xl transition-colors hover:bg-white/[0.05]"
      >
        <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.txt" className="hidden"
          onChange={(e) => handleFiles(Array.from(e.target.files || []))} />
        <CloudUpload className="mx-auto mb-2 text-indigo-300" size={30} />
        <p className="text-sm font-medium">Drag & drop <span className="neon-text font-semibold">PDF / DOCX / TXT</span> here</p>
        <p className="mt-1 text-xs text-slate-400">or click to browse · batch upload supported · chunk 1000 / overlap 200</p>
      </motion.div>

      <div className="mt-3 space-y-2">
        <AnimatePresence>
          {items.map((it) => (
            <motion.div key={it.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="glass px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm">
                <FileText size={15} className="shrink-0 text-indigo-300" />
                <span className="truncate font-medium">{it.name}</span>
                <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
                  {it.status === "uploading" && <><Loader2 size={13} className="animate-spin" /> {it.pct}%</>}
                  {it.status === "parsing" && <><Loader2 size={13} className="animate-spin text-violet-300" /> <span className="animate-pulse">Parsing & chunking…</span></>}
                  {it.status === "done" && <><CheckCircle2 size={13} className="text-emerald-400" /> <span className="text-emerald-300">{it.detail}</span></>}
                  {it.status === "error" && <><XCircle size={13} className="text-rose-400" /> <span className="text-rose-300">{it.detail}</span></>}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400"
                  animate={{ width: `${it.pct}%` }} transition={{ ease: "easeOut" }} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
