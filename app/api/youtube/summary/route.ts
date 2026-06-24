export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { cacheGetJson, cacheSetJson } from "@/lib/cache";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getPublicTranscript, youtubeFetch } from "@/lib/youtube";

const YOUTUBE_SUMMARY_CACHE_SECONDS = 30 * 24 * 60 * 60;

function cleanSummaryText(value: string) {
  return value
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTakeaways(summary: string) {
  const lines = summary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const started = lines.findIndex((line) => /^important points[:\-]?/i.test(line));
  const collected: string[] = [];
  if (started >= 0) {
    for (let i = started + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^(what you can use|watch or skip|verdict|short summary)[:\-]?/i.test(line)) break;
      const normalized = line.replace(/^[\-\d.)\s]+/, "").trim();
      if (normalized) collected.push(normalized);
      if (collected.length >= 5) break;
    }
  }
  if (collected.length > 0) return collected;
  return lines
    .filter((line) => !/^(verdict|short summary|important points|what you can use|watch or skip)[:\-]?/i.test(line))
    .map((line) => line.replace(/^[\-\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const { videoId } = await req.json();
    if (!videoId) return NextResponse.json({ error: "Video ID required" }, { status: 400 });

    const cacheKey = `v1:youtube:summary:${userId}:${String(videoId)}`;
    const cached = await cacheGetJson<any>(cacheKey);
    if (cached) return NextResponse.json({ ...cached, cached: true });

    const limited = rateLimit(req, "youtube-summary", { limit: 20, windowMs: 60 * 60 * 1000, userId });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many YouTube summaries. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limited) }
      );
    }

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
            content:
              "You summarize YouTube videos for a busy builder. Return clean plain text only, with no markdown symbols, no ## headings, no asterisks, and no tables. Keep it simple and useful. Use this exact order with short labels: 1. Verdict, 2. Short summary, 3. Important points, 4. What you can use, 5. Watch or skip. Sort Important points from most important to least important. Capture valuable ideas, tools, models, product updates, risks, numbers, and action items. If only metadata is available, say the summary is based on title and description.",
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
    const summary = cleanSummaryText(data?.choices?.[0]?.message?.content ?? "No summary generated.");
    const payload = {
      video: {
        id: videoId,
        title: video.snippet?.title,
        channelTitle: video.snippet?.channelTitle,
        thumbnail: video.snippet?.thumbnails?.medium?.url ?? video.snippet?.thumbnails?.default?.url,
      },
      source: sourceLabel,
      summary,
      takeaways: extractTakeaways(summary),
      cached: false,
      cachedAt: new Date().toISOString(),
    };
    await cacheSetJson(cacheKey, payload, YOUTUBE_SUMMARY_CACHE_SECONDS);
    return NextResponse.json(payload);
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed to summarize video" : error?.message ?? "Failed to summarize video" }, { status: 500 });
  }
}
