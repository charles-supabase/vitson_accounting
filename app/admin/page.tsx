import Link from "next/link";
import { MASTER_LIST } from "@/lib/admin-masters";

const GROUPS = ["Purchasing", "Accounting", "Sales and production"] as const;

function Card({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <Link href={href} className="rounded border border-line bg-paper-raised p-5 transition-colors hover:border-ink">
      <span className="font-display text-lg font-semibold text-ink">{label}</span>
      <span className="mt-1 block text-sm text-ink-soft">{description}</span>
    </Link>
  );
}

export default function AdminOverview() {
  return (
    <div>
      <p className="mb-8 text-sm text-ink-soft">
        Add and edit master data. Double-click a record in the list of any screen to load it into the form for viewing and editing.
      </p>
      <h2 className="ledger-label mb-3">Access</h2>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card href="/admin/users" label="Users" description="Logins, passwords, module access, super admin flag" />
      </div>
      {GROUPS.map((g) => (
        <div key={g} className="mb-8">
          <h2 className="ledger-label mb-3">{g}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {MASTER_LIST.filter((m) => m.group === g).map((m) => (
              <Card key={m.slug} href={`/admin/${m.slug}`} label={m.title} description={m.description} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
