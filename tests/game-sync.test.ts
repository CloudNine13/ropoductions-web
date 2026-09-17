import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  validateBranchName,
  resolveTargetBranch,
  locateGameRoot,
  validateGameStructure,
  injectWebBridge,
  segregateAssets,
  generateBuildMetadata,
} from "../scripts/sync-game-release";

describe("upstream game release ingestion engine (scripts/sync-game-release.ts)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "game-sync-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("validateBranchName", () => {
    it("accepts valid alphanumeric, semver, and kebab-case branch names", () => {
      assert.equal(validateBranchName("0.6.0"), "0.6.0");
      assert.equal(validateBranchName("v1.2.3"), "v1.2.3");
      assert.equal(validateBranchName("release/0.6.0"), "release/0.6.0");
      assert.equal(validateBranchName("feat-new-maps"), "feat-new-maps");
      assert.equal(validateBranchName("patch_2026_09"), "patch_2026_09");
    });

    it("rejects branches starting with hyphen to prevent git CLI flag injection", () => {
      assert.throws(() => validateBranchName("-u"), /Invalid branch name/);
      assert.throws(() => validateBranchName("--upload-pack=evil"), /Invalid branch name/);
    });

    it("rejects path traversal and consecutive slash sequences", () => {
      assert.throws(() => validateBranchName("../../master"), /Invalid branch name/);
      assert.throws(() => validateBranchName("main//release"), /Invalid branch name/);
    });

    it("rejects shell metacharacters and invalid symbols", () => {
      assert.throws(() => validateBranchName("main; rm -rf /"), /Invalid branch name/);
      assert.throws(() => validateBranchName("0.6.0|curl"), /Invalid branch name/);
      assert.throws(() => validateBranchName(""), /Invalid branch name/);
    });
  });

  describe("resolveTargetBranch", () => {
    it("returns explicit branch name when not auto", async () => {
      const result = await resolveTargetBranch("0.6.0");
      assert.equal(result, "0.6.0");
    });

    it("fetches and extracts base version when branch is auto or undefined", async () => {
      const mockFetch = async () => JSON.stringify({ base: "0.6.5", minBase: "0.6.0" });
      const result = await resolveTargetBranch("auto", mockFetch);
      assert.equal(result, "0.6.5");

      const resultUndefined = await resolveTargetBranch(undefined, mockFetch);
      assert.equal(resultUndefined, "0.6.5");
    });

    it("throws when release.json fails to parse or lacks base version", async () => {
      const invalidJsonFetch = async () => "not-json";
      await assert.rejects(
        () => resolveTargetBranch("auto", invalidJsonFetch),
        /Failed to parse upstream tools\/release\.json/
      );

      const missingBaseFetch = async () => JSON.stringify({ other: "data" });
      await assert.rejects(
        () => resolveTargetBranch("auto", missingBaseFetch),
        /missing valid "base" version/
      );
    });
  });

  describe("locateGameRoot", () => {
    it("detects game files inside Final Orginity/ subdirectory", () => {
      const subDir = path.join(tempDir, "Final Orginity");
      fs.mkdirSync(path.join(subDir, "data"), { recursive: true });
      fs.writeFileSync(path.join(subDir, "data", "System.json"), "{}");

      const root = locateGameRoot(tempDir);
      assert.equal(root, subDir);
    });

    it("detects game files at repository root", () => {
      fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "data", "System.json"), "{}");

      const root = locateGameRoot(tempDir);
      assert.equal(root, tempDir);
    });

    it("throws when System.json is not found in either location", () => {
      assert.throws(
        () => locateGameRoot(tempDir),
        /Could not locate RPG Maker MZ game root/
      );
    });
  });

  describe("validateGameStructure", () => {
    function scaffoldValidGame(dir: string) {
      fs.mkdirSync(path.join(dir, "data"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "data", "System.json"),
        JSON.stringify({
          gameTitle: "Final Orginity",
          versionId: 100,
          variables: ["", "Var1"],
          switches: ["", "Switch1"],
        })
      );
      fs.writeFileSync(
        path.join(dir, "data", "MapInfos.json"),
        JSON.stringify([null, { id: 1, name: "Intro" }])
      );
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "game" }));
      fs.writeFileSync(path.join(dir, "index.html"), "<!DOCTYPE html><html></html>");
    }

    it("succeeds when required files and valid JSON exist", () => {
      scaffoldValidGame(tempDir);
      const result = validateGameStructure(tempDir);
      assert.equal(result.gameTitle, "Final Orginity");
      assert.equal(result.versionId, 100);
      assert.ok(result.fileCount >= 4);
    });

    it("throws when index.html is missing", () => {
      scaffoldValidGame(tempDir);
      fs.unlinkSync(path.join(tempDir, "index.html"));

      assert.throws(
        () => validateGameStructure(tempDir),
        /Missing required game file: index\.html/
      );
    });

    it("throws when data/System.json has invalid JSON syntax", () => {
      scaffoldValidGame(tempDir);
      fs.writeFileSync(path.join(tempDir, "data", "System.json"), "{ invalid-json }");

      assert.throws(
        () => validateGameStructure(tempDir),
        /Corrupted JSON in data\/System\.json/
      );
    });

    it("throws when a secondary database file like data/MapInfos.json is truncated or empty", () => {
      scaffoldValidGame(tempDir);
      fs.writeFileSync(path.join(tempDir, "data", "MapInfos.json"), "");

      assert.throws(
        () => validateGameStructure(tempDir),
        /Corrupted JSON in data\/MapInfos\.json/
      );
    });
  });

  describe("injectWebBridge", () => {
    let pluginsJsPath: string;
    let bridgeSourcePath: string;

    beforeEach(() => {
      const pluginsDir = path.join(tempDir, "js");
      fs.mkdirSync(path.join(pluginsDir, "plugins"), { recursive: true });
      pluginsJsPath = path.join(pluginsDir, "plugins.js");
      bridgeSourcePath = path.join(tempDir, "Ropoductions_WebBridge.js");
      fs.writeFileSync(bridgeSourcePath, "// WebBridge Source");
    });

    it("injects bridge into empty $plugins array and validates syntax", () => {
      fs.writeFileSync(pluginsJsPath, "var $plugins = [];\n");

      const result = injectWebBridge(tempDir, bridgeSourcePath);
      assert.equal(result.injected, true);
      assert.equal(result.alreadyPresent, false);

      const targetBridgePath = path.join(tempDir, "js", "plugins", "Ropoductions_WebBridge.js");
      assert.ok(fs.existsSync(targetBridgePath));

      const updatedPluginsJs = fs.readFileSync(pluginsJsPath, "utf-8");
      assert.match(updatedPluginsJs, /Ropoductions_WebBridge/);

      // Verify JavaScript syntax by evaluating without errors
      const fn = new Function(`${updatedPluginsJs}; return $plugins;`);
      const plugins = fn() as Array<{ name: string; status: boolean }>;
      assert.equal(plugins.length, 1);
      assert.equal(plugins[0].name, "Ropoductions_WebBridge");
      assert.equal(plugins[0].status, true);
    });

    it("injects bridge into non-empty $plugins array preserving existing plugins", () => {
      fs.writeFileSync(
        pluginsJsPath,
        'var $plugins =\n[\n{"name":"ExistingPlugin","status":true,"description":"Desc","parameters":{}}\n];'
      );

      const result = injectWebBridge(tempDir, bridgeSourcePath);
      assert.equal(result.injected, true);

      const updatedPluginsJs = fs.readFileSync(pluginsJsPath, "utf-8");
      const fn = new Function(`${updatedPluginsJs}; return $plugins;`);
      const plugins = fn() as Array<{ name: string }>;
      assert.equal(plugins.length, 2);
      assert.equal(plugins[0].name, "ExistingPlugin");
      assert.equal(plugins[1].name, "Ropoductions_WebBridge");
    });

    it("is idempotent when Ropoductions_WebBridge is already registered", () => {
      fs.writeFileSync(
        pluginsJsPath,
        'var $plugins =\n[\n{"name":"Ropoductions_WebBridge","status":true,"description":"","parameters":{}}\n];'
      );

      const result = injectWebBridge(tempDir, bridgeSourcePath);
      assert.equal(result.injected, false);
      assert.equal(result.alreadyPresent, true);

      const updatedPluginsJs = fs.readFileSync(pluginsJsPath, "utf-8");
      const fn = new Function(`${updatedPluginsJs}; return $plugins;`);
      const plugins = fn() as Array<{ name: string }>;
      assert.equal(plugins.length, 1);
    });
  });

  describe("segregateAssets", () => {
    let outputDir: string;

    beforeEach(() => {
      outputDir = path.join(tempDir, "public_engine");
      fs.mkdirSync(outputDir, { recursive: true });

      // Scaffold game structure
      fs.mkdirSync(path.join(tempDir, "audio", "bgm"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "audio", "bgm", "Theme.ogg"), "audio-bytes");

      fs.mkdirSync(path.join(tempDir, "img", "titles1"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "img", "titles1", "Title.png"), "image-bytes");

      fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "data", "System.json"), "{}");

      fs.mkdirSync(path.join(tempDir, "js"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "js", "main.js"), "console.log('mz');");

      fs.mkdirSync(path.join(tempDir, "css"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "css", "game.css"), "body{}");

      fs.writeFileSync(path.join(tempDir, "index.html"), "<html></html>");
    });

    it("partitions media paths for R2 and copies shell files to public engine", () => {
      const result = segregateAssets(tempDir, outputDir);

      assert.ok(result.mediaFiles.some((f) => f.startsWith("audio/bgm/Theme.ogg")));
      assert.ok(result.mediaFiles.some((f) => f.startsWith("img/titles1/Title.png")));
      assert.ok(result.mediaFiles.some((f) => f.startsWith("data/System.json")));

      assert.ok(result.shellFiles.includes("index.html"));
      assert.ok(result.shellFiles.includes("js/main.js"));
      assert.ok(result.shellFiles.includes("css/game.css"));

      assert.ok(fs.existsSync(path.join(outputDir, "index.html")));
      assert.ok(fs.existsSync(path.join(outputDir, "js", "main.js")));
      assert.ok(fs.existsSync(path.join(outputDir, "css", "game.css")));

      // Media files should NOT be in outputDir
      assert.equal(fs.existsSync(path.join(outputDir, "audio")), false);
      assert.equal(fs.existsSync(path.join(outputDir, "img")), false);
    });

    it("rejects symbolic links to prevent path traversal", () => {
      const externalFile = path.join(tempDir, "external.txt");
      fs.writeFileSync(externalFile, "secret");

      const symlinkPath = path.join(tempDir, "js", "evil-link.js");
      try {
        fs.symlinkSync(externalFile, symlinkPath);
      } catch {
        // Skip test if OS / filesystem forbids symlink in unprivileged mode
        return;
      }

      assert.throws(
        () => segregateAssets(tempDir, outputDir),
        /Symbolic links are forbidden/
      );
    });
  });

  describe("generateBuildMetadata", () => {
    it("writes build-metadata.json with commit, branch, and timestamp", () => {
      generateBuildMetadata({
        upstreamRepo: "salamin888/Final_Orginity",
        branch: "0.6.0",
        commitSha: "abc1234567890",
        syncedAt: "2026-09-17T12:00:00.000Z",
        outputDir: tempDir,
      });

      const metadataFile = path.join(tempDir, "build-metadata.json");
      assert.ok(fs.existsSync(metadataFile));

      const parsed = JSON.parse(fs.readFileSync(metadataFile, "utf-8")) as {
        upstreamRepo: string;
        branch: string;
        commitSha: string;
        syncedAt: string;
      };
      assert.equal(parsed.upstreamRepo, "salamin888/Final_Orginity");
      assert.equal(parsed.branch, "0.6.0");
      assert.equal(parsed.commitSha, "abc1234567890");
      assert.equal(parsed.syncedAt, "2026-09-17T12:00:00.000Z");
    });
  });
});
