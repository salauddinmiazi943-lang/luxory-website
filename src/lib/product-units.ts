export const productUnits = [
  "kg",
  "gram",
  "ml",
  "liter",
  "piece",
  "meter",
  "size",
  "packet",
  "box",
  "dozen",
  "g",
  "pair",
  "yard",
  "haat",
] as const;

export type ProductUnit = typeof productUnits[number];

const decimalUnits = new Set<ProductUnit>(["kg","gram","ml","liter","meter","g","yard","haat"]);

export const productUnitLabels: Record<ProductUnit, { en: string; bn: string }> = {
  kg: { en: "kg", bn: "কেজি" },
  gram: { en: "gram", bn: "গ্রাম" },
  ml: { en: "ml", bn: "মিলি" },
  liter: { en: "liter", bn: "লিটার" },
  piece: { en: "piece", bn: "টি" },
  meter: { en: "meter", bn: "মিটার" },
  size: { en: "size", bn: "সাইজ" },
  packet: { en: "packet", bn: "প্যাকেট" },
  box: { en: "box", bn: "বক্স" },
  dozen: { en: "dozen", bn: "ডজন" },
  g: { en: "gram", bn: "গ্রাম" },
  pair: { en: "pair", bn: "জোড়া" },
  yard: { en: "yard", bn: "গজ" },
  haat: { en: "haat", bn: "হাত" },
};

export function normalizeUnit(unit: string | undefined): ProductUnit {
  if (!unit) return "piece";
  const value = unit.trim().toLowerCase();
  if (Object.hasOwn(productUnitLabels, value)) return value as ProductUnit;
  if (value === "l") return "liter";
  return "piece";
}

export function unitLabel(unit: string | undefined, locale: "en" | "bn" = "en") {
  return productUnitLabels[normalizeUnit(unit)][locale];
}

export function isDecimalUnit(unit: string | undefined) {
  return decimalUnits.has(normalizeUnit(unit));
}

export function quantityStep(unit: string | undefined) {
  return isDecimalUnit(unit) ? 0.01 : 1;
}

export function isValidQuantity(unit: string | undefined, quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000) return false;
  if (!isDecimalUnit(unit)) return Number.isInteger(quantity);
  return Math.abs(quantity * 100 - Math.round(quantity * 100)) < 1e-8;
}

export function normalizeQuantity(unit: string | undefined, quantity: number) {
  return isDecimalUnit(unit) ? Math.round(quantity * 100) / 100 : Math.round(quantity);
}
