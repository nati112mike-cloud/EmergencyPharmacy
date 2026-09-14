"use client";

import { useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  sku: string;
  name: string;
  price: number;
  displayStock: number;
  storeStock: number;
  unit: string;
  category: { name: string } | null;
};

type CartLine = { productId: string; name: string; price: number; quantity: number; stock: number };

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [cashierName, setCashierName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ saleId: string; totalAmount: number } | null>(null);

  useEffect(() => {
    fetch("/api/products").then((r) => r.json()).then(setProducts);
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => u && setCashierName((prev) => prev || u.name))
      .catch(() => {});
  }, []);

  const results = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, query]);

  function addToCart(p: Product) {
    setReceipt(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === p.id ? { ...l, quantity: Math.min(l.quantity + 1, p.displayStock) } : l
        );
      }
      return [...prev, { productId: p.id, name: p.name, price: p.price, quantity: 1, stock: p.displayStock }];
    });
    setQuery("");
  }

  function updateQty(productId: string, quantity: number) {
    setCart((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.max(1, quantity) } : l))
    );
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  const total = cart.reduce((s, l) => s + l.price * l.quantity, 0);

  async function checkout() {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        paymentMethod,
        cashierName: cashierName || undefined,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Checkout failed");
      return;
    }
    const data = await res.json();
    setReceipt(data);
    setCart([]);
    fetch("/api/products").then((r) => r.json()).then(setProducts);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Point of Sale</h1>
        <p className="text-slate-500">Search a product, add it to the cart, and check out.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="card md:col-span-2">
          <input
            className="input"
            placeholder="Search by product name or SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {results.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => addToCart(p)}
                    disabled={p.displayStock <= 0}
                  >
                    <span>
                      {p.name} <span className="text-slate-400">({p.sku})</span>
                      {p.category && (
                        <span className="badge ml-2 bg-slate-100 text-slate-600">{p.category.name}</span>
                      )}
                    </span>
                    <span className="text-slate-500">
                      ${p.price.toFixed(2)} ·{" "}
                      {p.displayStock <= 0
                        ? p.storeStock > 0
                          ? "on shelf: 0 (in store)"
                          : "out of stock"
                        : `${p.displayStock} on shelf`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mb-2 mt-6 font-semibold text-slate-900">Cart</h2>
          {cart.length === 0 ? (
            <p className="text-sm text-slate-500">Cart is empty. Search above to add items.</p>
          ) : (
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l) => (
                  <tr key={l.productId}>
                    <td>{l.name}</td>
                    <td>
                      <QtyStepper
                        value={l.quantity}
                        max={l.stock}
                        onChange={(qty) => updateQty(l.productId, qty)}
                      />
                    </td>
                    <td>${l.price.toFixed(2)}</td>
                    <td>${(l.price * l.quantity).toFixed(2)}</td>
                    <td>
                      <button className="text-sm text-red-600" onClick={() => removeLine(l.productId)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card h-fit space-y-3">
          <h2 className="font-semibold text-slate-900">Checkout</h2>
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="INSURANCE">Insurance</option>
            <option value="OTHER">Other</option>
          </select>
          <input
            className="input"
            placeholder="Cashier name (optional)"
            value={cashierName}
            onChange={(e) => setCashierName(e.target.value)}
          />
          <button className="btn w-full" disabled={cart.length === 0 || submitting} onClick={checkout}>
            {submitting ? "Processing…" : "Complete Sale"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {receipt && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
              Sale recorded — total ${receipt.totalAmount.toFixed(2)} (receipt {receipt.saleId.slice(-6)})
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Touch-friendly qty control: big +/- tap targets (a bare `type=number`
 * input is fiddly on a phone keyboard) plus a direct-entry field for when
 * someone wants to type a specific number.
 */
function QtyStepper({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (qty: number) => void;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => setText(String(value)), [value]);

  function commit(next: string) {
    const n = Math.max(1, Math.min(max, Math.round(Number(next)) || 1));
    setText(String(n));
    onChange(n);
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-lg leading-none text-slate-600 active:bg-slate-100"
        onClick={() => commit(String(value - 1))}
        disabled={value <= 1}
      >
        −
      </button>
      <input
        type="number"
        min={1}
        max={max}
        className="input w-14 px-1 text-center"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
      />
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-lg leading-none text-slate-600 active:bg-slate-100"
        onClick={() => commit(String(value + 1))}
        disabled={value >= max}
      >
        +
      </button>
    </div>
  );
}
