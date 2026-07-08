export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { youtubeFetch } from "@/lib/youtube";

function parseIsoDurationSeconds(duration?: string) {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (Number(match[1] ?? 0) * 3600) + (Number(match[2] ?? 0) * 60) + Number(match[3] ?? 0);
}

function compactDescription(value?: string) {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .trim()
    .slice(0, 220);
}

const aiTechSignals = [
  "ai",
  "artificial intelligence",
  "agent",
  "agents",
  "llm",
  "model",
  "openai",
  "claude",
  "gemini",
  "chatgpt",
  "machine learning",
  "deep learning",
  "automation",
  "coding",
  "developer",
  "software",
  "programming",
  "startup",
  "saas",
  "product",
  "cloud",
  "api",
  "database",
  "security",
  "cyber",
  "robotics",
  "nvidia",
  "gpu",
  "semiconductor",
  "iphone",
  "apple",
  "google",
  "microsoft",
  "meta",
  "tesla",
];

const learningSignals = [
  "tutorial",
  "explained",
  "guide",
  "course",
  "roadmap",
  "build",
  "learn",
  "how to",
  "case study",
  "review",
  "benchmark",
  "demo",
];

function scoreVideo(video: any, durationSeconds: number, viewCount: number | null) {
  const text = `${video.title ?? ""} ${video.description ?? ""} ${video.channelTitle ?? ""}`.toLowerCase();
  let score = 0;
  const matchedTopics = new Set<string>();

  for (const signal of aiTechSignals) {
    if (text.includes(signal)) {
      score += signal.length <= 3 ? 8 : 12;
      matchedTopics.add(signal);
    }
  }
  for (const signal of learningSignals) {
    if (text.includes(signal)) score += 6;
  }

  if (durationSeconds >= 180 && durationSeconds <= 3600) score += 14;
  if (durationSeconds > 0 && durationSeconds <= 90) score -= 20;
  if (viewCount) score += Math.min(12, Math.floor(Math.log10(viewCount + 1) * 3));

  const publishedTime = new Date(video.publishedAt).getTime();
  const ageDays = Number.isFinite(publishedTime) ? (Date.now() - publishedTime) / 86_400_000 : 999;
  if (ageDays <= 7) score += 12;
  else if (ageDays <= 30) score += 7;
  else if (ageDays <= 90) score += 3;

  return {
    priorityScore: Math.max(0, Math.round(score)),
    matchedTopics: Array.from(matchedTopics).slice(0, 5),
  };
}

export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");
    if (!channelId) return NextResponse.json({ error: "Channel ID required" }, { status: 400 });
    const result = await youtubeFetch(
      userId,
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&maxResults=50&order=date&type=video`
    );
    if (!result.ok) return NextResponse.json(result.data, { status: result.status });
    const searchVideos = (result.data.items ?? []).map((item: any) => ({
      id: item.id?.videoId,
      title: item.snippet?.title,
      description: item.snippet?.description,
      publishedAt: item.snippet?.publishedAt,
      thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url,
      channelTitle: item.snippet?.channelTitle,
    })).filter((video: any) => video.id);

    const ids = searchVideos.map((video: any) => video.id).join(",");
    const detailsResult = ids
      ? await youtubeFetch(
          userId,
          `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${encodeURIComponent(ids)}&maxResults=50`
        )
      : null;
    const detailMap = new Map<string, any>();
    if (detailsResult?.ok) {
      for (const item of detailsResult.data.items ?? []) {
        detailMap.set(item.id, item);
      }
    }

    const videos = searchVideos
      .map((video: any) => {
        const details = detailMap.get(video.id);
        const durationSeconds = parseIsoDurationSeconds(details?.contentDetails?.duration);
        const isShort = durationSeconds > 0 && durationSeconds <= 90;
        const viewCount = details?.statistics?.viewCount ? Number(details.statistics.viewCount) : null;
        const ranking = scoreVideo(video, durationSeconds, viewCount);
        return {
          ...video,
          description: compactDescription(video.description),
          durationSeconds,
          kind: isShort ? "short" : "video",
          viewCount,
          ...ranking,
        };
      })
      .sort((a: any, b: any) => {
        if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
        if (a.kind !== b.kind) return a.kind === "video" ? -1 : 1;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      })
      .slice(0, 24);
    return NextResponse.json({ videos });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed to load videos" : error?.message ?? "Failed to load videos" }, { status: 500 });
  }
}
