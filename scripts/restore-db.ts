import { readFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";

function fromPlain(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(fromPlain);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 1) {
      if (keys[0] === "$oid" && typeof record.$oid === "string") return new mongoose.Types.ObjectId(record.$oid);
      if (keys[0] === "$date" && typeof record.$date === "string") return new Date(record.$date);
      if (keys[0] === "$binary" && typeof record.$binary === "string") return Buffer.from(record.$binary, "base64");
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) out[key] = fromPlain(item);
    return out;
  }
  return value;
}

async function main() {
  const uri = process.env.RESTORE_MONGODB_URI;
  const folder = process.argv[2];
  const replace = process.argv.includes("--replace");
  const confirm = process.env.RESTORE_CONFIRM;

  if (!uri) throw new Error("Set RESTORE_MONGODB_URI to the database you intend to restore into.");
  if (!folder) throw new Error("Pass the backup folder: scripts/restore-db.ts backups/<stamp>");
  if (!confirm) throw new Error("Set RESTORE_CONFIRM to the target database name to confirm the restore.");

  const dir = path.resolve(process.cwd(), folder);
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as {
    database: string;
    createdAt: string;
    collections: { name: string; documents: number }[];
  };

  await mongoose.connect(uri, {
    autoIndex: false,
    bufferCommands: false,
    serverSelectionTimeoutMS: 15_000,
  });

  const db = mongoose.connection.db;
  if (!db) throw new Error("Database handle is not available.");
  if (confirm !== db.databaseName) {
    throw new Error(`RESTORE_CONFIRM (${confirm}) does not match target database (${db.databaseName}). Aborting.`);
  }
  if (!replace) {
    throw new Error("Refusing to restore without --replace (this would clear existing collections).");
  }

  for (const entry of manifest.collections) {
    const rows = JSON.parse(await readFile(path.join(dir, `${entry.name}.json`), "utf8")) as unknown[];
    const docs = rows.map(fromPlain) as Record<string, unknown>[];
    const collection = db.collection(entry.name);

    await collection.deleteMany({});
    if (docs.length) await collection.insertMany(docs, { ordered: false });

    console.log(`${entry.name}: restored ${docs.length} documents (expected ${entry.documents}).`);
  }

  console.log(`\nRestore complete from ${path.relative(process.cwd(), dir)} (backup ${manifest.createdAt}).`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});