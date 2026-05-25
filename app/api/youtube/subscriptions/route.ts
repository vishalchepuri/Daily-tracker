export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { youtubeFetch } from "@/lib/youtube";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;
    const result = await youtubeFetch(
      userId,
      "https://www.googleapis.com/youtube/v3/subscriptions?part=snippet,contentDetails&mine=true&maxResults=50&order=alphabetical"
    );
    if (!result.ok) return NextResponse.json(result.data, { status: result.status });
    const subscriptions = (result.data.items ?? []).map((item: any) => ({
      id: item.id,
      channelId: item.snippet?.resourceId?.channelId,
      title: item.snippet?.title,
      description: item.snippet?.description,
      thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url,
      totalItemCount: item.contentDetails?.totalItemCount ?? 0,
    }));
    return NextResponse.json({ subscriptions });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to load subscriptions" }, { status: 500 });
  }
}
