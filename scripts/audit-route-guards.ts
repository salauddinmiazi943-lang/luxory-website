import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const GUARD_PATTERN = /requireUser|requirePermission|accountsApiUser|dailyHisabApiUser|getSession|verifyAccessKey|requireAccountsPage/;

const PUBLIC_ROUTES = new Set([
  "auth/login/route.ts",
  "auth/logout/route.ts",
  "auth/register/route.ts",
  "checkout/config/route.ts",
  "locations/route.ts",
  "orders/[id]/delivery/guest-report/route.ts",
]);

const PUBLIC_REASON: Record<string, string> = {
  "auth/login/route.ts": "issues the session",
  "auth/logout/route.ts": "only clears the session cookie",
  "auth/register/route.ts": "role is forced to customer",
  "checkout/config/route.ts": "exposes only the default delivery charge",
  "locations/route.ts": "public Bangladesh location tree",
  "orders/[id]/delivery/guest-report/route.ts": "guest access requires the hashed access key",
};

async function walk(dir: string, root: string, out: string[] = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, root, out);
    else if (entry.name === "route.ts") out.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return out;
}

function roleLists(source: string) {
  return Array.from(source.matchAll(/requireUser\(\s*\[?([^\])]*)\]?\s*\)/g)).map((match) => match[1].trim());
}

async function main() {
  const root = path.join(process.cwd(), "src", "app", "api");
  const routes = await walk(root, path.join(process.cwd(), "src", "app", "api"));

  const violations: string[] = [];
  const openGuards: string[] = [];

  for (const route of routes.sort()) {
    const source = await readFile(path.join(process.cwd(), "src", "app", "api", route), "utf8");
    if (!GUARD_PATTERN.test(source)) {
      if (!PUBLIC_ROUTES.has(route)) violations.push(route);
      continue;
    }
    for (const roles of roleLists(source)) {
      if (!roles) openGuards.push(route);
    }
  }

  console.log(`Audited ${routes.length} API routes.`);
  console.log(`Intentionally public: ${PUBLIC_ROUTES.size} (${Array.from(PUBLIC_ROUTES).map((route) => `${route} — ${PUBLIC_REASON[route]}`).join("; ")})`);

  if (openGuards.length) {
    console.log(`\nAuthenticated but role-unrestricted (${openGuards.length}) — review each by hand:`);
    for (const route of [...new Set(openGuards)].sort()) console.log(`  ${route}`);
  }

  if (violations.length) {
    console.error(`\nUnauthenticated route handlers (${violations.length}):`);
    for (const route of violations) console.error(`  ${route}`);
    console.error("\nAdd an auth guard, or add the path to PUBLIC_ROUTES with a reason.");
    process.exitCode = 1;
    return;
  }

  console.log("\nNo unauthenticated route handlers found.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});