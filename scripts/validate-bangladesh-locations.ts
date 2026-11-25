import { bangladeshLocations, resolveBangladeshAddress } from "@/lib/bangladesh-locations";

const expectedCounts = {
  divisions: 8,
  districts: 64,
  upazilas: 576,
} as const;

for (const [level, expected] of Object.entries(expectedCounts)) {
  const actual = bangladeshLocations[level as keyof typeof expectedCounts].length;
  if (actual !== expected) throw new Error(`Expected ${expected} ${level}, found ${actual}`);
}
if ("unions" in bangladeshLocations) throw new Error("The checkout location data must not include unions");

for (const district of bangladeshLocations.districts) {
  if (!bangladeshLocations.divisions.some((division) => division.id === district.divisionId)) {
    throw new Error(`District ${district.name} has an unknown division`);
  }
}
if (new Set(bangladeshLocations.divisions.map((division) => division.id)).size !== 8) {
  throw new Error("Division IDs must be unique");
}
if (new Set(bangladeshLocations.districts.map((district) => district.id)).size !== 64) {
  throw new Error("District IDs must be unique");
}
for (const upazila of bangladeshLocations.upazilas) {
  if (!bangladeshLocations.districts.some((district) => district.id === upazila.districtId)) {
    throw new Error(`Upazila ${upazila.name} has an unknown district`);
  }
  if (!upazila.name || !upazila.bnName) throw new Error(`Upazila / thana ${upazila.id} is missing a localized name`);
}
if (new Set(bangladeshLocations.upazilas.map((upazila) => upazila.id)).size !== 576) {
  throw new Error("Upazila / thana IDs must be unique");
}
const upazilaCount = bangladeshLocations.upazilas.filter((location) => location.type === "upazila").length;
const thanaCount = bangladeshLocations.upazilas.filter((location) => location.type === "thana").length;
if (upazilaCount !== 502 || thanaCount !== 74) {
  throw new Error(`Expected 502 upazilas and 74 thanas, found ${upazilaCount} and ${thanaCount}`);
}

const dhakaDivision = bangladeshLocations.divisions.find((division) => division.name === "Dhaka");
const dhakaDistrict = bangladeshLocations.districts.find((district) =>
  district.name === "Dhaka" && district.divisionId === dhakaDivision?.id);
const cumillaDistrict = bangladeshLocations.districts.find((district) =>
  (district.name === "Comilla" || district.name === "Cumilla") &&
  bangladeshLocations.divisions.find((division) => division.id === district.divisionId)?.name === "Chattagram");
const laksam = bangladeshLocations.upazilas.find((upazila) => upazila.name === "Laksam");
if (!dhakaDivision || !dhakaDistrict || !cumillaDistrict || cumillaDistrict.divisionId === dhakaDivision.id) {
  throw new Error("Cumilla must not be assigned to Dhaka division");
}
if (!laksam || laksam.districtId !== cumillaDistrict.id) {
  throw new Error("Laksam must be assigned to the Cumilla district record");
}
if (resolveBangladeshAddress({
  divisionId: dhakaDivision.id,
  districtId: cumillaDistrict.id,
  upazilaId: laksam.id,
})) {
  throw new Error("The API resolver must reject a district or upazila selected under the wrong parent");
}
if (!resolveBangladeshAddress({
  divisionId: cumillaDistrict.divisionId,
  districtId: cumillaDistrict.id,
})) {
  throw new Error("The API resolver must allow a manually entered thana under its selected district");
}
const dhanmondi = bangladeshLocations.upazilas.find((location) =>
  location.name === "Dhanmondi" && location.type === "thana");
if (!dhanmondi || dhanmondi.districtId !== dhakaDistrict.id) {
  throw new Error("Dhaka metropolitan thanas must belong to Dhaka district");
}

console.info("Bangladesh location data is valid.", {
  divisions: bangladeshLocations.divisions.length,
  districts: bangladeshLocations.districts.length,
  upazilas: upazilaCount,
  thanas: thanaCount,
});
