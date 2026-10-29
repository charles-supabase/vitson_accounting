import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth";
import { UserManager, type UserRow } from "@/components/user-manager";

export const dynamic = "force-dynamic";

export default async function UsersAdminPage() {
  await requireSuperAdmin();
  const [{ data: users, error: usersError }, { data: userModules }] = await Promise.all([
    supabaseAdmin.from("tbl_User").select("id, user_login_name, is_super_admin, active").order("user_login_name"),
    supabaseAdmin.from("tbl_User_Module").select("user_id, module"),
  ]);
  if (usersError) return <p className="text-sm text-danger">Could not load users: {usersError.message}</p>;

  const modulesByUser = new Map<number, string[]>();
  for (const row of userModules ?? []) {
    const list = modulesByUser.get(row.user_id) ?? [];
    list.push(row.module);
    modulesByUser.set(row.user_id, list);
  }
  const rows: UserRow[] = (users ?? []).map((u) => ({
    id: u.id,
    login: u.user_login_name,
    isSuperAdmin: u.is_super_admin,
    active: u.active,
    modules: modulesByUser.get(u.id) ?? [],
  }));
  return <UserManager users={rows} />;
}
