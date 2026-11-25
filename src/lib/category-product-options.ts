import type { ProductUnit } from "@/lib/product-units";

type CategoryLike = {
  slug?: string;
  name?: { en?: string; bn?: string };
};

export type CategoryProductPreset = {
  unit: ProductUnit;
  options: string[];
};

const clothingOptions = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const shoeOptions = ["38", "39", "40", "41", "42", "43", "44"];

export function categoryProductPreset(category?: CategoryLike): CategoryProductPreset | undefined {
  const categoryText = `${category?.slug ?? ""} ${category?.name?.en ?? ""} ${category?.name?.bn ?? ""}`
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  if (/(perfume|attar|fragrance|পারফিউম|আতর)/.test(categoryText)) {
    return { unit: "ml", options: [] };
  }

  if (/(shoe|footwear|sneaker|sandal|জুতা|পাদুকা)/.test(categoryText)) {
    return { unit: "pair", options: shoeOptions };
  }

  if (/(cloth|clothing|apparel|garment|fashion|shirt|t shirt|pant|trouser|dress|saree|sari|sharee|kurti|panjabi|পোশাক|জামা|শার্ট|শাড়ি|কাপড়)/.test(categoryText)) {
    return { unit: "piece", options: clothingOptions };
  }

  if (/(oil|tel|cooking oil|তেল)/.test(categoryText)) {
    return { unit: "liter", options: [] };
  }

  if (/(liquid|beverage|drink|juice|milk|water|shampoo|detergent|dishwash|cleaning|lotion|তরল|পানীয়|জুস|দুধ|শ্যাম্পু|লোশন)/.test(categoryText)) {
    return { unit: "ml", options: [] };
  }

  if (/(cosmetic|beauty|makeup|skincare|cream|lipstick|প্রসাধনী|বিউটি|কসমেটিক)/.test(categoryText)) {
    return { unit: "piece", options: [] };
  }

  if (/(grocery|grocer|food|rice|flour|sugar|dal|lentil|spice|masala|salt|tea|মুদি|খাবার|চাল|আটা|চিনি|ডাল|মসলা|লবণ|চা)/.test(categoryText)) {
    return { unit: "kg", options: [] };
  }

  if (/(fruit|vegetable|produce|fish|meat|potato|onion|ফল|সবজি|মাছ|মাংস|আলু|পেঁয়াজ)/.test(categoryText)) {
    return { unit: "kg", options: [] };
  }

  if (/(gram|গ্রাম)/.test(categoryText)) {
    return { unit: "gram", options: [] };
  }

  if (/(fabric|cloth roll|meter|yardage|কাপড় রোল|মিটার)/.test(categoryText)) {
    return { unit: "meter", options: [] };
  }

  if (/(packet|snack|biscuit|noodle|প্যাকেট|বিস্কুট)/.test(categoryText)) {
    return { unit: "packet", options: [] };
  }

  if (/(box|gift box|বক্স)/.test(categoryText)) {
    return { unit: "box", options: [] };
  }

  if (/(dozen|egg|ডজন|ডিম)/.test(categoryText)) {
    return { unit: "dozen", options: [] };
  }

  return undefined;
}