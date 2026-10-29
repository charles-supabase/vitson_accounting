"use client";

import { useEffect, useMemo, useState } from "react";
import { saveMaster } from "@/actions/admin-masters";
import { NoticeModal } from "@/components/notice-modal";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";

export type ClientField = {
  name: string;
  label: string;
  type: "text" | "email" | "int" | "numeric" | "bool" | "select" | "multi";
  required?: boolean;
  placeholder?: string;
  hint?: string;
  defaultValue?: string;
};
export type ClientOption = { value: string; label: string };

type Row = Record<string, unknown> & { id: number };

const LEAVE_MESSAGE = "You have unsaved changes that will be lost. Leave anyway?";

function toValues(fields: ClientField[], row: Row): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = row[f.name];
    out[f.name] = v == null ? "" : typeof v === "boolean" ? String(v) : String(v);
  }
  return out;
}

function blankValues(fields: ClientField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) out[f.name] = f.defaultValue ?? (f.type === "bool" ? "true" : "");
  return out;
}

export function MasterManager({
  slug,
  title,
  singular,
  fields,
  options,
  rows,
}: {
  slug: string;
  title: string;
  singular: string;
  fields: ClientField[];
  options: Record<string, ClientOption[]>;
  rows: Row[];
}) {
  const { setDirty, confirmLeave } = useUnsavedChanges();
  const blank = useMemo(() => blankValues(fields), [fields]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, string>>(blank);
  const [baseline, setBaseline] = useState<Record<string, string>>(blank);
  const [filter, setFilter] = useState("");
  const [multiFilter, setMultiFilter] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  useEffect(() => {
    setDirty(dirty, LEAVE_MESSAGE);
    return () => setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  const labelOf = (f: ClientField, raw: unknown): string => {
    if (raw == null || raw === "") return "\u2014";
    if (f.type === "bool") return raw === true || raw === "true" ? "Yes" : "No";
    if (f.type === "select") return options[f.name]?.find((o) => o.value === String(raw))?.label ?? String(raw);
    if (f.type === "multi") return String(raw).split(",").filter(Boolean).length + " linked";
    return String(raw);
  };

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => fields.some((f) => labelOf(f, r[f.name]).toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, fields]);

  async function loadRow(row: Row) {
    if (row.id !== selectedId && !(await confirmLeave(dirty, LEAVE_MESSAGE))) return;
    const v = toValues(fields, row);
    setSelectedId(row.id);
    setPickedId(row.id);
    setValues(v);
    setBaseline(v);
    setError(null);
  }

  async function newRecord() {
    if (!(await confirmLeave(dirty, LEAVE_MESSAGE))) return;
    setSelectedId(null);
    setPickedId(null);
    setValues(blank);
    setBaseline(blank);
    setError(null);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await saveMaster(slug, selectedId, values);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    const wasNew = selectedId == null;
    setSelectedId(res.id ?? selectedId);
    setPickedId(res.id ?? selectedId);
    setBaseline(values);
    setNotice(wasNew ? `The ${singular} was added.` : `The ${singular} was updated.`);
  }

  function setValue(name: string, v: string) {
    setValues((cur) => ({ ...cur, [name]: v }));
  }

  function renderField(f: ClientField) {
    const id = `f_${f.name}`;
    const v = values[f.name] ?? "";
    const label = (
      <label className="mb-1 block text-sm text-ink-soft" htmlFor={id}>
        {f.label}
        {f.required ? " *" : ""}
      </label>
    );
    const hint = f.hint ? <p className="mt-1 text-xs text-ink-faint">{f.hint}</p> : null;

    if (f.type === "bool") {
      return (
        <div key={f.name} className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={v === "true"} onChange={(e) => setValue(f.name, e.target.checked ? "true" : "false")} />
            {f.label}
          </label>
        </div>
      );
    }
    if (f.type === "select") {
      return (
        <div key={f.name}>
          {label}
          <select id={id} className="field-input" value={v} onChange={(e) => setValue(f.name, e.target.value)}>
            <option value=""></option>
            {(options[f.name] ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hint}
        </div>
      );
    }
    if (f.type === "multi") {
      const chosen = v.split(",").map((s) => s.trim()).filter(Boolean);
      const q = (multiFilter[f.name] ?? "").trim().toLowerCase();
      const opts = (options[f.name] ?? []).filter((o) => !q || o.label.toLowerCase().includes(q));
      const toggle = (val: string) => {
        const next = chosen.includes(val) ? chosen.filter((c) => c !== val) : [...chosen, val];
        setValue(f.name, next.join(","));
      };
      return (
        <div key={f.name} className="sm:col-span-2">
          {label}
          <input
            className="field-input mb-2"
            placeholder="Filter the list\u2026"
            value={multiFilter[f.name] ?? ""}
            onChange={(e) => setMultiFilter((cur) => ({ ...cur, [f.name]: e.target.value }))}
          />
          <div className="max-h-48 overflow-auto rounded border border-line bg-paper p-2">
            {opts.length === 0 && <p className="text-xs text-ink-faint">Nothing matches.</p>}
            {opts.map((o) => (
              <label key={o.value} className="flex items-center gap-2 py-0.5 text-sm">
                <input type="checkbox" checked={chosen.includes(o.value)} onChange={() => toggle(o.value)} />
                {o.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-faint">{chosen.length} selected. {f.hint}</p>
        </div>
      );
    }
    return (
      <div key={f.name}>
        {label}
        <input
          id={id}
          className="field-input"
          type={f.type === "email" ? "email" : "text"}
          inputMode={f.type === "int" ? "numeric" : f.type === "numeric" ? "decimal" : undefined}
          placeholder={f.placeholder}
          value={v}
          onChange={(e) => setValue(f.name, e.target.value)}
        />
        {hint}
      </div>
    );
  }

  const listFields = fields;

  return (
    <div>
      <section className="mb-8 rounded border border-line bg-paper-raised p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">
            {selectedId == null ? `Add ${singular}` : `Edit ${singular}`}
            {selectedId != null && <span className="ml-2 font-mono text-sm font-normal text-ink-faint">#{selectedId}</span>}
          </h2>
          {(selectedId != null || dirty) && (
            <button type="button" className="rounded-sm border border-line px-3 py-1.5 text-sm hover:bg-paper" onClick={() => void newRecord()}>
              New {singular}
            </button>
          )}
        </div>
        <form onSubmit={onSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map(renderField)}
          {error && (
            <p className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2" role="alert">
              {error}
            </p>
          )}
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={busy || (selectedId != null && !dirty)}>
              {busy ? "Saving\u2026" : selectedId == null ? `Add ${singular}` : "Save changes"}
            </button>
          </div>
        </form>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">
              {title} <span className="text-sm font-normal text-ink-faint">({rows.length})</span>
            </h2>
            <p className="text-xs text-ink-soft">Double-click a record to load it into the form above for viewing and editing.</p>
          </div>
          <input className="field-input !w-56" placeholder="Filter\u2026" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-soft">No records yet. Add the first one above.</p>
        ) : (
          <div className="max-h-[28rem] overflow-auto rounded border border-line bg-paper-raised">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-paper-raised">
                <tr className="border-b border-line text-left ledger-label">
                  {listFields.map((f) => (
                    <th key={f.name} className="px-4 py-2 font-normal">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={listFields.length} className="px-4 py-3 text-xs text-ink-faint">
                      No records match the filter.
                    </td>
                  </tr>
                )}
                {shown.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    className={`cursor-pointer border-b border-line last:border-0 hover:bg-paper ${pickedId === r.id ? "bg-paper font-semibold" : ""}`}
                    onClick={() => setPickedId(r.id)}
                    onDoubleClick={() => void loadRow(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void loadRow(r);
                    }}
                    title="Double-click to load"
                  >
                    {listFields.map((f) => (
                      <td key={f.name} className="px-4 py-2 text-ink">
                        {labelOf(f, r[f.name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {notice && <NoticeModal title="Saved successfully" message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
