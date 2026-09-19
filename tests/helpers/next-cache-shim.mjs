import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let realNextCache = {};
try {
  realNextCache = require("next/cache");
} catch {
  // Fallback no-op
}

// In the unit-test process there is no route/generation context, so the real
// revalidatePath would throw "static generation store missing". Keep it a no-op
// here — revalidation is an integration concern, not unit-testable.
export const revalidatePath = () => {};
export const revalidateTag = () => {};
export const unstable_cache = realNextCache.unstable_cache || ((fn) => fn);
export const unstable_noStore = realNextCache.unstable_noStore || (() => {});
