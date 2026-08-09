import { GoogleGenAI } from "@google/genai";
import { Pinecone } from "@pinecone-database/pinecone";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pinecone.Index({ name: process.env.PINECONE_INDEX_NAME! });

export interface RelevantChunk {
    filePath: string;
    text: string;
    score: number;
}

export async function answerRepoQuestion(repo: string, question: string) {
    //1. Convert user question into vector embedding
    const embeddingResponse = await ai.models.embedContent({
        model: "gemini-embedding-001",
        contents: question,
    });

    const queryVector = embeddingResponse.embeddings?.[0]?.values;

    if (!queryVector)
        throw new Error("Failed to generate embedding for search query");

    //2. Query Pinecone for top 4 relevant code chunks matching repo metadata
    const queryResult = await index.query({
        vector: queryVector,
        topK: 4,
        includeMetadata: true,
        filter: { repo: { $eq: repo } },
    });

    const relevantChunks: RelevantChunk[] = queryResult.matches.map(
        (match) => ({
            filePath: (match.metadata?.filePath as string) || "Unknown File",
            text: (match.metadata?.text as string) || "",
            score: match.score || 0,
        }),
    );

    //3. Construct augmented prompt with code context
    const contextText = relevantChunks
        .map(
            (chunk, idx) =>
                `--- Snippet ${idx + 1} (File: ${chunk.filePath}) ---\n${chunk.text}`,
        )
        .join("\n\n");

    const systemInstruction = `You are RepoLens, an expert AI code assistant analyzing the codebase "${repo}". Answer the user's question accurately using ONLY the provided code snippets below. If the answer cannot be determined from the provided context, state that clearly. Always mention which file(s) contain the relevant code.`;

    const prompt = `Context Code Snippets:\n${contextText}\n\nUser Question: ${question}`;

    //4. Generate response using Gemini. Streaming response directly to frontend to reduce latency
    const responseStream = await ai.models.generateContentStream({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
            systemInstruction
        }        
    })

    return {
        responseStream,
        sources: relevantChunks,
    }
}
