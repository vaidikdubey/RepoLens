import { estimateRepoChunks } from "@/app/lib/rag-ingest";

export async function POST(req: Request) {
    try {
        const { repoUrl } = await req.json();

        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
            return new Response(
                JSON.stringify({ error: "Invalid GitHub URL format" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const [, owner, repo] = match;
        const cleanRepo = repo.replace(/\.git$/, "");

        const result = await estimateRepoChunks(owner, cleanRepo);
        const estimatedSeconds = Math.ceil((result.estimatedChunks / 8) * 2);
        const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

        return new Response(
            JSON.stringify({
                ...result,
                estimatedSeconds,
                estimatedMinutes,
                safe: result.estimatedChunks <= 500,
            }),
            { headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "Estimation failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}