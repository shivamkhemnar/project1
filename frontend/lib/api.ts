export type Source = {
  file_name: string;
  page_number: number;
  excerpt: string;
  score: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  latency_ms?: number;
  streaming?: boolean;
};

export type Analytics = {
  total_documents: number;
  total_chunks: number;
  total_queries: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  tokens: { prompt: number; completion: number; total: number };
  queries_per_day: { date: string; queries: number }[];
  doc_categories: { name: string; value: number }[];
  recent_queries: { ts: string; query: string; latency_ms: number }[];
  documents: any[];
};

export type Health = {
  status: string;
  app: string;
  provider: string;
  model: string;
  llm_configured: boolean;
  chroma_mode: string;
  docs_indexed: number;
  chunks: number;
  uptime_sec: number;
};

// Single API base URL for the whole app. Set via frontend/.env.local:
//   NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export const API_BASE_URL = API;

/** Thrown when the backend cannot be reached at all. */
export class BackendOfflineError extends Error {
  constructor() {
    super(
      "Backend is not connected. Start the backend server: " +
        'cd "C:\\projects\\project 1\\backend" → .\\venv\\Scripts\\Activate.ps1 → python -m uvicorn main:app --reload --port 8000'
    );
    this.name = "BackendOfflineError";
  }
}

async function readError(r: Response, fallback: string): Promise<string> {
  try {
    const body = await r.json();
    if (typeof body?.detail === "string" && body.detail) return body.detail;
  } catch { /* not JSON */ }
  return `${fallback} (HTTP ${r.status})`;
}

export async function apiHealth(): Promise<Health> {
  let r: Response;
  try {
    r = await fetch(`${API}/health`, { cache: "no-store" });
  } catch {
    throw new BackendOfflineError();
  }
  if (!r.ok) throw new Error(await readError(r, "Backend health check failed"));
  return (await r.json()) as Health;
}

export async function apiUpload(files: File[], onProgress: (pct: number) => void): Promise<any> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  // Animated progress for UX smoothness (the real upload runs below).
  let pct = 0;
  const tick = setInterval(() => {
    pct = Math.min(90, pct + Math.random() * 18);
    onProgress(Math.round(pct));
  }, 220);
  try {
    let r: Response;
    try {
      r = await fetch(`${API}/upload`, { method: "POST", body: fd });
    } catch {
      throw new BackendOfflineError();
    }
    clearInterval(tick);
    onProgress(100);
    if (!r.ok) throw new Error(await readError(r, "Upload failed"));
    return await r.json();
  } catch (e) {
    clearInterval(tick);
    throw e;
  }
}

export async function apiQuery(query: string, history: { role: string; content: string }[]): Promise<any> {
  let r: Response;
  try {
    r = await fetch(`${API}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, history, top_k: 5 })
    });
  } catch {
    throw new BackendOfflineError();
  }
  if (!r.ok) throw new Error(await readError(r, "Query failed"));
  return await r.json();
}

export async function apiAnalytics(): Promise<Analytics> {
  let r: Response;
  try {
    r = await fetch(`${API}/analytics`, { cache: "no-store" });
  } catch {
    throw new BackendOfflineError();
  }
  if (!r.ok) throw new Error(await readError(r, "Analytics request failed"));
  return (await r.json()) as Analytics;
}

export async function apiFeedback(message_id: string, rating: "up" | "down", query = "") {
  try {
    await fetch(`${API}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id, rating, query })
    });
  } catch { /* feedback is best-effort; never break the UI */ }
}
