export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const select = {
  notificationQuietStart: true,
  notificationQuietEnd: true,
  notifyReminders: true,
  notifyMedications: true,
  notifyRefills: true,
  notifyAgentTasks: true,
};

function cleanTime(value: unknown) {
  const text = String(value ?? "").trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : null;
}

export async function GET() {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
    select,
  });
  return NextResponse.json({ preferences: profile });
}

export async function PATCH(req: Request) {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const profile = await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {
      notificationQuietStart: cleanTime(data.notificationQuietStart),
      notificationQuietEnd: cleanTime(data.notificationQuietEnd),
      notifyReminders: Boolean(data.notifyReminders),
      notifyMedications: Boolean(data.notifyMedications),
      notifyRefills: Boolean(data.notifyRefills),
      notifyAgentTasks: Boolean(data.notifyAgentTasks),
    },
    create: {
      userId: user.id,
      notificationQuietStart: cleanTime(data.notificationQuietStart),
      notificationQuietEnd: cleanTime(data.notificationQuietEnd),
      notifyReminders: Boolean(data.notifyReminders),
      notifyMedications: Boolean(data.notifyMedications),
      notifyRefills: Boolean(data.notifyRefills),
      notifyAgentTasks: Boolean(data.notifyAgentTasks),
    },
    select,
  });
  return NextResponse.json({ preferences: profile });
}
