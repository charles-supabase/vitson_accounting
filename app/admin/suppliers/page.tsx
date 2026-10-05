import { supabaseAdmin } from "@/lib/supabase/admin";
import { SupplierForm } from "@/components/supplier-form";

export const dynamic = "force-dynamic";

export default async function SuppliersAdminPage() {
  const [{ data: suppliers, error: suppliersError }, { data: accBooks }, { data: accCategories }] =
    await Promise.all([
      supabaseAdmin
        .from("tbl_Supplier")
        .select("id, Supplier_Name, Phone, Contact_Person, Email, supplier_TIN, discount_percent, terms, tbl_Acc_Book(Book_Name), tbl_Acc_Category(Acc_Category_Name)")
        .order("Supplier_Name"),
      supabaseAdmin.from("tbl_Acc_Book").select("id, Book_Name").order("Book_Name"),
      supabaseAdmin.from("tbl_Acc_Category").select("id, Acc_Category_Name").order("Acc_Category_Name"),
    ]);

  return (
    <div>
      <section className="mb-10 rounded border border-line bg-paper-raised p-6">
        <h2 className="mb-4 font-display text-lg font-semibold text-ink">Add supplier</h2>
        <SupplierForm
          accBooks={(accBooks ?? []).map((b) => ({ id: b.id, label: b.Book_Name }))}
          accCategories={(accCategories ?? []).map((c) => ({ id: c.id, label: c.Acc_Category_Name }))}
        />
      </section>

      <section>
        <h2 className="mb-4 font-display text-lg font-semibold text-ink">Suppliers</h2>
        {suppliersError ? (
          <p className="text-sm text-danger">Could not load suppliers: {suppliersError.message}</p>
        ) : !suppliers || suppliers.length === 0 ? (
          <p className="text-sm text-ink-soft">No suppliers yet. Add the first one above.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-line bg-paper-raised">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left ledger-label">
                  <th className="px-4 py-2 font-normal">Name</th>
                  <th className="px-4 py-2 font-normal">Contact</th>
                  <th className="px-4 py-2 font-normal">Email</th>
                  <th className="px-4 py-2 font-normal">Phone</th>
                  <th className="px-4 py-2 font-normal">TIN</th>
                  <th className="px-4 py-2 text-right font-normal">Discount %</th>
                  <th className="px-4 py-2 text-right font-normal">Terms</th>
                  <th className="px-4 py-2 font-normal">Account book</th>
                  <th className="px-4 py-2 font-normal">Category</th>
                </tr>
              </thead>
              <tbody>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(suppliers as any[]).map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 font-medium text-ink">{s.Supplier_Name}</td>
                    <td className="px-4 py-2 text-ink-soft">{s.Contact_Person ?? "\u2014"}</td>
                    <td className="px-4 py-2 text-ink-soft">{s.Email ?? "\u2014"}</td>
                    <td className="px-4 py-2 font-mono text-ink-soft">{s.Phone ?? "\u2014"}</td>
                    <td className="px-4 py-2 font-mono text-ink-soft">{s.supplier_TIN ?? "\u2014"}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink-soft">{s.discount_percent ?? "\u2014"}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink-soft">{s.terms != null ? `${s.terms} d` : "\u2014"}</td>
                    <td className="px-4 py-2 text-ink-soft">{s.tbl_Acc_Book?.Book_Name ?? "\u2014"}</td>
                    <td className="px-4 py-2 text-ink-soft">
                      {s.tbl_Acc_Category?.Acc_Category_Name ?? "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
