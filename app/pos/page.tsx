"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ModalBackdrop from "@/components/ModalBackdrop";

type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  price: number;
  displayStock: number;
  storeStock: number;
  unit: string;
  category: { name: string } | null;
};

type CartLine = { productId: string; name: string; price: number; quantity: number; stock: number };

type QueuedSale = {
  localId: string;
  items: { productId: string; quantity: number }[];
  paymentMethod: string;
  cashierName?: string;
  totalAmount: number;
  queuedAt: string;
};

const QUEUE_KEY = "pos-offline-queue";

function loadQueue(): QueuedSale[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedSale[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage unavailable (private browsing, etc.) — queue just won't persist across reloads
  }
}

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [cashierName, setCashierName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ saleId: string; totalAmount: number } | null>(null);
  const [queuedNote, setQueuedNote] = useState("");
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [scanSupported, setScanSupported] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const loadProducts = useCallback(() => {
    fetch("/api/products").then((r) => r.json()).then(setProducts);
  }, []);

  const syncQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const current = loadQueue();
    if (current.length === 0) return;
    setSyncing(true);
    const remaining = [...current];
    while (remaining.length > 0) {
      const next = remaining[0];
      try {
        const res = await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: next.items,
            paymentMethod: next.paymentMethod,
            cashierName: next.cashierName,
          }),
        });
        if (!res.ok) break; // a real error (e.g. stock ran out) — stop and let someone look at it
        remaining.shift();
        setQueue([...remaining]);
        saveQueue(remaining);
      } catch {
        break; // still offline — stop, will retry later
      }
    }
    setSyncing(false);
    if (remaining.length === 0) loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    loadProducts();
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => u && setCashierName((prev) => prev || u.name))
      .catch(() => {});

    setQueue(loadQueue());
    setOnline(navigator.onLine);
    setScanSupported(typeof window !== "undefined" && "BarcodeDetector" in window);

    const goOnline = () => {
      setOnline(true);
      syncQueue();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    syncQueue();
    const interval = setInterval(syncQueue, 30000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // A hardware barcode scanner behaves like a keyboard: it types the code
  // fast and sends Enter. So the plain search box doubles as a scan input —
  // if what's typed exactly matches a product's barcode, add it straight to
  // the cart instead of requiring a manual pick from the results list.
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const match = products.find((p) => p.barcode && p.barcode === query.trim());
    if (match) {
      if (match.displayStock <= 0) {
        setError(`${match.name} has no display stock to sell.`);
        return;
      }
      addToCart(match);
    } else if (results.length === 1) {
      addToCart(results[0]);
    }
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
    setQueuedNote("");
    const payload = {
      items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      paymentMethod,
      cashierName: cashierName || undefined,
    };

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      loadProducts();
    } catch {
      // fetch itself threw — no connection, not a server rejection. Queue it
      // so the cashier can keep working instead of losing the sale.
      setSubmitting(false);
      const queued: QueuedSale = {
        localId: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...payload,
        totalAmount: total,
        queuedAt: new Date().toISOString(),
      };
      const next = [...loadQueue(), queued];
      saveQueue(next);
      setQueue(next);
      setQueuedNote("No connection — sale saved offline and will sync automatically once you're back online.");
      setCart([]);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Point of Sale</h1>
          <p className="text-slate-500">Search a product, add it to the cart, and check out.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {!online && <span className="badge badge-danger">Offline</span>}
          {queue.length > 0 && (
            <span className="badge badge-warning">
              {queue.length} sale{queue.length > 1 ? "s" : ""} waiting to sync
            </span>
          )}
          {queue.length > 0 && (
            <button className="text-sm font-medium text-brand-600" disabled={syncing} onClick={syncQueue}>
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="card md:col-span-2">
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Search by name/SKU, or scan a barcode…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoFocus
            />
            {scanSupported && (
              <button type="button" className="btn-secondary whitespace-nowrap" onClick={() => setScanOpen(true)}>
                📷 Scan
              </button>
            )}
          </div>
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
          {queuedNote && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">{queuedNote}</div>
          )}
          {receipt && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
              Sale recorded — total ${receipt.totalAmount.toFixed(2)} (receipt {receipt.saleId.slice(-6)})
            </div>
          )}
        </div>
      </div>

      {scanOpen && (
        <CameraScanModal
          products={products}
          onClose={() => setScanOpen(false)}
          onDetected={(p) => {
            addToCart(p);
            setScanOpen(false);
          }}
        />
      )}
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

// Minimal type for the native BarcodeDetector API — not yet in TS's default
// DOM lib, and only feature-detected/used when window.BarcodeDetector exists
// (Chrome/Edge on Android and most desktop; gracefully absent elsewhere).
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };

function CameraScanModal({
  products,
  onClose,
  onDetected,
}: {
  products: Product[];
  onClose: () => void;
  onDetected: (p: Product) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError("Couldn't access the camera — check your browser's camera permission.");
        return;
      }

      const Detector = (window as unknown as { BarcodeDetector: new () => BarcodeDetectorLike }).BarcodeDetector;
      const detector = new Detector();

      async function tick() {
        if (stopped || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const code = codes[0]?.rawValue;
          if (code) {
            const match = products.find((p) => p.barcode === code);
            if (match) {
              onDetected(match);
              return;
            }
          }
        } catch {
          // transient decode error — just try again next frame
        }
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
    }

    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ModalBackdrop onClose={onClose} maxWidth="max-w-sm" zIndex="z-20">
      <h2 className="mb-2 text-lg font-semibold">Scan a barcode</h2>
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <video ref={videoRef} className="w-full rounded-lg bg-black" muted playsInline />
        )}
        <p className="mt-2 text-xs text-slate-500">
          Point the camera at the product's barcode. Only products with a barcode saved in Inventory
          will be recognized.
        </p>
        <div className="mt-3 flex justify-end">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
    </ModalBackdrop>
  );
}
