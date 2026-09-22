import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADDRESSING_REVISION,
  ENGINE_RELEASE_ID_PATTERN,
  ENGINE_RELEASE_PARAM,
  SHELL_DOCUMENT_CACHE,
  SHELL_IMMUTABLE_CACHE,
  SHELL_MODERATE_CACHE,
  addressShellReferences,
  computeReleaseId,
  isAddressedShellRequest,
  resolveShellCacheControl,
} from "../src/lib/engine-addressing";

const RELEASE_ID = "a".repeat(64);

/** Mirrors the shipped RPG Maker MZ 1.8.0 export: shell references plus one dangling cordova tag. */
const INDEX_HTML = `<!DOCTYPE html>
<html>
    <head>
        <link rel="icon" href="icon/icon.png" type="image/png">
        <link rel="apple-touch-icon" href="icon/icon.png">
        <link rel="stylesheet" type="text/css" href="css/game.css">
        <title>Final Orginity</title>
    </head>
    <body style="background-color: black">
        <script type="text/javascript" src="cordova.js"></script>
        <script type="text/javascript" src="js/main.js"></script>
    </body>
</html>
`;

/** The two runtime URL sites main.js owns: the boot-script loop and the Effekseer wasm. */
const MAIN_JS = `const scriptUrls = [
    "js/libs/pixi.js",
    "js/rmmz_core.js",
    "js/plugins.js"
];
const effekseerWasmUrl = "js/libs/effekseer.wasm";

class Main {
    loadMainScripts() {
        for (const url of scriptUrls) {
            const script = document.createElement("script");
            script.src = url;
            script._url = url;
            document.body.appendChild(script);
        }
    }
}
`;

/** The shell URL builders plus the media builders that must stay untouched. */
const MANAGERS_JS = `DataManager.loadDataFile = function(name, src) {
    const url = "data/" + src;
};

FontManager.makeUrl = function(filename) {
    return "fonts/" + Utils.encodeURI(filename);
};

ImageManager.loadBitmap = function(folder, filename) {
    const url = folder + Utils.encodeURI(filename) + ".png";
};

AudioManager.createBuffer = function(folder, name) {
    const url = this._path + folder + Utils.encodeURI(name) + ext;
};

EffectManager.makeUrl = function(filename) {
    return "effects/" + Utils.encodeURI(filename) + ".efkefc";
};

PluginManager.loadScript = function(filename) {
    const url = this.makeUrl(filename);
    script.src = url;
};

PluginManager.makeUrl = function(filename) {
    return "js/plugins/" + Utils.encodeURI(filename) + ".js";
};
`;

function stagedSources(): Map<string, string> {
  return new Map<string, string>([
    ["index.html", INDEX_HTML],
    ["js/main.js", MAIN_JS],
    ["js/rmmz_managers.js", MANAGERS_JS],
  ]);
}

function addressedSources(releaseId = RELEASE_ID): Map<string, string> {
  const sources = stagedSources();
  addressShellReferences(sources, releaseId);
  return sources;
}

