import { Schema, models, model } from "mongoose";
import type { Model, Types } from "mongoose";
import { productUnits } from "@/lib/product-units";

export type AppRole = "super_admin" | "admin" | "vendor" | "delivery_staff" | "customer";
export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "failed" | "cancelled";
type CartEntry = { productId: Types.ObjectId; variantId?: Types.ObjectId; quantity: number };
type SavedCustomerAddress = {
  _id?: Types.ObjectId;
  label?: string;
  name: string;
  phone: string;
  divisionId: string;
  division: string;
  divisionBn: string;
  districtId: string;
  district: string;
  districtBn: string;
  upazilaId?: string;
  upazila: string;
  upazilaBn?: string;
  unionId?: string;
  union?: string;
  unionBn?: string;
  area?: string;
  address: string;
  isDefault: boolean;
};
type UserRecord = {
  name: string; email: string; passwordHash: string; employeeId?: string; phone?: string; address?: string; shopName?: string;
  role: AppRole; permissions: string[]; status: "active" | "inactive" | "suspended"; cart?: CartEntry[];
  savedAddresses?: SavedCustomerAddress[];
};
type OrderLine = {
  productId: Types.ObjectId; vendorId?: Types.ObjectId; variantId?: Types.ObjectId; variantLabel?: string;
  unit: string; title: string; image?: string; quantity: number; originalPrice?: number; unitPrice: number; discountPercent?: number; lineTotal?: number; status: OrderStatus;
};
type DeliveryAuditEntry = {
  orderId: string; actorId: string; actorRole: AppRole; event: string; occurredAt: Date;
  previousHash: string; hash: string; signature?: string; details?: string;
};
type DeliveryAssignment = { assignedTo: string; assignedBy: string; assignedAt: Date };
type DeliveryAssignmentHistory = DeliveryAssignment & {
  action: "assigned" | "reassigned"; previousStaffId?: string;
};
type OrderRecord = {
  customer?: Types.ObjectId;
  customerInfo: {
    name: string; phone: string; address: string; notes?: string; email?: string;
    division?: string; district?: string; upazila?: string; area?: string;
    divisionId?: string; divisionBn?: string; districtId?: string; districtBn?: string;
    upazilaId?: string; upazilaBn?: string; unionId?: string; union?: string; unionBn?: string;
  };
  items: OrderLine[]; subtotal?: number; deliveryCharge?: number; total: number; paymentMethod: "COD"; status: OrderStatus | "partially_delivered";
  deliveryAudit: DeliveryAuditEntry[];
  delivery: {
    verificationStatus: "not_required" | "pending" | "verified" | "flagged";
    accessKeyHash?: string;
    assignment?: DeliveryAssignment;
    assignmentHistory: DeliveryAssignmentHistory[];
    deliveredAt?: Date; deliveredBy?: string; notes?: string;
    failedAt?: Date; failedBy?: string; failedReason?: string;
    reports: { _id?: Types.ObjectId; customerId: string; requestId?: string; reason: string; details?: string; createdAt: Date; status: "open" | "resolved"; resolvedBy?: string; resolvedAt?: Date }[];
    notifications: { message: string; createdAt: Date; readAt?: Date }[];
    handovers: {
      _id?: Types.ObjectId; productId: Types.ObjectId; variantId?: Types.ObjectId; title: string;
      assignedTo: string; assignedBy: string; assignedQuantity: number; acceptedQuantity: number;
      deliveredQuantity: number; verifiedDeliveredQuantity: number; returnedQuantity: number;
      missingQuantity: number; disputedQuantity: number; codDue: number; codCollected: number;
      codSettled: number; codDisputed: number; acceptedAt?: Date; settledAt?: Date; settledBy?: string;
    }[];
    returns: {
      _id?: Types.ObjectId; productId: Types.ObjectId; variantId?: Types.ObjectId; title: string;
      expectedQuantity: number; countedQuantity: number; receivedBy: string; receivedAt: Date; notes?: string;
      status: "pending_confirmation" | "confirmed"; condition?: "good" | "damaged" | "disputed";
      confirmedBy?: string; confirmedAt?: Date; restockAppliedAt?: Date; handoverId?: Types.ObjectId;
    }[];
  };
};

