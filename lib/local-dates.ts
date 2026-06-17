const configuredDefaultTimeZone =
  typeof process !== "undefined" && process.env?.APP_TIME_ZONE
    ? process.env.APP_TIME_ZONE
    : null;

export const DEFAULT_TIME_ZONE = configuredDefaultTimeZone || "Asia/Kolkata";

export function formatLocalDateInput(date: Date) {
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateInputToLocalDate(value?: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function dateTimeInputToIso(dateValue: string, timeValue?: string | null) {
  const date = dateInputToLocalDate(dateValue);
  if (!date) return "";
  const [hours = 9, minutes = 0] = String(timeValue || "09:00").split(":").map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date.toISOString();
}

export function getClientTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function normalizeTimeZone(value?: string | null) {
  const timeZone = String(value || DEFAULT_TIME_ZONE).trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function getZonedDateParts(date: Date, timeZone?: string | null) {
  const zone = normalizeTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    timeZone: zone,
    year: parts.year,
    month: parts.month,
    day: parts.day,
    weekday: parts.weekday,
    hour: parts.hour,
    minute: parts.minute,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function parseTimeOfDayToMinutes(timeOfDay?: string | null) {
  const [hours = 0, minutes = 0] = String(timeOfDay || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function dateOnlyKey(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
