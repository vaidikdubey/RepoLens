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

        const { responseStream, sources } = await answerRepoQuestion(repo, question);

        const encoder = new TextEncoder();

        //Create a Web ReadableStream from Gemini's async generator
        const stream = new ReadableStream({
            async start(controller) { 
                try {
                    for await (const chunk of responseStream) { 
                        const text = chunk.text

                        if (text) { 
                            controller.enqueue(encoder.encode(text))
                        }
                    }
                    controller.close()
                } catch (error) {
                    controller.error(error)
                }
            }
        })

        //Sending sources via custom JSON header and stream the plain text body (to send in 1 res)
        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "x-rag-sources": JSON.stringify(sources)
            }
        })
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
