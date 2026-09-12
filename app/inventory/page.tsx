"use client";

import { Fragment, useEffect, useState, useCallback } from "react";

type Batch = {
  id: string;
  batchNumber: string;
  quantity: number;
  costPrice: number;
  expiryDate: string;
  location: "STORE" | "DISPLAY";
};

type Category = { id: string; name: string };

type Product = {
  id: string;
  sku: string;
  name: string;
  categoryId: string | null;
  category: Category | null;
  unit: string;
  price: number;
  reorderPoint: number;
  reorderQty: number;
  stock: number;
  storeStock: number;
  displayStock: number;
  batches: Batch[];
};

type Supplier = { id: string; name: string };

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function stockBadge(stock: number, reorderPoint: number) {
  if (stock <= 0) return <span className="badge badge-danger">Out of stock</span>;
  if (stock <= reorderPoint) return <span className="badge badge-warning">Low: {stock}</span>;
  return <span className="badge badge-ok">{stock} in stock</span>;
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [batchFormFor, setBatchFormFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [transferBusyId, setTransferBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s, c] = await Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/suppliers").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ]);
    setProducts(p);
    setSuppliers(s);
    setCategories(c);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = products.filter((p) => {
    const matchesQuery =
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.sku.toLowerCase().includes(query.toLowerCase()) ||
      (p.category?.name ?? "").toLowerCase().includes(query.toLowerCase());
    const matchesCategory = !categoryFilter || p.categoryId === categoryFilter;
    return matchesQuery && matchesCategory;
  });

  async function transfer(batchId: string, quantity: number) {
    setTransferBusyId(batchId);
    const res = await fetch(`/api/batches/${batchId}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    setTransferBusyId(null);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Transfer failed");
      return;
    }
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-slate-500">Store vs. display stock, expiry tracking, and reorder points.</p>
        </div>
        <button className="btn" onClick={() => setShowAddProduct(true)}>
          + Add Product
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          className="input max-w-sm"
          placeholder="Search by name, SKU, or category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="input max-w-xs"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Store</th>
                <th>Display</th>
                <th>Soonest Expiry</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const soonest = [...p.batches]
                  .filter((b) => b.quantity > 0)
                  .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())[0];
                const needsShelfRestock = p.displayStock <= 0 && p.storeStock > 0;
                return (
                  <Fragment key={p.id}>
                    <tr>
                      <td className="font-mono text-xs">{p.sku}</td>
                      <td className="font-medium">{p.name}</td>
                      <td>{p.category?.name ?? <span className="text-slate-400">Uncategorized</span>}</td>
                      <td>${p.price.toFixed(2)}</td>
                      <td>{p.storeStock}</td>
                      <td>
                        {p.displayStock}
                        {needsShelfRestock && (
                          <span className="badge badge-warning ml-2">Restock shelf</span>
                        )}
                      </td>
                      <td>
                        {soonest ? (
                          <span
                            className={
                              daysUntil(soonest.expiryDate) < 0
                                ? "badge badge-danger"
                                : daysUntil(soonest.expiryDate) <= 90
                                ? "badge badge-warning"
                                : "text-slate-500"
                            }
                          >
                            {new Date(soonest.expiryDate).toLocaleDateString()}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="space-x-2 text-right">
                        <button
                          className="text-sm font-medium text-brand-600"
                          onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                        >
                          {expandedId === p.id ? "Hide" : "Batches"}
                        </button>
                        <button
                          className="text-sm font-medium text-brand-600"
                          onClick={() => setBatchFormFor(batchFormFor === p.id ? null : p.id)}
                        >
                          Receive stock
                        </button>
                      </td>
                    </tr>
                    {expandedId === p.id && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50">
                          <div className="p-3">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs uppercase text-slate-500">
                                  <th className="py-1 text-left">Batch #</th>
                                  <th className="py-1 text-left">Location</th>
                                  <th className="py-1 text-left">Qty</th>
                                  <th className="py-1 text-left">Cost</th>
                                  <th className="py-1 text-left">Expiry</th>
                                  <th className="py-1 text-left"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.batches.map((b) => (
                                  <tr key={b.id}>
                                    <td className="py-1">{b.batchNumber}</td>
                                    <td className="py-1">
                                      <span
                                        className={`badge ${b.location === "DISPLAY" ? "badge-ok" : "text-slate-500"}`}
                                      >
                                        {b.location}
                                      </span>
                                    </td>
                                    <td className="py-1">{b.quantity}</td>
                                    <td className="py-1">${b.costPrice.toFixed(2)}</td>
                                    <td className="py-1">{new Date(b.expiryDate).toLocaleDateString()}</td>
                                    <td className="py-1 text-right">
                                      {b.quantity > 0 && (
                                        <TransferControl
                                          batch={b}
                                          busy={transferBusyId === b.id}
                                          onTransfer={(qty) => transfer(b.id, qty)}
                                        />
                                      )}
                                    </td>
                                  </tr>
                                ))}
                                {p.batches.length === 0 && (
                                  <tr>
                                    <td colSpan={6} className="py-2 text-slate-400">
                                      No batches recorded yet.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    {batchFormFor === p.id && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50">
                          <ReceiveStockForm
                            productId={p.id}
                            suppliers={suppliers}
                            onDone={() => {
                              setBatchFormFor(null);
                              load();
                            }}
                            onCancel={() => setBatchFormFor(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddProduct && (
        <AddProductModal
          suppliers={suppliers}
          categories={categories}
          onClose={() => setShowAddProduct(false)}
          onCreated={() => {
            setShowAddProduct(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function TransferControl({
  batch,
  busy,
  onTransfer,
}: {
  batch: Batch;
  busy: boolean;
  onTransfer: (quantity: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const target = batch.location === "STORE" ? "Display" : "Store";

  if (!open) {
    return (
      <button className="text-sm font-medium text-brand-600" onClick={() => setOpen(true)}>
        → {target}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        className="input w-16 py-1"
        type="number"
        min={1}
        max={batch.quantity}
        placeholder="Qty"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
      />
      <button
        className="text-sm font-medium text-brand-600"
        disabled={busy || !qty}
        onClick={() => {
          onTransfer(Number(qty));
          setQty("");
          setOpen(false);
        }}
      >
        Move
      </button>
      <button className="text-sm text-slate-400" onClick={() => setOpen(false)}>
        ✕
      </button>
    </span>
  );
}

function ReceiveStockForm({
  productId,
  suppliers,
  onDone,
  onCancel,
}: {
  productId: string;
  suppliers: Supplier[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [batchNumber, setBatchNumber] = useState("");
  const [quantity, setQuantity] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [location, setLocation] = useState("STORE");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/products/${productId}/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchNumber,
        quantity,
        costPrice,
        expiryDate,
        supplierId: supplierId || undefined,
        location,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save");
      return;
    }
    onDone();
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-6">
      <input className="input" placeholder="Batch #" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
      <input className="input" type="number" placeholder="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      <input className="input" type="number" step="0.01" placeholder="Unit cost" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
      <input className="input" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
      <select className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
        <option value="STORE">Store (back stock)</option>
        <option value="DISPLAY">Display (shelf)</option>
      </select>
      <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
        <option value="">Supplier (optional)</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <div className="col-span-2 flex gap-2 md:col-span-6">
        <button className="btn" disabled={submitting} onClick={submit}>
          Save Batch
        </button>
        <button className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        {error && <span className="self-center text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}

const NEW_CATEGORY = "__new__";

function AddProductModal({
  suppliers,
  categories,
  onClose,
  onCreated,
}: {
  suppliers: Supplier[];
  categories: Category[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [categoryChoice, setCategoryChoice] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [price, setPrice] = useState("");
  const [reorderPoint, setReorderPoint] = useState("10");
  const [reorderQty, setReorderQty] = useState("20");
  const [defaultSupplierId, setDefaultSupplierId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku,
        name,
        ...(categoryChoice === NEW_CATEGORY
          ? { categoryName: newCategoryName }
          : { categoryId: categoryChoice || undefined }),
        price,
        reorderPoint,
        reorderQty,
        defaultSupplierId: defaultSupplierId || undefined,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save");
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Add Product</h2>
        <div className="grid grid-cols-2 gap-3">
          <input className="input" placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input" value={categoryChoice} onChange={(e) => setCategoryChoice(e.target.value)}>
            <option value="">Category (optional)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW_CATEGORY}>+ Add new category…</option>
          </select>
          {categoryChoice === NEW_CATEGORY ? (
            <input
              className="input"
              placeholder="New category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
          ) : (
            <div />
          )}
          <input className="input" type="number" step="0.01" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
          <input className="input" type="number" placeholder="Reorder point" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} />
          <input className="input" type="number" placeholder="Reorder quantity" value={reorderQty} onChange={(e) => setReorderQty(e.target.value)} />
          <select className="input col-span-2" value={defaultSupplierId} onChange={(e) => setDefaultSupplierId(e.target.value)}>
            <option value="">Default supplier (optional)</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn"
            disabled={
              submitting ||
              !sku ||
              !name ||
              !price ||
              (categoryChoice === NEW_CATEGORY && !newCategoryName.trim())
            }
            onClick={submit}
          >
            Save Product
          </button>
        </div>
      </div>
    </div>
  );
}
