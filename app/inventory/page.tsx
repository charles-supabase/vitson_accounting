import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

const BUTTONS = [
  { href: "/inventory/purchases", label: "Purchases", note: "Items purchased in a month, by sorting and bound" },
  { href: "/inventory/daily", label: "Daily Usage", note: "Enter daily withdrawals per item" },
  { href: "/inventory/monthly-usage", label: "Monthly Usage", note: "Enter actual withdrawals per item" },
  { href: "/inventory/recipe", label: "Recipe Usage", note: "Populate usage from recipe tickets" },
  { href: "/inventory/analysis", label: "Analysis", note: "Actual vs daily vs recipe discrepancies" },
  { href: "/inventory/monthly", label: "Monthly Inventory", note: "Balance forward, purchases, withdrawals, balance" },
];

export default async function InventoryDashboard() {
  const session = await requireModule("inventory");
  return (
    <AppShell
      title="Inventory"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
        {BUTTONS.map((b, i) => (
          <Link
            key={b.href}
            href={b.href}
            className="rounded border border-line bg-paper-raised p-5 transition-colors hover:border-ink"
          >
            <span className="ledger-label">{i + 1}</span>
            <span className="block font-display text-lg font-semibold text-ink">{b.label}</span>
            <span className="mt-1 block text-sm text-ink-soft">{b.note}</span>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
