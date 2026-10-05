"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";

export type ProjectFormState = { error?: string; id?: number; name?: string };

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  await requireModule("requisition");

  const projectName = String(formData.get("projectName") ?? "").trim();
  if (!projectName) {
    return { error: "Project name is required." };
  }

  const { data: created, error } = await supabaseAdmin
    .from("tbl_Project_ID")
    .insert({ project_name: projectName })
    .select("id, project_name")
    .single();

  if (error || !created) {
    return { error: `Could not save project: ${error?.message ?? "unknown error"}` };
  }

  revalidatePath("/requisition");
  return { id: created.id, name: created.project_name };
}
