"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth";
import type { ModuleKey } from "@/lib/modules";

export type UserFormState = { error?: string };

const VALID_MODULES: ModuleKey[] = [
  "requisition",
  "purchase_order",
  "receiving",
  "voucher",
  "bank",
];

export async function createUser(
  _prev: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  await requireSuperAdmin();

  const loginName = String(formData.get("loginName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const isSuperAdmin = formData.get("isSuperAdmin") === "on";
  const selectedModules = VALID_MODULES.filter((m) => formData.get(`module_${m}`) === "on");

  if (!loginName || !password) {
    return { error: "Login name and password are required." };
  }
  if (password.length < 4) {
    return { error: "Password should be at least 4 characters." };
  }

  const { data: hashData, error: hashError } = await supabaseAdmin.rpc("hash_password", {
    p_password: password,
  });
  if (hashError || !hashData) {
    return { error: "Could not hash the password. Try again." };
  }

  const { data: userRow, error: insertError } = await supabaseAdmin
    .from("tbl_User")
    .insert({
      user_login_name: loginName,
      password: hashData,
      is_super_admin: isSuperAdmin,
    })
    .select("id")
    .single();

  if (insertError || !userRow) {
    return { error: `Could not create user: ${insertError?.message ?? "unknown error"}` };
  }

  if (selectedModules.length > 0) {
    const rows = selectedModules.map((module) => ({ user_id: userRow.id, module }));
    const { error: moduleError } = await supabaseAdmin.from("tbl_User_Module").insert(rows);
    if (moduleError) {
      return { error: `User created, but could not save module access: ${moduleError.message}` };
    }
  }

  revalidatePath("/admin/users");
  return {};
}

export async function setUserActive(userId: number, active: boolean) {
  await requireSuperAdmin();
  await supabaseAdmin.from("tbl_User").update({ active }).eq("id", userId);
  revalidatePath("/admin/users");
}
