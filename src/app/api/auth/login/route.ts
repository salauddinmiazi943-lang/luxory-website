import { z } from "zod";
import bcrypt from "bcryptjs";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { apiError, clientKey, rateLimit, readJson } from "@/lib/http";
import { createSession } from "@/lib/auth";

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "login"), 8)) return Response.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).select("+passwordHash");
    if (!user || user.status !== "active" || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }
    await createSession({ id: String(user._id), name: user.name, email: user.email, role: user.role, permissions: user.permissions ?? [] });
    return Response.json({ user: { id: String(user._id), name: user.name, email: user.email, role: user.role, permissions: user.permissions } });
  } catch (error) {
    return apiError(error);
  }
}
