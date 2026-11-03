
import mongoose from "mongoose";
import dns from "node:dns";
type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalCache = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache;
};

const cache =
  globalCache.mongooseCache ??
  { conn: null, promise: null };

globalCache.mongooseCache = cache;

export async function connectDb() {
  const dnsServers = process.env.MONGO_DNS_SERVERS
    ?.split(",")
    .map((server) => server.trim())
    .filter(Boolean);
  if (dnsServers?.length) dns.setServers(dnsServers);

  if (cache.conn) {
    return cache.conn;
  }

  const configuredUri = process.env.MONGODB_URI;
  const username = process.env.MONGO_USER;
  const password = process.env.MONGO_PASS;
  if (!configuredUri && (!username || !password)) {
    throw new Error(
      "MONGODB_URI or both MONGO_USER and MONGO_PASS must be configured"
    );
  }

  const uri = configuredUri ?? `mongodb+srv://${encodeURIComponent(username!)}:${encodeURIComponent(password!)}@cluster0.uverrsf.mongodb.net/Coursify?retryWrites=true&w=majority`;

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(uri, {
        family: 4,
        bufferCommands: false,
      })
      .catch((error: unknown) => {
        cache.promise = null;
        throw error;
      });
  }

  cache.conn = await cache.promise;

  return cache.conn;
}
