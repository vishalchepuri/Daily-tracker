export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { youtubeFetch } from "@/lib/youtube";

const MAX_CHANNELS = 50;
const MAX_FEED_VIDEOS = 60;

function parseIsoDurationSeconds(duration?: string) {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (Number(match[1] ?? 0) * 3600) + (Number(match[2] ?? 0) * 60) + Number(match[3] ?? 0);
}

function decodeXml(value?: string) {
  return (value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function textBetween(value: string, tag: string) {
  const match = value.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeXml(match?.[1]);
}

function attrValue(value: string, tag: string, attr: string) {
  const match = value.match(new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, "i"));
  return decodeXml(match?.[1]);
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
  "automation",
  "coding",
  "developer",
  "software",
  "programming",
  "startup",
  "product",
  "cloud",
  "api",
  "database",
  "security",
  "nvidia",
  "apple",
  "google",
  "microsoft",
  "meta",
  "tesla",
];

const learningSignals = ["tutorial", "explained", "guide", "course", "roadmap", "build", "learn", "how to", "case study", "review", "benchmark", "demo"];

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

function parseFeed(xml: string, fallbackChannel: any) {
  const entries = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  return entries.map((entry) => {
    const id = textBetween(entry, "yt:videoId");
    return {
      id,
      title: textBetween(entry, "title"),
      description: compactDescription(textBetween(entry, "media:description")),
      publishedAt: textBetween(entry, "published"),
      thumbnail: attrValue(entry, "media:thumbnail", "url"),
      channelId: fallbackChannel.channelId,
      channelTitle: textBetween(entry, "author") ? textBetween(textBetween(entry, "author"), "name") : fallbackChannel.title,
      channelThumbnail: fallbackChannel.thumbnail,
    };
  }).filter((video) => video.id && video.publishedAt);
}

async function fetchChannelFeed(channel: any) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channel.channelId)}`, {
    headers: { "User-Agent": "Dayza/1.0" },
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];
  return parseFeed(await res.text(), channel);
}

export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;

    const subscriptionsResult = await youtubeFetch(
      userId,
      "https://www.googleapis.com/youtube/v3/subscriptions?part=snippet,contentDetails&mine=true&maxResults=50&order=alphabetical"
    );
    if (!subscriptionsResult.ok) {
      const payload = {
        subscriptions: [],
        videos: [],
        sort: "publishedAt:desc",
        ...subscriptionsResult.data,
      };
      const expectedConnectionIssue = subscriptionsResult.data?.needsConnection;
      return NextResponse.json(payload, { status: expectedConnectionIssue ? 200 : subscriptionsResult.status });
    }

    const subscriptions = (subscriptionsResult.data.items ?? []).map((item: any) => ({
      id: item.id,
      channelId: item.snippet?.resourceId?.channelId,
      title: item.snippet?.title,
      description: item.snippet?.description,
      thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url,
      totalItemCount: item.contentDetails?.totalItemCount ?? 0,
    })).filter((channel: any) => channel.channelId).slice(0, MAX_CHANNELS);

    const channelFeeds = await Promise.all(subscriptions.map((channel: any) => fetchChannelFeed(channel).catch(() => [])));
    const feedVideos = channelFeeds.flat()
      .sort((a: any, b: any) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, MAX_FEED_VIDEOS);

    const ids = feedVideos.map((video: any) => video.id).join(",");
    const detailsResult = ids
      ? await youtubeFetch(userId, `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${encodeURIComponent(ids)}&maxResults=50`)
      : null;
    const detailMap = new Map<string, any>();
    if (detailsResult?.ok) {
      for (const item of detailsResult.data.items ?? []) detailMap.set(item.id, item);
    }

    const videos = feedVideos.map((video: any) => {
      const details = detailMap.get(video.id);
      const durationSeconds = parseIsoDurationSeconds(details?.contentDetails?.duration);
      const viewCount = details?.statistics?.viewCount ? Number(details.statistics.viewCount) : null;
      const isShort = durationSeconds > 0 && durationSeconds <= 90;
      return {
        ...video,
        durationSeconds,
        kind: isShort ? "short" : "video",
        viewCount,
        ...scoreVideo(video, durationSeconds, viewCount),
      };
    });

    return NextResponse.json({ subscriptions, videos, sort: "publishedAt:desc" });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed to load subscription feed" : error?.message ?? "Failed to load subscription feed" }, { status: 500 });
  }
}
