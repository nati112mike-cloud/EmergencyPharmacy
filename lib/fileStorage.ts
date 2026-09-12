import { randomUUID } from "crypto";
import path from "path";
import fs from "fs/promises";

// Uploaded invoice files live outside `public/` (never directly URL-addressable)
// and are served only through an API route that streams them back.
const STORAGE_ROOT = path.join(process.cwd(), "storage", "invoices");

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-100);
}

/** Saves a buffer under a random key and returns that key (store this on the record, not a path). */
export async function saveInvoiceFile(buffer: Buffer, originalName: string): Promise<string> {
  await fs.mkdir(STORAGE_ROOT, { recursive: true });
  const key = `${randomUUID()}-${sanitizeFileName(originalName)}`;
  await fs.writeFile(path.join(STORAGE_ROOT, key), buffer);
  return key;
}

/** Reads back a file by its storage key. Rejects anything that isn't a bare filename (no traversal). */
export async function readInvoiceFile(key: string): Promise<Buffer> {
  if (key.includes("/") || key.includes("\\") || key.includes("..")) {
    throw new Error("Invalid file key");
  }
  return fs.readFile(path.join(STORAGE_ROOT, key));
}
