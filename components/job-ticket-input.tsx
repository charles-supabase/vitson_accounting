"use client";

import { useRef } from "react";
import { formatJobTicketInput } from "@/lib/job-ticket";

/**
 * Text box for a job ticket. Dashes are put in while typing: C2 shows "C2-", C200607 shows "C2-00607-", and so on
 * up to A#-#####-#-AA-#. Use it instead of <input> wherever a job ticket is typed or searched.
 * The value passed to onChange is already formatted.
 */
export function JobTicketInput({
  value,
  onChange,
  className = "field-input",
  placeholder = "A#-#####-#-AA-#",
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className" | "placeholder">) {
  const prev = useRef(value);
  return (
    <input
      {...rest}
      className={`${className} font-mono`}
      placeholder={placeholder}
      maxLength={15}
      autoComplete="off"
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        const deleting = raw.length < prev.current.length;
        const next = formatJobTicketInput(raw, { deleting });
        prev.current = next;
        onChange(next);
      }}
    />
  );
}
