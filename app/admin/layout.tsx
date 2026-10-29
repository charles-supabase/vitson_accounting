import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { MASTER_LIST } from "@/lib/admin-masters";

const ADMIN_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  ...MASTER_LIST.map((m) => ({ href: `/admin/${m.slug}`, label: m.title })),
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSuperAdmin();

  return (
    <AppShell
      title="Administration"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <nav className="mb-6 flex flex-wrap gap-x-5 gap-y-2 border-b border-line pb-3 text-sm">
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
