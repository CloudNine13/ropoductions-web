import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let nextCache = {};
try {
  nextCache = require("next/cache");
} catch {
  // Fallback no-op
}

export const revalidatePath = nextCache.revalidatePath || (() => {});
export const revalidateTag = nextCache.revalidateTag || (() => {});
export const unstable_cache = nextCache.unstable_cache || ((fn) => fn);
export const unstable_noStore = nextCache.unstable_noStore || (() => {});
