"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import RequireAdmin from "@/components/RequireAdmin";
import ModalBackdrop from "@/components/ModalBackdrop";
import { UNIT_OPTIONS } from "@/lib/types";

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
  barcode: string | null;
  name: string;
  categoryId: string | null;
  category: Category | null;
  unit: string;
  price: number;
  reorderPoint: number;
  reorderQty: number;
  defaultSupplierId: string | null;
  stock: number;
  storeStock: number;
  displayStock: number;
  unitsSold30d: number;
  stockValue: number;
  batches: Batch[];
};

type SortKey =
  | "name"
  | "expiry_soonest"
  | "expiry_latest"
  | "fast_moving"
  | "slow_moving"
  | "value_high";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name (A–Z)" },
  { value: "expiry_soonest", label: "Expiry: soonest first" },
  { value: "expiry_latest", label: "Expiry: latest first" },
  { value: "fast_moving", label: "Fast-moving (best sellers, 30d)" },
  { value: "slow_moving", label: "Slow-moving (30d)" },
  { value: "value_high", label: "Stock value: highest first" },
];

function soonestExpiry(p: Product): number {
  const live = p.batches.filter((b) => b.quantity > 0);
  if (live.length === 0) return Infinity;
  return Math.min(...live.map((b) => new Date(b.expiryDate).getTime()));
}

type Supplier = { id: string; name: string };

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// Mirrors lib/business.ts's suggestedDiscountPercent — kept as a small local
// copy since that file also imports prisma and can't be pulled into a
// client component.
function suggestedDiscount(days: number) {
  if (days < 0) return 0;
  if (days <= 30) return 50;
  if (days <= 60) return 25;
  if (days <= 90) return 10;
  return 0;
}

function stockBadge(stock: number, reorderPoint: number) {
  if (stock <= 0) return <span className="badge badge-danger">Out of stock</span>;
  if (stock <= reorderPoint) return <span className="badge badge-warning">Low: {stock}</span>;
  return <span className="badge badge-ok">{stock} in stock</span>;
}

// Small box glyph so store/display are told apart at a glance, not just by
// badge color — plus a native title tooltip explaining what each means.
function LocationBadge({ location }: { location: "STORE" | "DISPLAY" }) {
  const isDisplay = location === "DISPLAY";
  return (
    <span
      className={`badge inline-flex items-center gap-1 ${isDisplay ? "badge-ok" : "text-slate-500"}`}
      title={
        isDisplay
          ? "Display: on the shelf — this is what POS sells from."
          : "Store: back-room stock — not sellable until transferred to Display."
      }
    >
      <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M2.5 6.5 10 3l7.5 3.5v7L10 17l-7.5-3.5v-7Z" strokeLinejoin="round" />
        <path d="M2.5 6.5 10 10l7.5-3.5M10 10v7" strokeLinejoin="round" />
      </svg>
      {location}
    </span>
  );
}

export default function InventoryPage() {
  return (
    <RequireAdmin>
      <InventoryContent />
    </RequireAdmin>
  );
}

