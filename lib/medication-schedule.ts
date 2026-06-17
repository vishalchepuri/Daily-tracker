import { dateOnlyKey, getZonedDateParts, parseTimeOfDayToMinutes } from "@/lib/local-dates";

export function atDateTime(timeOfDay: string, baseDate = new Date()) {
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  const next = new Date(baseDate);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  return next;
}

const weekdayAliases: Record<string, string[]> = {
  Sun: ["Sun", "Sunday"],
  Mon: ["Mon", "Monday"],
  Tue: ["Tue", "Tuesday"],
  Wed: ["Wed", "Wednesday"],
  Thu: ["Thu", "Thursday"],
  Fri: ["Fri", "Friday"],
  Sat: ["Sat", "Saturday"],
};

function weekdayMatches(savedDays: string | null | undefined, weekday: string) {
  const allowed = String(savedDays ?? "")
    .split(",")
    .map((item: string) => item.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  const aliases = weekdayAliases[weekday] ?? [weekday];
  return allowed.some((day) => aliases.includes(day));
}

export function isMedicationDueOn(med: any, date = new Date(), timeZone?: string | null) {
  if (!med?.active) return false;
  const zoned = getZonedDateParts(date, timeZone);
  const targetKey = zoned.dateKey;

  if (med.startDate) {
    const startKey = dateOnlyKey(med.startDate);
    if (startKey && targetKey < startKey) return false;
  }

  if (med.endDate) {
    const endKey = dateOnlyKey(med.endDate);
    if (endKey && targetKey > endKey) return false;
  }

  if (med.recurrence === "weekly") {
    return weekdayMatches(med.daysOfWeek, zoned.weekday);
  }

  if (med.recurrence === "monthly") {
    return !med.dayOfMonth || Number(zoned.day) === med.dayOfMonth;
  }

  return true;
}

export function isMedicationTimeDueNow(med: any, date = new Date(), timeZone?: string | null) {
  return parseTimeOfDayToMinutes(med?.timeOfDay) <= getZonedDateParts(date, timeZone).minuteOfDay;
}
