/**
 * Cloudflare Environment & Resource Binding Helpers
 * Ropoductions Web Portal
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Safely resolves the Cloudflare D1 database binding (`DB`).
 *
 * @param env Optional explicit CloudflareEnv object (e.g., in worker handlers or tests)
 * @returns The Cloudflare D1Database instance
 * @throws Error if D1 binding `DB` is not available in the current execution context
 */
export async function getDatabase(env?: CloudflareEnv): Promise<D1Database> {
  if (env?.DB) {
    return env.DB;
  }

  try {
    const ctx = await getCloudflareContext({ async: true });
    if (ctx?.env?.DB) {
      return ctx.env.DB;
    }
  } catch (error) {
    throw new Error(
      `Failed to resolve Cloudflare D1 binding 'DB' from context: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  throw new Error(
    "Cloudflare D1 binding 'DB' is missing. Verify [[d1_databases]] binding 'DB' in wrangler.toml."
  );
}

/**
 * Synchronously resolves the Cloudflare D1 database binding (`DB`).
 * Applicable within active Next.js App Router request execution contexts.
 *
 * @param env Optional explicit CloudflareEnv object
 * @returns The Cloudflare D1Database instance
 * @throws Error if D1 binding `DB` is not available
 */
export function getDatabaseSync(env?: CloudflareEnv): D1Database {
  if (env?.DB) {
    return env.DB;
  }

  try {
    const ctx = getCloudflareContext();
    if (ctx?.env?.DB) {
      return ctx.env.DB;
    }
  } catch (error) {
    throw new Error(
      `Failed to synchronously resolve Cloudflare D1 binding 'DB' from context: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  throw new Error(
    "Cloudflare D1 binding 'DB' is missing. Verify [[d1_databases]] binding 'DB' in wrangler.toml."
  );
}

/**
 * Safely resolves the private Cloudflare R2 bucket binding (`GAME_ASSETS`).
 *
 * @param env Optional explicit CloudflareEnv object
 * @returns The Cloudflare R2Bucket instance
 * @throws Error if R2 bucket binding `GAME_ASSETS` is not available
 */
export async function getGameAssetsBucket(env?: CloudflareEnv): Promise<R2Bucket> {
  if (env?.GAME_ASSETS) {
    return env.GAME_ASSETS;
  }

  try {
    const ctx = await getCloudflareContext({ async: true });
    if (ctx?.env?.GAME_ASSETS) {
      return ctx.env.GAME_ASSETS;
    }
  } catch (error) {
    throw new Error(
      `Failed to resolve Cloudflare R2 binding 'GAME_ASSETS' from context: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  throw new Error(
    "Cloudflare R2 binding 'GAME_ASSETS' is missing. Verify [[r2_buckets]] binding 'GAME_ASSETS' in wrangler.toml."
  );
}

/**
 * Synchronously resolves the private Cloudflare R2 bucket binding (`GAME_ASSETS`).
 * Applicable within active Next.js App Router request execution contexts.
 *
 * @param env Optional explicit CloudflareEnv object
 * @returns The Cloudflare R2Bucket instance
 * @throws Error if R2 bucket binding `GAME_ASSETS` is not available
 */
export function getGameAssetsBucketSync(env?: CloudflareEnv): R2Bucket {
  if (env?.GAME_ASSETS) {
    return env.GAME_ASSETS;
  }

  try {
    const ctx = getCloudflareContext();
    if (ctx?.env?.GAME_ASSETS) {
      return ctx.env.GAME_ASSETS;
    }
  } catch (error) {
    throw new Error(
      `Failed to synchronously resolve Cloudflare R2 binding 'GAME_ASSETS' from context: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  throw new Error(
    "Cloudflare R2 binding 'GAME_ASSETS' is missing. Verify [[r2_buckets]] binding 'GAME_ASSETS' in wrangler.toml."
  );
}
