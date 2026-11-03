import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import type { AppRole } from "@/lib/models";

const cookieName = "eshop_session";
const secret = () => {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("JWT_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(value);
};

export type SessionUser = { id: string; name: string; email: string; role: AppRole; permissions: string[] };

export async function createSession(user: SessionUser) {
  const payload: SessionUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: Array.from(user.permissions),
  };
  const token = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret());
  const jar = await cookies();
  jar.set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
}

export async function clearSession() {
  (await cookies()).delete(cookieName);
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const key = secret();
  try {
    const { payload } = await jwtVerify(token, key);
    if (typeof payload.id !== "string" || typeof payload.role !== "string" || typeof payload.email !== "string") return null;
    return {
      id: payload.id,
      name: typeof payload.name === "string" ? payload.name : "",
      email: payload.email,
      role: payload.role as AppRole,
      permissions: Array.isArray(payload.permissions) ? payload.permissions.filter((item): item is string => typeof item === "string") : [],
    };
  } catch {
    return null;
  }
}

export async function requireUser(roles?: AppRole[]) {
  const session = await getSession();
  if (!session) return { error: Response.json({ error: "Authentication required" }, { status: 401 }) } as const;
  let user;
  try {
    await connectDb();
    user = await User.findById(session.id).select("status role permissions name email").lean();
  } catch (error) {
    console.error("Could not verify the current user.", error);
    const message = error instanceof Error && error.message === "MONGO_USER and MONGO_PASS must be configured in .env.local"
      ? "Database is not configured"
      : "Could not verify the current user";
    return { error: Response.json({ error: message }, { status: 503 }) } as const;
  }
  if (!user || user.status !== "active") return { error: Response.json({ error: "Account is inactive" }, { status: 401 }) } as const;
  const current: SessionUser = { id: String(user._id), name: user.name, email: user.email, role: user.role, permissions: user.permissions ?? [] };
  if (roles && !roles.includes(current.role)) return { error: Response.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { user: current } as const;
}

export function hasPermission(user: SessionUser, permission: string) {
  return user.role === "super_admin" || (user.role === "admin" && user.permissions.includes(permission));
}

export async function requirePermission(permission: string) {
  const result = await requireUser(["super_admin", "admin"]);
  if ("error" in result) return result;
  if (!hasPermission(result.user, permission)) return { error: Response.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return result;
}
