"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BrainCircuit, LayoutDashboard, MessageSquareText, Activity, Github } from "lucide-react";
import ChatBox from "@/components/ChatBox";
import DocumentViewer, { type ViewerSource } from "@/components/DocumentViewer";
import Dropzone from "@/components/Dropzone";
import Dashboard from "@/components/Dashboard";
import { apiHealth, type Health } from "@/lib/api";
import { cn } from "@/lib/utils";

type Tab = "chat" | "dashboard";

export default function Page() {
  const [tab, setTab] = useState<Tab>("chat");
  const [sources, setSources] = useState<ViewerSource[]>([]);
  const [focus, setFocus] = useState(0);
  const [health, setHealth] = useState<Health | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setBackendError(null);
    apiHealth()
      .then((h) => setHealth(h))
      .catch((e: any) => {
        setHealth(null);
        setBackendError(e?.message || "Backend is not connected.");
      });
  }, [refreshKey]);

  const online = health?.status === "ok";

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] gap-4 p-4">
      {/* Sidebar */}
      <aside className="glass hidden w-60 shrink-0 flex-col p-4 md:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-600 to-cyan-400 shadow-glass">
            <BrainCircuit size={18} />
          </div>
          <div>
            <p className="font-bold leading-none">DocuMind <span className="neon-text">AI</span></p>
            <p className="mt-1 text-[11px] text-slate-400">Enterprise RAG Engine</p>
          </div>
        </div>
        <nav className="mt-6 space-y-1.5">
          <NavBtn active={tab === "chat"} onClick={() => setTab("chat")} icon={<MessageSquareText size={15} />} label="RAG Chat" />
          <NavBtn active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={<LayoutDashboard size={15} />} label="Analytics" />
        </nav>
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-slate-400">
          <p className="mb-1 flex items-center gap-1 font-semibold text-slate-300"><Activity size={12} /> Backend status</p>
          <p>● {online ? <span className="text-emerald-300">online · {health?.provider} · {health?.model}</span> : <span className="text-rose-300">offline — start the backend server</span>}</p>
          <p className="mt-1">chunks: {health?.chunks ?? "—"} · docs: {health?.docs_indexed ?? "—"}{health ? ` · ${health.chroma_mode}` : ""}</p>
        </div>
        <div className="mt-auto pt-4 text-[11px] text-slate-500">
          <p className="flex items-center gap-1"><Github size={12} /> DocuMind v1.0</p>
          <p className="mt-0.5">chunk 1000 · overlap 200 · top-k 5</p>
        </div>
      </aside>

      {/* Main */}
      <main className="min-w-0 flex-1">
        <header className="glass mb-4 flex items-center gap-3 px-5 py-3.5">
          <div>
            <h1 className="text-lg font-bold">
              {tab === "chat" ? <>Chat with your <span className="neon-text">documents</span></> : <>Usage & <span className="neon-text">analytics</span></>}
            </h1>
            <p className="text-xs text-slate-400">Hybrid BM25 + vector retrieval · cited answers · streaming UI</p>
          </div>
          {/* mobile tabs */}
          <div className="ml-auto flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1 md:hidden">
            <button onClick={() => setTab("chat")} className={cn("rounded-lg px-3 py-1 text-xs", tab === "chat" && "bg-indigo-500/40")}>Chat</button>
            <button onClick={() => setTab("dashboard")} className={cn("rounded-lg px-3 py-1 text-xs", tab === "dashboard" && "bg-indigo-500/40")}>Stats</button>
          </div>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            {online ? (
              <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200">{health?.provider} · {health?.model} · live</span>
            ) : (
              <span className="rounded-full border border-rose-300/20 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-200">backend offline</span>
            )}
          </div>
        </header>

        {backendError && (
          <div className="glass mb-4 border-rose-300/30 px-5 py-3 text-sm text-rose-200">
            ⚠️ {backendError}
          </div>
        )}

        {tab === "dashboard" ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Dashboard refreshKey={refreshKey} />
          </motion.div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="flex min-h-[540px] flex-col gap-4">
              <div className="glass p-4">
                <Dropzone onIndexed={() => setRefreshKey((k) => k + 1)} />
              </div>
              <div className="min-h-[480px] flex-1">
                <ChatBox onSources={(s, f) => { setSources(s); setFocus(f ?? 0); document.getElementById(`src-${f ?? 0}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />
              </div>
            </div>
            <div className="min-h-[540px]">
              <DocumentViewer sources={sources} focus={focus} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function NavBtn({ active, onClick, icon, label }: any) {
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={onClick}
      className={cn("flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors",
        active ? "border-indigo-300/40 bg-indigo-500/20 text-white shadow-glass" : "border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200")}>
      {icon} {label}
    </motion.button>
  );
}
