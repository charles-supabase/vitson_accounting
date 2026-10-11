import { NextResponse } from "next/server";
import { ImportError } from "@/lib/receivables-import/errors";
import { assertCanImport, assertSameOrigin } from "@/lib/receivables-import/guard";
import { importReceivables } from "@/lib/receivables-import/receivables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function errorResponse(err: unknown) {
  if (err instanceof ImportError) {
    if (err.original) console.error(`[import] ${err.code}:`, err.original);
    return NextResponse.json(
      { success: false, error: { code: err.code, message: err.message, details: err.details }, changesMade: false },
      { status: err.status },
    );
  }
  console.error("[import] Unexpected error:", err);
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "UNEXPECTED_ERROR",
        message: "An unexpected error occurred. Please try again; if it keeps happening, contact the administrator.",
      },
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await assertCanImport();

    let body: any;
    try {
      body = await request.json();
    } catch {
      throw new ImportError("INVALID_REQUEST", "The request was not valid. Please reload the page and try again.", { status: 400 });
    }
    if (!body || typeof body !== "object") {
      throw new ImportError("INVALID_REQUEST", "The request was not valid. Please reload the page and try again.", { status: 400 });
    }

    const result = await importReceivables({
      month: body.month,
      year: body.year,
      allowEmptyReplacement: body.allowEmptyReplacement === true,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
