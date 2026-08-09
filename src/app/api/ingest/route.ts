import { ingestGithubRepo } from "@/app/lib/rag-ingest";

export async function POST(req: Request) {
    try {
        const { repoUrl } = await req.json();

        //Parsing owner/repo from URL. URL is like: https://github.com/owner/repo
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
            return new Response(
                JSON.stringify(
                    {
                        success: false,
                        error: "Invalid GitHub URL format"
                    }),
                {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                }
            );
        }

        const [, owner, repo] = match;
        const cleanRepo = repo.replace(/\.git$/, "");

        const encoder = new TextEncoder()

        const stream = new ReadableStream({
            async start(controller) { 
                const sendEvent = (data: object) => { 
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
                }

                try {
                    const result = await ingestGithubRepo(owner, cleanRepo, (message, progress) => {
                        sendEvent({ type: "progress", message, progress });
                    });

                    sendEvent({
                        type: "complete",
                        message: "Ingestion finished successfully",
                        result,
                        repoSlug: `${owner}/${cleanRepo}`,
                    });
                } catch (error) {
                    sendEvent({
                        type: "error",
                        error: error instanceof Error ? error.message : "Ingestion failed",
                    });
                }
                finally { 
                    controller.close()
                }
            }
        })

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
            },
        });
    } catch (error) {
        console.error("Ingestion error: ", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Internal server error",
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" }
            }
        );
    }
}
