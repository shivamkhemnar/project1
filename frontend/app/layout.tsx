import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "DocuMind AI — Enterprise RAG Document Intelligence",
  description: "Chat with your documents. Hybrid retrieval, citations, analytics."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
        <Toaster theme="dark" position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