const localized = {
  en: { type: String, required: true, trim: true, maxlength: 5000 },
  bn: { type: String, required: true, trim: true, maxlength: 5000 },
};

const deliveryAuditSchema = new Schema<DeliveryAuditEntry>({
  orderId: { type: String, required: true, immutable: true },
  actorId: { type: String, required: true, immutable: true },
  actorRole: { type: String, enum: ["super_admin", "admin", "vendor", "delivery_staff", "customer"], required: true, immutable: true },
  event: { type: String, required: true, maxlength: 80, immutable: true },
  occurredAt: { type: Date, required: true, immutable: true },
  previousHash: { type: String, required: true, immutable: true },
  hash: { type: String, required: true, immutable: true },
  signature: { type: String, immutable: true },
  details: { type: String, maxlength: 2000, immutable: true },
}, { _id: false, versionKey: false });

const handoverSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  variantId: { type: Schema.Types.ObjectId },
  title: { type: String, required: true, maxlength: 500 },
  assignedTo: { type: String, required: true, maxlength: 64 },
  assignedBy: { type: String, required: true, maxlength: 64 },
  assignedQuantity: { type: Number, required: true, min: 0 },
  acceptedQuantity: { type: Number, required: true, min: 0, default: 0 },
  deliveredQuantity: { type: Number, required: true, min: 0, default: 0 },
  verifiedDeliveredQuantity: { type: Number, required: true, min: 0, default: 0 },
  returnedQuantity: { type: Number, required: true, min: 0, default: 0 },
  missingQuantity: { type: Number, required: true, min: 0, default: 0 },
  disputedQuantity: { type: Number, required: true, min: 0, default: 0 },
  codDue: { type: Number, required: true, min: 0 },
  codCollected: { type: Number, required: true, min: 0, default: 0 },
  codSettled: { type: Number, required: true, min: 0, default: 0 },
  codDisputed: { type: Number, required: true, min: 0, default: 0 },
  acceptedAt: Date,
  settledAt: Date,
  settledBy: { type: String, maxlength: 64 },
});

const deliverySchema = new Schema({
  verificationStatus: { type: String, enum: ["not_required", "pending", "verified", "flagged"], default: "not_required" },
  accessKeyHash: { type: String, select: false },
  assignment: {
    assignedTo: { type: String, maxlength: 64 },
    assignedBy: { type: String, maxlength: 64 },
    assignedAt: Date,
  },
  assignmentHistory: [{
    assignedTo: { type: String, required: true, maxlength: 64 },
    assignedBy: { type: String, required: true, maxlength: 64 },
    assignedAt: { type: Date, required: true },
    action: { type: String, enum: ["assigned", "reassigned"], required: true },
    previousStaffId: { type: String, maxlength: 64 },
  }],
  deliveredAt: Date,
  deliveredBy: { type: String, maxlength: 64 },
  notes: { type: String, trim: true, maxlength: 1000, default: "" },
  failedAt: Date,
  failedBy: { type: String, maxlength: 64 },
  failedReason: { type: String, trim: true, maxlength: 500, default: "" },
  reports: [{
    customerId: { type: String, required: true, maxlength: 64 },
    requestId: { type: String, maxlength: 64 },
    reason: { type: String, required: true, enum: ["not_received", "late", "missing_items", "damaged", "other"] },
    details: { type: String, trim: true, maxlength: 1000 },
    createdAt: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: ["open", "resolved"], default: "open" },
    resolvedBy: { type: String, maxlength: 64 },
    resolvedAt: Date,
  }],
  notifications: [{
    message: { type: String, required: true, maxlength: 500 },
    createdAt: { type: Date, required: true, default: Date.now },
    readAt: Date,
  }],
  handovers: { type: [handoverSchema], default: [] },
  returns: [{
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId },
    title: { type: String, required: true, maxlength: 500 },
    expectedQuantity: { type: Number, required: true, min: 0 },
    countedQuantity: { type: Number, required: true, min: 0 },
    receivedBy: { type: String, required: true, maxlength: 64 },
    receivedAt: { type: Date, required: true, default: Date.now },
    notes: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: ["pending_confirmation", "confirmed"], default: "pending_confirmation" },
    condition: { type: String, enum: ["good", "damaged", "disputed"] },
    confirmedBy: { type: String, maxlength: 64 },
    confirmedAt: Date,
    restockAppliedAt: Date,
    handoverId: { type: Schema.Types.ObjectId },
  }],
});

