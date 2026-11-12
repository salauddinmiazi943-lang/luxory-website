import { requireUser, type SessionUser } from "@/lib/auth";

export type AccountsAdminResult = { user: SessionUser } | { error: Response };

/** Re-checks the live user record on every accounts page/API request. */
export async function requireAccountsAdmin(): Promise<AccountsAdminResult> {
  const result = await requireUser(["super_admin", "admin"]);
  if ("error" in result) {
    if (result.error?.status === 401) return { error: result.error };
    return { error: Response.json({ error: "অনুমতি নেই" }, { status: 404 }) };
  }
  return { user: result.user };
}

export function isResponse(value: AccountsAdminResult): value is { error: Response } {
  return "error" in value;
}