function InventoryContent() {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [batchFormFor, setBatchFormFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [transferBusyId, setTransferBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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

  const unitsInUse = Array.from(new Set(products.map((p) => p.unit))).sort();

  const filtered = products.filter((p) => {
    const matchesQuery =
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.sku.toLowerCase().includes(query.toLowerCase()) ||
      (p.category?.name ?? "").toLowerCase().includes(query.toLowerCase());
    const matchesCategory = !categoryFilter || p.categoryId === categoryFilter;
    const matchesUnit = !unitFilter || p.unit === unitFilter;
    const matchesLocation =
      !locationFilter ||
      (locationFilter === "STORE" && p.storeStock > 0) ||
      (locationFilter === "DISPLAY" && p.displayStock > 0) ||
      (locationFilter === "LOW" && p.stock > 0 && p.stock <= p.reorderPoint) ||
      (locationFilter === "OUT" && p.stock <= 0);
    return matchesQuery && matchesCategory && matchesUnit && matchesLocation;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortKey) {
      case "expiry_soonest":
        return soonestExpiry(a) - soonestExpiry(b);
      case "expiry_latest":
        return soonestExpiry(b) - soonestExpiry(a);
      case "fast_moving":
        return b.unitsSold30d - a.unitsSold30d;
      case "slow_moving":
        return a.unitsSold30d - b.unitsSold30d;
      case "value_high":
        return b.stockValue - a.stockValue;
      default:
        return a.name.localeCompare(b.name);
    }
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

  async function writeOff(batchId: string) {
    if (!confirm("Write off this expired batch? This zeroes its quantity and can't be undone.")) return;
    const res = await fetch(`/api/batches/${batchId}/write-off`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Failed to write off batch");
      return;
    }
    load();
  }

  async function deleteProduct(p: Product) {
    if (!confirm(`Delete ${p.name}? This can't be undone.`)) return;
    const res = await fetch(`/api/products/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Failed to delete product");
      return;
    }
    load();
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === sorted.length ? new Set() : new Set(sorted.map((p) => p.id))
    );
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected product(s)? This can't be undone.`)) return;

    setBulkDeleting(true);
    let deleted = 0;
    const failures: string[] = [];
    for (const id of ids) {
      const product = products.find((p) => p.id === id);
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (res.ok) {
        deleted++;
      } else {
        const data = await res.json().catch(() => ({}));
        failures.push(`${product?.name ?? id}: ${data.error ?? "failed"}`);
      }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    load();

    if (failures.length > 0) {
      alert(
        `Deleted ${deleted} of ${ids.length}. Skipped:\n${failures.join("\n")}`
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-slate-500">Store vs. display stock, expiry tracking, and reorder points.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedIds.size > 0 && (
            <button className="btn-row-danger px-3 py-2 text-sm" disabled={bulkDeleting} onClick={bulkDelete}>
              {bulkDeleting ? "Deleting…" : `Delete Selected (${selectedIds.size})`}
            </button>
          )}
          <a href="/api/inventory/export" className="btn-secondary">
            Export to Excel
          </a>
          <button className="btn-secondary" onClick={() => setShowImport(true)}>
            Import from Excel
          </button>
          <button className="btn" onClick={() => setShowAddProduct(true)}>
            + Add Product
          </button>
        </div>
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
        <select
          className="input max-w-xs"
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
        >
          <option value="">All stock levels</option>
          <option value="STORE">Has store stock</option>
          <option value="DISPLAY">Has display stock</option>
          <option value="LOW">Low stock</option>
          <option value="OUT">Out of stock</option>
        </select>
        <select className="input max-w-xs" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
          <option value="">All units</option>
          {unitsInUse.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <select
          className="input max-w-xs"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Sort: {o.label}
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
                <th className="w-8">
                  <input
                    type="checkbox"
                    checked={sorted.length > 0 && selectedIds.size === sorted.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </th>
                <th>SKU</th>
                <th>Name</th>
                <th>Category</th>
                <th>Unit</th>
                <th>Price</th>
                <th>Store</th>
                <th>Display</th>
                <th>Total</th>
                <th>Soonest Expiry</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const soonest = [...p.batches]
                  .filter((b) => b.quantity > 0)
                  .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())[0];
                const needsShelfRestock = p.displayStock <= 0 && p.storeStock > 0;
                return (
                  <Fragment key={p.id}>
                    <tr>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleSelected(p.id)}
                          aria-label={`Select ${p.name}`}
                        />
                      </td>
                      <td className="font-mono text-xs">{p.sku}</td>
                      <td className="font-medium">{p.name}</td>
                      <td>{p.category?.name ?? <span className="text-slate-400">Uncategorized</span>}</td>
                      <td className="text-slate-500">{p.unit}</td>
                      <td>${p.price.toFixed(2)}</td>
                      <td>{p.storeStock}</td>
                      <td>
                        {p.displayStock}
                        {needsShelfRestock && (
                          <span className="badge badge-warning ml-2">Restock shelf</span>
                        )}
                      </td>
                      <td className="font-medium">{stockBadge(p.stock, p.reorderPoint)}</td>
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
                      <td className="whitespace-nowrap text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <button
                            className="btn-row"
                            onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                          >
                            {expandedId === p.id ? "Hide" : "Batches"}
                          </button>
                          <button
                            className="btn-row"
                            onClick={() => setBatchFormFor(batchFormFor === p.id ? null : p.id)}
                          >
                            Receive stock
                          </button>
                          <button className="btn-row" onClick={() => setHistoryProduct(p)}>
                            History
                          </button>
                          <button className="btn-row" onClick={() => setEditProduct(p)}>
                            Edit
                          </button>
                          <button className="btn-row-danger" onClick={() => deleteProduct(p)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === p.id && (
                      <tr>
                        <td colSpan={11} className="bg-slate-50">
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
                                {p.batches.map((b) => {
                                  const days = daysUntil(b.expiryDate);
                                  const discount = suggestedDiscount(days);
                                  return (
                                    <tr key={b.id}>
                                      <td className="py-1">{b.batchNumber}</td>
                                      <td className="py-1">
                                        <LocationBadge location={b.location} />
                                      </td>
                                      <td className="py-1">{b.quantity}</td>
                                      <td className="py-1">${b.costPrice.toFixed(2)}</td>
                                      <td className="py-1">
                                        {new Date(b.expiryDate).toLocaleDateString()}
                                        {days < 0 && b.quantity > 0 && (
                                          <span className="badge badge-danger ml-2">Expired</span>
                                        )}
                                        {discount > 0 && (
                                          <span
                                            className="badge badge-warning ml-2"
                                            title="Suggested markdown to sell through before it expires — nothing applies this automatically."
                                          >
                                            Suggest -{discount}%
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-1 text-right">
                                        {b.quantity > 0 && days < 0 ? (
                                          <button
                                            className="text-sm font-medium text-red-600"
                                            onClick={() => writeOff(b.id)}
                                          >
                                            Write off
                                          </button>
                                        ) : (
                                          b.quantity > 0 && (
                                            <TransferControl
                                              batch={b}
                                              busy={transferBusyId === b.id}
                                              onTransfer={(qty) => transfer(b.id, qty)}
                                            />
                                          )
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
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
                        <td colSpan={11} className="bg-slate-50">
                          <ReceiveStockForm
                            product={p}
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
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-6 text-center text-slate-400">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddProduct && (
        <ProductModal
          suppliers={suppliers}
          categories={categories}
          onClose={() => setShowAddProduct(false)}
          onSaved={() => {
            setShowAddProduct(false);
            load();
          }}
        />
      )}

      {editProduct && (
        <ProductModal
          product={editProduct}
          suppliers={suppliers}
          categories={categories}
          onClose={() => setEditProduct(null)}
          onSaved={() => {
            setEditProduct(null);
            load();
          }}
        />
      )}

      {historyProduct && (
        <HistoryModal product={historyProduct} onClose={() => setHistoryProduct(null)} />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => load()}
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
      <button
        className="text-sm font-medium text-brand-600"
        title={`Move stock from ${batch.location} to ${target}`}
        onClick={() => {
          setQty(String(batch.quantity));
          setOpen(true);
        }}
      >
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
        onKeyDown={(e) => {
          if (e.key === "Enter" && qty) {
            onTransfer(Number(qty));
            setQty("");
            setOpen(false);
          }
        }}
        autoFocus
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

const NEW_BATCH = "__new__";

function ReceiveStockForm({
  product,
  suppliers,
  onDone,
  onCancel,
}: {
  product: Product;
  suppliers: Supplier[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [batchChoice, setBatchChoice] = useState(NEW_BATCH);
  const [batchNumber, setBatchNumber] = useState("");
  const [quantity, setQuantity] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [location, setLocation] = useState("STORE");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const knownBatches = Array.from(new Map(product.batches.map((b) => [b.batchNumber, b])).values());

  function selectExisting(id: string) {
    setBatchChoice(id);
    if (id === NEW_BATCH) {
      setBatchNumber("");
      return;
    }
    const match = product.batches.find((b) => b.id === id);
    if (!match) return;
    setBatchNumber(match.batchNumber);
    setCostPrice(String(match.costPrice));
    setExpiryDate(match.expiryDate.slice(0, 10));
    setLocation(match.location);
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/products/${product.id}/batches`, {
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

  const canSubmit = !!(batchNumber && quantity && costPrice && expiryDate);

  return (
    <form
      className="grid grid-cols-2 gap-3 p-3 md:grid-cols-7"
      onSubmit={(e) => {
        e.preventDefault();
        if (!submitting && canSubmit) submit();
      }}
    >
      {knownBatches.length > 0 && (
        <select
          className="input md:col-span-7"
          value={batchChoice}
          onChange={(e) => selectExisting(e.target.value)}
        >
          <option value={NEW_BATCH}>+ New batch number…</option>
          {knownBatches.map((b) => (
            <option key={b.id} value={b.id}>
              Use existing: {b.batchNumber} — exp {new Date(b.expiryDate).toLocaleDateString()} ({b.location})
            </option>
          ))}
        </select>
      )}
      <input
        className="input"
        placeholder="Batch #"
        value={batchNumber}
        onChange={(e) => setBatchNumber(e.target.value)}
      />
      <input className="input" type="number" placeholder="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
      <input className="input" type="number" step="0.01" placeholder="Unit cost" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
      <input className="input" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
      <select className="input" title="Store: back room, not sellable. Display: on the shelf, sellable at POS." value={location} onChange={(e) => setLocation(e.target.value)}>
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
      <div className="col-span-2 flex gap-2 md:col-span-7">
        <button type="submit" className="btn" disabled={submitting || !canSubmit}>
          Save Batch
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        {error && <span className="self-center text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}

const NEW_CATEGORY = "__new__";
const OTHER_UNIT = "__other__";

function ProductModal({
  product,
  suppliers,
  categories,
  onClose,
  onSaved,
}: {
  product?: Product;
  suppliers: Supplier[];
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!product;
  const [sku, setSku] = useState(product?.sku ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [categoryChoice, setCategoryChoice] = useState(product?.categoryId ?? "");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [unitChoice, setUnitChoice] = useState<string>(
    product && !(UNIT_OPTIONS as readonly string[]).includes(product.unit) ? OTHER_UNIT : product?.unit ?? "unit"
  );
  const [customUnit, setCustomUnit] = useState(product && unitChoice === OTHER_UNIT ? product.unit : "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [reorderPoint, setReorderPoint] = useState(product ? String(product.reorderPoint) : "");
  const [reorderQty, setReorderQty] = useState(product ? String(product.reorderQty) : "");
  const [defaultSupplierId, setDefaultSupplierId] = useState(product?.defaultSupplierId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = !!(sku && name && price && (categoryChoice !== NEW_CATEGORY || newCategoryName.trim()));

  async function submit() {
    setSubmitting(true);
    setError("");
    const unit = unitChoice === OTHER_UNIT ? customUnit.trim() || "unit" : unitChoice;
    const body = {
      sku,
      barcode: barcode || undefined,
      name,
      ...(categoryChoice === NEW_CATEGORY
        ? { categoryName: newCategoryName }
        : { categoryId: categoryChoice || undefined }),
      unit,
      price,
      ...(reorderPoint && { reorderPoint }),
      ...(reorderQty && { reorderQty }),
      defaultSupplierId: defaultSupplierId || undefined,
    };
    const res = await fetch(isEdit ? `/api/products/${product!.id}` : "/api/products", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json();
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
        <h2 className="mb-4 text-lg font-semibold">{isEdit ? "Edit Product" : "Add Product"}</h2>
        <div className="grid grid-cols-2 gap-3">
          <input className="input" placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} autoFocus />
          <input
            className="input"
            placeholder="Barcode (optional, for scanning)"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
          />
          <input className="input col-span-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
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
          <select className="input" value={unitChoice} onChange={(e) => setUnitChoice(e.target.value)}>
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
            <option value={OTHER_UNIT}>Other…</option>
          </select>
          {unitChoice === OTHER_UNIT ? (
            <input
              className="input"
              placeholder="Custom unit"
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value)}
            />
          ) : (
            <div />
          )}
          <input className="input" type="number" step="0.01" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
          <input
            className="input"
            type="number"
            placeholder="Reorder point"
            value={reorderPoint}
            onChange={(e) => setReorderPoint(e.target.value)}
          />
          <input
            className="input"
            type="number"
            placeholder="Reorder quantity"
            value={reorderQty}
            onChange={(e) => setReorderQty(e.target.value)}
          />
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
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={submitting || !canSubmit}>
            {isEdit ? "Save Changes" : "Save Product"}
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

type HistoryMovement = {
  id: string;
  type: string;
  quantity: number;
  note: string | null;
  batchNumber: string | null;
  performedBy: string | null;
  createdAt: string;
};
type HistoryPrice = { id: string; oldPrice: number; newPrice: number; changedBy: string | null; createdAt: string };

function HistoryModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [movements, setMovements] = useState<HistoryMovement[] | null>(null);
  const [priceHistory, setPriceHistory] = useState<HistoryPrice[] | null>(null);

  useEffect(() => {
    fetch(`/api/products/${product.id}/history`)
      .then((r) => r.json())
      .then((d) => {
        setMovements(d.movements);
        setPriceHistory(d.priceHistory);
      });
  }, [product.id]);

  return (
    <ModalBackdrop onClose={onClose} maxWidth="max-w-2xl" className="max-h-[85vh] overflow-y-auto">
      <h2 className="mb-1 text-lg font-semibold">History — {product.name}</h2>
        <p className="mb-4 text-sm text-slate-500">{product.sku}</p>

        <h3 className="mb-2 text-sm font-semibold text-slate-700">Price changes</h3>
        {!priceHistory ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : priceHistory.length === 0 ? (
          <p className="mb-4 text-sm text-slate-500">No price changes recorded.</p>
        ) : (
          <ul className="mb-4 space-y-1 text-sm">
            {priceHistory.map((h) => (
              <li key={h.id} className="flex justify-between border-b border-slate-100 py-1">
                <span>
                  ${h.oldPrice.toFixed(2)} → ${h.newPrice.toFixed(2)}
                  {h.changedBy && <span className="text-slate-400"> · by {h.changedBy}</span>}
                </span>
                <span className="text-slate-400">{new Date(h.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}

        <h3 className="mb-2 text-sm font-semibold text-slate-700">Stock movements (purchases, sales, transfers)</h3>
        {!movements ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : movements.length === 0 ? (
          <p className="text-sm text-slate-500">No stock movements recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="py-1 text-left">When</th>
                <th className="py-1 text-left">Type</th>
                <th className="py-1 text-left">Batch</th>
                <th className="py-1 text-left">Qty</th>
                <th className="py-1 text-left">By</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="py-1">{new Date(m.createdAt).toLocaleString()}</td>
                  <td className="py-1">{m.type.replace(/_/g, " ")}</td>
                  <td className="py-1">{m.batchNumber ?? "—"}</td>
                  <td className={`py-1 ${m.quantity < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {m.quantity > 0 ? "+" : ""}
                    {m.quantity}
                  </td>
                  <td className="py-1">{m.performedBy ?? "—"}</td>
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

type ImportRowResult = {
  row: number;
  status: "created" | "updated" | "error";
  productName?: string;
  batchNumber?: string;
  message?: string;
};

type ImportSummary = {
  totalRows: number;
  categoriesCreated: number;
  suppliersCreated: number;
  productsCreated: number;
  productsUpdated: number;
  batchesCreated: number;
  rows: ImportRowResult[];
};

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError("");
    setSummary(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/inventory/import", { method: "POST", body: formData });
    setUploading(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Import failed");
      return;
    }
    setSummary(data);
    onImported();
  }

  const errorRows = summary?.rows.filter((r) => r.status === "error") ?? [];
  const warningRows = summary?.rows.filter((r) => r.status !== "error" && r.message) ?? [];

  return (
    <ModalBackdrop onClose={onClose} maxWidth="max-w-2xl" className="max-h-[85vh] overflow-y-auto">
      <h2 className="mb-2 text-lg font-semibold">Import Inventory from Excel</h2>
        <p className="mb-4 text-sm text-slate-500">
          Upload a spreadsheet with product name, batch number, quantity, expiry date, category,
          and supplier — one row per stock lot. Existing products are matched by SKU (or by name if
          no SKU column is given) and get a new batch added; unrecognized categories and suppliers
          are created automatically.
        </p>

        <a
          href="/api/inventory/import/template"
          className="mb-4 inline-block text-sm font-medium text-brand-600"
        >
          ⬇ Download template (.xlsx)
        </a>

        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <button className="btn" disabled={!file || uploading} onClick={upload}>
            {uploading ? "Importing…" : "Upload"}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {summary && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm md:grid-cols-3">
              <div>Rows processed: <strong>{summary.totalRows}</strong></div>
              <div>Products created: <strong>{summary.productsCreated}</strong></div>
              <div>Products updated: <strong>{summary.productsUpdated}</strong></div>
              <div>Batches added: <strong>{summary.batchesCreated}</strong></div>
              <div>Categories added: <strong>{summary.categoriesCreated}</strong></div>
              <div>Suppliers added: <strong>{summary.suppliersCreated}</strong></div>
            </div>

            {warningRows.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-amber-700">Warnings</p>
                <ul className="space-y-1 text-sm text-amber-700">
                  {warningRows.map((r) => (
                    <li key={r.row}>
                      Row {r.row} ({r.productName}): {r.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {errorRows.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-red-700">Errors (not imported)</p>
                <ul className="space-y-1 text-sm text-red-700">
                  {errorRows.map((r) => (
                    <li key={r.row}>
                      Row {r.row}
                      {r.productName ? ` (${r.productName})` : ""}: {r.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {errorRows.length === 0 && warningRows.length === 0 && (
              <p className="text-sm text-emerald-700">All rows imported cleanly.</p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
    </ModalBackdrop>
  );
}
