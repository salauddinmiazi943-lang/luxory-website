import { Schema, models, model } from "mongoose";
import type { Model, Types } from "mongoose";
import { productUnits } from "@/lib/product-units";

export type AppRole = "super_admin" | "admin" | "vendor" | "customer";
export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
type CartEntry = { productId: Types.ObjectId; variantId?: Types.ObjectId; quantity: number };
type UserRecord = {
  name: string; email: string; passwordHash: string; phone?: string; address?: string; shopName?: string;
  role: AppRole; permissions: string[]; status: "active" | "inactive"; cart?: CartEntry[];
};
type OrderLine = {
  productId: Types.ObjectId; vendorId?: Types.ObjectId; variantId?: Types.ObjectId; variantLabel?: string;
  unit: string; title: string; image?: string; quantity: number; unitPrice: number; status: OrderStatus;
};
type OrderRecord = {
  customer?: Types.ObjectId;
  customerInfo: { name: string; phone: string; address: string; notes?: string; email?: string };
  items: OrderLine[]; total: number; paymentMethod: "COD"; status: OrderStatus;
};

const localized = {
  en: { type: String, required: true, trim: true, maxlength: 5000 },
  bn: { type: String, required: true, trim: true, maxlength: 5000 },
};

const userSchema = new Schema<UserRecord>({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, trim: true, maxlength: 30 },
  address: { type: String, trim: true, maxlength: 1000 },
  shopName: { type: String, trim: true, maxlength: 120 },
  role: { type: String, enum: ["super_admin", "admin", "vendor", "customer"], default: "customer", index: true },
  permissions: [{ type: String, enum: ["manage_categories", "manage_banners", "manage_products", "manage_featured", "view_bookings", "manage_bookings", "manage_vendors", "view_messages"] }],
  status: { type: String, enum: ["active", "inactive"], default: "active", index: true },
  cart: { type: [{
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId },
    quantity: { type: Number, min: 0.01, max: 100000, required: true },
  }], default: [] },
}, { timestamps: true });

const categorySchema = new Schema({
  name: { type: localized, required: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  image: { type: String, default: "" },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

const bannerSchema = new Schema({
  image: { type: String, required: true },
  title: { type: localized, required: true },
  subtitle: { type: localized, required: true },
  link: { type: String, default: "/" },
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

const productVariantSchema = new Schema({
  label: { type: String, required: true, trim: true, maxlength: 60 },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0 },
});

const productSchema = new Schema({
  title: { type: localized, required: true },
  description: { type: localized, required: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  discountPrice: { type: Number, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  unit: { type: String, enum: productUnits, default: "piece" },
  variants: { type: [productVariantSchema], default: [] },
  category: { type: Schema.Types.ObjectId, ref: "Category", required: true, index: true },
  images: [{ type: String }],
  vendor: { type: Schema.Types.ObjectId, ref: "User", index: true },
  active: { type: Boolean, default: false, index: true },
  approved: { type: Boolean, default: true, index: true },
  featured: { type: Boolean, default: false, index: true },
  bestSeller: { type: Boolean, default: false },
}, { timestamps: true });
productSchema.index({ "title.en": "text", "title.bn": "text", "description.en": "text", "description.bn": "text" });

const orderSchema = new Schema<OrderRecord>({
  customer: { type: Schema.Types.ObjectId, ref: "User", index: true },
  customerInfo: {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    address: { type: String, required: true, trim: true, maxlength: 1000 },
    notes: { type: String, trim: true, maxlength: 2000, default: "" },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
  },
  items: [{
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId },
    vendorId: { type: Schema.Types.ObjectId, ref: "User" },
    variantLabel: { type: String, trim: true, maxlength: 60 },
    unit: { type: String, enum: productUnits, default: "piece" },
    title: { type: String, required: true },
    image: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 0.01, max: 100_000 },
    unitPrice: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["pending", "confirmed", "shipped", "delivered", "cancelled"], default: "pending" },
  }],
  total: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, enum: ["COD"], default: "COD" },
  status: { type: String, enum: ["pending", "confirmed", "shipped", "delivered", "cancelled"], default: "pending", index: true },
}, { timestamps: true });

const applicationSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  shopName: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true, maxlength: 30 },
  address: { type: String, required: true, trim: true, maxlength: 1000 },
  description: { type: String, required: true, trim: true, maxlength: 3000 },
  documents: [{ type: String }],
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
}, { timestamps: true });

const contactSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true },
  subject: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 4000 },
  read: { type: Boolean, default: false },
}, { timestamps: true });

export const User: Model<UserRecord> = (models.User as Model<UserRecord> | undefined) || model<UserRecord>("User", userSchema);
export const Category = models.Category || model("Category", categorySchema);
export const Banner = models.Banner || model("Banner", bannerSchema);
export const Product = models.Product || model("Product", productSchema);
export const Order: Model<OrderRecord> = (models.Order as Model<OrderRecord> | undefined) || model<OrderRecord>("Order", orderSchema);
export const VendorApplication = models.VendorApplication || model("VendorApplication", applicationSchema);
export const ContactMessage = models.ContactMessage || model("ContactMessage", contactSchema);
