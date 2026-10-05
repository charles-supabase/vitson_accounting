"use client";

import { useRouter } from "next/navigation";

export function MonthPicker({ value }: { value: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      <label className="ledger-label" htmlFor="ym">
        Month and year
      </label>
      <input
        id="ym"
        type="month"
        className="field-input !w-auto"
        value={value}
        onChange={(e) => {
          if (e.target.value) router.push(`?ym=${e.target.value}`);
        }}
      />
    </div>
  );
}
