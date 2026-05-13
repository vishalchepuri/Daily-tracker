export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import AdmZip from "adm-zip";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

type RecordAttrs = Record<string, string>;
const MAX_APPLE_HEALTH_UPLOAD_BYTES = 200 * 1024 * 1024;

const metricTypes: Record<string, string> = {
  HKQuantityTypeIdentifierStepCount: "steps",
  HKQuantityTypeIdentifierActiveEnergyBurned: "active_energy",
  HKQuantityTypeIdentifierBasalEnergyBurned: "basal_energy",
  HKQuantityTypeIdentifierDistanceWalkingRunning: "walking_running_distance",
  HKQuantityTypeIdentifierHeartRate: "heart_rate",
  HKQuantityTypeIdentifierRestingHeartRate: "resting_heart_rate",
  HKQuantityTypeIdentifierAppleExerciseTime: "exercise_minutes",
  HKQuantityTypeIdentifierFlightsClimbed: "flights_climbed",
  HKQuantityTypeIdentifierVO2Max: "vo2_max",
  HKQuantityTypeIdentifierBodyMass: "body_weight",
};

function attrsFromTag(tag: string) {
  const attrs: RecordAttrs = {};
  for (const match of tag.matchAll(/(\w+)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function normalizeDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeValue(value?: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function minutesBetween(startDate: Date, endDate: Date) {
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
}

function activityLabel(value?: string) {
  return (value ?? "Apple Health Workout")
    .replace(/^HKWorkoutActivityType/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim() || "Apple Health Workout";
}

async function getExportXml(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith(".zip") || file.type.includes("zip")) {
    const zip = new AdmZip(bytes);
    const entry = zip
      .getEntries()
      .find((item) => item.entryName.toLowerCase().endsWith("export.xml"));

    if (!entry) {
      throw new Error("No export.xml file was found inside the Apple Health ZIP.");
    }

    return entry.getData().toString("utf8");
  }

  return bytes.toString("utf8");
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = (session.user as any)?.id;
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Apple Health export file required" }, { status: 400 });
    }
    if (file.size > MAX_APPLE_HEALTH_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error:
            "This Apple Health export is too large for the current in-app importer. Use a smaller export.xml or add the planned streaming importer before uploading the full archive.",
        },
        { status: 413 }
      );
    }

    const xml = await getExportXml(file);
    if (!xml.includes("<HealthData")) {
      return NextResponse.json({ error: "This does not look like an Apple Health export." }, { status: 400 });
    }

    const metricRows = [];
    const bodyWeights = [];
    let recordsRead = 0;
    let unsupportedRecords = 0;

    for (const match of xml.matchAll(/<Record\b[^>]*\/>/g)) {
      recordsRead += 1;
      const attrs = attrsFromTag(match[0]);
      const type = metricTypes[attrs.type];
      const value = normalizeValue(attrs.value);
      const startDate = normalizeDate(attrs.startDate);
      if (!type || value == null || !startDate) {
        unsupportedRecords += 1;
        continue;
      }

      const endDate = normalizeDate(attrs.endDate);
      const externalId = `${attrs.type}:${attrs.sourceName ?? ""}:${attrs.startDate}:${attrs.endDate ?? ""}:${attrs.value}`;
      metricRows.push({
        userId,
        type,
        value,
        unit: attrs.unit,
        source: attrs.sourceName,
        startDate,
        endDate,
        externalId,
      });

      if (type === "body_weight") {
        bodyWeights.push({ date: startDate, weight: attrs.unit === "lb" ? value * 0.45359237 : value });
      }
    }

    for (const match of xml.matchAll(/<Category\b[^>]*\/>/g)) {
      const attrs = attrsFromTag(match[0]);
      if (attrs.type !== "HKCategoryTypeIdentifierSleepAnalysis") {
        unsupportedRecords += 1;
        continue;
      }

      recordsRead += 1;
      const startDate = normalizeDate(attrs.startDate);
      const endDate = normalizeDate(attrs.endDate);
      if (!startDate || !endDate) {
        unsupportedRecords += 1;
        continue;
      }

      const sleepState = attrs.value?.replace(/^HKCategoryValueSleepAnalysis/, "") || "Sleep";
      const externalId = `${attrs.type}:${attrs.sourceName ?? ""}:${attrs.startDate}:${attrs.endDate ?? ""}:${attrs.value}`;
      metricRows.push({
        userId,
        type: "sleep_minutes",
        value: minutesBetween(startDate, endDate),
        unit: "min",
        source: attrs.sourceName ? `${attrs.sourceName} ${sleepState}` : sleepState,
        startDate,
        endDate,
        externalId,
      });
    }

    let workoutsImported = 0;
    for (const match of xml.matchAll(/<Workout\b[^>]*>/g)) {
      const attrs = attrsFromTag(match[0]);
      const startDate = normalizeDate(attrs.startDate);
      if (!startDate) continue;

      const duration = normalizeValue(attrs.duration);
      const durationMinutes = attrs.durationUnit === "s" && duration ? duration / 60 : duration;
      const energy = normalizeValue(attrs.totalEnergyBurned);
      const distance = normalizeValue(attrs.totalDistance);
      const notes = [
        `Imported from Apple Health${attrs.sourceName ? ` (${attrs.sourceName})` : ""}.`,
        energy ? `Energy: ${energy} ${attrs.totalEnergyBurnedUnit ?? "kcal"}.` : "",
        distance ? `Distance: ${distance} ${attrs.totalDistanceUnit ?? ""}.` : "",
      ]
        .filter(Boolean)
        .join(" ");

      const existing = await prisma.workoutLog.findFirst({
        where: {
          userId,
          date: startDate,
          templateName: activityLabel(attrs.workoutActivityType),
        },
      });
      if (existing) continue;

      await prisma.workoutLog.create({
        data: {
          userId,
          date: startDate,
          templateName: activityLabel(attrs.workoutActivityType),
          duration: durationMinutes ? Math.round(durationMinutes) : null,
          notes,
        },
      });
      workoutsImported += 1;
    }

    let metricsImported = 0;
    for (const row of metricRows) {
      const existing = await prisma.healthMetric.findUnique({
        where: { userId_externalId: { userId, externalId: row.externalId } },
      });
      if (existing) continue;

      await prisma.healthMetric.create({ data: row });
      metricsImported += 1;
    }

    let progressImported = 0;
    for (const item of bodyWeights) {
      const dayStart = new Date(item.date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(item.date);
      dayEnd.setHours(23, 59, 59, 999);
      const existing = await prisma.progressEntry.findFirst({
        where: { userId, date: { gte: dayStart, lte: dayEnd }, weight: item.weight },
      });
      if (existing) continue;

      await prisma.progressEntry.create({
        data: {
          userId,
          date: item.date,
          weight: item.weight,
          notes: "Imported from Apple Health.",
        },
      });
      progressImported += 1;
    }

    return NextResponse.json({
      summary: {
        recordsRead,
        metricsImported,
        workoutsImported,
        progressImported,
        unsupportedRecords,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Import failed" }, { status: 500 });
  }
}
