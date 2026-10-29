import { MasterPage } from "@/components/master-page";

export const dynamic = "force-dynamic";

export default async function ItemsAdminPage() {
  return <MasterPage slug="items" />;
}
