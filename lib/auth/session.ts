// Uses the Web Crypto API (not Node's `crypto` module) so the same code
// verifies sessions in both middleware (Edge runtime) and route handlers
// (Node runtime) — Node 20+ and every modern Edge runtime both expose it
// as the global `crypto`.

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export type SessionPayload = {
  userId: string;
  username: string;
  name: string;
  role: string;
  exp: number; // epoch ms
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET environment variable is not set");
  return secret;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(
  payload: Omit<SessionPayload, "exp">
): Promise<string> {
  const full: SessionPayload = {
    ...payload,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const payloadB64 = base64url(encoder.encode(JSON.stringify(full)));
  const key = await hmacKey(getSecret());
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return `${payloadB64}.${base64url(signature)}`;
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;

  try {
    const key = await hmacKey(getSecret());
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlToBytes(sigB64) as BufferSource,
      encoder.encode(payloadB64)
    );
    if (!valid) return null;

    const payload = JSON.parse(decoder.decode(base64urlToBytes(payloadB64))) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
