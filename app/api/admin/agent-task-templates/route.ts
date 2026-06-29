import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function cleanString(value: unknown, fallback = "") {
  return String(value ?? fallback).trim() || fallback;
}

export async function PATCH(req: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const data = await req.json();
  const id = cleanString(data.id);
  const status = cleanString(data.status);
  if (!id || !["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Template ID and valid status are required" }, { status: 400 });
  }

  const template = await prisma.agentTaskTemplate.update({
    where: { id },
    data: {
      status,
      shared: status === "approved",
      reviewedById: admin.id,
      reviewedAt: new Date(),
      reviewNotes: cleanString(data.reviewNotes) || null,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/agent-tasks");
  return NextResponse.json({ template });
}
