const configuredDefaultTimeZone =
  typeof process !== "undefined"
    ? process.env?.NEXT_PUBLIC_APP_TIME_ZONE || process.env?.APP_TIME_ZONE || null
    : null;

export const DEFAULT_TIME_ZONE = configuredDefaultTimeZone || "Asia/Kolkata";

function getTimeZoneOffsetMs(date: Date, timeZone?: string | null) {
  const zone = normalizeTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const zonedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return zonedAsUtc - date.getTime();
}

function zonedDateTimeToDate(dateValue: string, timeValue?: string | null, timeZone?: string | null) {
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) return null;
  const [hours = 9, minutes = 0] = String(timeValue || "09:00").split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hours || 0, minutes || 0, 0, 0));
  return new Date(utcGuess.getTime() - getTimeZoneOffsetMs(utcGuess, timeZone));
}

export function formatLocalDateInput(date: Date, timeZone: string | null = DEFAULT_TIME_ZONE) {
  if (Number.isNaN(date.getTime())) return "";
  return getZonedDateParts(date, timeZone).dateKey;
}

export function dateInputToLocalDate(value?: string | null, timeZone: string | null = DEFAULT_TIME_ZONE) {
  if (!value) return null;
  return zonedDateTimeToDate(value, "00:00", timeZone);
}

export function dateTimeInputToIso(dateValue: string, timeValue?: string | null, timeZone: string | null = DEFAULT_TIME_ZONE) {
  const date = zonedDateTimeToDate(dateValue, timeValue, timeZone);
  if (!date) return "";
  return date.toISOString();
}

export function getClientTimeZone() {
  return DEFAULT_TIME_ZONE;
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
  return formatLocalDateInput(date);
}

export function formatAppDate(value?: Date | string | null, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { timeZone: DEFAULT_TIME_ZONE, ...options }).format(date);
}

export function formatAppTime(value?: Date | string | null, options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { timeZone: DEFAULT_TIME_ZONE, ...options }).format(date);
}

export function formatAppDateTime(value?: Date | string | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: DEFAULT_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
