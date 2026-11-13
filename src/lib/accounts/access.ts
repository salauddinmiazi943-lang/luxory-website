import { notFound, redirect } from "next/navigation";
import { connectDb } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { AccountAccess } from "@/models/accounts";

export type AccountsUser = SessionUser & { accountsAdmin: boolean };

export async function accountsApiUser(): Promise<{ user?: AccountsUser; response?: Response }> {
  const auth = await requireUser();
  if ("error" in auth) return { response: auth.error };
  const { user } = auth;
  const accountsAdmin = user.role === "super_admin";
  if (!accountsAdmin) {
    try {
      await connectDb();
      const grant = await AccountAccess.findOne({ userId: user.id, active: true }).select("_id").lean();
      if (!grant) return { response: Response.json({ error: "হিসাব ব্যবহারের অনুমতি নেই" }, { status: 403 }) };
    } catch {
      return { response: Response.json({ error: "সার্ভার যাচাই করা যায়নি" }, { status: 503 }) };
    }
  }
  return { user: { ...user, accountsAdmin } };
}

export async function requireAccountsPage() {
  const auth = await requireUser();
  if ("error" in auth) redirect("/admin/login");
  if (auth.user.role === "super_admin") return { ...auth.user, accountsAdmin: true } as AccountsUser;
  try {
    await connectDb();
    const grant = await AccountAccess.findOne({ userId: auth.user.id, active: true }).select("_id").lean();
    if (!grant) notFound();
    return { ...auth.user, accountsAdmin: false } as AccountsUser;
  } catch {
    notFound();
  }
}

export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function bangladeshToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function startOfDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function endOfDay(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}
