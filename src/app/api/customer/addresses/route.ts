import { z } from "zod";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { requireUser } from "@/lib/auth";
import { apiError, readJson } from "@/lib/http";
import { resolveBangladeshAddress } from "@/lib/bangladesh-locations";

const addressSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  label: z.string().trim().max(60).default(""),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(30),
  divisionId: z.string().min(1).max(12),
  districtId: z.string().min(1).max(12),
  upazilaId: z.string().max(12).optional(),
  upazila: z.string().trim().min(2).max(120),
  unionId: z.string().max(12).optional(),
  union: z.string().trim().max(120).optional(),
  area: z.string().trim().max(120).optional().default(""),
  address: z.string().trim().min(5).max(500),
  isDefault: z.boolean().default(true),
});

export async function GET() {
  const access = await requireUser(["customer"]);
  if ("error" in access) return access.error;
  try {
    await connectDb();
    const user = await User.findOne({ _id: access.user.id, role: "customer" })
      .select("savedAddresses")
      .lean();
    if (!user) return Response.json({ error: "Customer account not found" }, { status: 404 });
    const addresses = [...(user.savedAddresses ?? [])]
      .sort((left, right) => Number(right.isDefault) - Number(left.isDefault));
    return Response.json({ addresses });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  const access = await requireUser(["customer"]);
  if ("error" in access) return access.error;
  try {
    const parsed = await readJson(request, addressSchema);
    if ("error" in parsed) return parsed.error;
    const resolved = resolveBangladeshAddress(parsed.data);
    if (!resolved) {
      return Response.json({ error: "The selected address locations do not match." }, { status: 400 });
    }

    await connectDb();
    const user = await User.findOne({ _id: access.user.id, role: "customer" });
    if (!user) return Response.json({ error: "Customer account not found" }, { status: 404 });
    const addresses = user.savedAddresses ?? [];
    const addressIndex = parsed.data.id
      ? addresses.findIndex((address) => String(address._id) === parsed.data.id)
      : -1;
    if (parsed.data.id && addressIndex < 0) {
      return Response.json({ error: "Saved address not found" }, { status: 404 });
    }
    if (addressIndex < 0 && addresses.length >= 10) {
      return Response.json({ error: "You can save up to 10 delivery addresses." }, { status: 400 });
    }

    if (parsed.data.isDefault) {
      for (const address of addresses) address.isDefault = false;
    }
    const savedAddress = {
      label: parsed.data.label,
      name: parsed.data.name,
      phone: parsed.data.phone,
      divisionId: resolved.division.id,
      division: resolved.division.name,
      divisionBn: resolved.division.bnName,
      districtId: resolved.district.id,
      district: resolved.district.name,
      districtBn: resolved.district.bnName,
      ...(resolved.upazila
        ? { upazilaId: resolved.upazila.id, upazila: resolved.upazila.name, upazilaBn: resolved.upazila.bnName }
        : { upazila: parsed.data.upazila }),
      unionId: undefined,
      union: undefined,
      unionBn: undefined,
      ...(parsed.data.area ? { area: parsed.data.area } : {}),
      address: parsed.data.address,
      isDefault: parsed.data.isDefault || addresses.length === 0,
    };

    if (addressIndex >= 0) Object.assign(addresses[addressIndex], savedAddress);
    else addresses.push(savedAddress);
    user.savedAddresses = addresses;
    await user.save();
    return Response.json({ addresses: user.savedAddresses }, { status: addressIndex >= 0 ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
