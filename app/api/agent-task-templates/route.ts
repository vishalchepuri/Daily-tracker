export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function cleanString(value: unknown, fallback = "") {
  return String(value ?? fallback).trim() || fallback;
}

function cleanSchedule(value: unknown) {
  return ["daily", "weekly", "manual"].includes(String(value)) ? String(value) : "daily";
}

export async function GET() {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.agentTaskTemplate.findMany({
    where: {
      OR: [
        { submittedById: user.id },
        { shared: true, status: "approved" },
      ],
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { submittedBy: { select: { name: true, email: true } } },
  });

  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const name = cleanString(data.name);
  const prompt = cleanString(data.prompt);
  if (!name || !prompt) return NextResponse.json({ error: "Template name and training instruction are required" }, { status: 400 });

  const shared = data.shared === true;
  const template = await prisma.agentTaskTemplate.create({
    data: {
      submittedById: user.id,
      name,
      description: cleanString(data.description) || null,
      prompt,
      outputFormat: cleanString(data.outputFormat) || null,
      category: cleanString(data.category, "general"),
      defaultScheduleType: cleanSchedule(data.defaultScheduleType),
      defaultTimeOfDay: cleanString(data.defaultTimeOfDay) || null,
      defaultDaysOfWeek: cleanString(data.defaultDaysOfWeek) || null,
      shared,
      status: shared ? "pending" : "private",
    },
  });

  return NextResponse.json({ template });
}

export async function PATCH(req: Request) {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const id = cleanString(data.id);
  if (!id) return NextResponse.json({ error: "Template ID is required" }, { status: 400 });

  const existing = await prisma.agentTaskTemplate.findFirst({ where: { id, submittedById: user.id } });
  if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (existing.status === "approved" && existing.shared) {
    return NextResponse.json({ error: "Approved shared templates cannot be edited. Create a new version instead." }, { status: 400 });
  }

  const shared = "shared" in data ? data.shared === true : existing.shared;
  const template = await prisma.agentTaskTemplate.update({
    where: { id },
    data: {
      name: "name" in data ? cleanString(data.name, existing.name) : existing.name,
      description: "description" in data ? cleanString(data.description) || null : existing.description,
      prompt: "prompt" in data ? cleanString(data.prompt, existing.prompt) : existing.prompt,
      outputFormat: "outputFormat" in data ? cleanString(data.outputFormat) || null : existing.outputFormat,
      category: "category" in data ? cleanString(data.category, existing.category) : existing.category,
      defaultScheduleType: "defaultScheduleType" in data ? cleanSchedule(data.defaultScheduleType) : existing.defaultScheduleType,
      defaultTimeOfDay: "defaultTimeOfDay" in data ? cleanString(data.defaultTimeOfDay) || null : existing.defaultTimeOfDay,
      defaultDaysOfWeek: "defaultDaysOfWeek" in data ? cleanString(data.defaultDaysOfWeek) || null : existing.defaultDaysOfWeek,
      shared,
      status: shared ? "pending" : "private",
      reviewedById: null,
      reviewedAt: null,
      reviewNotes: null,
    },
  });

  return NextResponse.json({ template });
}
