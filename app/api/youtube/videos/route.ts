export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { youtubeFetch } from "@/lib/youtube";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = (session.user as any)?.id;
    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");
    if (!channelId) return NextResponse.json({ error: "Channel ID required" }, { status: 400 });
    const result = await youtubeFetch(
      userId,
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&maxResults=12&order=date&type=video`
    );
    if (!result.ok) return NextResponse.json(result.data, { status: result.status });
    const videos = (result.data.items ?? []).map((item: any) => ({
      id: item.id?.videoId,
      title: item.snippet?.title,
      description: item.snippet?.description,
      publishedAt: item.snippet?.publishedAt,
      thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url,
      channelTitle: item.snippet?.channelTitle,
    })).filter((video: any) => video.id);
    return NextResponse.json({ videos });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to load videos" }, { status: 500 });
  }
}
