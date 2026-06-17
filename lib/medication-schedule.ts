export function atDateTime(timeOfDay: string, baseDate = new Date()) {
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  const next = new Date(baseDate);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  return next;
}

export function isMedicationDueOn(med: any, date = new Date()) {
  if (!med?.active) return false;
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  if (med.startDate) {
    const start = new Date(med.startDate);
    start.setHours(0, 0, 0, 0);
    if (target < start) return false;
  }

  if (med.endDate) {
    const end = new Date(med.endDate);
    end.setHours(23, 59, 59, 999);
    if (target > end) return false;
  }

  if (med.recurrence === "weekly") {
    const weekday = target.toLocaleDateString("en-US", { weekday: "long" });
    const allowed = String(med.daysOfWeek ?? "")
      .split(",")
      .map((item: string) => item.trim())
      .filter(Boolean);
    return allowed.length === 0 || allowed.includes(weekday);
  }

  if (med.recurrence === "monthly") {
    return !med.dayOfMonth || target.getDate() === med.dayOfMonth;
  }

  return true;
}
