"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth";

// Same five keys as the CHECK constraint on tbl_User_Module.
const VALID_MODULES = ["requisition", "purchase_order", "receiving", "voucher", "bank"];

export type SaveUserInput = {
  login: string;
  password: string; // empty on an edit = keep the current password
  isSuperAdmin: boolean;
  active: boolean;
  modules: string[];
};
export type SaveUserResult = { error?: string; id?: number };

/** Adds (id = null) or edits (id given) a user and the modules the user may open. Super admins only. */
export async function saveUser(id: number | null, input: SaveUserInput): Promise<SaveUserResult> {
  const session = await requireSuperAdmin();

  const login = String(input.login ?? "").trim();
  if (!login) return { error: "Login name is required." };
  if (login.length > 60) return { error: "Login name is too long." };
  const password = String(input.password ?? "");
  if (id == null && !password) return { error: "A password is required for a new user." };
  if (password && password.length < 8) return { error: "The password must be at least 8 characters." };
  const modules = Array.from(new Set((input.modules ?? []).filter((m) => VALID_MODULES.includes(m))));

  if (id != null) {
    const { data: current, error } = await supabaseAdmin.from("tbl_User").select("id, user_login_name, is_super_admin, active").eq("id", id).maybeSingle();
    if (error || !current) return { error: "That user no longer exists. Reload the page." };

    // never lock the app out of Administration
    const isMe = current.user_login_name === session.loginName;
    if (isMe && (!input.active || !input.isSuperAdmin)) {
      return { error: "You cannot deactivate your own account or remove your own super admin rights." };
    }
    if (current.is_super_admin && current.active && (!input.isSuperAdmin || !input.active)) {
      const { count } = await supabaseAdmin
        .from("tbl_User")
        .select("id", { count: "exact", head: true })
        .eq("is_super_admin", true)
        .eq("active", true)
        .neq("id", id);
      if (!count) return { error: "There must be at least one active super admin." };
    }
  }

  const fields: Record<string, unknown> = { user_login_name: login, is_super_admin: !!input.isSuperAdmin, active: !!input.active };
  if (password) fields.password = await bcrypt.hash(password, 10);

  let userId = id;
  if (id == null) {
    const { data, error } = await supabaseAdmin.from("tbl_User").insert(fields).select("id").single();
    if (error || !data) {
      if (error?.code === "23505") return { error: "That login name is already used." };
      return { error: `Could not save the user: ${error?.message ?? "unknown error"}` };
    }
    userId = data.id as number;
  } else {
    const { error } = await supabaseAdmin.from("tbl_User").update(fields).eq("id", id);
    if (error) {
      if (error.code === "23505") return { error: "That login name is already used." };
      return { error: `Could not save the user: ${error.message}` };
    }
  }

  const del = await supabaseAdmin.from("tbl_User_Module").delete().eq("user_id", userId as number);
  if (del.error) return { error: `The user was saved, but the modules could not be updated: ${del.error.message}` };
  if (modules.length > 0) {
    const ins = await supabaseAdmin.from("tbl_User_Module").insert(modules.map((m) => ({ user_id: userId as number, module: m })));
    if (ins.error) return { error: `The user was saved, but the modules could not be saved: ${ins.error.message}` };
  }

  revalidatePath("/admin/users");
  return { id: userId as number };
}
