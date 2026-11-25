import locations from "@/lib/bangladesh-locations.json";

export type BangladeshLocation = {
  id: string;
  name: string;
  bnName: string;
};

export type BangladeshDistrict = BangladeshLocation & { divisionId: string };
export type BangladeshUpazila = BangladeshLocation & {
  districtId: string;
  type: "upazila" | "thana";
};

export const bangladeshLocations = locations as {
  divisions: BangladeshLocation[];
  districts: BangladeshDistrict[];
  upazilas: BangladeshUpazila[];
};

export function resolveBangladeshAddress(ids: {
  divisionId: string;
  districtId: string;
  upazilaId?: string;
}) {
  const division = bangladeshLocations.divisions.find((item) => item.id === ids.divisionId);
  const district = bangladeshLocations.districts.find((item) =>
    item.id === ids.districtId && item.divisionId === ids.divisionId);
  const upazila = ids.upazilaId
    ? bangladeshLocations.upazilas.find((item) =>
      item.id === ids.upazilaId && item.districtId === ids.districtId)
    : undefined;

  if (!division || !district || (ids.upazilaId && !upazila)) return null;
  return { division, district, upazila };
}
