export type MicronutrientKey =
  | "vitaminC"
  | "vitaminD"
  | "vitaminB12"
  | "iron"
  | "magnesium"
  | "calcium"
  | "potassium"
  | "zinc"
  | "folate"
  | "vitaminA"
  | "vitaminE"
  | "vitaminK";

export type MicronutrientAmountMap = Partial<Record<MicronutrientKey, number>>;
export type MicronutrientCadence = "daily_focus" | "weekly_average";
export type MicronutrientProfile = {
  age?: number | null;
  gender?: string | null;
  weight?: number | null;
};

export const MICRONUTRIENTS: Array<{ key: MicronutrientKey; label: string; unit: string; target: number; cadence: MicronutrientCadence }> = [
  { key: "vitaminC", label: "Vitamin C", unit: "mg", target: 90, cadence: "weekly_average" },
  { key: "vitaminD", label: "Vitamin D", unit: "mcg", target: 15, cadence: "daily_focus" },
  { key: "vitaminB12", label: "Vitamin B12", unit: "mcg", target: 2.4, cadence: "daily_focus" },
  { key: "iron", label: "Iron", unit: "mg", target: 18, cadence: "daily_focus" },
  { key: "magnesium", label: "Magnesium", unit: "mg", target: 400, cadence: "daily_focus" },
  { key: "calcium", label: "Calcium", unit: "mg", target: 1000, cadence: "daily_focus" },
  { key: "potassium", label: "Potassium", unit: "mg", target: 3400, cadence: "daily_focus" },
  { key: "zinc", label: "Zinc", unit: "mg", target: 11, cadence: "weekly_average" },
  { key: "folate", label: "Folate", unit: "mcg", target: 400, cadence: "weekly_average" },
  { key: "vitaminA", label: "Vitamin A", unit: "mcg", target: 900, cadence: "weekly_average" },
  { key: "vitaminE", label: "Vitamin E", unit: "mg", target: 15, cadence: "weekly_average" },
  { key: "vitaminK", label: "Vitamin K", unit: "mcg", target: 120, cadence: "weekly_average" },
];

const allowedKeys = new Set(MICRONUTRIENTS.map((item) => item.key));

function normalizedGender(profile?: MicronutrientProfile | null) {
  const gender = String(profile?.gender ?? "").toLowerCase();
  return gender === "female" || gender === "male" ? gender : "unknown";
}

function normalizedAge(profile?: MicronutrientProfile | null) {
  const age = Number(profile?.age);
  return Number.isFinite(age) && age > 0 ? age : null;
}

export function defaultMicronutrientTargets(profile?: MicronutrientProfile | null): MicronutrientAmountMap {
  const age = normalizedAge(profile);
  const gender = normalizedGender(profile);
  const female = gender === "female";
  const male = gender === "male";

  return {
    vitaminC: female ? 75 : 90,
    vitaminD: age != null && age >= 71 ? 20 : 15,
    vitaminB12: 2.4,
    iron: female && (age == null || age <= 50) ? 18 : 8,
    magnesium: female ? (age != null && age <= 30 ? 310 : 320) : male ? (age != null && age >= 31 ? 420 : 400) : 400,
    calcium: (female && age != null && age >= 51) || (age != null && age >= 71) ? 1200 : 1000,
    potassium: female ? 2600 : male ? 3400 : 3000,
    zinc: female ? 8 : 11,
    folate: 400,
    vitaminA: female ? 700 : 900,
    vitaminE: 15,
    vitaminK: female ? 90 : 120,
  };
}

export function parseMicronutrientMap(value: unknown): MicronutrientAmountMap {
  if (!value) return {};
  const source = typeof value === "string" ? safeJson(value) : value;
  if (!source || typeof source !== "object") return {};
  const result: MicronutrientAmountMap = {};
  for (const [key, raw] of Object.entries(source as Record<string, unknown>)) {
    if (!allowedKeys.has(key as MicronutrientKey)) continue;
    const amount = Number(raw);
    if (Number.isFinite(amount) && amount >= 0) result[key as MicronutrientKey] = amount;
  }
  return result;
}

export function mergeWithDefaultMicronutrientTargets(value: unknown, profile?: MicronutrientProfile | null): MicronutrientAmountMap {
  const personalizedDefaults = defaultMicronutrientTargets(profile);
  const genericDefaults = Object.fromEntries(MICRONUTRIENTS.map((item) => [item.key, item.target])) as MicronutrientAmountMap;
  const savedTargets = parseMicronutrientMap(value);
  const normalizedSavedTargets: MicronutrientAmountMap = {};
  for (const [key, amount] of Object.entries(savedTargets)) {
    const typedKey = key as MicronutrientKey;
    const wasGenericDefault = amount === genericDefaults[typedKey];
    normalizedSavedTargets[typedKey] = wasGenericDefault ? personalizedDefaults[typedKey] : amount;
  }
  return { ...personalizedDefaults, ...normalizedSavedTargets };
}

export function sumMicronutrients(items: Array<MicronutrientAmountMap | null | undefined>): MicronutrientAmountMap {
  const totals: MicronutrientAmountMap = {};
  for (const item of items) {
    for (const [key, amount] of Object.entries(parseMicronutrientMap(item))) {
      totals[key as MicronutrientKey] = (totals[key as MicronutrientKey] ?? 0) + amount;
    }
  }
  return totals;
}

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
