export const productUnits = [
  "piece",
  "pair",
  "kg",
  "g",
  "ml",
  "liter",
  "yard",
  "haat",
] as const;

export type ProductUnit = typeof productUnits[number];

export const productUnitLabels: Record<ProductUnit, { en: string; bn: string }> = {
  piece: { en: "piece", bn: "টি" },
  pair: { en: "pair", bn: "জোড়া" },
  kg: { en: "kg", bn: "কেজি" },
  g: { en: "g", bn: "গ্রাম" },
  ml: { en: "ml", bn: "মিলি" },
  liter: { en: "liter", bn: "লিটার" },
  yard: { en: "yard", bn: "গজ" },
  haat: { en: "haat", bn: "হাত" },
};

export function unitLabel(unit: string | undefined, locale: "en" | "bn" = "en") {
  if (!unit || !Object.hasOwn(productUnitLabels, unit)) return productUnitLabels.piece[locale];
  return productUnitLabels[unit as ProductUnit][locale];
}

export function quantityStep(unit: string | undefined) {
  return unit === "piece" || unit === "pair" ? 1 : 0.01;
}

export function isValidQuantity(unit: string | undefined, quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000) return false;
  if (quantityStep(unit) === 1) return Number.isInteger(quantity);
  return Math.abs(quantity * 100 - Math.round(quantity * 100)) < 1e-8;
}

export function normalizeQuantity(unit: string | undefined, quantity: number) {
  return quantityStep(unit) === 1 ? Math.round(quantity) : Math.round(quantity * 100) / 100;
}
