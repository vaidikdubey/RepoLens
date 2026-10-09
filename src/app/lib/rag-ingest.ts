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

        start = nextStart > start ? nextStart : end;
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
export const VALID_EXTENSIONS = [
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
    ".cpp",
    ".h",
    ".c",
    ".cmake",
];

//Skip auto-generated files, lock files and static assets
export const IGNORED_PATTERNS = [
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

    // SMART FILTERING: Strip lock files, config overhead, test dumps
    const files = treeResponse.data.tree.filter((item) => {
        if (item.type !== "blob" || !item.path) return false;

        // Ignore configs, lock files, minified bundles, and non-essential docs
        const lowerPath = item.path.toLowerCase();
        if (
            lowerPath.includes("min.js") ||
            lowerPath.includes("test") ||
            lowerPath.includes("spec") ||
            lowerPath.endsWith(".config.js") ||
            lowerPath.endsWith(".config.ts")
        ) {
            return false;
        }

        const hasValidExt = VALID_EXTENSIONS.some((ext) =>
            item.path?.endsWith(ext),
        );
        const isNotIgnored = !IGNORED_PATTERNS.some((pattern) =>
            item.path?.includes(pattern),
        );
        const isReasonableSize =
            (item.size ?? 0) > 50 && (item.size ?? 0) < 80000; // Skip tiny/empty and >80KB files

        return hasValidExt && isNotIgnored && isReasonableSize;
    });

    const allChunksWithMeta: {
        chunk: string;
        filePath: string;
        chunkIndex: number;
    }[] = [];

    onProgress?.(`Reading and chunking ${files.length} files...`, 20);

    for (let idx = 0; idx < files.length; idx++) {
        const file = files[idx];
        if (!file.path) continue;

        //2. Fetch raw file content
        try {
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
        } catch (error) {
            console.warn(
                `Failed to fetch file content for ${file.path}, skipping...`,
                error,
            );
        }

        //Small delay every 10 files to avoid GitHub REST secondary rate limits
        if (idx % 10 === 0 && idx > 0) await delay(200);
    }

    // console.log("Total files after filter:", files.length);
    // console.log("Total chunks:", allChunksWithMeta.length);
    // console.log(
    //     "File paths being ingested:",
    //     files.map((f) => f.path),
    // );

    if (allChunksWithMeta.length === 0)
        throw new Error("No eligible source code found to ingest.");

    const estimatedMinutes = Math.ceil(
        ((allChunksWithMeta.length / 8) * 2) / 60,
    );

    if (allChunksWithMeta.length > 300) {
        onProgress?.(
            `Large repo detected (${allChunksWithMeta.length} chunks). Estimated time: ~${estimatedMinutes} Ingestion will take longer due to API rate limits...`,
            35,
        );

        await delay(3000); //Let user read the warning
    }

    onProgress?.(
        `Generating batch embeddings for ${allChunksWithMeta.length} code chunks. Estimated time: ~${estimatedMinutes}`,
        40,
    );

    //Adaptive rate limiting state
    let consecutiveSuccesses = 0;
    let currentDelay = 2000; //2s
    const MIN_DELAY = 1500; //1.5s
    const MAX_DELAY = 30000; //30s

    const vectorsToUpsert: VectorRecord[] = [];
    const EMBED_BATCH_SIZE = 8; //Batch items per embedding call

    for (let i = 0; i < allChunksWithMeta.length; i += EMBED_BATCH_SIZE) {
        const batch = allChunksWithMeta.slice(i, i + EMBED_BATCH_SIZE);
        const contents = batch.map((item) => item.chunk);

        let success = false;
        let retries = 0;
        const maxRetries = 8;

        // Retry loop with exponential backoff for Gemini 429 rate limits
        while (!success && retries < maxRetries) {
            try {
                // Enforcing a strict minimum delay between requests to avoid rate limits
                await delay(currentDelay);

                //3. Generate vector embedding with Gemini (or selected model) with created batch of 8
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

                success = true;
                consecutiveSuccesses++;

                //Gradually speed up after 5 consecutive successes
                if (consecutiveSuccesses >= 5) {
                    currentDelay = Math.max(MIN_DELAY, currentDelay - 200);
                    consecutiveSuccesses = 0;
                }
            } catch (error: unknown) {
                retries++;
                consecutiveSuccesses = 0;

                const errorMessage =
                    error instanceof Error ? error.message : String(error);
                const errorStatus = (error as { status?: number })?.status;

                //Check if rate limited (429)
                if (errorStatus === 429 || errorMessage.includes("429")) {
                    currentDelay = Math.min(MAX_DELAY, currentDelay * 2);
                    console.warn(
                        `Rate limit hit. Backing off to ${currentDelay}ms. Retry ${retries}/${maxRetries}`,
                    );
                    await delay(currentDelay);
                } else {
                    console.error(
                        `Error requesting embeddings for batch starting at ${i}:`,
                        error,
                    );
                    break; // Non-rate-limit error, abort retry loop
                }
            }
        }

        if (!success) {
            console.warn(
                `Skipping batch at index ${i} after ${maxRetries} retries`,
            );
            // Don't throw — skip the batch and continue so partial ingestion still works
        }

        //For UI updates, to show progress to user. Calculates percentage b/w 40-85
        const progressPercent = Math.min(
            85,
            40 + Math.round((i / allChunksWithMeta.length) * 45),
        );
        onProgress?.(
            `Embedded ${Math.min(i + EMBED_BATCH_SIZE, allChunksWithMeta.length)} / ${allChunksWithMeta.length} chunks...`,
            progressPercent,
        );
    }

    onProgress?.("Upserting vectors into Pinecone database...", 90);

    //4. Parallel Batch Upsert to Pinecone
    if (vectorsToUpsert.length > 0) {
        //Processing in batches of 100 to stay safely under payload limits
        const PINECONE_BATCH_SIZE = 100;

        for (let i = 0; i < vectorsToUpsert.length; i += PINECONE_BATCH_SIZE) {
            const batch = vectorsToUpsert.slice(i, i + PINECONE_BATCH_SIZE);
            await index.upsert({ records: batch });
            await delay(200); // Prevent hitting Pinecone free write rate spikes
        }
    }

    onProgress?.(
        `Ingestion complete. Successfully ingested ${files.length} files!`,
        100,
    );

    return {
        success: true,
        processedFiles: files.length,
        totalChunks: vectorsToUpsert.length,
    };
}

