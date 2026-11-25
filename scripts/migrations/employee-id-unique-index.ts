import mongoose from "mongoose";
import { User } from "@/lib/models";
import { getStagingMigrationTarget } from "./staging-target";

async function main() {
  const target = getStagingMigrationTarget(process.env);
  await mongoose.connect(target.uri, {
    autoIndex: false,
    bufferCommands: false,
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });
  const connectedDatabase = mongoose.connection.db?.databaseName;
  if (connectedDatabase !== target.databaseName) {
    throw new Error("Connected database does not match the verified staging database name.");
  }
  console.log(`Connected to verified staging target ${target.host}/${target.databaseName}.`);

  const indexes = await User.collection.indexes();
  const employeeIdIndex = indexes.find((index) =>
    Object.keys(index.key).length === 1 && index.key.employeeId === 1
  );
  if (employeeIdIndex) {
    if (employeeIdIndex.unique === true && employeeIdIndex.sparse === true) {
      console.log("The unique sparse employee ID index already exists; no changes made.");
      return;
    }
    throw new Error("An incompatible single-field employee ID index exists; review it before applying this migration.");
  }

  const nonCanonical = await User.aggregate([
    { $match: { employeeId: { $type: "string", $ne: "" } } },
    { $project: { employeeId: 1, normalized: { $toUpper: { $trim: { input: "$employeeId" } } } } },
    { $match: { $expr: { $ne: ["$employeeId", "$normalized"] } } },
    { $limit: 1 },
  ]);
  if (nonCanonical.length) {
    throw new Error("Non-canonical Employee IDs exist; trim and uppercase them before applying the unique index.");
  }

  const duplicates = await User.aggregate([
    { $match: { employeeId: { $type: "string", $ne: "" } } },
    { $group: { _id: { $toUpper: { $trim: { input: "$employeeId" } } }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]);
  if (duplicates.length) {
    throw new Error(`Employee IDs collide after normalization (${duplicates[0]._id}); resolve them before applying the unique index.`);
  }
  await User.collection.createIndex(
    { employeeId: 1 },
    { unique: true, sparse: true, name: "employeeId_1" },
  );
  console.log("Created the unique sparse employee ID index.");
}

main()
  .catch((error: unknown) => {
    console.error("Could not apply employee ID index migration.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
