export const ADMIN_PERMISSIONS = [
  "manage_categories",
  "manage_banners",
  "manage_products",
  "manage_featured",
  "manage_offers",
  "manage_announcements",
  "view_bookings",
  "manage_bookings",
  "manage_delivery_staff",
  "manage_vendors",
  "view_messages",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];
