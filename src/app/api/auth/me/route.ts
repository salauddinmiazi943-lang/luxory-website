import { getSession, requireUser } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ user: null });
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    return Response.json({ user: result.user });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not verify session" }, { status: 503 });
  }
}
