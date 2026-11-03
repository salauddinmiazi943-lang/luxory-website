import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDb } from "../src/lib/db";
import { Category, Product, User } from "../src/lib/models";

async function seed() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env.local");
  if (password.length < 12) throw new Error("SUPER_ADMIN_PASSWORD must be at least 12 characters");
  await connectDb();
  const existingAdmin = await User.findOne({ email: email.toLowerCase() });
  if (existingAdmin && existingAdmin.role !== "super_admin") {
    throw new Error("SUPER_ADMIN_EMAIL belongs to a non-super-admin account. Choose a new seed email.");
  }
  if (!existingAdmin) {
    await User.create({
      name: process.env.SUPER_ADMIN_NAME || "Store Administrator",
      email: email.toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
      role: "super_admin",
      status: "active",
    });
  }
  const categories = [
    { name: { en: "Smartphones", bn: "স্মার্টফোন" }, slug: "smartphones" },
    { name: { en: "Headphones", bn: "হেডফোন" }, slug: "headphones" },
    { name: { en: "Smart watches", bn: "স্মার্ট ঘড়ি" }, slug: "smart-watches" },
    { name: { en: "Accessories", bn: "আনুষঙ্গিক" }, slug: "accessories" },
    { name: { en: "Fruits", bn: "ফলমূল" }, slug: "fruits" },
    { name: { en: "Vegetables", bn: "শাকসবজি" }, slug: "vegetables" },
    { name: { en: "Food & groceries", bn: "খাবার ও মুদি পণ্য" }, slug: "food-groceries" },
    { name: { en: "Fish", bn: "মাছ" }, slug: "fish" },
    { name: { en: "Meat", bn: "মাংস" }, slug: "meat" },
    { name: { en: "Cosmetics", bn: "প্রসাধনী" }, slug: "cosmetics" },
    { name: { en: "Clothing", bn: "পোশাক" }, slug: "clothing" },
    { name: { en: "Shoes", bn: "জুতা" }, slug: "shoes" },
    { name: { en: "Perfume", bn: "পারফিউম" }, slug: "perfume" },
    { name: { en: "Home & kitchen", bn: "ঘর ও রান্নাঘর" }, slug: "home-kitchen" },
  ];
  for (const category of categories) {
    await Category.updateOne({ slug: category.slug }, { $setOnInsert: category }, { upsert: true });
  }
  const category = await Category.findOne({ slug: "smartphones" });
  const seededProducts = [
    { slug: "everyday-smartphone", title: { en: "Everyday smartphone", bn: "দৈনন্দিন স্মার্টফোন" }, description: { en: "A dependable everyday smartphone with a vibrant display.", bn: "উজ্জ্বল ডিসপ্লেসহ নির্ভরযোগ্য দৈনন্দিন স্মার্টফোন।" }, price: 24999, discountPrice: 22999, featured: true, bestSeller: true, categorySlug: "smartphones" },
    { slug: "orbit-headphones", title: { en: "Orbit wireless headphones", bn: "অরবিট ওয়্যারলেস হেডফোন" }, description: { en: "Comfortable wireless sound for work and play.", bn: "কাজ ও বিনোদনের জন্য আরামদায়ক ওয়্যারলেস সাউন্ড।" }, price: 7990, discountPrice: 6490, featured: true, bestSeller: false, categorySlug: "headphones" },
    { slug: "nova-smartwatch", title: { en: "Nova smart watch", bn: "নোভা স্মার্ট ঘড়ি" }, description: { en: "A smart companion for the rhythm of your day.", bn: "আপনার প্রতিদিনের সঙ্গী স্মার্ট ঘড়ি।" }, price: 5990, featured: false, bestSeller: true, categorySlug: "smart-watches" },
    { slug: "studio-mini-speaker", title: { en: "Studio mini speaker", bn: "স্টুডিও মিনি স্পিকার" }, description: { en: "Room-filling audio in a compact design.", bn: "ছোট ডিজাইনে ঘরজুড়ে সাউন্ড।" }, price: 4290, featured: false, bestSeller: false, categorySlug: "accessories" },
  ];
  for (const product of seededProducts) {
    const productCategory = product.categorySlug === "smartphones" ? category : await Category.findOne({ slug: product.categorySlug });
    if (!productCategory) continue;
    await Product.updateOne(
      { slug: product.slug },
      { $setOnInsert: {
        title: product.title, description: product.description, slug: product.slug, price: product.price,
        ...("discountPrice" in product ? { discountPrice: product.discountPrice } : {}),
        stock: 25, category: productCategory._id, images: [], active: true, approved: true, featured: product.featured, bestSeller: product.bestSeller,
      } },
      { upsert: true },
    );
  }
  await mongoose.disconnect();
  console.log("Seed complete.");
}

seed().catch(async (error: unknown) => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
