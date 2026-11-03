import { z } from "zod";
import bcrypt from "bcryptjs";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { apiError, clientKey, rateLimit, readJson } from "@/lib/http";
import { createSession } from "@/lib/auth";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128),
});

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "register"), 5)) return Response.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  try {
    const parsed = await readJson(request, schema);
    if ("error" in parsed) return parsed.error;
    await connectDb();
    const exists = await User.exists({ email: parsed.data.email.toLowerCase() });
    if (exists) return Response.json({ error: "An account with this email already exists" }, { status: 409 });
    const user = await User.create({ ...parsed.data, email: parsed.data.email.toLowerCase(), passwordHash: await bcrypt.hash(parsed.data.password, 12) });
    await createSession({ id: String(user._id), name: user.name, email: user.email, role: "customer", permissions: [] });
    return Response.json({ user: { id: String(user._id), name: user.name, email: user.email, role: user.role } }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return Response.json({ error: "An account with this email already exists" }, { status: 409 });
    }
    return apiError(error);
  }
}
