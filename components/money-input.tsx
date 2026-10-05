"use client";

import { useState } from "react";

/**
 * A money field: shows 2 decimals with comma separators (12,500.00) when you are not typing in it,
 * and the plain number while you are. The parent keeps the plain text ("12500.5").
 */
export function MoneyInput({
  value,
  onChange,
  className,
  placeholder,
  disabled,
  ariaLabel,
  onEnter,
}: {
  value: string;
  onChange: (plain: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  onEnter?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const n = Number(value);
  const shown =
    focused || value === "" || !Number.isFinite(n)
      ? value
      : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <input
      inputMode="decimal"
      className={(className ?? "field-input") + " text-right font-mono"}
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      value={shown}
      data-enter-submit={onEnter ? true : undefined}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) onEnter();
      }}
    />
  );
}
