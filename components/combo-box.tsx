"use client";

import { useEffect, useRef, useState } from "react";

export type Option = { id: number; label: string; columns?: string[] };

export function ComboBox({
  options,
  value,
  onChange,
  onCreateNew,
  placeholder,
  disabled,
  inputClassName,
  columnTemplate,
  columnAlign,
  columnClasses,
  listMinWidth,
}: {
  options: Option[];
  value: number | null;
  onChange: (id: number | null) => void;
  onCreateNew?: (typedLabel: string) => void;
  placeholder?: string;
  disabled?: boolean;
  inputClassName?: string;
  /** CSS grid-template-columns used to line up option.columns, e.g. "5rem 6rem 1fr 7rem". */
  columnTemplate?: string;
  columnAlign?: ("left" | "right")[];
  /** Extra classes per column, e.g. text colours, to make wide lists easier to read. */
  columnClasses?: string[];
  /** Makes the dropdown list wider than the box itself, e.g. "36rem". */
  listMinWidth?: string;
}) {
  const selected = options.find((o) => o.id === value) ?? null;
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  // false until the user types: opening the list (focus or the arrow) shows every option
  const [filterActive, setFilterActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the displayed text in sync when the selection changes from outside
  // (e.g. auto-filled after an item is chosen elsewhere on the page).
  useEffect(() => {
    setQuery(selected?.label ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered =
    !filterActive || query.trim() === ""
      ? options
      : options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));

  // bring the current selection into view whenever the list opens
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open]);

  function openAll() {
    setFilterActive(false);
    setOpen(true);
  }

  const exactMatch = options.find((o) => o.label.toLowerCase() === query.trim().toLowerCase());
  const showCreatePrompt =
    !!onCreateNew && filterActive && query.trim() !== "" && !exactMatch && !options.some((o) => o.id === value && o.label === query);

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        className={inputClassName ?? "field-input"}
        style={{ paddingRight: "2rem" }}
        placeholder={placeholder}
        disabled={disabled}
        value={query}
        onFocus={openAll}
        // Leaving the box without a (confirmed) pick restores the text of the real selection.
        onBlur={() => {
          setQuery(selected?.label ?? "");
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            openAll();
            return;
          }
          if (e.key === "Enter" && open) {
            // typed text: take the best match; otherwise keep the current selection
            if (filterActive && query.trim() !== "") {
              const pick = exactMatch ?? filtered[0];
              if (pick) {
                onChange(pick.id);
                setQuery(pick.label);
              }
            }
            setOpen(false);
          }
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setFilterActive(true);
          setOpen(true);
          if (e.target.value.trim() === "") onChange(null);
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Show all options"
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-ink-soft hover:text-ink disabled:opacity-40"
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) {
            setOpen(false);
          } else {
            inputRef.current?.focus();
            openAll();
          }
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && !disabled && (
        <div
          ref={listRef}
          style={{
            backgroundColor: "#d6dbc8",
            color: "#14213D",
            ...(listMinWidth ? { minWidth: listMinWidth, maxWidth: "90vw" } : {}),
          }}
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-sm border border-[#b8bfa6] shadow-md"
        >
          {filtered.length === 0 && !showCreatePrompt && (
            <p className="px-3 py-2 text-xs text-[#6b7280]">No matches</p>
          )}
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              data-selected={o.id === value}
              className={"combo-option block w-full px-3 py-2 text-left text-sm " + (o.id === value ? "font-medium" : "")}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o.id);
                setQuery(o.label);
                setOpen(false);
              }}
            >
              {o.columns && columnTemplate ? (
                <span className="grid items-baseline gap-3" style={{ gridTemplateColumns: columnTemplate }}>
                  {o.columns.map((c, i) => (
                    <span
                      key={i}
                      className={"truncate " + (columnAlign?.[i] === "right" ? "text-right font-mono " : "") + (columnClasses?.[i] ?? "")}
                    >
                      {c}
                    </span>
                  ))}
                </span>
              ) : (
                o.label
              )}
            </button>
          ))}
          {showCreatePrompt && (
            <button
              type="button"
              className="combo-option block w-full border-t border-[#b8bfa6] px-3 py-2 text-left text-sm text-accent"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                onCreateNew!(query.trim());
              }}
            >
              + Add “{query.trim()}” as new…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
