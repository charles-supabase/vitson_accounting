import Link from "next/link";

const SECTIONS = [
  { href: "/admin/users", label: "Users", description: "Logins, module access, super admin flag" },
  { href: "/admin/suppliers", label: "Suppliers", description: "Supplier master list" },
  { href: "/admin/items", label: "Items", description: "Item master list" },
];

export default function AdminOverview() {
  return (
    <div>
      <p className="mb-8 text-sm text-ink-soft">
        More master data screens (units, account books, categories, banks, and so on) will be
        added here following the same pattern.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded border border-line bg-paper-raised p-5 transition-colors hover:border-ink"
          >
            <span className="font-display text-lg font-semibold text-ink">{s.label}</span>
            <span className="mt-1 block text-sm text-ink-soft">{s.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
