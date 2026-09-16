import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = dirname(fileURLToPath(import.meta.url));
const WRANGLER_DEPENDENT = new Set(["d1-schema.test.ts"]);

describe("unit test manifest", () => {
  it("runs every isolated suite through test:unit", () => {
    const pkg = JSON.parse(readFileSync(join(testsDir, "../package.json"), "utf8"));
    const command = pkg.scripts["test:unit"] as string;
    const missing = readdirSync(testsDir)
      .filter((f) => f.endsWith(".test.ts") && !WRANGLER_DEPENDENT.has(f))
      .filter((f) => !command.includes(f));
    assert.deepEqual(missing, []);
  });
});
