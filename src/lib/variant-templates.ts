export const VARIANT_TEMPLATE_KEYS = [
  "saree_free_size",
  "clothing_numeric_and_alpha",
  "unstitched_or_size",
  "footwear_size",
  "electronics_inch",
  "standard_default",
] as const;

export type VariantTemplateKey = (typeof VARIANT_TEMPLATE_KEYS)[number];

export type VariantTemplate = {
  key: VariantTemplateKey;
  label: string;
  presets: string[];
};

export const VARIANT_TEMPLATES: Record<VariantTemplateKey, VariantTemplate> = {
  saree_free_size: { key: "saree_free_size", label: "Option / Length", presets: ["Free Size (12 Hat)", "With Blouse Piece", "Without Blouse Piece"] },
  clothing_numeric_and_alpha: { key: "clothing_numeric_and_alpha", label: "Size", presets: ["38", "40", "42", "44", "46", "S", "M", "L", "XL", "XXL"] },
  unstitched_or_size: { key: "unstitched_or_size", label: "Stitching / Size", presets: ["Unstitched", "36", "38", "40", "42", "44"] },
  footwear_size: { key: "footwear_size", label: "Shoe Size", presets: ["36", "37", "38", "39", "40", "41", "42", "43", "44"] },
  electronics_inch: { key: "electronics_inch", label: "Size / Specification", presets: ["16 Inch", "24 Inch", "36 Inch", "48 Inch", "56 Inch"] },
  standard_default: { key: "standard_default", label: "Variant / Option", presets: ["Standard"] },
};

const templateRules: { key: VariantTemplateKey; pattern: RegExp }[] = [
  { key: "saree_free_size", pattern: /(saree|sari|sharee|shari|katan|jamdani|শাড়ি|শাড়ি|কাতান|জামদানি)/i },
  { key: "unstitched_or_size", pattern: /(three[\s-]*piece|3[\s-]*piece|salwar|kameez|থ্রি[\s-]*পিস|কামিজ)/i },
  { key: "clothing_numeric_and_alpha", pattern: /(^|[^a-z])(men|mens|man|gents)([^a-z]|$)|panjabi|punjabi|shirt|t[\s-]*shirt|polo|clothing|fashion|পাঞ্জাবি|শার্ট|পোশাক/i },
  { key: "footwear_size", pattern: /(shoe|shoes|footwear|sandal|sneaker|জুতা|স্যান্ডেল|স্যান্ডল)/i },
  { key: "electronics_inch", pattern: /(^|[^a-z])(fan|fans|tv|television|monitor)([^a-z]|$)|electronics|ফ্যান|টেলিভিশন|মনিটর/i },
];

export function isVariantTemplateKey(value: unknown): value is VariantTemplateKey {
  return typeof value === "string" && (VARIANT_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export function variantTemplateForKey(key?: string | null): VariantTemplate {
  return isVariantTemplateKey(key) ? VARIANT_TEMPLATES[key] : VARIANT_TEMPLATES.standard_default;
}

export function detectVariantTemplate(...texts: (string | undefined | null)[]): VariantTemplateKey {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  for (const rule of templateRules) if (rule.pattern.test(haystack)) return rule.key;
  return "standard_default";
}

export function resolveVariantTemplate(input: {
  categoryTemplate?: string | null;
  categoryName?: string | null;
  parentCategoryName?: string | null;
  productName?: string | null;
}): { template: VariantTemplate; detected: boolean } {
  if (isVariantTemplateKey(input.categoryTemplate)) return { template: VARIANT_TEMPLATES[input.categoryTemplate], detected: false };
  const key = detectVariantTemplate(input.categoryName, input.parentCategoryName, input.productName);
  return { template: VARIANT_TEMPLATES[key], detected: true };
}