export async function estimateRepoChunks(
    owner: string,
    repo: string,
): Promise<{ estimatedChunks: number; fileCount: number }> {
    const repoInfo = await octokit.rest.repos.get({ owner, repo });
    const defaultBranch = repoInfo.data.default_branch;

    const treeResponse = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: defaultBranch,
        recursive: "1",
    });

    const files = treeResponse.data.tree.filter((item) => {
        if (item.type !== "blob" || !item.path) return false;
        const lowerPath = item.path.toLowerCase();
        if (
            lowerPath.includes("min.js") ||
            lowerPath.includes("test") ||
            lowerPath.includes("spec") ||
            lowerPath.endsWith(".config.js") ||
            lowerPath.endsWith(".config.ts")
        )
            return false;

        const hasValidExt = VALID_EXTENSIONS.some((ext) =>
            item.path?.endsWith(ext),
        );
        const isNotIgnored = !IGNORED_PATTERNS.some((pattern) =>
            item.path?.includes(pattern),
        );
        const isReasonableSize =
            (item.size ?? 0) > 50 && (item.size ?? 0) < 80000;

        return hasValidExt && isNotIgnored && isReasonableSize;
    });

    const totalChars = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
    const estimatedChunks = Math.ceil(totalChars / 900);

    return { estimatedChunks, fileCount: files.length };
}
