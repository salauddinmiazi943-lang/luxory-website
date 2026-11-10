import { bangladeshLocations } from "@/lib/bangladesh-locations";

export async function GET() {
  return Response.json(bangladeshLocations, {
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
  });
}
