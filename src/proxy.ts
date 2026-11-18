import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const cookieName = "eshop_session";

type ProxySession = { id: string; role: string };

const ROLE_RULES: { base: string; roles: string[] }[] = [
  { base: "/vendor", roles: ["vendor", "super_admin"] },
  { base: "/delivery", roles: ["delivery_staff", "super_admin"] },
];

async function readSession(request: NextRequest): Promise<ProxySession | null> {
  const token = request.cookies.get(cookieName)?.value;
  const secret = process.env.JWT_SECRET;
  if (!token || !secret || secret.length < 32) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (typeof payload.id !== "string" || typeof payload.role !== "string" || typeof payload.email !== "string") return null;
    return { id: payload.id, role: payload.role };
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const session = await readSession(request);
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "?error=unauthorized";
    return NextResponse.redirect(url);
  }

  const rule = ROLE_RULES.find((entry) => pathname === entry.base || pathname.startsWith(`${entry.base}/`));
  if (rule && !rule.roles.includes(session.role)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "?error=unauthorized";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/accounts",
    "/accounts/:path*",
    "/vendor",
    "/delivery",
    "/delivery/:path*",
  ],
};