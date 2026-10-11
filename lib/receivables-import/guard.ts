import "server-only";
import { requireModule } from "@/lib/auth";
import { ImportError } from "./errors";

/**
 * Same protection as the Accounts Receivable page: the signed-in user must hold
 * the "accounts_receivable" module. requireModule() is written for pages and may
 * redirect instead of returning; in an API route a redirect is turned into a
 * 401 (not signed in) or 403 (signed in without the module).
 */
export async function assertCanImport(): Promise<void> {
  try {
    await requireModule("accounts_receivable");
  } catch (err: any) {
    const digest = typeof err?.digest === "string" ? err.digest : "";
    if (digest.startsWith("NEXT_REDIRECT")) {
      // digest format: NEXT_REDIRECT;<replace|push>;<url>;<status>;
      const target = digest.split(";")[2] ?? "";
      const toLogin = target === "/" || /login|sign-?in/i.test(target);
      throw toLogin
        ? new ImportError("UNAUTHORIZED", "Please sign in to continue.", { status: 401 })
        : new ImportError("FORBIDDEN", "You do not have access to Accounts Receivable.", { status: 403 });
    }
    throw new ImportError("FORBIDDEN", "You do not have access to Accounts Receivable.", { status: 403, cause: err });
  }
}

/** Blocks cross-site POSTs (the session is a cookie): if an Origin header is sent it must match this host. */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    /* fall through to the rejection below */
  }
  if (!host || originHost !== host) {
    throw new ImportError("FORBIDDEN", "This request was not accepted.", { status: 403 });
  }
}
