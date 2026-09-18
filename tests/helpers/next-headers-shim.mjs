import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let realHeadersModule;
try {
  realHeadersModule = require("next/headers");
} catch {
  // Ignore
}

let mockCookieStore = null;

export function setMockCookies(store) {
  mockCookieStore = store;
}

export const cookies = async () => {
  if (mockCookieStore !== null) {
    return {
      get: (name) => {
        const val = mockCookieStore[name];
        return val !== undefined ? { name, value: val } : undefined;
      },
      getAll: () => Object.entries(mockCookieStore).map(([name, value]) => ({ name, value })),
    };
  }
  if (realHeadersModule?.cookies) {
    return realHeadersModule.cookies();
  }
  return {
    get: () => undefined,
    getAll: () => [],
  };
};
export const headers = async () => {
  try {
    if (realHeadersModule?.headers) {
      return await realHeadersModule.headers();
    }
  } catch {
    // Fall back to empty headers outside active Next.js request scope
  }
  return new Headers();
};
export const draftMode = realHeadersModule?.draftMode;
