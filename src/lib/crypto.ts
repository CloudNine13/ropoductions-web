function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBuffer(base64url: string): Uint8Array {
  try {
    const base64 = base64url
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), "=");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return new Uint8Array(0);
  }
}

export function generateRandomString(length: number = 32): string {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  return bufferToBase64Url(randomBytes).slice(0, length);
}

export function generatePkceVerifier(length: number = 64): string {
  const clampedLength = Math.max(43, Math.min(128, length));
  const byteCount = Math.ceil((clampedLength * 3) / 4);
  const randomBytes = new Uint8Array(byteCount);
  crypto.getRandomValues(randomBytes);
  return bufferToBase64Url(randomBytes).slice(0, clampedLength);
}

export async function generatePkceChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const verifierBytes = encoder.encode(verifier);
  const digestBuffer = await crypto.subtle.digest("SHA-256", verifierBytes);
  return bufferToBase64Url(digestBuffer);
}

export async function generatePkcePair(length: number = 64): Promise<{
  verifier: string;
  challenge: string;
  method: "S256";
}> {
  const verifier = generatePkceVerifier(length);
  const challenge = await generatePkceChallenge(verifier);
  return {
    verifier,
    challenge,
    method: "S256",
  };
}

export async function signValue(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value)
  );
  const signature = bufferToBase64Url(signatureBuffer);
  return `${value}.${signature}`;
}

export async function verifySignedValue(
  signedValue: string,
  secret: string
): Promise<string | null> {
  try {
    const lastDotIndex = signedValue.lastIndexOf(".");
    if (lastDotIndex === -1) {
      return null;
    }

    const value = signedValue.slice(0, lastDotIndex);
    const signature = signedValue.slice(lastDotIndex + 1);

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = base64UrlToBuffer(signature);
    if (signatureBytes.length === 0) {
      return null;
    }

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as unknown as BufferSource,
      encoder.encode(value)
    );

    return isValid ? value : null;
  } catch {
    return null;
  }
}

async function deriveAesGcmKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: encoder.encode("ropoductions-patreon-token-v1"),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptToken(
  plaintext: string,
  secretKey: string
): Promise<string> {
  const key = await deriveAesGcmKey(secretKey);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const encoder = new TextEncoder();
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  const ivBase64 = bufferToBase64Url(iv);
  const cipherBase64 = bufferToBase64Url(ciphertextBuffer);
  return `${ivBase64}:${cipherBase64}`;
}

export async function decryptToken(
  encryptedToken: string,
  secretKey: string
): Promise<string> {
  const parts = encryptedToken.split(":");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted token format");
  }

  const [ivBase64, cipherBase64] = parts;
  const iv = base64UrlToBuffer(ivBase64);
  const ciphertext = base64UrlToBuffer(cipherBase64);
  const key = await deriveAesGcmKey(secretKey);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    ciphertext as unknown as BufferSource
  );

  return new TextDecoder().decode(decryptedBuffer);
}
