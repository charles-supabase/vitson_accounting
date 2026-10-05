"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { emailPurchaseOrder } from "@/actions/purchase-orders";

export function EmailButton({
  poId,
  to,
  subject,
  body,
  emailed,
}: {
  poId: number;
  to: string | null;
  subject: string;
  body: string;
  emailed: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [toValue, setToValue] = useState(to ?? "");
  const [subjectValue, setSubjectValue] = useState(subject);
  const [message, setMessage] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function send() {
    setError(null);
    startTransition(async () => {
      const res = await emailPurchaseOrder({ poId, to: toValue, subject: subjectValue, message });
      if (res.error) {
        setError(res.error);
        return;
      }
      setSentTo(res.sentTo ?? toValue);
      router.refresh();
    });
  }

  function close() {
    setOpen(false);
    setSentTo(null);
    setError(null);
  }

  return (
    <>
      <a href={`/purchase-order/${poId}/pdf`} target="_blank" rel="noopener noreferrer" className="btn-secondary">
        Download PDF
      </a>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={"btn-primary " + (emailed ? "!bg-green-600 hover:!bg-green-700" : "!bg-orange-500 hover:!bg-orange-600")}
        title={emailed ? "Already emailed" : "Not emailed yet"}
      >
        Email PDF to supplier
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 print:hidden"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isPending) close();
          }}
        >
          <div className="w-full max-w-lg rounded border border-line bg-paper-raised p-6 shadow-sm">
            {sentTo ? (
              <div className="text-center">
                <p className="mb-5 text-sm text-ink">Purchase order sent to {sentTo} with the PDF attached.</p>
                <button type="button" className="btn-primary w-full" onClick={close} autoFocus>
                  OK
                </button>
              </div>
            ) : (
              <>
                <h3 className="mb-4 font-display text-lg font-semibold text-ink">Email purchase order</h3>
                <div className="space-y-3">
                  <div>
                    <label className="ledger-label mb-1 block">To</label>
                    <input
                      className="field-input"
                      type="email"
                      value={toValue}
                      onChange={(e) => setToValue(e.target.value)}
                      placeholder={to ? undefined : "This supplier has no email on file. Type one."}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="ledger-label mb-1 block">Subject</label>
                    <input className="field-input" value={subjectValue} onChange={(e) => setSubjectValue(e.target.value)} />
                  </div>
                  <div>
                    <label className="ledger-label mb-1 block">Message</label>
                    <textarea className="field-input h-32" value={message} onChange={(e) => setMessage(e.target.value)} />
                  </div>
                  <p className="text-xs text-ink-soft">The purchase order is attached as a PDF (PO form layout).</p>
                </div>
                {error && (
                  <p className="mt-3 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                    {error}
                  </p>
                )}
                <div className="mt-5 flex gap-2">
                  <button type="button" className="btn-secondary flex-1" onClick={close} disabled={isPending}>
                    Cancel
                  </button>
                  <button type="button" className="btn-primary flex-1" onClick={send} disabled={isPending}>
                    {isPending ? "Sending…" : "Send with PDF"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
