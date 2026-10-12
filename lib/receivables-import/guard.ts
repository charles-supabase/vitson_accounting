import "server-only";
import { checkSession } from "@/lib/session";
import { ImportError } from "./errors";

/**
 * Same protection as the Accounts Receivable page, but without redirects:
 * 401 when not signed in, 403 when signed in but not allowed (wrong module, or a
 * regular user outside the office network), 503 if the user lookup fails.
 */
export async function assertCanImport(): Promise<void> {
  const check = await checkSession();
  if (!check.ok) {
    if (check.status === 401) throw new ImportError("UNAUTHORIZED", "Please sign in to continue.", { status: 401 });
    if (check.status === 503) {
      throw new ImportError("FORBIDDEN", "Access could not be verified right now. Please try again.", { status: 503 });
    }
    throw new ImportError("FORBIDDEN", "You do not have access to Accounts Receivable.", { status: 403 });
  }
  if (!check.session.isSuperAdmin && !check.session.modules.includes("accounts_receivable")) {
    throw new ImportError("FORBIDDEN", "You do not have access to Accounts Receivable.", { status: 403 });
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