const userSchema = new Schema<UserRecord>({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, trim: true, maxlength: 30 },
  address: { type: String, trim: true, maxlength: 1000 },
  employeeId: {
    type: String, trim: true, uppercase: true, maxlength: 32,
    required: function () { return this.role === "delivery_staff"; },
  },
  shopName: { type: String, trim: true, maxlength: 120 },
  role: { type: String, enum: ["super_admin", "admin", "vendor", "delivery_staff", "customer"], default: "customer", index: true },
  permissions: [{ type: String, enum: ["manage_categories", "manage_banners", "manage_products", "manage_featured", "view_bookings", "manage_bookings", "manage_delivery_staff", "manage_vendors", "view_messages"] }],
  status: { type: String, enum: ["active", "inactive", "suspended"], default: "active", index: true },
  cart: { type: [{
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId },
    quantity: { type: Number, min: 0.01, max: 100000, required: true },
  }], default: [] },
  savedAddresses: { type: [{
    label: { type: String, trim: true, maxlength: 60 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    divisionId: { type: String, required: true, maxlength: 12 },
    division: { type: String, required: true, trim: true, maxlength: 120 },
    divisionBn: { type: String, required: true, trim: true, maxlength: 120 },
    districtId: { type: String, required: true, maxlength: 12 },
    district: { type: String, required: true, trim: true, maxlength: 120 },
    districtBn: { type: String, required: true, trim: true, maxlength: 120 },
    upazilaId: { type: String, maxlength: 12 },
    upazila: { type: String, required: true, trim: true, maxlength: 120 },
    upazilaBn: { type: String, trim: true, maxlength: 120 },
    unionId: { type: String, maxlength: 12 },
    union: { type: String, trim: true, maxlength: 120 },
    unionBn: { type: String, trim: true, maxlength: 120 },
    area: { type: String, trim: true, maxlength: 120 },
    address: { type: String, required: true, trim: true, maxlength: 500 },
    isDefault: { type: Boolean, default: false },
  }], default: [] },
}, { timestamps: true });

const categorySchema = new Schema({
  name: { type: localized, required: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  image: { type: String, default: "" },
  parentCategory: { type: Schema.Types.ObjectId, ref: "Category" },
  isFeatured: { type: Boolean, default: false, index: true },
  active: { type: Boolean, default: true, index: true },
  order: { type: Number, default: 0 },
}, { timestamps: true });

const bannerSchema = new Schema({
  image: { type: String, required: true },
  title: { type: localized, required: true },
  subtitle: { type: localized, required: true },
  buttonText: {
    en: { type: String, trim: true, maxlength: 120 },
    bn: { type: String, trim: true, maxlength: 120 },
  },
  bgColor: { type: String, trim: true, maxlength: 120 },
  link: { type: String, default: "" },
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true, index: true },
  startDate: { type: Date },
  endDate: { type: Date },
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

const productCommentSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
  customer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  customerName: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, required: true, default: Date.now },
  adminReply: { type: String, trim: true, maxlength: 2000, default: "" },
  repliedBy: { type: String, maxlength: 64 },
  repliedAt: Date,
}, { timestamps: false });
productCommentSchema.index({ product: 1, createdAt: -1 });

