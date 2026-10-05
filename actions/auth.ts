"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { setSessionCookie, clearSessionCookie } from "@/lib/session";
import { MODULES, type ModuleKey } from "@/lib/modules";

export type LoginState = { error?: string };

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const loginName = String(formData.get("loginName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const moduleKey = String(formData.get("module") ?? "") as ModuleKey | "admin";

  if (!loginName || !password) {
    return { error: "Enter a login name and password." };
  }

  const { data, error } = await supabaseAdmin.rpc("verify_user_login", {
    p_login_name: loginName,
    p_password: password,
  });

  if (error) {
    return { error: "Something went wrong verifying that login. Try again." };
  }
  if (!data || data.length === 0) {
    return { error: "Incorrect login name or password." };
  }

  const user = data[0] as { id: number; user_login_name: string; is_super_admin: boolean };

  if (moduleKey === "admin") {
    if (!user.is_super_admin) {
      return { error: "This account does not have admin access." };
    }
    await setSessionCookie({
      userId: user.id,
      loginName: user.user_login_name,
      isSuperAdmin: true,
      modules: [],
      iat: Math.floor(Date.now() / 1000),
    });
    redirect("/admin");
  }

  const { data: moduleRows, error: moduleError } = await supabaseAdmin
    .from("tbl_User_Module")
    .select("module")
    .eq("user_id", user.id);

  if (moduleError) {
    return { error: "Something went wrong checking module access. Try again." };
  }

  const modules = (moduleRows ?? []).map((r) => r.module as string);

  if (!user.is_super_admin && !modules.includes(moduleKey)) {
    return { error: "This account does not have access to that module." };
  }

  await setSessionCookie({
    userId: user.id,
    loginName: user.user_login_name,
    isSuperAdmin: user.is_super_admin,
    modules,
    iat: Math.floor(Date.now() / 1000),
  });

  const target = MODULES.find((m) => m.key === moduleKey);
  redirect(target ? target.href : "/");
}

export async function logout() {
  await clearSessionCookie();
  redirect("/");
}
