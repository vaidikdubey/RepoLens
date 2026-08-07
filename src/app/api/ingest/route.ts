import { NextResponse } from "next/server";
import { ingestGithubRepo } from "@/app/lib/rag-ingest";

export async function POST(req: Request) {
    try {
        const { repoUrl } = await req.json();

        //Parsing owner/repo from URL. URL is like: https://github.com/owner/repo
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Invalid GitHub URL format",
                },
                { status: 400 },
            );
        }

        const [, owner, repo] = match;
        const cleanRepo = repo.replace(/\.git$/, "");

        const result = await ingestGithubRepo(owner, cleanRepo);

        return NextResponse.json(
            {
                success: true,
                message: "Repository ingest successful",
                result,
            },
            { status: 200 },
        );
    } catch (error) {
        console.error("Ingestion error: ", error);
        return NextResponse.json(
            {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to process repository",
            },
            { status: 500 },
        );
    }
}
