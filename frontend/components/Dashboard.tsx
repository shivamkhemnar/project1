"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid
} from "recharts";
import { FileStack, Zap, Coins, MessagesSquare } from "lucide-react";
import { apiAnalytics, type Analytics } from "@/lib/api";
import { formatMs } from "@/lib/utils";

const COLORS = ["#6366f1", "#8b5cf6", "#22d3ee", "#34d399", "#f472b6"];

export default function Dashboard({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    setData(null);
    apiAnalytics()
      .then(setData)
      .catch((e: any) => setError(e?.message || "Analytics unavailable."));
  }, [refreshKey]);

  if (error) {
    return (
      <div className="glass border-rose-300/30 p-6 text-sm text-rose-200">
        ⚠️ {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  const cards = [
    { icon: FileStack, label: "Documents indexed", value: String(data.total_documents), sub: `${data.total_chunks} chunks` },
    { icon: Zap, label: "Avg latency", value: formatMs(data.avg_latency_ms), sub: `p95 ${formatMs(data.p95_latency_ms)}` },
    { icon: Coins, label: "Tokens used", value: data.tokens.total.toLocaleString(), sub: `${data.tokens.prompt} in / ${data.tokens.completion} out` },
    { icon: MessagesSquare, label: "Total queries", value: String(data.total_queries), sub: "all time" }
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="glass p-4">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <c.icon size={14} className="text-indigo-300" /> {c.label}
            </div>
            <p className="mt-1 text-2xl font-bold">{c.value}</p>
            <p className="text-[11px] text-slate-500">{c.sub}</p>
          </motion.div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-5">
        <div className="glass p-4 lg:col-span-3">
          <p className="mb-2 text-sm font-semibold">Daily query frequency</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.queries_per_day}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.08)" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} interval={2} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#0f0f1e", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12 }} />
                <Bar dataKey="queries" fill="url(#g)" radius={[6, 6, 0, 0]} />
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" /><stop offset="100%" stopColor="#22d3ee" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="glass p-4 lg:col-span-2">
          <p className="mb-2 text-sm font-semibold">Document distribution</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.doc_categories} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={3}>
                  {data.doc_categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#0f0f1e", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {data.doc_categories.map((c, i) => (
              <span key={c.name} className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                {c.name} ({c.value})
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
