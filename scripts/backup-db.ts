import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";

const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof mongoose.Types.ObjectId) return { $oid: String(value) };
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Buffer.isBuffer(value)) return { $binary: value.toString("base64") };
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = toPlain(item);
    return out;
  }
  return value;
}

async function main() {
  const uri = process.env.BACKUP_MONGODB_URI;
  if (!uri) {
    throw new Error("Set BACKUP_MONGODB_URI to the database you intend to back up.");
  }

  const stamp = timestamp();
  const outDir = path.join(process.cwd(), "backups", stamp);
  await mkdir(outDir, { recursive: true });

  await mongoose.connect(uri, {
    autoIndex: false,
    bufferCommands: false,
    serverSelectionTimeoutMS: 15_000,
  });

  const db = mongoose.connection.db;
  if (!db) throw new Error("Database handle is not available.");

  const names = (await db.listCollections().toArray()).map((entry) => entry.name).sort();
  const manifest: { database: string; createdAt: string; collections: { name: string; documents: number; bytes: number }[] }[] = [
    {
      database: db.databaseName,
      createdAt: new Date().toISOString(),
      collections: [],
    },
  ];

  for (const name of names) {
    const cursor = db.collection(name).find({}, { batchSize: 500 });
    const rows: unknown[] = [];
    for await (const doc of cursor) rows.push(toPlain(doc));

    const file = path.join(outDir, `${name}.json`);
    const payload = `${JSON.stringify(rows, null, 0)}\n`;
    await writeFile(file, payload, "utf8");

    const stat = await import("node:fs/promises").then((fs) => fs.stat(file));
    manifest[0].collections.push({ name, documents: rows.length, bytes: stat.size });
    console.log(`${name}: ${rows.length} documents -> ${path.relative(process.cwd(), file)}`);
  }

  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest[0], null, 2)}\n`, "utf8");
  await writeFile(
    path.join(outDir, "RESTORE.md"),
    [
      "# Restore",
      "",
      `Database: \`${manifest[0].database}\``,
      `Created: ${manifest[0].createdAt}`,
      "",
      "```bash",
      "node --env-file=.env.local --import tsx scripts/restore-db.ts backups/<this-folder>",
      "```",
      "",
    ].join("\n"),
    "utf8",
  );

  const total = manifest[0].collections.reduce((sum, entry) => sum + entry.documents, 0);
  console.log(`\nBackup complete: ${manifest[0].collections.length} collections, ${total} documents.`);
  console.log(`Folder: ${path.relative(process.cwd(), outDir)}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});