const orderSchema = new Schema<OrderRecord>({
  customer: { type: Schema.Types.ObjectId, ref: "User", index: true },
  customerInfo: {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    address: { type: String, required: true, trim: true, maxlength: 1000 },
    division: { type: String, trim: true, maxlength: 120 },
    divisionId: { type: String, trim: true, maxlength: 12 },
    divisionBn: { type: String, trim: true, maxlength: 120 },
    district: { type: String, trim: true, maxlength: 120 },
    districtId: { type: String, trim: true, maxlength: 12 },
    districtBn: { type: String, trim: true, maxlength: 120 },
    upazila: { type: String, trim: true, maxlength: 120 },
    upazilaId: { type: String, trim: true, maxlength: 12 },
    upazilaBn: { type: String, trim: true, maxlength: 120 },
    union: { type: String, trim: true, maxlength: 120 },
    unionId: { type: String, trim: true, maxlength: 12 },
    unionBn: { type: String, trim: true, maxlength: 120 },
    area: { type: String, trim: true, maxlength: 120 },
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
    status: { type: String, enum: ["pending", "confirmed", "shipped", "delivered", "failed", "cancelled"], default: "pending" },
  }],
  total: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, enum: ["COD"], default: "COD" },
  status: { type: String, enum: ["pending", "confirmed", "shipped", "delivered", "failed", "cancelled", "partially_delivered"], default: "pending", index: true },
  deliveryAudit: { type: [deliveryAuditSchema], default: [] },
  delivery: { type: deliverySchema, default: () => ({}) },
}, { timestamps: true, optimisticConcurrency: true });

orderSchema.pre(["findOneAndUpdate", "updateOne", "updateMany"], function () {
  const update = this.getUpdate();
  if (!update || Array.isArray(update)) return;
  const fields = Object.keys(update).flatMap((key) => key.startsWith("$") && typeof update[key] === "object" && update[key] !== null
    ? Object.keys(update[key] as Record<string, unknown>)
    : [key]);
  if (fields.some((field) => field === "deliveryAudit" || field.startsWith("deliveryAudit."))) {
    throw new Error("Delivery audit history is append-only");
  }
});
orderSchema.pre(["deleteOne", "deleteMany", "findOneAndDelete"], function () {
  throw new Error("Order deletion is disabled to preserve delivery and audit history");
});

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

const offerSchema = new Schema({
  title: { type: localized, required: true },
  subtitle: { type: localized, required: true },
  image: { type: String, required: true },
  link: { type: String, default: "/products" },
  active: { type: Boolean, default: true, index: true },
  order: { type: Number, default: 0 },
  startDate: { type: Date },
  endDate: { type: Date },
}, { timestamps: true });

export const Offer = models.Offer || model("Offer", offerSchema);

const announcementSchema = new Schema({
  title: { type: localized, required: true },
  link: { type: String, default: "/products" },
  active: { type: Boolean, default: true, index: true },
  order: { type: Number, default: 0 },
  startDate: { type: Date },
  endDate: { type: Date },
}, { timestamps: true });

export const Announcement = models.Announcement || model("Announcement", announcementSchema);
export const Product = models.Product || model("Product", productSchema);
export const ProductComment = models.ProductComment || model("ProductComment", productCommentSchema);
export const Order: Model<OrderRecord> = (models.Order as Model<OrderRecord> | undefined) || model<OrderRecord>("Order", orderSchema);
const deliverySettingsSchema = new Schema({
  auditFrequencyPercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
  updatedBy: { type: String, required: true, maxlength: 64 },
}, { timestamps: true });
export const DeliverySettings = models.DeliverySettings || model("DeliverySettings", deliverySettingsSchema);
export const VendorApplication = models.VendorApplication || model("VendorApplication", applicationSchema);
export const ContactMessage = models.ContactMessage || model("ContactMessage", contactSchema);
