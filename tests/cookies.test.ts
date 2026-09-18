import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  AGE_VERIFIED_COOKIE_MAX_AGE,
  AGE_VERIFIED_COOKIE_NAME,
  hasAgeVerifiedCookie,
  isSecureCookieScope,
  setAgeVerifiedCookie,
} from "../src/lib/cookies";

let savedDocument: unknown;
let savedWindow: unknown;

function setDocumentCookie(value: string, protocol = "https:"): void {
  (globalThis as Record<string, unknown>).document = { cookie: value };
  (globalThis as Record<string, unknown>).window = { location: { protocol } };
}

beforeEach(() => {
  savedDocument = (globalThis as Record<string, unknown>).document;
  savedWindow = (globalThis as Record<string, unknown>).window;
});

afterEach(() => {
  (globalThis as Record<string, unknown>).document = savedDocument;
  (globalThis as Record<string, unknown>).window = savedWindow;
});

describe("age-gate cookie entry point", () => {
  it("reports unverified visitors when no cookie is present", () => {
    setDocumentCookie("");
    assert.equal(hasAgeVerifiedCookie(), false);
  });

  it("confirms entry and persists a SameSite Lax cookie after verification", () => {
    const store: Record<string, string> = {};
    (globalThis as Record<string, unknown>).document = {};
    Object.defineProperty((globalThis as Record<string, unknown>).document, "cookie", {
      configurable: true,
      get: () => Object.entries(store).map(([k, v]) => `${k}=${v}`).join("; "),
      set: (written: string) => {
        const [pair] = written.split(";");
        const [k, v] = pair.split("=");
        store[k] = v;
        store.__attributes = written;
      },
    });
    (globalThis as Record<string, unknown>).window = { location: { protocol: "https:" } };

    assert.equal(hasAgeVerifiedCookie(), false);
    setAgeVerifiedCookie();
    assert.equal(hasAgeVerifiedCookie(), true);

    const attributes = store.__attributes;
    assert.equal(AGE_VERIFIED_COOKIE_MAX_AGE, 50400);
    assert.match(attributes, /max-age=50400/);
    assert.match(attributes, /path=\//);
    assert.match(attributes, /SameSite=Lax/);
    assert.match(attributes, /Secure/);
  });

  it("rejects lookalike values instead of granting entry", () => {
    setDocumentCookie(`${AGE_VERIFIED_COOKIE_NAME}=false`);
    assert.equal(hasAgeVerifiedCookie(), false);

    setDocumentCookie(`${AGE_VERIFIED_COOKIE_NAME}=1; other=true`);
    assert.equal(hasAgeVerifiedCookie(), false);
  });

  it("stays closed during server-side rendering without a document", () => {
    delete (globalThis as Record<string, unknown>).document;
    delete (globalThis as Record<string, unknown>).window;
    assert.equal(hasAgeVerifiedCookie(), false);
    assert.doesNotThrow(() => setAgeVerifiedCookie());
  });
});

describe("secure cookie scope entry point", () => {
  it("marks production hosts secure regardless of internal protocol", () => {
    assert.equal(isSecureCookieScope(new URL("http://ropoductions.example/play")), true);
    assert.equal(isSecureCookieScope(new URL("https://ropoductions.example/")), true);
  });

  it("leaves local development hosts non-secure", () => {
    assert.equal(isSecureCookieScope(new URL("http://localhost:3000/")), false);
    assert.equal(isSecureCookieScope(new URL("http://127.0.0.1:3100/")), false);
    assert.equal(isSecureCookieScope(new URL("http://app.localhost:3000/")), false);
  });
});
