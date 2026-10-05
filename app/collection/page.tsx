import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { CollectionWorkspace } from "@/components/collection-workspace";
import { getCollectionLookups } from "@/actions/collection";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireModule("collection");
  const lookups = await getCollectionLookups();

  return (
    <AppShell
      title="Collection"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <CollectionWorkspace lookups={lookups} />
    </AppShell>
  );
}
