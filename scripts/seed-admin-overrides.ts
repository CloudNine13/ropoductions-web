import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { syncInitialAdminOverrides } from "../src/lib/patreon";

function extractEnvValueFromFile(filePath: string, key: string): string | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }

  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [k, ...rest] = trimmed.split("=");
    if (k.trim() === key) {
      return rest.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }

  return undefined;
}

function resolveInitialAdminIds(): string | undefined {
  const cliArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  if (cliArgs.length > 0) {
    return cliArgs.join(",");
  }

  if (process.env.CREATOR_ADMIN_PATREON_IDS) {
    return process.env.CREATOR_ADMIN_PATREON_IDS;
  }
  if (process.env.INITIAL_ADMIN_PATREON_IDS) {
    return process.env.INITIAL_ADMIN_PATREON_IDS;
  }

  const rootDir = process.cwd();
  const devVarsValue =
    extractEnvValueFromFile(resolve(rootDir, ".dev.vars"), "CREATOR_ADMIN_PATREON_IDS") ??
    extractEnvValueFromFile(resolve(rootDir, ".dev.vars"), "INITIAL_ADMIN_PATREON_IDS");
  if (devVarsValue) {
    return devVarsValue;
  }

  const envLocalValue =
    extractEnvValueFromFile(resolve(rootDir, ".env.local"), "CREATOR_ADMIN_PATREON_IDS") ??
    extractEnvValueFromFile(resolve(rootDir, ".env.local"), "INITIAL_ADMIN_PATREON_IDS");
  if (envLocalValue) {
    return envLocalValue;
  }

  const envValue =
    extractEnvValueFromFile(resolve(rootDir, ".env"), "CREATOR_ADMIN_PATREON_IDS") ??
    extractEnvValueFromFile(resolve(rootDir, ".env"), "INITIAL_ADMIN_PATREON_IDS");
  if (envValue) {
    return envValue;
  }

  return undefined;
}

async function main() {
  const initialAdminIds = resolveInitialAdminIds();

  if (!initialAdminIds) {
    console.error(
      "No CREATOR_ADMIN_PATREON_IDS (or INITIAL_ADMIN_PATREON_IDS) found in CLI arguments, process.env, .dev.vars, or .env.local.\n" +
      "Provide IDs via CLI: npm run db:seed:admins -- <id1,id2>\n" +
      "Or set CREATOR_ADMIN_PATREON_IDS=id1,id2 in .dev.vars or .env.local."
    );
  }

  const proxy = await getPlatformProxy();
  const db = proxy.env.DB as D1Database;

  if (!db) {
    console.error("D1 binding 'DB' could not be resolved from Wrangler platform proxy.");
    await proxy.dispose();
    process.exit(1);
  }

  try {
    const synced = await syncInitialAdminOverrides(db, initialAdminIds);
    console.log(`Successfully synced ${synced.length} admin override(s) into local D1 database: ${synced.join(", ")}`);
  } catch (error) {
    console.error("Failed to seed admin overrides into D1:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await proxy.dispose();
  }
}

main();
