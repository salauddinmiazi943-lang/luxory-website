import type { ProductUnit } from "@/lib/product-units";

type CategoryLike = {
  slug?: string;
  name?: { en?: string; bn?: string };
};

export type CategoryProductPreset = {
  unit: ProductUnit;
  options: string[];
};

const weightOptions = [
  "250 Gram",
  "500 Gram",
  "1 Kilogram",
  "1.5 Kilograms",
  "2 Kilograms",
  "5 Kilograms",
];

const clothingOptions = [
  "XS (Extra Small)",
  "S (Small)",
  "M (Medium)",
  "L (Large)",
  "XL (Extra Large)",
  "XXL (Double Extra Large)",
  "XXXL (Triple Extra Large)",
];

const liquidOptions = [
  "100 ml",
  "250 ml",
  "500 ml",
  "1 Liter",
  "2 Liters",
];

export function categoryProductPreset(category?: CategoryLike): CategoryProductPreset | undefined {
  const categoryText = `${category?.slug ?? ""} ${category?.name?.en ?? ""} ${category?.name?.bn ?? ""}`
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  if (/(perfume|attar|পারফিউম|আতর)/.test(categoryText)) {
    return { unit: "piece", options: ["20 ml", "30 ml", "50 ml", "100 ml", "200 ml"] };
  }

  if (/(shoe|footwear|জুতা|পাদুকা)/.test(categoryText)) {
    return { unit: "pair", options: ["38", "39", "40", "41", "42", "43", "44"] };
  }

  if (/(clothing|clothes|apparel|garment|fashion|shirt|t shirt|trouser|pants|পোশাক|জামা|শার্ট)/.test(categoryText)) {
    return { unit: "piece", options: clothingOptions };
  }

  if (/(liquid|beverage|drink|juice|milk|shampoo|detergent|dishwash|cleaning|cosmetic|oil|\btel\b|তরল|পানীয়|জুস|দুধ|শ্যাম্পু|তেল|প্রসাধনী)/.test(categoryText)) {
    return { unit: "piece", options: liquidOptions };
  }

  if (/(grocery|groceries|food|fruit|vegetable|produce|fish|meat|rice|grain|flour|sugar|potato|onion|মুদি|খাবার|ফল|সবজি|মাছ|মাংস|চাল|আটা|চিনি|আলু|পেঁয়াজ)/.test(categoryText)) {
    return { unit: "piece", options: weightOptions };
  }

  return undefined;
}