describe("engine release addressing", () => {
  describe("computeReleaseId", () => {
    const files = [
      { path: "index.html", bytes: new TextEncoder().encode(INDEX_HTML) },
      { path: "js/main.js", bytes: new TextEncoder().encode(MAIN_JS) },
      { path: "js/libs/pixi.js", bytes: new Uint8Array([1, 2, 3]) },
    ];

    it("is a full-length lowercase sha256 and is stable across runs and input order", async () => {
      const id = await computeReleaseId(files);
      const reordered = await computeReleaseId([...files].reverse());

      assert.match(id, ENGINE_RELEASE_ID_PATTERN);
      assert.equal(id.length, 64);
      assert.equal(id, reordered);
      assert.equal(id, await computeReleaseId(files));
    });

    it("changes when a single byte of any staged file changes", async () => {
      const id = await computeReleaseId(files);
      const tampered = files.map((file) =>
        file.path === "js/libs/pixi.js" ? { path: file.path, bytes: new Uint8Array([1, 2, 4]) } : file
      );

      assert.notEqual(await computeReleaseId(tampered), id);
    });

    it("changes when a staged path changes", async () => {
      const id = await computeReleaseId(files);
      const renamed = files.map((file) =>
        file.path === "js/main.js" ? { path: "js/main.renamed.js", bytes: file.bytes } : file
      );

      assert.notEqual(await computeReleaseId(renamed), id);
    });

    it("does not depend on the addressing revision at runtime, only through the manifest header", () => {
      assert.equal(ADDRESSING_REVISION, 1);
    });
  });

  describe("addressShellReferences", () => {
    it("addresses every shell reference the document declares and leaves other references alone", () => {
      const sources = addressedSources();
      const document = sources.get("index.html") as string;

      assert.equal(document.split(`?${ENGINE_RELEASE_PARAM}=${RELEASE_ID}`).length - 1, 4);
      assert.match(document, new RegExp(`href="icon/icon\\.png\\?${ENGINE_RELEASE_PARAM}=${RELEASE_ID}"`));
      assert.match(document, new RegExp(`href="css/game\\.css\\?${ENGINE_RELEASE_PARAM}=${RELEASE_ID}"`));
      assert.match(document, new RegExp(`src="js/main\\.js\\?${ENGINE_RELEASE_PARAM}=${RELEASE_ID}"`));
      assert.match(document, /src="cordova\.js"/);
    });

    it("addresses the boot-script loop and the Effekseer wasm without rewriting the script list", () => {
      const main = addressedSources().get("js/main.js") as string;

      assert.match(
        main,
        new RegExp(`script\\.src = url \\+ "\\?${ENGINE_RELEASE_PARAM}=${RELEASE_ID}";`)
      );
      assert.match(
        main,
        new RegExp(`effekseer\\.wasm\\?${ENGINE_RELEASE_PARAM}=${RELEASE_ID}"`)
      );
      assert.match(main, /"js\/plugins\.js"/);
      assert.match(main, /script\._url = url;/);
    });

    it("addresses plugin and font URLs while leaving every media URL builder untouched", () => {
      const managers = addressedSources().get("js/rmmz_managers.js") as string;

      assert.match(
        managers,
        new RegExp(`return "js/plugins/" \\+ Utils\\.encodeURI\\(filename\\) \\+ "\\.js" \\+ "\\?${ENGINE_RELEASE_PARAM}=${RELEASE_ID}";`)
      );
      assert.match(
        managers,
        new RegExp(`return "fonts/" \\+ Utils\\.encodeURI\\(filename\\) \\+ "\\?${ENGINE_RELEASE_PARAM}=${RELEASE_ID}";`)
      );

      assert.ok(managers.includes('const url = "data/" + src;'));
      assert.ok(managers.includes('const url = folder + Utils.encodeURI(filename) + ".png";'));
      assert.ok(managers.includes('const url = this._path + folder + Utils.encodeURI(name) + ext;'));
      assert.ok(managers.includes('return "effects/" + Utils.encodeURI(filename) + ".efkefc";'));
      assert.equal(managers.includes(`.efkefc?${ENGINE_RELEASE_PARAM}`), false);
    });

    it("rejects a publish whose engine no longer contains the expected URL-building site", () => {
      const sources = stagedSources();
      sources.set("js/main.js", MAIN_JS.replace("script.src = url;", "script.src = this.resolve(url);"));

      assert.throws(
        () => addressShellReferences(sources, RELEASE_ID),
        /Main\.loadMainScripts script source/
      );
    });

    it("rejects a publish when a shell source is missing entirely", () => {
      const sources = stagedSources();
      sources.delete("js/rmmz_managers.js");

      assert.throws(() => addressShellReferences(sources, RELEASE_ID), /js\/rmmz_managers\.js is missing/);
    });

    it("refuses to address an already addressed shell twice", () => {
      assert.throws(() => addressShellReferences(addressedSources(), RELEASE_ID), /already addressed/);
    });

    it("refuses an identifier that is not a release digest", () => {
      assert.throws(() => addressShellReferences(stagedSources(), "8c0be72"), /not a release identifier/);
    });

    it("keeps an existing query and fragment when it addresses a staged reference", () => {
      const sources = stagedSources();
      sources.set(
        "index.html",
        (sources.get("index.html") as string).replace(
          'href="css/game.css"',
          'href="css/game.css?theme=dark#top"'
        )
      );

      addressShellReferences(sources, RELEASE_ID);

      assert.match(
        sources.get("index.html") as string,
        new RegExp(
          `href="css/game\\.css\\?theme=dark&${ENGINE_RELEASE_PARAM}=${RELEASE_ID}#top"`
        )
      );
    });
  });

  describe("shell cache policy", () => {
    it("keeps the document revalidating so a newly published shell is discovered", () => {
      assert.equal(resolveShellCacheControl("index.html", false), SHELL_DOCUMENT_CACHE);
      assert.equal(resolveShellCacheControl("index.html", true), SHELL_DOCUMENT_CACHE);
    });

    it("caches addressed shell files immutably and unaddressed ones moderately", () => {
      assert.equal(resolveShellCacheControl("js/main.js", true), SHELL_IMMUTABLE_CACHE);
      assert.equal(resolveShellCacheControl("js/plugins/Ropoductions_WebBridge.js", true), SHELL_IMMUTABLE_CACHE);
      assert.equal(resolveShellCacheControl("js/plugins/Ropoductions_WebBridge.js", false), SHELL_MODERATE_CACHE);
      assert.equal(resolveShellCacheControl("fonts/mplus-1m-regular.woff", false), SHELL_MODERATE_CACHE);
    });

    it("recognises only a full-length lowercase digest as an address", () => {
      assert.equal(isAddressedShellRequest(new URLSearchParams(`?${ENGINE_RELEASE_PARAM}=${RELEASE_ID}`)), true);
      assert.equal(isAddressedShellRequest(new URLSearchParams("?")), false);
      assert.equal(isAddressedShellRequest(new URLSearchParams(`?${ENGINE_RELEASE_PARAM}=8c0be72`)), false);
      assert.equal(isAddressedShellRequest(new URLSearchParams(`?${ENGINE_RELEASE_PARAM}=${"A".repeat(64)}`)), false);
      assert.equal(isAddressedShellRequest(new URLSearchParams("?retry=1730000000000")), false);
    });
  });
});
