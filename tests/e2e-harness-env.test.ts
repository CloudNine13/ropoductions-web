import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FOUNDER_PATRON_ID_KEY,
  GENERATED_DEV_VARS_MARKER,
  isGeneratedDevVars,
  readFounderPatronId,
} from "../e2e/helpers/session";

const originalCwd = process.cwd();
let workspace: string | null = null;

function useDevVars(lines: string[]): void {
  workspace = mkdtempSync(join(tmpdir(), "ropoductions-e2e-env-"));
  writeFileSync(join(workspace, ".dev.vars"), `${lines.join("\n")}\n`, "utf-8");
  process.chdir(workspace);
}

afterEach(() => {
  process.chdir(originalCwd);
  if (workspace) {
    rmSync(workspace, { recursive: true, force: true });
    workspace = null;
  }
  delete process.env.CREATOR_ADMIN_PATREON_IDS;
});

describe("e2e founder fixture provenance", () => {
  it("resolves the disposable founder id the setup script wrote", () => {
    useDevVars([GENERATED_DEV_VARS_MARKER, `${FOUNDER_PATRON_ID_KEY}=424242`]);

    assert.equal(isGeneratedDevVars(), true);
    assert.equal(readFounderPatronId(), "424242");
  });

  it("never resolves a real creator id out of CREATOR_ADMIN_PATREON_IDS", () => {
    useDevVars([GENERATED_DEV_VARS_MARKER, "CREATOR_ADMIN_PATREON_IDS=987654,123456"]);
    process.env.CREATOR_ADMIN_PATREON_IDS = "987654";

    assert.equal(readFounderPatronId(), undefined);
  });

  it("ignores a hand-written .dev.vars that lacks the generator marker", () => {
    useDevVars([`${FOUNDER_PATRON_ID_KEY}=424242`]);

    assert.equal(isGeneratedDevVars(), false);
    assert.equal(readFounderPatronId(), undefined);
  });
});
