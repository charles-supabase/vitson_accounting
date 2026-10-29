"use client";

import { useEffect, useState } from "react";
import { saveUser } from "@/actions/admin-users";
import { NoticeModal } from "@/components/notice-modal";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";

export type UserRow = { id: number; login: string; isSuperAdmin: boolean; active: boolean; modules: string[] };

const MODULES = [
  { key: "requisition", label: "Requisition" },
  { key: "purchase_order", label: "Purchase order" },
  { key: "receiving", label: "Receiving" },
  { key: "voucher", label: "Voucher" },
  { key: "bank", label: "Bank" },
];
const LEAVE_MESSAGE = "You have unsaved changes that will be lost. Leave anyway?";

type Form = { login: string; password: string; isSuperAdmin: boolean; active: boolean; modules: string[] };
const BLANK: Form = { login: "", password: "", isSuperAdmin: false, active: true, modules: [] };

export function UserManager({ users }: { users: UserRow[] }) {
  const { setDirty, confirmLeave } = useUnsavedChanges();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [baseline, setBaseline] = useState<Form>(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  useEffect(() => {
    setDirty(dirty, LEAVE_MESSAGE);
    return () => setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  async function loadUser(u: UserRow) {
    if (u.id !== selectedId && !(await confirmLeave(dirty, LEAVE_MESSAGE))) return;
    const f: Form = { login: u.login, password: "", isSuperAdmin: u.isSuperAdmin, active: u.active, modules: u.modules };
    setSelectedId(u.id);
    setPickedId(u.id);
    setForm(f);
    setBaseline(f);
    setError(null);
  }

  async function newUser() {
    if (!(await confirmLeave(dirty, LEAVE_MESSAGE))) return;
    setSelectedId(null);
    setPickedId(null);
    setForm(BLANK);
    setBaseline(BLANK);
    setError(null);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await saveUser(selectedId, form);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    const wasNew = selectedId == null;
    const saved: Form = { ...form, password: "" };
    setSelectedId(res.id ?? selectedId);
    setPickedId(res.id ?? selectedId);
    setForm(saved);
    setBaseline(saved);
    setNotice(wasNew ? "The user was added." : "The user was updated.");
  }

  const toggleModule = (key: string) =>
    setForm((f) => ({ ...f, modules: f.modules.includes(key) ? f.modules.filter((m) => m !== key) : [...f.modules, key] }));

  return (
    <div>
      <section className="mb-8 rounded border border-line bg-paper-raised p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">
            {selectedId == null ? "Add user" : "Edit user"}
            {selectedId != null && <span className="ml-2 font-mono text-sm font-normal text-ink-faint">#{selectedId}</span>}
          </h2>
          {(selectedId != null || dirty) && (
            <button type="button" className="rounded-sm border border-line px-3 py-1.5 text-sm hover:bg-paper" onClick={() => void newUser()}>
              New user
            </button>
          )}
        </div>
        <form onSubmit={onSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-ink-soft" htmlFor="u_login">Login name *</label>
            <input id="u_login" className="field-input" autoComplete="off" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink-soft" htmlFor="u_pw">{selectedId == null ? "Password *" : "New password"}</label>
            <input
              id="u_pw"
              type="password"
              className="field-input"
              autoComplete="new-password"
              placeholder={selectedId == null ? "at least 8 characters" : "leave blank to keep the current password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-6 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={form.isSuperAdmin} onChange={(e) => setForm({ ...form, isSuperAdmin: e.target.checked })} />
              Super admin (all modules and Administration)
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active
            </label>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1 text-sm text-ink-soft">Modules</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              {MODULES.map((m) => (
                <label key={m.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.modules.includes(m.key)} onChange={() => toggleModule(m.key)} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
          {error && (
            <p className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2" role="alert">
              {error}
            </p>
          )}
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={busy || (selectedId != null && !dirty)}>
              {busy ? "Saving\u2026" : selectedId == null ? "Add user" : "Save changes"}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">
          Users <span className="text-sm font-normal text-ink-faint">({users.length})</span>
        </h2>
        <p className="mb-3 text-xs text-ink-soft">Double-click a user to load it into the form above for viewing and editing.</p>
        <div className="overflow-x-auto rounded border border-line bg-paper-raised">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left ledger-label">
                <th className="px-4 py-2 font-normal">Login</th>
                <th className="px-4 py-2 font-normal">Modules</th>
                <th className="px-4 py-2 font-normal">Super admin</th>
                <th className="px-4 py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  tabIndex={0}
                  className={`cursor-pointer border-b border-line last:border-0 hover:bg-paper ${pickedId === u.id ? "bg-paper font-semibold" : ""}`}
                  onClick={() => setPickedId(u.id)}
                  onDoubleClick={() => void loadUser(u)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void loadUser(u);
                  }}
                  title="Double-click to load"
                >
                  <td className="px-4 py-2 text-ink">{u.login}</td>
                  <td className="px-4 py-2 text-ink-soft">{u.isSuperAdmin ? "all" : u.modules.join(", ") || "\u2014"}</td>
                  <td className="px-4 py-2 text-ink-soft">{u.isSuperAdmin ? "yes" : "no"}</td>
                  <td className="px-4 py-2">
                    <span className={u.active ? "rounded-sm bg-success-soft px-2 py-0.5 text-xs text-success" : "rounded-sm bg-danger-soft px-2 py-0.5 text-xs text-danger"}>
                      {u.active ? "active" : "inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {notice && <NoticeModal title="Saved successfully" message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
