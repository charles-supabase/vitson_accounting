import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

const ADMIN_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/suppliers", label: "Suppliers" },
  { href: "/admin/items", label: "Items" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSuperAdmin();

  return (
    <AppShell
      title="Administration"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <nav className="mb-6 flex gap-5 border-b border-line pb-3 text-sm">
        {ADMIN_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-ink-soft hover:text-ink">
            {l.label}
          </Link>
        ))}
      </nav>
      {children}
    </AppShell>
  );
}
