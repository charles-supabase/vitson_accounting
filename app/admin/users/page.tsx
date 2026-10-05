import { supabaseAdmin } from "@/lib/supabase/admin";
import { UserForm } from "@/components/user-form";

export const dynamic = "force-dynamic";

export default async function UsersAdminPage() {
  const [{ data: users, error: usersError }, { data: userModules }] = await Promise.all([
    supabaseAdmin
      .from("tbl_User")
      .select("id, user_login_name, is_super_admin, active")
      .order("user_login_name"),
    supabaseAdmin.from("tbl_User_Module").select("user_id, module"),
  ]);

  const modulesByUser = new Map<number, string[]>();
  for (const row of userModules ?? []) {
    const list = modulesByUser.get(row.user_id) ?? [];
    list.push(row.module);
    modulesByUser.set(row.user_id, list);
  }

  return (
    <div>
      <section className="mb-10 rounded border border-line bg-paper-raised p-6">
        <h2 className="mb-4 font-display text-lg font-semibold text-ink">Add user</h2>
        <UserForm />
      </section>

      <section>
        <h2 className="mb-4 font-display text-lg font-semibold text-ink">Users</h2>
        {usersError ? (
          <p className="text-sm text-danger">Could not load users: {usersError.message}</p>
        ) : (
          <div className="overflow-x-auto rounded border border-line bg-paper-raised">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left ledger-label">
                  <th className="px-4 py-2 font-normal">Login</th>
                  <th className="px-4 py-2 font-normal">Modules</th>
                  <th className="px-4 py-2 font-normal">Super admin</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr key={u.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 font-medium text-ink">{u.user_login_name}</td>
                    <td className="px-4 py-2 text-ink-soft">
                      {u.is_super_admin ? "all" : (modulesByUser.get(u.id) ?? []).join(", ") || "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-ink-soft">{u.is_super_admin ? "yes" : "no"}</td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          u.active
                            ? "rounded-sm bg-success-soft px-2 py-0.5 text-xs text-success"
                            : "rounded-sm bg-danger-soft px-2 py-0.5 text-xs text-danger"
                        }
                      >
                        {u.active ? "active" : "inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
