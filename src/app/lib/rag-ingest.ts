import { Octokit } from "@octokit/rest";
import { GoogleGenAI } from "@google/genai";
import { Pinecone } from "@pinecone-database/pinecone";

//Initialize clients
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pinecone.Index({ name: process.env.PINECONE_INDEX_NAME! });

//Rate limit delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type ProgressCallback = (message: string, progress: number) => void;

interface VectorRecord {
    id: string;
    values: number[];
    metadata: {
        repo: string;
        filePath: string;
        chunkIndex: number;
        text: string;
    };
}

//Text chunking by character limit
function chunkText(text: string, chunkSize = 1000, overlap = 100): string[] {
    // Sanitize any malformed unicode in the source file first
    //typeof check prevents the code from throwing a TypeError in non-compatible environments
    const cleanText =
        typeof text.toWellFormed === "function" ? text.toWellFormed() : text;
    const chunks: string[] = [];
    let start = 0;

    while (start < cleanText.length) {
        let end = Math.min(start + chunkSize, cleanText.length);

        // Prevent splitting surrogate pairs at the end boundary which will cause malformed strings
        if (
            end < cleanText.length &&
            isHighSurrogate(cleanText.charCodeAt(end - 1))
        ) {
            end--;
        }

        const chunk = cleanText.slice(start, end);

        //Sanitize chunk again to prevent pushing malformed chunks with compatibility checks
        chunks.push(
            typeof chunk.toWellFormed === "function"
                ? chunk.toWellFormed()
                : chunk,
        );

        //To get the overlap in the next chunk we adjust the start value
        let nextStart = end - overlap;

        // Prevent starting on a low surrogate at the start boundary
        if (nextStart > 0 && isLowSurrogate(cleanText.charCodeAt(nextStart))) {
            nextStart++;
        }

        start = Math.max(start + 1, nextStart);
    }

    return chunks;
}

function isHighSurrogate(code: number): boolean {
    return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
    return code >= 0xdc00 && code <= 0xdfff;
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

//Skip auto-generated files, lock files and static assets
const IGNORED_PATTERNS = [
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "node_modules",
    "dist",
    ".next",
    "build",
    "public/",
];

export async function ingestGithubRepo(
    owner: string,
    repo: string,
    onProgress?: ProgressCallback,
) {
    onProgress?.("Fetching repository file structure...", 10);

    //1. Fetch repo tree (recursively)
    const repoInfo = await octokit.rest.repos.get({ owner, repo });
    const defaultBranch = repoInfo.data.default_branch;

    //Without recursive "1", github omits the nested subtree data and only returns their sha's, but with recursive "1", github flattern all subtrees into an array present in treeResponse.data.tree
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
            !IGNORED_PATTERNS.some((pattern) => item.path?.includes(pattern)) &&
            (item.size ?? 0) < 100000, // Skip files larger than ~100KB
    );

    //Limit processing to first 10 code files for fast ingestion
    const selectedFiles = files.slice(0, 10);
    const allChunksWithMeta: {
        chunk: string;
        filePath: string;
        chunkIndex: number;
    }[] = [];

    onProgress?.(`Reading and chunking ${selectedFiles.length} files...`, 30);

    for (const file of selectedFiles) {
        if (!file.path) continue;

        //2. Fetch raw file content
        const fileData = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: file.path,
        });

        if ("content" in fileData.data && fileData.data.content) {
            //content contains base64 encoded string data and native JS can't convert it to utf-8 string. So we create a buffer of that string to use .toString() to read the content.
            const content = Buffer.from(
                fileData.data.content,
                "base64",
            ).toString("utf-8");

            //Create chunks of the content with the helper function along with data sanitization.
            const chunks = chunkText(content);

            chunks.forEach((chunk, i) => {
                // Ensures string contains valid Unicode scalar values for JSON serialization. Implemented custom wellformed for un-supported environments.
                const sanitizedChunk =
                    typeof chunk.toWellFormed === "function"
                        ? chunk.toWellFormed()
                        : chunk.replace(
                              /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g,
                              "",
                          );

                allChunksWithMeta.push({
                    chunk: sanitizedChunk,
                    filePath: file.path!,
                    chunkIndex: i,
                });
            });
        }
    }

    if (allChunksWithMeta.length === 0)
        throw new Error("No eligible source code found to ingest.");

    onProgress?.(
        `Generating batch embeddings for ${allChunksWithMeta.length} code chunks...`,
        50,
    );

    //Batching gemini embeddings
    const vectorsToUpsert: VectorRecord[] = [];
    const EMBED_BATCH_SIZE = 10; //Batch items per embedding call

    for (let i = 0; i < allChunksWithMeta.length; i += EMBED_BATCH_SIZE) {
        // Add 500ms delay between batch requests to respect Gemini API rate limits
        if (i > 0) {
            await delay(500);
        }

        const batch = allChunksWithMeta.slice(i, i + EMBED_BATCH_SIZE);
        const contents = batch.map((item) => item.chunk);

        //3. Generate vector embedding with Gemini (or selected model) with created batch of 10
        const embeddingResponse = await ai.models.embedContent({
            model: "gemini-embedding-001",
            contents,
        });

        const embeddings = embeddingResponse.embeddings || [];

        batch.forEach((item, idx) => {
            const values = embeddings[idx]?.values as number[];

            if (values) {
                //Sanitized ID for Pinecone
                const id = `${owner}_${repo}_${item.filePath.replace(/[\/\.]/g, "_")}_chunk_${item.chunkIndex}`;
                vectorsToUpsert.push({
                    id,
                    values,
                    metadata: {
                        repo: `${owner}/${repo}`,
                        filePath: item.filePath,
                        chunkIndex: item.chunkIndex,
                        text: item.chunk,
                    },
                });
            }
        });

        //For UI updates, to show progress to user. Calculates percentage b/w 50-85
        const batchProgress = Math.min(
            85,
            50 +
                Math.round(
                    ((i + EMBED_BATCH_SIZE) / allChunksWithMeta.length) * 35,
                ),
        );
        onProgress?.(
            `Generated embeddings (${Math.min(i + EMBED_BATCH_SIZE, allChunksWithMeta.length)}/${allChunksWithMeta.length})...`,
            batchProgress,
        );
    }

    onProgress?.("Upserting vectors into Pinecone database...", 90);

    //4. Parallel Batch Upsert to Pinecone
    if (vectorsToUpsert.length > 0) {
        //Processing in batches of 100 to stay safely under payload limits
        const PINECONE_BATCH_SIZE = 100;
        const pineconePromises = [];

        for (let i = 0; i < vectorsToUpsert.length; i += PINECONE_BATCH_SIZE) {
            const batch = vectorsToUpsert.slice(i, i + PINECONE_BATCH_SIZE);
            pineconePromises.push(index.upsert({ records: batch }));
        }

        await Promise.all(pineconePromises);
    }

    onProgress?.(
        `Ingestion complete. Successfully ingested ${selectedFiles.length} files!`,
        100,
    );

    return {
        success: true,
        processedFiles: selectedFiles.length,
        totalChunks: vectorsToUpsert.length,
    };
}
