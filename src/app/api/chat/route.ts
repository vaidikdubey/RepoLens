import { NextResponse } from "next/server";
import { answerRepoQuestion } from "@/app/lib/rag-query";

export async function POST(req: Request) {
    try {
        const { repo, question } = await req.json();

        if (!repo || !question)
            return NextResponse.json(
                {
                    success: false,
                    error: "Both repo identifier and question are required.",
                },
                { status: 400 },
            );

        const result = await answerRepoQuestion(repo, question);

        return NextResponse.json({
            success: true,
            message: "Repo question answer generated successfully",
            result,
        });
    } catch (error) {
        console.error("Chat Query Error: ", error);
        return NextResponse.json(
            {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to answer question",
            },
            { status: 500 },
        );
    }
}
