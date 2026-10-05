import { requireModule } from "@/lib/auth";
import { getPoPrintData } from "@/lib/po-data";
import { buildPoPdf } from "@/lib/po-pdf";

export const dynamic = "force-dynamic";

/** Downloads the purchase order as a PDF in the company form layout. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireModule("purchase_order");
  const { id } = await params;
  const data = await getPoPrintData(Number(id));
  if (!data) return new Response("Purchase order not found", { status: 404 });

  const bytes = await buildPoPdf(data);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="PO-${data.poNo}.pdf"`,
    },
  });
}
