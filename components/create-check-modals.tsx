"use client";

import { useEffect, useState, useTransition } from "react";
import { currentYm } from "@/lib/inventory-format";

export type NumberBank = { id: number; label: string };
export type CreateResult = { error?: string; created?: number; first?: string; last?: string };
export type CreateChecksFn = (bankId: number, start: string, count: number) => Promise<CreateResult>;
export type CreateDmsFn = (bankId: number, ym: string, count: number) => Promise<CreateResult>;

export function ModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded border border-line bg-paper-raised p-6 shadow-sm">
        <h3 className="mb-4 font-display text-lg font-semibold text-ink">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ChecksForm({
  bank,
  createChecks,
  onClose,
  onDone,
}: {
  bank: NumberBank;
  createChecks: CreateChecksFn;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [start, setStart] = useState("");
  const [countStr, setCountStr] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = Number(countStr);
  const startOk = /^\d{1,15}$/.test(start.trim());
  const countOk = Number.isInteger(count) && count >= 1 && count <= 999;

  function submit() {
    setAttempted(true);
    setError(null);
    if (!startOk || !countOk) return;
    startTransition(async () => {
      // one extra check is always added: 100 wanted -> 101 created
      const res = await createChecks(bank.id, start, count + 1);
      if (res.error) {
        setError(res.error);
        return;
      }
      onDone(`Created ${res.created} checks for ${bank.label}: ${res.first} to ${res.last}.`);
    });
  }

  return (
    <>
      <div className="space-y-3">
        <div>
          <label className="ledger-label mb-1 block">Starting check number</label>
          <input
            className={attempted && !startOk ? "field-input-error" : "field-input"}
            inputMode="numeric"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="ledger-label mb-1 block">Number of checks</label>
          <input
            type="number"
            min="1"
            max="999"
            className={attempted && !countOk ? "field-input-error" : "field-input"}
            value={countStr}
            onChange={(e) => setCountStr(e.target.value)}
          />
          {attempted && !countOk && <p className="mt-1 text-[11px] text-danger">Enter a whole number from 1 to 999.</p>}
          <p className="mt-1 text-[11px] text-ink-faint">One extra check is always added.</p>
        </div>
      </div>
      {error && (
        <p className="mt-3 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={isPending}>
          Cancel
        </button>
        <button type="button" className="btn-primary flex-1" onClick={submit} disabled={isPending}>
          {isPending ? "Creating…" : "Create"}
        </button>
      </div>
    </>
  );
}

function DmForm({
  bank,
  createDms,
  onClose,
  onDone,
}: {
  bank: NumberBank;
  createDms: CreateDmsFn;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [ym, setYm] = useState(currentYm());
  const [countStr, setCountStr] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = Number(countStr);
  const ymOk = /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
  const countOk = Number.isInteger(count) && count >= 1 && count <= 500;

  function submit() {
    setAttempted(true);
    setError(null);
    if (!ymOk || !countOk) return;
    startTransition(async () => {
      const res = await createDms(bank.id, ym, count);
      if (res.error) {
        setError(res.error);
        return;
      }
      onDone(`Created ${res.created} DM${res.created === 1 ? "" : "s"} for ${bank.label}: ${res.first} to ${res.last}.`);
    });
  }

  return (
    <>
      <div className="space-y-3">
        <div>
          <label className="ledger-label mb-1 block">Month and year</label>
          <input
            type="month"
            className={attempted && !ymOk ? "field-input-error" : "field-input"}
            value={ym}
            onChange={(e) => setYm(e.target.value)}
          />
        </div>
        <div>
          <label className="ledger-label mb-1 block">Number of DMs</label>
          <input
            type="number"
            min="1"
            max="500"
            className={attempted && !countOk ? "field-input-error" : "field-input"}
            value={countStr}
            onChange={(e) => setCountStr(e.target.value)}
            autoFocus
          />
          {attempted && !countOk && <p className="mt-1 text-[11px] text-danger">Enter a whole number from 1 to 500.</p>}
        </div>
      </div>
      {error && (
        <p className="mt-3 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={isPending}>
          Cancel
        </button>
        <button type="button" className="btn-primary flex-1" onClick={submit} disabled={isPending}>
          {isPending ? "Creating…" : "Create"}
        </button>
      </div>
    </>
  );
}

export function CreateChecksModal(props: {
  bank: NumberBank;
  createChecks: CreateChecksFn;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <ModalFrame title={`Create checks · ${props.bank.label}`} onClose={props.onClose}>
      <ChecksForm {...props} />
    </ModalFrame>
  );
}

export function CreateDmModal(props: {
  bank: NumberBank;
  createDms: CreateDmsFn;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <ModalFrame title={`Create DM · ${props.bank.label}`} onClose={props.onClose}>
      <DmForm {...props} />
    </ModalFrame>
  );
}

/** One pop-up for both: pick Check or DM, then fill in the same form as the Bank module. */
export function CreateNumbersModal({
  bank,
  createChecks,
  createDms,
  onClose,
  onDone,
}: {
  bank: NumberBank;
  createChecks: CreateChecksFn;
  createDms: CreateDmsFn;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [kind, setKind] = useState<"check" | "dm">("check");
  return (
    <ModalFrame title={`Create check / DM · ${bank.label}`} onClose={onClose}>
      <div className="mb-4 flex gap-2" role="tablist">
        {(["check", "dm"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={kind === k ? "btn-primary flex-1" : "btn-secondary flex-1"}
          >
            {k === "check" ? "Check" : "DM"}
          </button>
        ))}
      </div>
      {kind === "check" ? (
        <ChecksForm key="check" bank={bank} createChecks={createChecks} onClose={onClose} onDone={onDone} />
      ) : (
        <DmForm key="dm" bank={bank} createDms={createDms} onClose={onClose} onDone={onDone} />
      )}
    </ModalFrame>
  );
}
