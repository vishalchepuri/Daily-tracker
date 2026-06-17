export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { sendPushToUser } from "@/lib/web-push";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await sendPushToUser(user.id, {
      title: "Dayza test notification",
      body: "Your mobile push notifications are working.",
      url: "/reminders",
      tag: "dayza-test",
      data: { kind: "test" },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }
}
