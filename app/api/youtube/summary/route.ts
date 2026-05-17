export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPublicTranscript, youtubeFetch } from "@/lib/youtube";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const { videoId } = await req.json();
    if (!videoId) return NextResponse.json({ error: "Video ID required" }, { status: 400 });

    const details = await youtubeFetch(
      userId,
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${encodeURIComponent(videoId)}`
    );
    if (!details.ok) return NextResponse.json(details.data, { status: details.status });
    const video = details.data.items?.[0];
    if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

    const transcript = await getPublicTranscript(videoId);
    const sourceText = transcript || `${video.snippet?.title ?? ""}\n${video.snippet?.description ?? ""}`;
    const sourceLabel = transcript ? "transcript" : "title and description";

    const response = await fetch("https://apps.abacus.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        stream: false,
        max_tokens: 900,
        messages: [
          {
            role: "system",
            content: "You summarize YouTube videos clearly. Return concise markdown with: Short summary, Key points, Useful takeaways, and Who should watch. If only metadata is available, say the summary is based on title/description.",
          },
          {
            role: "user",
            content: `Video title: ${video.snippet?.title}\nChannel: ${video.snippet?.channelTitle}\nSource: ${sourceLabel}\n\n${sourceText.slice(0, 18000)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: `Summary failed: ${text}` }, { status: 500 });
    }
    const data = await response.json();
    return NextResponse.json({
      video: {
        id: videoId,
        title: video.snippet?.title,
        channelTitle: video.snippet?.channelTitle,
        thumbnail: video.snippet?.thumbnails?.medium?.url ?? video.snippet?.thumbnails?.default?.url,
      },
      source: sourceLabel,
      summary: data?.choices?.[0]?.message?.content ?? "No summary generated.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to summarize video" }, { status: 500 });
  }
}
