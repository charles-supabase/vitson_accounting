"use client";

export function InfoModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded border border-line bg-paper-raised p-6 text-center shadow-sm">
        <p className="mb-5 text-sm text-ink">{message}</p>
        <button type="button" onClick={onClose} className="btn-primary w-full" autoFocus>
          OK
        </button>
      </div>
    </div>
  );
}
