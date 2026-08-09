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

        const { responseStream, sources } = await answerRepoQuestion(
            repo,
            question,
        );

        //Strip down sources to aviod giant payload overhead in headers
        const cleanSources = sources.map((s) => ({
            filePath: s.filePath,
            score: s.score,
        }));

        const encoder = new TextEncoder();

        //Create a Web ReadableStream from Gemini's async generator
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of responseStream) {
                        const text = chunk.text;

                        if (text) {
                            controller.enqueue(encoder.encode(text));
                        }
                    }
                    controller.close();
                } catch (error) {
                    controller.error(error);
                }
            },
        });

        //Sending sources via custom JSON header and stream the plain text body (to send in 1 res)
        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                //Safe URL encoding to prevent non-ASCII characters from breaking headers
                "x-rag-sources": encodeURIComponent(
                    JSON.stringify(cleanSources),
                ),
            },
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
