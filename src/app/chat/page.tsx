"use client";

import { useState } from "react";
import { Send, Bot, Code, Loader2, CheckCircle2 } from "lucide-react";

interface ContextSource {
  filePath: string;
  text: string;
  score: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: ContextSource[];
}

interface IngestApiResponse {
  success?: boolean;
  processedFiles?: number;
  totalChunks?: number;
  error?: string;
}

interface ChatApiResponse {
  answer?: string;
  sources?: ContextSource[];
  error?: string;
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState<string>("");
  const [activeRepo, setActiveRepo] = useState<string>("");
  const [ingesting, setIngesting] = useState<boolean>(false);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);

  const [question, setQuestion] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [asking, setAsking] = useState<boolean>(false);

  const handleIngest = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setIngesting(true);
    setIngestStatus(null);

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });

      const data: IngestApiResponse = await res.json();

      if (res.ok) {
        const cleanUrl = repoUrl.replace(/[\[\]\(\)]/g, "").trim();
        const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (match) {
          const repoSlug = `${match[1]}/${match[2].replace(/\.git$/, "")}`;
          setActiveRepo(repoSlug);
        }
        setIngestStatus(
          `Successfully ingested ${data.processedFiles ?? 0} files (${data.totalChunks ?? 0} vectors)!`
        );
      } else {
        setIngestStatus(`Error: ${data.error ?? "Ingestion failed"}`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
      setIngestStatus(`Failed: ${errorMessage}`);
    } finally {
      setIngesting(false);
    }
  };

  const handleAsk = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!question.trim() || !activeRepo) return;

    const userMsg = question;
    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setAsking(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: activeRepo, question: userMsg }),
      });

      const data: ChatApiResponse = await res.json();

      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.answer ?? "", sources: data.sources },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${data.error ?? "Query failed"}` },
        ]);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${errorMessage}` },
      ]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      {/* Top Section (Small Screens) / Left Sidebar (Large Screens) */}
      <div className="w-full lg:w-80 xl:w-96 border-b lg:border-b-0 lg:border-r border-zinc-800 p-4 sm:p-6 flex flex-col gap-4 sm:gap-6 bg-zinc-900/50 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-amber-400">
            <Code className="w-6 h-6 sm:w-7 sm:h-7 text-amber-400" /> RepoLens
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            RAG-powered codebase exploration using Gemini & Pinecone
          </p>
        </div>

        <form onSubmit={handleIngest} className="flex flex-col sm:flex-row lg:flex-col gap-3">
          <div className="flex-1">
            <label className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1 block">
              Target Repository
            </label>
            <input
              type="url"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-amber-500"
            />
          </div>
          <button
            type="submit"
            disabled={ingesting || !repoUrl}
            className="sm:self-end lg:self-auto bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm py-2 px-4 rounded-md transition flex items-center justify-center gap-2 disabled:bg-zinc-800 disabled:text-zinc-500 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
          >
            {ingesting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-zinc-950" /> Ingesting...
              </>
            ) : (
              "Ingest & Analyze"
            )}
          </button>
        </form>

        {ingestStatus && (
          <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-300">
            {ingestStatus}
          </div>
        )}

        {activeRepo && (
          <div className="lg:mt-auto p-3 sm:p-4 bg-amber-950/20 border border-amber-500/30 rounded-lg flex items-center lg:block justify-between">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-amber-400" /> Active Context
            </div>
            <p className="text-xs sm:text-sm font-mono lg:mt-1 text-zinc-200 truncate">{activeRepo}</p>
          </div>
        )}
      </div>

      {/* Bottom Section (Small Screens) / Right Panel (Large Screens) */}
      <div className="flex-1 flex flex-col h-full bg-zinc-950 min-h-0">
        <div className="p-3 sm:p-4 border-b border-zinc-800 flex items-center gap-2 bg-zinc-900/30">
          <Bot className="w-5 h-5 text-amber-400" />
          <span className="font-semibold text-xs sm:text-sm text-zinc-200">Codebase QA Terminal</span>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs sm:text-sm text-center px-4">
              <p>Ingest a public GitHub repository above to start asking questions.</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-full sm:max-w-2xl px-4 py-3 rounded-lg text-xs sm:text-sm ${
                    msg.role === "user"
                      ? "bg-amber-500 text-zinc-950 font-medium"
                      : "bg-zinc-900 border border-zinc-800 text-zinc-200"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Retrieved RAG Context Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-zinc-800">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-amber-400 mb-1">
                        Retrieved Context Files:
                      </p>
                      <ul className="space-y-1">
                        {msg.sources.map((s: ContextSource, idx: number) => (
                          <li key={idx} className="text-[11px] sm:text-xs font-mono text-zinc-400">
                            • {s.filePath}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {asking && (
            <div className="flex items-center gap-2 text-zinc-400 text-xs sm:text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> Searching vectors & generating answer...
            </div>
          )}
        </div>

        {/* Chat Input Bar */}
        <form onSubmit={handleAsk} className="p-3 sm:p-4 border-t border-zinc-800 flex gap-2 bg-zinc-900/30">
          <input
            type="text"
            disabled={!activeRepo || asking}
            placeholder={
              activeRepo ? "Ask a question about this repository..." : "Ingest a repo first..."
            }
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="flex-1 px-3 sm:px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-md text-xs sm:text-sm text-zinc-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!activeRepo || asking || !question.trim()}
            className="bg-amber-500 hover:bg-amber-400 text-zinc-950 disabled:bg-zinc-800 disabled:text-zinc-600 px-3 sm:px-4 py-2 rounded-md transition flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}