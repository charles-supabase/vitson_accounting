"use client";

import { useEffect } from "react";

/** Opens the browser print dialog once the page has rendered, plus a manual Print button. */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="fixed right-4 top-4 rounded bg-black px-4 py-2 text-sm text-white print:hidden"
    >
      Print
    </button>
  );
}
