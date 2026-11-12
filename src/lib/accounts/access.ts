import { connectDb } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { AccountAccess } from "@/models/account-access";

export type AccountAccessResult = { user: SessionUser } | { error: Response };

export async function requireAccountsAccess(): Promise<AccountAccessResult> {
  const access = await requireUser();
  if ("error" in access) return access;
  if (access.user.role === "super_admin") return { user: access.user };
  if (access.user.role !== "admin") {
    return { error: Response.json({ error: "অনুমতি নেই" }, { status: 404 }) };
  }

  await connectDb();
  const grant = await AccountAccess.exists({ userId: access.user.id, active: true });
  if (!grant) return { error: Response.json({ error: "অনুমতি নেই" }, { status: 404 }) };
  return { user: access.user };
}

export async function requireAccountsAdmin(): Promise<AccountAccessResult> {
  const access = await requireUser();
  if ("error" in access) return access;
  if (access.user.role !== "super_admin") {
    return { error: Response.json({ error: "অনুমতি নেই" }, { status: 404 }) };
  }
  return { user: access.user };
}
