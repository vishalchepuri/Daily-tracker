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

export const MICRONUTRIENTS: Array<{ key: MicronutrientKey; label: string; unit: string; target: number }> = [
  { key: "vitaminC", label: "Vitamin C", unit: "mg", target: 90 },
  { key: "vitaminD", label: "Vitamin D", unit: "mcg", target: 15 },
  { key: "vitaminB12", label: "Vitamin B12", unit: "mcg", target: 2.4 },
  { key: "iron", label: "Iron", unit: "mg", target: 18 },
  { key: "magnesium", label: "Magnesium", unit: "mg", target: 400 },
  { key: "calcium", label: "Calcium", unit: "mg", target: 1000 },
  { key: "potassium", label: "Potassium", unit: "mg", target: 3400 },
  { key: "zinc", label: "Zinc", unit: "mg", target: 11 },
  { key: "folate", label: "Folate", unit: "mcg", target: 400 },
  { key: "vitaminA", label: "Vitamin A", unit: "mcg", target: 900 },
  { key: "vitaminE", label: "Vitamin E", unit: "mg", target: 15 },
  { key: "vitaminK", label: "Vitamin K", unit: "mcg", target: 120 },
];

const allowedKeys = new Set(MICRONUTRIENTS.map((item) => item.key));

export function defaultMicronutrientTargets(): MicronutrientAmountMap {
  return Object.fromEntries(MICRONUTRIENTS.map((item) => [item.key, item.target])) as MicronutrientAmountMap;
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

export function mergeWithDefaultMicronutrientTargets(value: unknown): MicronutrientAmountMap {
  return { ...defaultMicronutrientTargets(), ...parseMicronutrientMap(value) };
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
