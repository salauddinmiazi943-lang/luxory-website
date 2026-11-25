import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Dashboard } from "@/components/dashboard";

export const metadata = { title: "Admin dashboard | Luxora Global Trade" };

export default async function AdminPage() {
  const session = await getSession();

  // Protect all admin routes: Direct navigation using /admin or nav('/admin') must NEVER bypass authentication
  if (!session) {
    redirect("/admin/login");
  }

  // Role-based authorization: Unauthorized customers and sellers must not access admin functionality
  if (session.role !== "super_admin" && session.role !== "admin") {
    redirect("/admin/login?error=unauthorized");
  }

  return <Dashboard kind="admin" />;
}
