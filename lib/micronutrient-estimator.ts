import { parseMicronutrientMap, type MicronutrientAmountMap } from "@/lib/micronutrients";

type FoodMicronutrientProfile = {
  aliases: string[];
  grams: number;
  micronutrients: MicronutrientAmountMap;
};

const FOOD_PROFILES: FoodMicronutrientProfile[] = [
  { aliases: ["orange", "mosambi", "sweet lime"], grams: 100, micronutrients: { vitaminC: 53, potassium: 181, folate: 30, calcium: 40 } },
  { aliases: ["banana"], grams: 100, micronutrients: { vitaminC: 9, potassium: 358, magnesium: 27, vitaminB12: 0 } },
  { aliases: ["mango"], grams: 100, micronutrients: { vitaminC: 36, vitaminA: 54, folate: 43, potassium: 168, vitaminE: 0.9 } },
  { aliases: ["apple"], grams: 100, micronutrients: { vitaminC: 5, potassium: 107, vitaminK: 2.2 } },
  { aliases: ["egg", "eggs", "boiled egg"], grams: 100, micronutrients: { vitaminD: 2, vitaminB12: 1.1, vitaminA: 160, iron: 1.8, zinc: 1.3 } },
  { aliases: ["milk", "curd", "yogurt", "greek yogurt", "paneer"], grams: 100, micronutrients: { calcium: 120, vitaminB12: 0.5, potassium: 155, magnesium: 11 } },
  { aliases: ["chicken", "chicken breast"], grams: 100, micronutrients: { vitaminB12: 0.3, magnesium: 29, potassium: 256, zinc: 1 } },
  { aliases: ["fish", "salmon", "tuna", "sardine"], grams: 100, micronutrients: { vitaminD: 10, vitaminB12: 3, potassium: 360, magnesium: 30, zinc: 0.6 } },
  { aliases: ["dal", "lentil", "lentils", "moong dal", "toor dal", "chana dal"], grams: 100, micronutrients: { folate: 180, iron: 3.3, magnesium: 36, potassium: 369, zinc: 1.3 } },
  { aliases: ["chickpea", "chickpeas", "chana", "rajma", "beans"], grams: 100, micronutrients: { folate: 170, iron: 2.9, magnesium: 48, potassium: 290, zinc: 1.5 } },
  { aliases: ["spinach", "palak", "greens"], grams: 100, micronutrients: { vitaminK: 483, vitaminA: 469, folate: 194, iron: 2.7, magnesium: 79, vitaminC: 28 } },
  { aliases: ["carrot"], grams: 100, micronutrients: { vitaminA: 835, vitaminK: 13, potassium: 320, vitaminC: 6 } },
  { aliases: ["tomato"], grams: 100, micronutrients: { vitaminC: 14, vitaminA: 42, potassium: 237, vitaminK: 8 } },
  { aliases: ["almond", "almonds", "nuts"], grams: 100, micronutrients: { vitaminE: 25.6, magnesium: 268, calcium: 269, zinc: 3.1, iron: 3.7 } },
  { aliases: ["peanut", "peanuts"], grams: 100, micronutrients: { vitaminE: 8.3, magnesium: 168, zinc: 3.3, folate: 240, iron: 4.6 } },
  { aliases: ["oats", "oatmeal"], grams: 100, micronutrients: { magnesium: 177, iron: 4.7, zinc: 4, folate: 56, calcium: 54 } },
  { aliases: ["rice", "brown rice", "white rice"], grams: 100, micronutrients: { magnesium: 43, potassium: 86, iron: 0.6 } },
  { aliases: ["roti", "chapati", "wheat", "whole wheat"], grams: 100, micronutrients: { magnesium: 82, iron: 3.6, zinc: 2.6, folate: 44 } },
  { aliases: ["sweet potato"], grams: 100, micronutrients: { vitaminA: 709, vitaminC: 2.4, potassium: 337, magnesium: 25 } },
];

function inferServingGrams(servingSize?: string | null) {
  const text = String(servingSize ?? "").toLowerCase();
  const gramMatch = text.match(/(\d+(?:\.\d+)?)\s*g\b/);
  if (gramMatch) return Number(gramMatch[1]);
  const kgMatch = text.match(/(\d+(?:\.\d+)?)\s*kg\b/);
  if (kgMatch) return Number(kgMatch[1]) * 1000;
  const mlMatch = text.match(/(\d+(?:\.\d+)?)\s*ml\b/);
  if (mlMatch) return Number(mlMatch[1]);
  return 100;
}

export function estimateMicronutrientsForFood(foodName?: string | null, servingSize?: string | null): MicronutrientAmountMap {
  const text = String(foodName ?? "").toLowerCase();
  if (!text.trim()) return {};
  const profile = FOOD_PROFILES.find((item) => item.aliases.some((alias) => text.includes(alias)));
  if (!profile) return {};
  const multiplier = inferServingGrams(servingSize) / profile.grams;
  return parseMicronutrientMap(
    Object.fromEntries(
      Object.entries(profile.micronutrients).map(([key, value]) => [key, Math.round(Number(value) * multiplier * 10) / 10])
    )
  );
}
