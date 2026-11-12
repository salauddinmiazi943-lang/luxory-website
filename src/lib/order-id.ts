import mongoose from "mongoose";

// অর্ডার খুঁজে বের করার কমন হেল্পার। পূর্ণ ২৪-অক্ষরের ObjectId অথবা শর্ট কোড
// (যেমন #C8EC8BBA বা C8EC8BBA) — উভয় দিয়েই কাজ করবে।
// _id ফিল্ডে ObjectId সেভ করা থাকে, তাই শর্ট কোডের ক্ষেত্রে $expr + $regexMatch
// ব্যবহার করে $toString("$id") এর সাথে ম্যাচ করা হয়।
export function orderIdFilter(id: string): Record<string, unknown> | null {
  const raw = String(id).replace(/^#\s*/, "").trim();
  if (!raw) return null;
  if (/^[a-f0-9]{24}$/i.test(raw)) return { _id: new mongoose.Types.ObjectId(raw) };
  if (/^[a-f0-9]{6,23}$/i.test(raw)) {
    return { $expr: { $regexMatch: { input: { $toString: "$_id" }, regex: raw.toLowerCase() + "$", options: "i" } } };
  }
  return null;
}

export function isValidOrderId(id: string): boolean {
  return orderIdFilter(id) !== null;
}
