import { describe, it, mock, beforeEach, afterEach } from "node:test";
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
  addressStagedShell,
  generateBuildMetadata,
  printResolvedBranch,
  printGameRoot,
} from "../scripts/sync-game-release";
import { ENGINE_RELEASE_ID_PATTERN, ENGINE_RELEASE_PARAM } from "../src/lib/engine-addressing";

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
    it("defaults to main when branch is auto, undefined, or empty", async () => {
      assert.equal(await resolveTargetBranch("auto"), "main");
      assert.equal(await resolveTargetBranch(undefined), "main");
      assert.equal(await resolveTargetBranch(""), "main");
      assert.equal(await resolveTargetBranch("   "), "main");
    });

    it("returns explicit branch name when valid", async () => {
      assert.equal(await resolveTargetBranch("main"), "main");
      assert.equal(await resolveTargetBranch("0.5.8"), "0.5.8");
      assert.equal(await resolveTargetBranch("custom-feature"), "custom-feature");
    });

    it("rejects invalid branch names and injection attempts", async () => {
      await assert.rejects(
        () => resolveTargetBranch("-invalid-flag"),
        /cannot start with hyphen/
      );
      await assert.rejects(
        () => resolveTargetBranch("../path-traversal"),
        /cannot contain traversal sequences/
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

    it("rejects symbolic links to prevent path traversal", (t) => {
      const externalFile = path.join(tempDir, "external.txt");
      fs.writeFileSync(externalFile, "secret");

      const symlinkPath = path.join(tempDir, "js", "evil-link.js");
      try {
        fs.symlinkSync(externalFile, symlinkPath);
      } catch {
        t.skip("OS / filesystem forbids symlinks in unprivileged mode");
        return;
      }

      assert.throws(
        () => segregateAssets(tempDir, outputDir),
        /Symbolic links are forbidden/
      );
    });
  });

  describe("generateBuildMetadata", () => {
    it("writes build-metadata.json with commit, branch, timestamp, and the release identifier", () => {
      generateBuildMetadata({
        upstreamRepo: "salamin888/Final_Orginity",
        branch: "0.6.0",
        commitSha: "abc1234567890",
        syncedAt: "2026-09-17T12:00:00.000Z",
        releaseId: "b".repeat(64),
        outputDir: tempDir,
      });

      const metadataFile = path.join(tempDir, "build-metadata.json");
      assert.ok(fs.existsSync(metadataFile));

      const parsed = JSON.parse(fs.readFileSync(metadataFile, "utf-8")) as {
        upstreamRepo: string;
        branch: string;
        commitSha: string;
        syncedAt: string;
        releaseId: string;
        addressingRevision: number;
      };
      assert.equal(parsed.upstreamRepo, "salamin888/Final_Orginity");
      assert.equal(parsed.branch, "0.6.0");
      assert.equal(parsed.commitSha, "abc1234567890");
      assert.equal(parsed.syncedAt, "2026-09-17T12:00:00.000Z");
      assert.equal(parsed.releaseId, "b".repeat(64));
      assert.equal(parsed.addressingRevision, 1);
    });
  });

  describe("addressStagedShell", () => {
    const SHELL_SOURCES: Record<string, string> = {
      "index.html": `<!DOCTYPE html>
<html>
    <head>
        <link rel="icon" href="icon/icon.png" type="image/png">
        <link rel="apple-touch-icon" href="icon/icon.png">
        <link rel="stylesheet" type="text/css" href="css/game.css">
    </head>
    <body>
        <script type="text/javascript" src="cordova.js"></script>
        <script type="text/javascript" src="js/main.js"></script>
    </body>
</html>
`,
      "js/main.js": `const scriptUrls = ["js/libs/pixi.js", "js/rmmz_core.js", "js/plugins.js"];
const effekseerWasmUrl = "js/libs/effekseer.wasm";
script.src = url;
`,
      "js/rmmz_managers.js": `DataManager.loadDataFile = function(name, src) {
    const url = "data/" + src;
};
FontManager.makeUrl = function(filename) {
    return "fonts/" + Utils.encodeURI(filename);
};
ImageManager.loadBitmap = function(folder, filename) {
    const url = folder + Utils.encodeURI(filename) + ".png";
};
EffectManager.makeUrl = function(filename) {
    return "effects/" + Utils.encodeURI(filename) + ".efkefc";
};
PluginManager.makeUrl = function(filename) {
    return "js/plugins/" + Utils.encodeURI(filename) + ".js";
};
`,
    };

    function stageReleasableGame(overrides: Record<string, string> = {}): {
      shellDir: string;
      shellFiles: string[];
    } {
      fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "data", "System.json"), "{}");
      fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ name: "game" }));
      fs.mkdirSync(path.join(tempDir, "js", "libs"), { recursive: true });
      fs.mkdirSync(path.join(tempDir, "css"), { recursive: true });
      fs.mkdirSync(path.join(tempDir, "icon"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "js", "libs", "pixi.js"), "// pixi");
      fs.writeFileSync(path.join(tempDir, "css", "game.css"), "body{}");
      fs.writeFileSync(path.join(tempDir, "icon", "icon.png"), "png");
      for (const [file, content] of Object.entries({ ...SHELL_SOURCES, ...overrides })) {
        const dest = path.join(tempDir, file);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, content);
      }

      const shellDir = path.join(tempDir, "staged");
      const segregation = segregateAssets(tempDir, shellDir);
      return { shellDir, shellFiles: segregation.shellFiles };
    }

    it("addresses every staged shell reference with the content digest it returns", async () => {
      const { shellDir, shellFiles } = stageReleasableGame();

      const releaseId = await addressStagedShell(shellDir, shellFiles);

      assert.match(releaseId, ENGINE_RELEASE_ID_PATTERN);
      const document = fs.readFileSync(path.join(shellDir, "index.html"), "utf-8");
      assert.equal(document.split(`?${ENGINE_RELEASE_PARAM}=${releaseId}`).length - 1, 4);
      assert.match(document, /src="cordova\.js"/);

      const main = fs.readFileSync(path.join(shellDir, "js", "main.js"), "utf-8");
      assert.ok(main.includes(`script.src = url + "?${ENGINE_RELEASE_PARAM}=${releaseId}";`));
      assert.ok(main.includes(`effekseer.wasm?${ENGINE_RELEASE_PARAM}=${releaseId}"`));

      const managers = fs.readFileSync(path.join(shellDir, "js", "rmmz_managers.js"), "utf-8");
      assert.ok(managers.includes(`+ ".js" + "?${ENGINE_RELEASE_PARAM}=${releaseId}";`));
      assert.ok(managers.includes(`Utils.encodeURI(filename) + "?${ENGINE_RELEASE_PARAM}=${releaseId}";`));
      assert.ok(managers.includes('const url = "data/" + src;'));
      assert.ok(managers.includes('const url = folder + Utils.encodeURI(filename) + ".png";'));
      assert.ok(managers.includes('return "effects/" + Utils.encodeURI(filename) + ".efkefc";'));
    });

    it("derives the same identifier from identical bytes and a different one from changed bytes", async () => {
      const firstStage = stageReleasableGame();
      const first = await addressStagedShell(firstStage.shellDir, firstStage.shellFiles);

      fs.rmSync(path.join(tempDir, "staged"), { recursive: true, force: true });
      const secondStage = stageReleasableGame();
      const second = await addressStagedShell(secondStage.shellDir, secondStage.shellFiles);
      assert.equal(second, first);

      fs.rmSync(path.join(tempDir, "staged"), { recursive: true, force: true });
      const thirdStage = stageReleasableGame({ "css/game.css": "body{color:red}" });
      const third = await addressStagedShell(thirdStage.shellDir, thirdStage.shellFiles);
      assert.notEqual(third, first);
    });

    it("refuses to address an already addressed staged shell", async () => {
      const { shellDir, shellFiles } = stageReleasableGame();
      await addressStagedShell(shellDir, shellFiles);

      await assert.rejects(
        () => addressStagedShell(shellDir, shellFiles),
        /already addressed/
      );
    });
  });

  describe("workflow CLI output contracts", () => {
    it("prints the resolved branch to stdout and returns it", async () => {
      const logs: string[] = [];
      const logged = mock.method(console, "log", (line: unknown) => logs.push(String(line)));
      try {
        const branch = await printResolvedBranch("0.5.8");
        assert.equal(branch, "0.5.8");
        assert.deepEqual(logs, ["0.5.8"]);
      } finally {
        logged.mock.restore();
      }
    });

    it("defaults to main when BRANCH_INPUT is unset", async () => {
      const saved = process.env.BRANCH_INPUT;
      delete process.env.BRANCH_INPUT;
      const logs: string[] = [];
      const logged = mock.method(console, "log", (line: unknown) => logs.push(String(line)));
      try {
        const branch = await printResolvedBranch();
        assert.equal(branch, "main");
        assert.deepEqual(logs, ["main"]);
      } finally {
        logged.mock.restore();
        if (saved === undefined) {
          delete process.env.BRANCH_INPUT;
        } else {
          process.env.BRANCH_INPUT = saved;
        }
      }
    });

    it("prints the detected game root and returns it", () => {
      const gameDir = path.join(tempDir, "Final Orginity");
      fs.mkdirSync(path.join(gameDir, "data"), { recursive: true });
      fs.writeFileSync(path.join(gameDir, "data", "System.json"), "{}");

      const logs: string[] = [];
      const logged = mock.method(console, "log", (line: unknown) => logs.push(String(line)));
      try {
        const root = printGameRoot(tempDir);
        assert.equal(root, gameDir);
        assert.deepEqual(logs, [gameDir]);
      } finally {
        logged.mock.restore();
      }
    });
  });
});
