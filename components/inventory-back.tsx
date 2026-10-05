import Link from "next/link";

export function InventoryBack() {
  return (
    <Link href="/inventory" className="mb-4 inline-block text-sm text-ink-soft underline hover:text-ink">
      ← Inventory
    </Link>
  );
}
