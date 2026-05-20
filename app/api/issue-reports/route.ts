import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();

    const message = cleanText(body.message, 2000);
    if (!message || message.length < 8) {
      return NextResponse.json({ error: "Please describe the issue a little more." }, { status: 400 });
    }

    const report = await prisma.issueReport.create({
      data: {
        userId: (session?.user as any)?.id ?? null,
        name: cleanText(body.name, 120),
        email: cleanText(body.email, 180)?.toLowerCase() ?? session?.user?.email ?? null,
        page: cleanText(body.page, 200),
        category: cleanText(body.category, 40) ?? "issue",
        message,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: report.id });
  } catch (error) {
    console.error("Issue report failed", error);
    return NextResponse.json({ error: "Could not submit the report right now." }, { status: 500 });
  }
}
