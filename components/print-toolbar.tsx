"use client";

import { useEffect } from "react";

/** On-screen Print / Close buttons for the report pages (hidden on paper). Opens the print dialog once. */
export function PrintToolbar({ autoPrint = true }: { autoPrint?: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [autoPrint]);

  return (
    <div className="mb-4 flex gap-2 print:hidden">
      <button type="button" className="btn-primary" onClick={() => window.print()}>
        Print
      </button>
      <button type="button" className="btn-secondary" onClick={() => window.close()}>
        Close
      </button>
    </div>
  );
}
