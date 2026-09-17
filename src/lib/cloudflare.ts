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

export async function getEnvVariable(
  key: string,
  explicitEnv?: Record<string, unknown>
): Promise<string | undefined> {
  if (explicitEnv && typeof explicitEnv[key] === "string") {
    return explicitEnv[key] as string;
  }
  try {
    const ctx = await getCloudflareContext({ async: true });
    const envObj = ctx?.env as unknown as Record<string, unknown> | undefined;
    const val = envObj?.[key];
    if (typeof val === "string") {
      return val;
    }
  } catch {
  }
  if (typeof process !== "undefined" && process.env && typeof process.env[key] === "string") {
    return process.env[key];
  }
  return undefined;
}

export async function getAuthEnv(explicitEnv?: Record<string, unknown>): Promise<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  campaignId?: string;
  sessionSecret: string;
  tokenEncryptionKey: string;
  initialAdminPatreonIds?: string;
}> {
  const clientId = (await getEnvVariable("PATREON_CLIENT_ID", explicitEnv)) ?? "";
  const clientSecret = (await getEnvVariable("PATREON_CLIENT_SECRET", explicitEnv)) ?? "";
  const redirectUri = (await getEnvVariable("PATREON_REDIRECT_URI", explicitEnv)) ?? "";
  const campaignId = await getEnvVariable("PATREON_CAMPAIGN_ID", explicitEnv);
  const sessionSecret =
    (await getEnvVariable("SESSION_SECRET", explicitEnv)) ??
    "dev_session_secret_change_in_production";
  const tokenEncryptionKey =
    (await getEnvVariable("TOKEN_ENCRYPTION_KEY", explicitEnv)) ??
    "dev_token_encryption_key_32_bytes_len";
  const initialAdminPatreonIds = await getEnvVariable(
    "INITIAL_ADMIN_PATREON_IDS",
    explicitEnv
  );

  return {
    clientId,
    clientSecret,
    redirectUri,
    campaignId,
    sessionSecret,
    tokenEncryptionKey,
    initialAdminPatreonIds,
  };
}
