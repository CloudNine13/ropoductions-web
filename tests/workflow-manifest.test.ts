import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("workflow and upstream integration manifest verification", () => {
  const workflowPath = path.resolve(
    process.cwd(),
    ".github/workflows/sync-game-release.yml"
  );
  const upstreamDocPath = path.resolve(
    process.cwd(),
    "docs/upstream/publish-to-web.yml"
  );

  it("fails when sync-game-release.yml workflow does not exist", () => {
    assert.ok(
      fs.existsSync(workflowPath),
      `Expected workflow file to exist at ${workflowPath}`
    );
  });

  it("verifies dual triggers: workflow_dispatch with main default and repository_dispatch with game_release_published", () => {
    assert.ok(fs.existsSync(workflowPath));
    const content = fs.readFileSync(workflowPath, "utf-8");
    const onBlock = content.match(/^on:\n([\s\S]*?)(?=^concurrency:)/m)?.[1] ?? "";

    // Must declare workflow_dispatch with a branch input defaulting to main
    assert.match(onBlock, /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*branch:/);
    assert.match(onBlock, /branch:\s*\n(?:\s+.+\n)*?\s*default:\s*["']main["']/);

    // Must declare repository_dispatch with game_release_published
    assert.match(onBlock, /repository_dispatch:\s*\n\s*types:\s*\n\s*-\s*game_release_published/);
  });

  it("verifies workflow concurrency group to prevent R2 and git race conditions", () => {
    assert.ok(fs.existsSync(workflowPath));
    const content = fs.readFileSync(workflowPath, "utf-8");
    const concurrencyBlock = content.match(/^concurrency:\n((?:\s+.+\n?)+)/m)?.[1] ?? "";

    assert.match(concurrencyBlock, /group:\s*sync-game-release/);
    assert.match(concurrencyBlock, /cancel-in-progress:\s*false/);
  });

  it("verifies least-privilege permissions: contents: write", () => {
    assert.ok(fs.existsSync(workflowPath));
    const content = fs.readFileSync(workflowPath, "utf-8");
    const permissionsBlock = content.match(/^permissions:\n((?:\s+.+\n?)+)/m)?.[1] ?? "";

    assert.match(permissionsBlock, /contents:\s*write/);
  });

  it("strictly enforces absence of --delete flag in aws s3 sync commands", () => {
    assert.ok(fs.existsSync(workflowPath));
    const content = fs.readFileSync(workflowPath, "utf-8");

    // Critical security & backward-compatibility rule: never purge historic assets
    assert.equal(
      content.includes("--delete"),
      false,
      "Workflow must NEVER use --delete flag in aws s3 sync to preserve backward compatibility for patron save files"
    );
  });

  it("verifies input sanitization: does not interpolate untrusted branch variables in run shell blocks", () => {
    assert.ok(fs.existsSync(workflowPath));
    const content = fs.readFileSync(workflowPath, "utf-8");

    // Prevent CWE-78 command injection: pass inputs via env:, not direct ${{ ... }} interpolation in run:
    const lines = content.split("\n");
    let inRunBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*run:\s*\|?/.test(line)) {
        inRunBlock = true;
        continue;
      }
      if (/^\s*[a-zA-Z0-9_-]+\s*:/.test(line) && !/^\s*-\s*/.test(line)) {
        inRunBlock = false;
      }

      if (inRunBlock) {
        assert.equal(
          line.includes("${{ github.event.inputs.branch }}"),
          false,
          `Line ${i + 1} insecurely interpolates github.event.inputs.branch in run block. Pass via step env: instead.`
        );
        assert.equal(
          line.includes("${{ github.event.client_payload.branch }}"),
          false,
          `Line ${i + 1} insecurely interpolates github.event.client_payload.branch in run block. Pass via step env: instead.`
        );
      }
    }
  });

  it("verifies upstream documentation and dispatch contract in docs/upstream/publish-to-web.yml", () => {
    assert.ok(
      fs.existsSync(upstreamDocPath),
      `Expected upstream documentation file at ${upstreamDocPath}`
    );
    const content = fs.readFileSync(upstreamDocPath, "utf-8");

    assert.match(content, /CloudNine13\/ropoductions-web/);
    assert.match(content, /game_release_published/);
    assert.match(content, /ROPODUCTIONS_TRIGGER_TOKEN/);
  });

  it("targets the real R2 bucket name, not the wrangler binding", () => {
    assert.ok(fs.existsSync(workflowPath));
    const wf = fs.readFileSync(workflowPath, "utf-8");
    assert.match(wf, /R2_BUCKET_NAME:\s*ropoductions-game-assets/);
    assert.equal(wf.includes("s3://GAME_ASSETS/"), false);
  });
});
