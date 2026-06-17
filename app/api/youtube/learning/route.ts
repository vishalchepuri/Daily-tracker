export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import {
  deleteYoutubeLearningItem,
  listYoutubeLearningItems,
  updateYoutubeLearningItem,
  upsertYoutubeLearningItem,
} from "@/lib/firestore-app-data";

function normalizeCategory(value?: string | null) {
  const allowed = ["fitness", "nutrition", "finance", "productivity", "other"];
  const normalized = String(value ?? "other").trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : "other";
}

function normalizeStatus(value?: string | null) {
  const allowed = ["saved", "watched", "summarized", "acted_on", "completed"];
  const normalized = String(value ?? "saved").trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : "saved";
}

function normalizeTakeaways(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const items = await listYoutubeLearningItems(user.id);
    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = await req.json();
    const videoId = String(data?.videoId ?? "").trim();
    if (!videoId) return NextResponse.json({ error: "Video ID required" }, { status: 400 });
    const item = await upsertYoutubeLearningItem(user.id, videoId, {
      title: data.title ?? "",
      channelTitle: data.channelTitle ?? "",
      thumbnail: data.thumbnail ?? "",
      summary: data.summary ?? "",
      source: data.source ?? "",
      category: normalizeCategory(data.category),
      status: normalizeStatus(data.status),
      notes: String(data.notes ?? ""),
      takeaways: normalizeTakeaways(data.takeaways),
      nextAction: String(data.nextAction ?? ""),
      lastViewedAt: data.lastViewedAt ?? null,
    });
    return NextResponse.json({ item });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = await req.json();
    const videoId = String(data?.videoId ?? "").trim();
    if (!videoId) return NextResponse.json({ error: "Video ID required" }, { status: 400 });
    const item = await updateYoutubeLearningItem(user.id, videoId, {
      title: data.title,
      channelTitle: data.channelTitle,
      thumbnail: data.thumbnail,
      summary: data.summary,
      source: data.source,
      category: data.category == null ? undefined : normalizeCategory(data.category),
      status: data.status == null ? undefined : normalizeStatus(data.status),
      notes: data.notes,
      takeaways: data.takeaways == null ? undefined : normalizeTakeaways(data.takeaways),
      nextAction: data.nextAction,
      lastViewedAt: data.lastViewedAt ?? null,
    });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const videoId = String(searchParams.get("videoId") ?? "").trim();
    if (!videoId) return NextResponse.json({ error: "Video ID required" }, { status: 400 });
    await deleteYoutubeLearningItem(user.id, videoId);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed" : error?.message ?? "Failed" }, { status: 500 });
  }
}
