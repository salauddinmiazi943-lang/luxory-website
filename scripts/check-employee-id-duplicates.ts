import mongoose from "mongoose";
import { User } from "@/lib/models";

async function main() {
  const uri = process.env.DELIVERY_STAFF_CHECK_MONGODB_URI;
  if (!uri) {
    throw new Error("Set DELIVERY_STAFF_CHECK_MONGODB_URI to the database you intend to inspect.");
  }

  await mongoose.connect(uri, {
    autoIndex: false,
    bufferCommands: false,
    serverSelectionTimeoutMS: 10_000,
  });

  const duplicates = await User.aggregate([
    { $match: { employeeId: { $type: "string", $ne: "" } } },
    {
      $group: {
        _id: { $toUpper: { $trim: { input: "$employeeId" } } },
        count: { $sum: 1 },
        values: { $addToSet: "$employeeId" },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } },
    { $limit: 100 },
  ]);
  const nonCanonical = await User.aggregate([
    { $match: { employeeId: { $type: "string", $ne: "" } } },
    { $project: { employeeId: 1, normalized: { $toUpper: { $trim: { input: "$employeeId" } } } } },
    { $match: { $expr: { $ne: ["$employeeId", "$normalized"] } } },
    { $limit: 100 },
  ]);

  if (duplicates.length || nonCanonical.length) {
    if (duplicates.length) console.log("Duplicate Employee IDs found after trimming and case normalization:");
    for (const duplicate of duplicates) {
      console.log(`${duplicate._id}: ${duplicate.values.join(", ")}`);
    }
    if (nonCanonical.length) {
      console.log("Employee IDs requiring normalization before the unique index can be applied:");
      for (const item of nonCanonical) {
        console.log(item.employeeId);
      }
    }
    process.exitCode = 1;
    return;
  }

  console.log("No duplicate Employee IDs found after trimming and case normalization.");
}

main()
  .catch((error: unknown) => {
    console.error("Could not check Employee IDs.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
