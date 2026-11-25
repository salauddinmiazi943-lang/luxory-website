import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Banner } from "@/lib/models";
import { requirePermission } from "@/lib/auth";
import { apiError, cloudinaryUrl, readJson, safeLink, translated } from "@/lib/http";

const localized = z.object({ en: z.string().trim().min(1).max(500), bn: z.string().trim().max(500).optional() });
const optionalLocalized = z.object({ en: z.string().trim().max(120).optional(), bn: z.string().trim().max(120).optional() }).optional();
const optionalBannerLink = (requestOrigin: string) => z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const link = value.trim();
  if (!link.toLowerCase().startsWith("http://")) return link;
  try {
    const url = new URL(link);
    const localHosts = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"];
    if (url.origin === requestOrigin || localHosts.includes(url.hostname)) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return link;
  }
  return link;
}, z.union([z.literal(""), safeLink()]));
const optionalScheduleDate = z.preprocess((value) => {
  if (value === "" || value == null) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date;
  }
  return value;
}, z.date().optional());
const optionalBgColor = z.preprocess((value) => {
  if (value === "" || value == null) return undefined;
  return typeof value === "string" ? value.trim() : value;
}, z.string().max(120).optional());
const schema = (requestOrigin: string) => z.object({ image: cloudinaryUrl(), title: localized, subtitle: localized, buttonText: optionalLocalized, bgColor: optionalBgColor, link: optionalBannerLink(requestOrigin).default(""), order: z.number().int().default(0), active: z.boolean().default(true), startDate: optionalScheduleDate, endDate: optionalScheduleDate });

export async function GET(request: Request) {
  try {
    await connectDb();
    const showAll = new URL(request.url).searchParams.get("all") === "true";
    if (showAll) {
      const access = await requirePermission("manage_banners");
      if ("error" in access) return access.error;
    }
    const now = new Date();
    const publicFilter = {
      active: true,
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] },
      ],
    };
    const items = await Banner.find(showAll ? {} : publicFilter).sort({ order: 1, createdAt: -1 }).lean();
    return Response.json({ items });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const access = await requirePermission("manage_banners");
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, schema(new URL(request.url).origin));
    if ("error" in parsed) return parsed.error;
    if (parsed.data.startDate && parsed.data.endDate && parsed.data.startDate > parsed.data.endDate) {
      return Response.json({ error: "End date must be on or after start date" }, { status: 400 });
    }
    await connectDb();
    const buttonText = parsed.data.buttonText?.en?.trim() ? { en: parsed.data.buttonText.en.trim(), bn: (parsed.data.buttonText.bn ?? "").trim() } : undefined;
    const item = await Banner.create({
      ...parsed.data,
      ...(buttonText ? { buttonText } : {}),
      title: await translated(parsed.data.title),
      subtitle: await translated(parsed.data.subtitle),
    });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
