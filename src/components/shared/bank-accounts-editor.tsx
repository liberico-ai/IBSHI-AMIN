"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";

// Các ngân hàng lương Công ty thường trả (fix cứng). "Khác" → nhập tay tên ngân hàng.
export const SALARY_BANKS = ["VPBank", "HDBank", "BACAbank", "TienphongBank"];
export const MAX_BANK_ACCOUNTS = 5;

export type BankAccount = { bank: string; accountNumber: string };

// Chuẩn hoá giá trị JSON từ DB về mảng hợp lệ.
export function normalizeBankAccounts(v: unknown): BankAccount[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is BankAccount => !!x && typeof (x as any).accountNumber === "string")
    .map((x) => ({ bank: String((x as any).bank || ""), accountNumber: String((x as any).accountNumber || "") }));
}

export function BankAccountsEditor({
  value,
  onChange,
  max = MAX_BANK_ACCOUNTS,
}: {
  value: BankAccount[];
  onChange: (v: BankAccount[]) => void;
  max?: number;
}) {
  const rows = value;
  const inputCls = "w-full px-3 py-2 rounded-lg text-[13px] outline-none border";
  const inputStyle: React.CSSProperties = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };

  function update(i: number, patch: Partial<BankAccount>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function add() {
    if (rows.length >= max) return;
    onChange([...rows, { bank: SALARY_BANKS[0], accountNumber: "" }]);
  }
  function remove(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <div className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có tài khoản ngân hàng.</div>
      )}
      {rows.map((r, i) => {
        const sel = SALARY_BANKS.includes(r.bank) ? r.bank : "Khác";
        return (
          <div key={i} className="flex items-start gap-2">
            <div style={{ width: 170 }} className="shrink-0">
              <select
                value={sel}
                onChange={(e) => { const v = e.target.value; update(i, { bank: v === "Khác" ? "" : v }); }}
                className={inputCls}
                style={inputStyle}
              >
                {SALARY_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                <option value="Khác">Khác</option>
              </select>
              {sel === "Khác" && (
                <input
                  value={r.bank}
                  onChange={(e) => update(i, { bank: e.target.value })}
                  placeholder="Tên ngân hàng"
                  className={inputCls + " mt-1.5"}
                  style={inputStyle}
                />
              )}
            </div>
            <input
              value={r.accountNumber}
              onChange={(e) => update(i, { accountNumber: e.target.value })}
              placeholder="Số tài khoản (STK)"
              className={inputCls + " flex-1"}
              style={inputStyle}
            />
            <button type="button" onClick={() => remove(i)} className="p-2 rounded-md shrink-0" style={{ color: "var(--ibs-danger)" }} title="Xoá tài khoản">
              <X size={14} />
            </button>
          </div>
        );
      })}
      {rows.length < max && (
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded-md"
          style={{ color: "var(--ibs-accent)" }}
        >
          <Plus size={13} /> Thêm tài khoản ({rows.length}/{max})
        </button>
      )}
    </div>
  );
}
