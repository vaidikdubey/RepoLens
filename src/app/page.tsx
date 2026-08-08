"use client";

import Link from "next/link";
import {
    Code2,
    Sparkles,
    Zap,
    Terminal,
    ShieldCheck,
    ArrowRight,
    Layers,
} from "lucide-react";
import { FaGithub } from "react-icons/fa";

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-amber-500 selection:text-zinc-950 flex flex-col justify-between">
            {/* Background Subtle Gradient Glow */}
            <div className="fixed inset-0 pointer-events-none flex justify-center items-center">
                <div className="w-150 h-150 bg-amber-500/10 blur-[140px] rounded-full" />
            </div>

            {/* Header / Navbar */}
            <header className="relative z-10 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-1">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                            <Code2 className="w-5 h-5 text-amber-400" />
                        </div>
                        <span className="font-bold text-lg tracking-tight text-zinc-100">
                            RepoLens
                        </span>
                    </div>

                    <Link
                        href="/chat"
                        className="text-xs sm:text-sm font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 px-3 md:px-4 py-2 rounded-lg transition-all duration-200 shadow-md shadow-amber-500/10 flex items-center gap-1 md:gap-1.5"
                    >
                        Launch Terminal
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </header>

            {/* Main Hero Section */}
            <main className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-16 text-center flex-1 flex flex-col justify-center">
                {/* Status Badge */}
                <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs sm:text-sm text-zinc-300 mb-8 mx-auto">
                    <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span>Next-Gen Codebase Intelligence</span>
                </div>

                {/* Hero Title */}
                <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-zinc-100 max-w-4xl mx-auto leading-[1.15]">
                    Understand complex codebases in{" "}
                    <span className="bg-linear-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">
                        seconds, not hours.
                    </span>
                </h1>

                {/* Hero Subtitle */}
                <p className="mt-6 text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
                    RepoLens leverages RAG architecture with Gemini and Pinecone
                    vector search to ingest GitHub repositories and deliver
                    contextual, precise technical insights.
                </p>

                {/* Primary CTA Buttons */}
                <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link
                        href="/chat"
                        className="w-full sm:w-auto text-sm font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 px-8 py-3.5 rounded-xl transition-all duration-200 shadow-lg shadow-amber-500/15 flex items-center justify-center gap-2 group cursor-pointer"
                    >
                        Start Exploring Repo
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                    <a
                        href="https://github.com/vaidikdubey/RepoLens"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto text-sm font-semibold text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-6 py-3.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
                    >
                        <FaGithub className="w-4 h-4 text-zinc-400" />
                        View Source Code
                    </a>
                </div>

                {/* Core Features Grid */}
                <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                    <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 hover:border-amber-500/30 transition-all duration-300">
                        <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl w-fit mb-4">
                            <Zap className="w-5 h-5 text-amber-400" />
                        </div>
                        <h2 className="text-base font-semibold text-zinc-100">
                            Instant Vector Search
                        </h2>
                        <p className="mt-2 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                            Chunks codebase files and embeds them into Pinecone
                            for rapid semantic context retrieval.
                        </p>
                    </div>

                    <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 hover:border-amber-500/30 transition-all duration-300">
                        <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl w-fit mb-4">
                            <Terminal className="w-5 h-5 text-amber-400" />
                        </div>
                        <h2 className="text-base font-semibold text-zinc-100">
                            Context-Aware Answers
                        </h2>
                        <p className="mt-2 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                            Queries Gemini AI models using actual source code
                            chunks to prevent hallucinations.
                        </p>
                    </div>

                    <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 hover:border-amber-500/30 transition-all duration-300">
                        <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl w-fit mb-4">
                            <ShieldCheck className="w-5 h-5 text-amber-400" />
                        </div>
                        <h2 className="text-base font-semibold text-zinc-100">
                            Precise Source Attribution
                        </h2>
                        <p className="mt-2 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                            Every AI response explicitly cites file path
                            locations for verification and auditability.
                        </p>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="relative z-10 border-t border-zinc-800/60 py-6 text-center text-xs text-zinc-500">
                <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <p>
                        © {new Date().getFullYear()} RepoLens. Built for
                        engineering teams.
                    </p>
                    <div className="flex items-center gap-4 text-zinc-400">
                        <span className="flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-amber-400" />{" "}
                            Powered by <Link href="https://aistudio.google.com/welcome" target="_blank" className="text-blue-600 visited:text-purple-500 hover:underline hover:underline-offset-2">Gemini</Link> & <Link href="https://www.pinecone.io/" target="_blank" className="text-blue-600 visited:text-purple-500 hover:underline hover:underline-offset-2">Pinecone</Link>
                        </span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
