"use client";

import { useCallback, useEffect, useState } from "react";
import RequireAdmin from "@/components/RequireAdmin";
import ModalBackdrop from "@/components/ModalBackdrop";

type FinanceAccountType = "CASH" | "BANK" | "MOBILE_MONEY";

type Account = {
  id: string;
  type: FinanceAccountType;
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  openingBalance: number;
  archived: boolean;
  balance: number;
};

type CreditSale = {
  saleId: string;
  saleDate: string;
  creditorName: string;
  totalAmount: number;
  cashierName: string | null;
};

type LedgerEntry = {
  id: string;
  type: string;
  amount: number;
  reference: string | null;
  performedBy: string | null;
  createdAt: string;
};

const TYPE_LABELS: Record<FinanceAccountType, string> = {
  CASH: "Cash",
  BANK: "Bank",
  MOBILE_MONEY: "Mobile Money",
};

export default function FinancePage() {
  return (
    <RequireAdmin>
      <FinanceContent />
    </RequireAdmin>
  );
}

function FinanceContent() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditSales, setCreditSales] = useState<CreditSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [ledgerAccount, setLedgerAccount] = useState<Account | null>(null);
  const [collectingSaleId, setCollectingSaleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, c] = await Promise.all([
      fetch("/api/finance/accounts").then((r) => r.json()),
      fetch("/api/finance/credit-sales").then((r) => r.json()),
    ]);
    setAccounts(a);
    setCreditSales(c);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const totalOutstandingCredit = creditSales.reduce((s, c) => s + c.totalAmount, 0);

  async function collect(saleId: string, accountId: string) {
    const res = await fetch(`/api/finance/credit-sales/${saleId}/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Failed to record collection");
      return;
    }
    setCollectingSaleId(null);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Finance</h1>
          <p className="text-slate-500">Cash/bank/mobile money accounts, deposits, and credit sale collections.</p>
        </div>
        <button className="btn" onClick={() => setShowAddAccount(true)}>
          + Add Account
        </button>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card">
              <p className="text-sm text-slate-500">Total across accounts</p>
              <p className="text-2xl font-bold text-slate-900">${totalBalance.toFixed(2)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-slate-500">Outstanding credit (owed by customers)</p>
              <p className="text-2xl font-bold text-slate-900">${totalOutstandingCredit.toFixed(2)}</p>
            </div>
          </div>

          <div className="card overflow-x-auto p-0">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Details</th>
                  <th>Balance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="badge bg-slate-100 text-slate-600">{TYPE_LABELS[a.type]}</span>
                    </td>
                    <td className="font-medium">{a.name}</td>
                    <td className="text-slate-500">
                      {a.bankName || a.accountNumber
                        ? [a.bankName, a.accountNumber].filter(Boolean).join(" · ")
                        : "—"}
                    </td>
                    <td className="font-medium">${a.balance.toFixed(2)}</td>
                    <td className="text-right">
                      <button className="btn-row" onClick={() => setLedgerAccount(a)}>
                        Ledger
                      </button>
                    </td>
                  </tr>
                ))}
                {accounts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No accounts yet — add your cash drawer and bank accounts to start tracking balances.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <DepositForm accounts={accounts} onDone={load} />

          <div>
            <h2 className="mb-2 font-semibold text-slate-900">Outstanding Credit Sales</h2>
            <div className="card overflow-x-auto p-0">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Buyer</th>
                    <th>Amount</th>
                    <th>Cashier</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {creditSales.map((c) => (
                    <tr key={c.saleId}>
                      <td>{new Date(c.saleDate).toLocaleDateString()}</td>
                      <td className="font-medium">{c.creditorName}</td>
                      <td>${c.totalAmount.toFixed(2)}</td>
                      <td className="text-slate-500">{c.cashierName ?? "—"}</td>
                      <td className="text-right">
                        {collectingSaleId === c.saleId ? (
                          <CollectControl
                            accounts={accounts}
                            onCollect={(accountId) => collect(c.saleId, accountId)}
                            onCancel={() => setCollectingSaleId(null)}
                          />
                        ) : (
                          <button className="btn-row" onClick={() => setCollectingSaleId(c.saleId)}>
                            Collect
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {creditSales.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        No outstanding credit sales.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showAddAccount && (
        <AddAccountModal
          onClose={() => setShowAddAccount(false)}
          onSaved={() => {
            setShowAddAccount(false);
            load();
          }}
        />
      )}

      {ledgerAccount && <LedgerModal account={ledgerAccount} onClose={() => setLedgerAccount(null)} />}
    </div>
  );
}

function CollectControl({
  accounts,
  onCollect,
  onCancel,
}: {
  accounts: Account[];
  onCollect: (accountId: string) => void;
  onCancel: () => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <span className="inline-flex items-center gap-1">
      <select className="input w-40 py-1" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
        <option value="">Into which account?</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <button
        className="text-sm font-medium text-brand-600 disabled:opacity-40"
        disabled={!accountId || busy}
        onClick={() => {
          setBusy(true);
          onCollect(accountId);
        }}
      >
        Confirm
      </button>
      <button className="text-sm text-slate-400" onClick={onCancel}>
        ✕
      </button>
    </span>
  );
}

function DepositForm({ accounts, onDone }: { accounts: Account[]; onDone: () => void }) {
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const canSubmit = !!(fromAccountId && toAccountId && fromAccountId !== toAccountId && Number(amount) > 0);

  async function submit() {
    setSubmitting(true);
    setError("");
    setSuccess(false);
    const res = await fetch("/api/finance/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAccountId, toAccountId, amount, note: note || undefined }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to record deposit");
      return;
    }
    setAmount("");
    setNote("");
    setSuccess(true);
    onDone();
  }

  return (
    <div className="card">
      <h2 className="mb-3 font-semibold text-slate-900">Move Money Between Accounts</h2>
      <p className="mb-3 text-sm text-slate-500">
        Cash collected at the till, deposited into the bank — records a matching debit and credit.
      </p>
      <form
        className="grid grid-cols-2 gap-3 md:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!submitting && canSubmit) submit();
        }}
      >
        <select className="input" value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
          <option value="">From…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className="input" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
          <option value="">To…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="number"
          step="0.01"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className="input"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="btn" disabled={submitting || !canSubmit}>
          Record
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-2 text-sm text-emerald-600">Deposit recorded.</p>}
    </div>
  );
}

function AddAccountModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<FinanceAccountType>("BANK");
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = !!name.trim();

  async function submit() {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/finance/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        name,
        bankName: bankName || undefined,
        accountNumber: accountNumber || undefined,
        openingBalance: openingBalance || undefined,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save");
      return;
    }
    onSaved();
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!submitting && canSubmit) submit();
        }}
      >
        <h2 className="mb-4 text-lg font-semibold">Add Account</h2>
        <div className="grid grid-cols-2 gap-3">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as FinanceAccountType)}>
            <option value="CASH">Cash</option>
            <option value="BANK">Bank</option>
            <option value="MOBILE_MONEY">Mobile Money</option>
          </select>
          <input className="input" placeholder="Name (e.g. CBE Checking)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {type === "BANK" && (
            <>
              <input className="input" placeholder="Bank name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              <input
                className="input"
                placeholder="Account number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </>
          )}
          <input
            className="input col-span-2"
            type="number"
            step="0.01"
            placeholder="Opening balance (optional)"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={submitting || !canSubmit}>
            Save Account
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

const TXN_TYPE_LABELS: Record<string, string> = {
  SALE: "Sale",
  CASH_DEPOSIT: "Cash deposit",
  CREDIT_COLLECTED: "Credit collected",
  BILL_PAYMENT: "Bill payment",
  PURCHASE_PAYMENT: "Purchase payment",
  ADJUSTMENT: "Adjustment",
};

function LedgerModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const [ledger, setLedger] = useState<LedgerEntry[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/finance/accounts/${account.id}/ledger`)
      .then((r) => r.json())
      .then((d) => {
        setLedger(d.ledger);
        setBalance(d.balance);
      });
  }, [account.id]);

  return (
    <ModalBackdrop onClose={onClose} maxWidth="max-w-2xl" className="max-h-[85vh] overflow-y-auto">
      <h2 className="mb-1 text-lg font-semibold">Ledger — {account.name}</h2>
      <p className="mb-4 text-sm text-slate-500">
        Balance: <span className="font-semibold text-slate-900">${(balance ?? account.balance).toFixed(2)}</span>
      </p>

      {!ledger ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : ledger.length === 0 ? (
        <p className="text-sm text-slate-500">No transactions recorded yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase text-slate-500">
              <th className="py-1 text-left">When</th>
              <th className="py-1 text-left">Type</th>
              <th className="py-1 text-left">Reference</th>
              <th className="py-1 text-left">By</th>
              <th className="py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((t) => (
              <tr key={t.id} className="border-b border-slate-100">
                <td className="py-1">{new Date(t.createdAt).toLocaleString()}</td>
                <td className="py-1">{TXN_TYPE_LABELS[t.type] ?? t.type}</td>
                <td className="py-1 text-slate-500">{t.reference ?? "—"}</td>
                <td className="py-1">{t.performedBy ?? "—"}</td>
                <td className={`py-1 text-right ${t.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {t.amount > 0 ? "+" : ""}
                  {t.amount.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-5 flex justify-end">
        <button className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalBackdrop>
  );
}
