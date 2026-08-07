import { Octokit } from "@octokit/rest";
import { GoogleGenAI } from "@google/genai";
import { Pinecone } from "@pinecone-database/pinecone";

//Initialize clients
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pinecone.Index({ name: process.env.PINECONE_INDEX_NAME! });

//Rate limit delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

//Text chunking by character limit
function chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push(text.slice(start, end));
        start += chunkSize - overlap;
    }

    return chunks;
}

//List of allowed file extension
const VALID_EXTENSIONS = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".json",
    ".md",
    ".html",
    ".css",
    ".prisma",
    ".go",
    ".rs",
];

export async function ingestGithubRepo(owner: string, repo: string) {
    //1. Fetch repo tree (recursively)
    const repoInfo = await octokit.rest.repos.get({ owner, repo });
    const defaultBranch = repoInfo.data.default_branch;

    const treeResponse = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: defaultBranch,
        recursive: "1",
    });

    const files = treeResponse.data.tree.filter(
        (item) =>
            item.type === "blob" &&
            item.path &&
            VALID_EXTENSIONS.some((ext) => item.path?.endsWith(ext)) &&
            !item.path.includes("node_modules") &&
            !item.path.includes("dist") &&
            !item.path.includes(".next"),
    );

    //Limit processing to first 10 code files for fast ingestion
    const selectedFiles = files.slice(0, 10);
    const vectorsToUpsert = [];

    for (const file of selectedFiles) {
        if (!file.path) continue;

        //2. Fetch raw file content
        const fileData = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: file.path,
        });

        if ("content" in fileData.data && fileData.data.content) {
            const content = Buffer.from(
                fileData.data.content,
                "base64",
            ).toString("utf-8");
            const chunks = chunkText(content);

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];

                //Delay 1.2s between calls to avoid rate limit errors
                await delay(1200);

                //3. Generate vector embedding with Gemini (or selected model)
                const embeddingResponse = await ai.models.embedContent({
                    model: "gemini-embedding-001",
                    contents: chunk,
                });

                const embeddingValues = embeddingResponse.embeddings?.[0]?.values as number[];

                if (embeddingValues) {
                    //Sanitized ID for Pinecone
                    const vectorId = `${owner}_${repo}_${file.path.replace(/[\/\.]/g, "_")}_chunk_${i}`;

                    vectorsToUpsert.push({
                        id: vectorId,
                        values: embeddingValues,
                        metadata: {
                            repo: `${owner}/${repo}`,
                            filePath: file.path,
                            chunkIndex: i,
                            text: chunk,
                        },
                    });
                }
            }
        }
    }

    //4. Batch Upsert to Pinecone
    if (vectorsToUpsert.length > 0) {
        //Processing in batches of 100 to stay safely under payload limits
        const batchSize = 100;

        for (let i = 0; i < vectorsToUpsert.length; i += batchSize) {
            const batch = vectorsToUpsert.slice(i, i + batchSize);
            await index.upsert({records: batch});
        }
    }

    return {
        success: true,
        processedFiles: selectedFiles.length,
        totalChunks: vectorsToUpsert.length,
    };
}
