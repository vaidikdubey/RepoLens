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

export default function Home() {
    const [repoUrl, setRepoUrl] = useState<string>("");
    const [activeRepo, setActiveRepo] = useState<string>("");
    const [ingesting, setIngesting] = useState<boolean>(false);
    const [ingestStatus, setIngestStatus] = useState<string | null>(null);
    const [ingestProgress, setIngestProgress] = useState<number>(0);

    const [question, setQuestion] = useState<string>("");
    const [messages, setMessages] = useState<Message[]>([]);
    const [asking, setAsking] = useState<boolean>(false);

    const handleIngest = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!repoUrl.trim()) return;

        setIngesting(true);
        setIngestStatus("Connecting...");
        setIngestProgress(5);

        try {
            const res = await fetch("/api/ingest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repoUrl }),
            });

            if (!res.ok || !res.body) {
                throw new Error("Failed to initialize ingestion stream.");
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n\n");
                buffer = lines.pop() || ""; // Keep incomplete chunk in buffer

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const payload = JSON.parse(line.replace("data: ", ""));

                        if (payload.type === "progress") {
                            setIngestStatus(payload.message);
                            setIngestProgress(payload.progress);
                        } else if (payload.type === "complete") {
                            setActiveRepo(payload.repoSlug);
                            setIngestStatus(
                                `Successfully ingested ${payload.result?.processedFiles ?? 0} files (${payload.result?.totalChunks ?? 0} vectors)!`
                            );
                            setIngestProgress(100);
                        } else if (payload.type === "error") {
                            setIngestStatus(`Error: ${payload.error}`);
                            setIngestProgress(0);
                        }
                    }
                }
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
            setIngestStatus(`Failed: ${errorMessage}`);
            setIngestProgress(0);
        } finally {
            setIngesting(false);
        }
    };

    const handleAsk = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!question.trim() || !activeRepo) return;

        const userMsg = question;
        setQuestion("");

        setMessages((prev) => [
            ...prev,
            { role: "user", content: userMsg },
            { role: "assistant", content: "", sources: [] },
        ]);
        setAsking(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repo: activeRepo, question: userMsg }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Query failed");
            }

            const rawSources = res.headers.get("x-rag-sources");
            const sources: ContextSource[] = rawSources
                ? JSON.parse(decodeURIComponent(rawSources))
                : [];

            setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;

                if (lastIdx >= 0 && updated[lastIdx].role === "assistant")
                    updated[lastIdx].sources = sources;

                return updated;
            });

            if (!res.body) throw new Error("No readable stream received.");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const textChunk = decoder.decode(value, { stream: true });
                accumulatedContent += textChunk;

                setMessages((prev) => {
                    const updated = [...prev];
                    const lastIdx = updated.length - 1;

                    if (lastIdx >= 0 && updated[lastIdx].role === "assistant")
                        updated[lastIdx] = {
                            ...updated[lastIdx],
                            content: accumulatedContent,
                        };

                    return updated;
                });
            }
        } catch (err: unknown) {
            const errorMessage =
                err instanceof Error ? err.message : "Unknown error occurred. Please try again later.";
            setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;

                if (lastIdx >= 0 && updated[lastIdx].role === "assistant")
                    updated[lastIdx].content = `Error: ${errorMessage}`;

                return updated;
            });
        } finally {
            setAsking(false);
        }
    };

    console.log(ingestStatus);

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

                <form onSubmit={handleIngest} className="flex flex-col gap-3">
                    <div>
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
                        className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm py-2 px-4 rounded-md transition flex items-center justify-center gap-2 disabled:bg-zinc-800 disabled:text-zinc-500 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
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

                {/* Interactive Progress Bar directly below button */}
                {(ingesting || ingestStatus) && (
                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-300 space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="truncate pr-2 font-medium text-zinc-300">
                                {ingestStatus || "Initializing..."}
                            </span>
                            {ingesting && (
                                <span className="text-amber-400 font-mono font-semibold">
                                    {ingestProgress}%
                                </span>
                            )}
                        </div>

                        {ingesting && (
                            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                                <div
                                    className="bg-amber-500 h-1.5 transition-all duration-300 ease-out"
                                    style={{ width: `${ingestProgress}%` }}
                                />
                            </div>
                        )}
                    </div>
                )}

                {activeRepo && (
                    <div className="lg:mt-auto p-3 sm:p-4 bg-amber-950/20 border border-amber-500/30 rounded-lg flex items-center lg:block justify-between">
                        <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                            <CheckCircle2 className="w-4 h-4 text-amber-400" /> Active Context
                        </div>
                        <p className="text-xs sm:text-sm font-mono lg:mt-1 text-zinc-200 truncate">
                            {activeRepo}
                        </p>
                    </div>
                )}
            </div>

            {/* Bottom Section / Right Panel */}
            <div className="flex-1 flex flex-col h-full bg-zinc-950 min-h-0">
                <div className="p-3 sm:p-4 border-b border-zinc-800 flex items-center gap-2 bg-zinc-900/30">
                    <Bot className="w-5 h-5 text-amber-400" />
                    <span className="font-semibold text-xs sm:text-sm text-zinc-200">
                        Codebase QA Terminal
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs sm:text-sm text-center px-4">
                            <p>Ingest a public GitHub repository to start asking questions.</p>
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

                                    {msg.sources && msg.sources.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-zinc-800">
                                            <p className="text-[10px] uppercase font-bold tracking-wider text-amber-400 mb-1">
                                                Retrieved Context Files:
                                            </p>
                                            <ul className="space-y-1">
                                                {msg.sources.map((s, idx) => (
                                                    <li
                                                        key={idx}
                                                        className="text-[11px] sm:text-xs font-mono text-zinc-400"
                                                    >
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
                            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                            Searching vectors & generating answer...
                        </div>
                    )}
                </div>

                <form
                    onSubmit={handleAsk}
                    className="p-3 sm:p-4 border-t border-zinc-800 flex gap-2 bg-zinc-900/30"
                >
                    <input
                        type="text"
                        disabled={!activeRepo || asking}
                        placeholder={
                            activeRepo
                                ? "Ask a question about this repository..."
                                : "Ingest a repo first..."
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