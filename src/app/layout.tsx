import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RepoLens - AI-Powered Codebase Intelligence",
  description:
    "RAG-powered web playground and CLI tool for exploring GitHub repositories using Gemini and Pinecone vector search.",
  keywords: [
    "RAG",
    "Codebase QA",
    "Gemini AI",
    "Pinecone",
    "Vector Database",
    "Developer Tools",
    "TypeScript",
  ],
  authors: [{ name: "Vaidik Dubey" }],
  openGraph: {
    title: "RepoLens - AI-Powered Codebase Intelligence",
    description:
      "Ingest GitHub repositories and get context-aware answers with explicit source code attributions.",
    type: "website",
    siteName: "RepoLens",
  },
  twitter: {
    card: "summary_large_image",
    title: "RepoLens - AI-Powered Codebase Intelligence",
    description:
      "RAG-powered web playground for exploring GitHub repositories with Gemini and Pinecone.",
  },
  icons: {
    icon: "/favicon.svg"
  }
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
