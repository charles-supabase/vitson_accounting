import { supabaseAdmin } from "@/lib/supabase/admin";
import { ItemForm } from "@/components/item-form";

export const dynamic = "force-dynamic";

export default async function ItemsAdminPage() {
  const [{ data: items, error: itemsError }, { data: bounds }, { data: shades }] = await Promise.all([
    supabaseAdmin
      .from("tbl_Item")
      .select("id, item_name, Price, tbl_Item_Bound(bound_name), tbl_Shade_Classification(Shade_name)")
      .order("item_name"),
    supabaseAdmin.from("tbl_Item_Bound").select("id, bound_name").order("bound_name"),
    supabaseAdmin.from("tbl_Shade_Classification").select("id, Shade_name").order("Shade_name"),
  ]);

  return (
    <div>
      <section className="mb-10 rounded border border-line bg-paper-raised p-6">
        <h2 className="mb-4 font-display text-lg font-semibold text-ink">Add item</h2>
        <ItemForm
          bounds={(bounds ?? []).map((b) => ({ id: b.id, label: b.bound_name }))}
          shades={(shades ?? []).map((s) => ({ id: s.id, label: s.Shade_name }))}
        />
      </section>

      <section>
        <h2 className="mb-4 font-display text-lg font-semibold text-ink">Items</h2>
        {itemsError ? (
          <p className="text-sm text-danger">Could not load items: {itemsError.message}</p>
        ) : !items || items.length === 0 ? (
          <p className="text-sm text-ink-soft">No items yet. Add the first one above.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-line bg-paper-raised">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left ledger-label">
                  <th className="px-4 py-2 font-normal">Item</th>
                  <th className="px-4 py-2 font-normal">Price</th>
                  <th className="px-4 py-2 font-normal">Bound</th>
                  <th className="px-4 py-2 font-normal">Shade</th>
                </tr>
              </thead>
              <tbody>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(items as any[]).map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 font-medium text-ink">{i.item_name}</td>
                    <td className="px-4 py-2 font-mono text-ink-soft">
                      {i.Price != null ? i.Price.toFixed(2) : "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-ink-soft">{i.tbl_Item_Bound?.bound_name ?? "\u2014"}</td>
                    <td className="px-4 py-2 text-ink-soft">
                      {i.tbl_Shade_Classification?.Shade_name ?? "\u2014"}
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
