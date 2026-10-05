import { getSession } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [session, resolvedSearchParams] = await Promise.all([getSession(), searchParams]);

  const publicSession = session
    ? { loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }
    : null;

  return (
    <AppShell session={publicSession}>
      <DashboardClient
        session={publicSession}
        errorFlag={typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : undefined}
      />
    </AppShell>
  );
}
