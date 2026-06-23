import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteFoodMicronutrientLog, getAgentUndoAction, listAgentUndoActions, markAgentUndoActionUsed } from "@/lib/firestore-app-data";

function undoError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isExpired(value: unknown) {
  if (!value) return false;
  const expiresAt = new Date(String(value));
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now();
}

async function deleteOwnedRecord(model: any, userId: string, id: string) {
  const result = await model.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

export async function GET(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user?.id) return undoError("Unauthorized", 401);

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(25, Number(url.searchParams.get("limit") ?? 10)));
    const actions = await listAgentUndoActions(user.id, limit);
    return NextResponse.json({ actions });
  } catch (error: any) {
    console.error("Agent undo list failed", error);
    return undoError(error?.message ?? "Could not load undo actions", 500);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user?.id) return undoError("Unauthorized", 401);

    const { undoId } = await req.json().catch(() => ({}));
    if (!undoId || typeof undoId !== "string") return undoError("Undo ID is required");

    const undo = await getAgentUndoAction(user.id, undoId);
    if (!undo) return undoError("Undo action not found", 404);
    if (undo.status !== "open") return undoError("This action was already undone or expired", 409);
    if (isExpired(undo.expiresAt)) return undoError("Undo window expired", 410);

    const targetId = String(undo.targetId ?? "");
    const targetType = String(undo.targetType ?? "");
    if (!targetId || !targetType) return undoError("Undo action is incomplete");

    let undone = false;

    if (targetType === "foodLog") {
      undone = await deleteOwnedRecord(prisma.foodLog, user.id, targetId);
      if (undone) await deleteFoodMicronutrientLog(user.id, targetId);
    } else if (targetType === "reminder") {
      undone = await deleteOwnedRecord(prisma.reminder, user.id, targetId);
    } else if (targetType === "reminderCompletion") {
      const result = await prisma.reminder.updateMany({
        where: { id: targetId, userId: user.id },
        data: {
          completed: Boolean(undo.payload?.previousCompleted),
          completedAt: undo.payload?.previousCompletedAt ? new Date(String(undo.payload.previousCompletedAt)) : null,
        },
      });
      undone = result.count > 0;
    } else if (targetType === "progressEntry") {
      undone = await deleteOwnedRecord(prisma.progressEntry, user.id, targetId);
    } else if (targetType === "spend") {
      undone = await prisma.$transaction(async (tx) => {
        const spend = await tx.spend.findFirst({ where: { id: targetId, userId: user.id } });
        if (!spend) return false;
        if (spend.balanceApplied && spend.bankAccountId) {
          await tx.bankAccount.updateMany({
            where: { id: spend.bankAccountId, userId: user.id },
            data: { balance: { increment: spend.amount } },
          });
        }
        if (spend.balanceApplied && spend.creditCardId) {
          await tx.creditCard.updateMany({
            where: { id: spend.creditCardId, userId: user.id },
            data: { currentDue: { decrement: spend.amount } },
          });
        }
        await tx.spend.delete({ where: { id: targetId } });
        return true;
      });
    } else if (targetType === "creditCard") {
      undone = await deleteOwnedRecord(prisma.creditCard, user.id, targetId);
    } else if (targetType === "bankAccount") {
      undone = await deleteOwnedRecord(prisma.bankAccount, user.id, targetId);
    } else if (targetType === "moneyLink") {
      undone = await deleteOwnedRecord(prisma.moneyLink, user.id, targetId);
    } else if (targetType === "workoutLog") {
      undone = await deleteOwnedRecord(prisma.workoutLog, user.id, targetId);
    } else if (targetType === "workoutTemplate") {
      undone = await deleteOwnedRecord(prisma.workoutTemplate, user.id, targetId);
    } else if (targetType === "workoutExercise") {
      const row = await prisma.workoutExercise.findUnique({
        where: { id: targetId },
        include: { workoutTemplate: { select: { userId: true } } },
      });
      if (row?.workoutTemplate?.userId === user.id) {
        await prisma.workoutExercise.delete({ where: { id: targetId } });
        undone = true;
      }
    } else if (targetType === "workoutExerciseRemoval") {
      const template = await prisma.workoutTemplate.findFirst({ where: { id: targetId, userId: user.id } });
      const rows = Array.isArray(undo.payload?.exercises) ? undo.payload.exercises : [];
      if (template && rows.length > 0) {
        await prisma.workoutExercise.createMany({
          data: rows
            .filter((row: any) => row?.exerciseId)
            .map((row: any) => ({
              workoutTemplateId: template.id,
              exerciseId: String(row.exerciseId),
              sets: Math.round(Number(row.sets ?? 3)),
              reps: String(row.reps ?? "8-12"),
              restSeconds: Math.round(Number(row.restSeconds ?? 90)),
              orderIndex: Math.round(Number(row.orderIndex ?? 0)),
            })),
        });
        undone = true;
      }
    } else if (targetType === "deletedWorkoutTemplate") {
      const payload = undo.payload ?? {};
      const existing = await prisma.workoutTemplate.findFirst({ where: { id: targetId, userId: user.id } });
      if (!existing && payload?.id === targetId) {
        await prisma.workoutTemplate.create({
          data: {
            id: targetId,
            userId: user.id,
            name: String(payload.name ?? "Restored workout"),
            description: payload.description ?? null,
            dayOfWeek: payload.dayOfWeek ?? null,
            muscleGroups: payload.muscleGroups ?? null,
            difficulty: payload.difficulty ?? null,
            warmupJson: payload.warmupJson ?? null,
            stretchesJson: payload.stretchesJson ?? null,
            exercises: {
              create: Array.isArray(payload.exercises)
                ? payload.exercises.map((row: any) => ({
                    exerciseId: String(row.exerciseId),
                    sets: Math.round(Number(row.sets ?? 3)),
                    reps: String(row.reps ?? "8-12"),
                    restSeconds: Math.round(Number(row.restSeconds ?? 90)),
                    orderIndex: Math.round(Number(row.orderIndex ?? 0)),
                  }))
                : [],
            },
          },
        });
        undone = true;
      }
    } else if (targetType === "dietPlan") {
      undone = await deleteOwnedRecord(prisma.dietPlan, user.id, targetId);
    } else if (targetType === "exercise") {
      const result = await prisma.exercise.deleteMany({
        where: { id: targetId, status: "pending", submittedById: user.id },
      });
      undone = result.count > 0;
    }

    if (!undone) return undoError("Nothing was undone. It may have already changed.", 409);

    await markAgentUndoActionUsed(user.id, undoId);
    return NextResponse.json({ ok: true, message: "Action undone" });
  } catch (error: any) {
    console.error("Agent undo failed", error);
    return undoError(error?.message ?? "Undo failed", 500);
  }
}
