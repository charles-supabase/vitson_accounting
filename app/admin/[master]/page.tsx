import { MasterPage } from "@/components/master-page";

export const dynamic = "force-dynamic";

export default async function MasterAdminPage({ params }: { params: Promise<{ master: string }> }) {
  const { master } = await params;
  return <MasterPage slug={master} />;
}
