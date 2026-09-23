import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {
  MOCK_ENGINE_HTML,
  WEB_BRIDGE_SOURCE,
} from "@/lib/engine-mock.generated";

interface BridgeResponsePayload {
  slots: Record<string, string>;
  global?: string;
  config?: string;
}

interface BridgeMessage {
  type: string;
  payload?: BridgeResponsePayload | Record<string, string>;
}

interface BootReportMessage {
  type: string;
  failureClass?: string;
  raw?: string;
  diagnostics?: {
    url?: string;
    statusMessage?: string;
    probeSupported?: boolean;
    engineScripts?: string[];
  };
}

describe("in-game postMessage web bridge Ropoductions_WebBridge.js", () => {
  const pluginPath = path.resolve(
    process.cwd(),
    "src/engine-plugins/Ropoductions_WebBridge.js"
  );

  interface MockStorage {
    [key: string]: unknown;
  }

  let storageStore: MockStorage;
  let postedMessages: Array<{ message: BridgeMessage; targetOrigin: string }>;
  let globalInfoLoaded: boolean;
  let eventListeners: Record<string, Array<(event: unknown) => void>>;
  let documentListeners: Record<string, Array<(event: unknown) => void>>;
  let sandbox: Record<string, unknown>;
  let errorPrinterElement: { style: { display: string } };

  function setupEnvironment(currentOrigin = "https://ropoductions.com") {
    storageStore = {};
    postedMessages = [];
    globalInfoLoaded = false;
    eventListeners = {};
    documentListeners = {};

    const mockWindow: Record<string, unknown> = {
      location: {
        origin: currentOrigin,
      },
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        if (!eventListeners[type]) {
          eventListeners[type] = [];
        }
        eventListeners[type].push(listener);
      },
      removeEventListener: (type: string, listener: (event: unknown) => void) => {
        if (eventListeners[type]) {
          eventListeners[type] = eventListeners[type].filter((l) => l !== listener);
        }
      },
      parent: {
        postMessage: (message: BridgeMessage, targetOrigin: string) => {
          postedMessages.push({ message, targetOrigin });
        },
      },
    };

    const mockStorageManager = {
      isLocalMode: () => false,
      saveObject: (saveName: string, object: unknown) => {
        storageStore[saveName] = object;
        return Promise.resolve();
      },
      loadObject: (saveName: string) => {
        if (saveName in storageStore) {
          return Promise.resolve(storageStore[saveName]);
        }
        return Promise.reject(new Error("Save not found"));
      },
      exists: (saveName: string) => {
        return Promise.resolve(saveName in storageStore);
      },
      remove: (saveName: string) => {
        delete storageStore[saveName];
        return Promise.resolve();
      },
    };

    const mockDataManager = {
      loadGlobalInfo: () => {
        globalInfoLoaded = true;
        return Promise.resolve();
      },
    };

    errorPrinterElement = { style: { display: "" } };

    const canvasListeners: Array<(event: unknown) => void> = [];
    const mockDocument = {
      readyState: "loading",
      getElementById: (id: string) => (id === "errorPrinter" ? errorPrinterElement : null),
      createElement: () => ({
        addEventListener: (type: string, listener: (event: unknown) => void) => {
          canvasListeners.push(listener);
        },
        removeEventListener: (type: string, listener: (event: unknown) => void) => {
          const index = canvasListeners.indexOf(listener);
          if (index >= 0) {
            canvasListeners.splice(index, 1);
          }
        },
        getContext: () => {
          for (const listener of canvasListeners) {
            listener({ statusMessage: "GPU process crashed" });
          }
          return null;
        },
      }),
      querySelectorAll: () => [],
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        if (!documentListeners[type]) {
          documentListeners[type] = [];
        }
        documentListeners[type].push(listener);
      },
      removeEventListener: (type: string, listener: (event: unknown) => void) => {
        if (documentListeners[type]) {
          documentListeners[type] = documentListeners[type].filter((l) => l !== listener);
        }
      },
    };

    sandbox = {
      window: mockWindow,
      document: mockDocument,
      StorageManager: mockStorageManager,
      DataManager: mockDataManager,
      console,
      queueMicrotask,
    };
  }

  async function dispatchMessage(
    data: unknown,
    origin = "https://ropoductions.com",
    source?: unknown
  ) {
    const listeners = eventListeners["message"] || [];
    const event = {
      origin,
      data,
      source: source !== undefined ? source : (sandbox.window as Record<string, unknown>).parent,
    };
    for (const listener of listeners) {
      await listener(event);
    }
  }

  function fireWindowEvent(type: string, event: Record<string, unknown> = {}) {
    const listeners = eventListeners[type] || [];
    for (const listener of listeners) {
      listener({ type, ...event });
    }
  }

  function fireDocumentEvent(type: string, event: Record<string, unknown> = {}) {
    const listeners = documentListeners[type] || [];
    for (const listener of listeners) {
      listener({ type, preventDefault: () => {}, ...event });
    }
  }

  function loadPlugin(targetPath = pluginPath) {
    assert.ok(
      fs.existsSync(targetPath),
      `Expected plugin file to exist at ${targetPath}`
    );
    const code = fs.readFileSync(targetPath, "utf-8");
    const script = new vm.Script(code);
    const context = vm.createContext(sandbox);
    script.runInContext(context);
  }

  beforeEach(() => {
    setupEnvironment();
  });

  it("fails when plugin file does not exist", () => {
    assert.throws(() =>
      loadPlugin(path.resolve(process.cwd(), "src/engine-plugins/Does_Not_Exist.js"))
    );
  });

  it("strictly ignores messages from mismatched origin", async () => {
    loadPlugin();
    await dispatchMessage({ type: "ROPODUCTIONS_GET_SAVES" }, "https://malicious-origin.com");

    assert.equal(postedMessages.length, 0);
  });
  it("strictly ignores messages from within the iframe itself (source !== window.parent)", async () => {
    loadPlugin();
    await dispatchMessage(
      { type: "ROPODUCTIONS_RESET_SAVES" },
      "https://ropoductions.com",
      sandbox.window
    );

    assert.equal(postedMessages.length, 0);
  });


  it("handles ROPODUCTIONS_GET_SAVES and returns saves data", async () => {
    storageStore["file1"] = JSON.stringify({ hero: "Reid", level: 5 });
    storageStore["global"] = JSON.stringify({ playtime: 120 });
    storageStore["config"] = JSON.stringify({ bgmVolume: 80 });

    loadPlugin();
    await dispatchMessage({ type: "ROPODUCTIONS_GET_SAVES" });

    assert.equal(postedMessages.length, 1);
    const response = postedMessages[0];
    assert.equal(response.targetOrigin, "https://ropoductions.com");
    assert.equal(response.message.type, "ROPODUCTIONS_SAVES_DATA");
    const payload = response.message.payload as BridgeResponsePayload;
    assert.ok(payload);
    assert.equal(payload.slots["file1"], JSON.stringify({ hero: "Reid", level: 5 }));
    assert.equal(payload.global, JSON.stringify({ playtime: 120 }));
    assert.equal(payload.config, JSON.stringify({ bgmVolume: 80 }));
  });

  it("handles ROPODUCTIONS_SET_SAVES and calls DataManager.loadGlobalInfo()", async () => {
    loadPlugin();
    const newSaves: Record<string, string> = {
      file1: JSON.stringify({ hero: "Reid", level: 10 }),
      file2: JSON.stringify({ hero: "Reid", level: 11 }),
      global: JSON.stringify({ playtime: 3600 }),
    };

    await dispatchMessage({ type: "ROPODUCTIONS_SET_SAVES", payload: newSaves });

    assert.equal(JSON.stringify(storageStore["file1"]), newSaves.file1);
    assert.equal(JSON.stringify(storageStore["file2"]), newSaves.file2);
    assert.equal(JSON.stringify(storageStore["global"]), newSaves.global);
    assert.equal(globalInfoLoaded, true);
    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].message.type, "ROPODUCTIONS_SET_SAVES_SUCCESS");
  });

  it("rejects prototype pollution attempts in ROPODUCTIONS_SET_SAVES", async () => {
    loadPlugin();
    const maliciousPayload = JSON.parse('{"__proto__": {"polluted": true}, "file1": "valid-data"}') as Record<string, string>;

    await dispatchMessage({ type: "ROPODUCTIONS_SET_SAVES", payload: maliciousPayload });

    assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"), false);
    assert.equal(Object.hasOwn(storageStore, "__proto__"), false);
    assert.equal(Object.hasOwn(storageStore, "constructor"), false);
  });

  it("rejects invalid save slot keys in ROPODUCTIONS_SET_SAVES and emits error on zero saved", async () => {
    loadPlugin();
    const invalidPayload: Record<string, string> = {
      unauthorized_slot: "some-data",
      file99: "exceeds-slot-20",
    };

    await dispatchMessage({ type: "ROPODUCTIONS_SET_SAVES", payload: invalidPayload });

    assert.equal(storageStore["unauthorized_slot"], undefined);
    assert.equal(storageStore["file99"], undefined);
    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].message.type, "ROPODUCTIONS_SAVE_ERROR");
  });

  it("handles StorageManager.saveObject rejection and emits ROPODUCTIONS_SAVE_ERROR", async () => {
    loadPlugin();
    (sandbox.StorageManager as { saveObject: unknown }).saveObject = () =>
      Promise.reject(new Error("DiskQuotaExceeded"));

    await dispatchMessage({
      type: "ROPODUCTIONS_SET_SAVES",
      payload: { file1: '{"level":1}' },
    });

    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].message.type, "ROPODUCTIONS_SAVE_ERROR");
  });

  it("handles DataManager.loadGlobalInfo rejection without throwing", async () => {
    loadPlugin();
    (sandbox.DataManager as { loadGlobalInfo: unknown }).loadGlobalInfo = () =>
      Promise.reject(new Error("CorruptGlobalInfo"));

    await dispatchMessage({
      type: "ROPODUCTIONS_SET_SAVES",
      payload: { file1: '{"level":1}' },
    });

    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].message.type, "ROPODUCTIONS_SET_SAVES_SUCCESS");
  });

  it("handles non-object engine payload and emits ROPODUCTIONS_SAVE_ERROR", async () => {
    loadPlugin();
    await dispatchMessage({
      type: "ROPODUCTIONS_SET_SAVES",
      payload: "not-an-object",
    });

    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].message.type, "ROPODUCTIONS_SAVE_ERROR");
  });

  it("strictly ignores message when event.source is null in nested iframe", async () => {
    loadPlugin();
    await dispatchMessage(
      { type: "ROPODUCTIONS_RESET_SAVES" },
      "https://ropoductions.com",
      null
    );

    assert.equal(postedMessages.length, 0);
  });

  it("skips slots exceeding 10MB byte limit", async () => {
    loadPlugin();
    const oversizedPayload = {
      file1: "x".repeat(10 * 1024 * 1024 + 10),
      file2: '{"valid":true}',
    };

    await dispatchMessage({
      type: "ROPODUCTIONS_SET_SAVES",
      payload: oversizedPayload,
    });

    assert.equal(storageStore["file1"], undefined);
    assert.equal(JSON.stringify(storageStore["file2"]), JSON.stringify({ valid: true }));
    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].message.type, "ROPODUCTIONS_SET_SAVES_SUCCESS");
  });

  it("handles ROPODUCTIONS_RESET_SAVES and purges storage slots", async () => {
    storageStore["file1"] = "save-1";
    storageStore["file2"] = "save-2";
    storageStore["global"] = "global-data";

    loadPlugin();
    await dispatchMessage({ type: "ROPODUCTIONS_RESET_SAVES" });

    assert.equal(storageStore["file1"], undefined);
    assert.equal(storageStore["file2"], undefined);
    assert.equal(storageStore["global"], undefined);
    assert.equal(globalInfoLoaded, true);
    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].message.type, "ROPODUCTIONS_RESET_SAVES_SUCCESS");
  });

  it("reports readiness against the document load when the document carries no MZ runtime", () => {
    (sandbox.document as { readyState: string }).readyState = "complete";
    loadPlugin();

    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].message.type, "ROPODUCTIONS_ENGINE_READY");
    assert.equal(postedMessages[0].targetOrigin, "https://ropoductions.com");
  });

  it("holds readiness until the document load when the mock harness is still parsing", () => {
    loadPlugin();
    assert.equal(postedMessages.length, 0);

    fireWindowEvent("load");

    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].message.type, "ROPODUCTIONS_ENGINE_READY");
  });

  it("classifies an MZ capability failure, keeps the raw probe detail and hides the error printer", () => {
    sandbox.Utils = { canUseWebGL: () => false };
    sandbox.SceneManager = {
      checkBrowser: () => {
        (sandbox.Utils as { canUseWebGL: () => boolean }).canUseWebGL();
        throw new Error("Your browser does not support WebGL.");
      },
    };
    sandbox.Graphics = { printError: () => {} };
    loadPlugin();

    assert.throws(() => (sandbox.SceneManager as { checkBrowser: () => void }).checkBrowser());

    assert.equal(postedMessages.length, 1);
    const report = postedMessages[0].message as unknown as BootReportMessage;
    assert.equal(report.type, "ROPODUCTIONS_ENGINE_BOOT_FAILURE");
    assert.equal(report.failureClass, "webgl_unavailable");
    assert.equal(report.raw, "Your browser does not support WebGL.");
    assert.equal(report.diagnostics?.statusMessage, "GPU process crashed");
    assert.equal(report.diagnostics?.probeSupported, false);
    assert.equal(errorPrinterElement.style.display, "none");
  });

  it("stops reporting boot failures once readiness is posted", () => {
    sandbox.SceneManager = { checkBrowser: () => true };
    sandbox.Graphics = { printError: () => {} };
    loadPlugin();

    (sandbox.SceneManager as { checkBrowser: () => void }).checkBrowser();
    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].message.type, "ROPODUCTIONS_ENGINE_READY");

    (sandbox.Graphics as { printError: (name: string, message: string) => void }).printError(
      "TypeError",
      "cannot read properties of undefined"
    );
    fireWindowEvent("error", {
      target: { tagName: "IMG", src: "https://ropoductions.com/img/pictures/hero.png" },
    });

    assert.equal(postedMessages.length, 1);
  });

  it("covers an unclassifiable engine error with the boot request class and its raw text", () => {
    sandbox.SceneManager = { checkBrowser: () => true };
    sandbox.Graphics = { printError: () => {} };
    loadPlugin();

    (sandbox.Graphics as { printError: (name: string, message: string) => void }).printError(
      "TypeError",
      "cannot read properties of undefined"
    );

    assert.equal(postedMessages.length, 1);
    const report = postedMessages[0].message as unknown as BootReportMessage;
    assert.equal(report.failureClass, "boot_request_failed");
    assert.equal(report.raw, "TypeError: cannot read properties of undefined");
  });

  it("classifies an MZ load failure as an asset failure and names the failing URL once", () => {
    sandbox.SceneManager = { checkBrowser: () => true };
    const printedErrors: Array<[unknown, unknown]> = [];
    sandbox.Graphics = {
      printError: (name: unknown, message: unknown) => {
        printedErrors.push([name, message]);
      },
    };
    loadPlugin();

    (sandbox.Graphics as { printError: (n: string, m: string) => void }).printError(
      "Failed to load",
      "js/main.js"
    );
    fireWindowEvent("error", {
      target: { tagName: "IMG", src: "https://ropoductions.com/img/pictures/hero.png" },
    });
    fireWindowEvent("error", {
      target: { tagName: "IMG", src: "https://ropoductions.com/img/pictures/hero.png" },
    });

    assert.equal(printedErrors.length, 1);
    assert.equal(postedMessages.length, 2);
    const first = postedMessages[0].message as unknown as BootReportMessage;
    assert.equal(first.failureClass, "asset_load_failed");
    assert.equal(first.diagnostics?.url, "js/main.js");
    const second = postedMessages[1].message as unknown as BootReportMessage;
    assert.equal(second.failureClass, "asset_load_failed");
    assert.equal(second.diagnostics?.url, "https://ropoductions.com/img/pictures/hero.png");
  });

  it("keeps the bridge boot taxonomy in parity with the host taxonomy", () => {
    const code = fs.readFileSync(pluginPath, "utf-8");
    for (const sentence of [
      "Your browser does not support WebGL.",
      "Your browser does not support Web Audio API.",
      "Your browser does not support CSS Font Loading.",
      "Your browser does not support IndexedDB.",
      "Your browser does not allow to read local files.",
      "Failed to initialize graphics.",
      "Failed to load",
      "has failed to load",
    ]) {
      assert.ok(code.includes(sentence), `bridge taxonomy must include: ${sentence}`);
    }
  });

  it("posts readiness on scene transition rather than the capability gate", () => {
    let gotoTarget: unknown = null;
    sandbox.SceneManager = {
      checkBrowser: () => true,
      goto: (sceneClass: unknown) => {
        gotoTarget = sceneClass;
      },
    };
    sandbox.Graphics = { printError: () => {} };
    loadPlugin();

    (sandbox.SceneManager as { checkBrowser: () => void }).checkBrowser();
    assert.equal(
      postedMessages.length,
      0,
      "capability gate must not close the boot window"
    );

    class SceneBootForTest {}
    Object.defineProperty(SceneBootForTest, "name", { value: "Scene_Boot" });
    class SceneMapForTest {}
    Object.defineProperty(SceneMapForTest, "name", { value: "Scene_Map" });
    (sandbox.SceneManager as { goto: (c: unknown) => void }).goto(SceneBootForTest);
    assert.equal(postedMessages.length, 0);
    (sandbox.SceneManager as { goto: (c: unknown) => void }).goto(SceneMapForTest);
    assert.equal(postedMessages.length, 1);
    assert.equal(postedMessages[0].message.type, "ROPODUCTIONS_ENGINE_READY");
    assert.equal(gotoTarget, SceneMapForTest);
  });

  it("reports a boot-window context loss as renderer_init_failed and asks the context to recover", () => {
    loadPlugin();
    let prevented = false;
    fireDocumentEvent("webglcontextlost", {
      preventDefault: () => {
        prevented = true;
      },
    });

    assert.equal(prevented, true, "the loss must allow restoration via preventDefault");
    assert.equal(postedMessages.length, 1);
    const report = postedMessages[0].message as BootReportMessage;
    assert.equal(report.type, "ROPODUCTIONS_ENGINE_BOOT_FAILURE");
    assert.equal(report.failureClass, "renderer_init_failed");
  });

  it("reports a boot-window context loss only once per boot", () => {
    loadPlugin();
    fireDocumentEvent("webglcontextlost");
    fireDocumentEvent("webglcontextlost");

    assert.equal(postedMessages.length, 1);
    assert.equal(
      (postedMessages[0].message as BootReportMessage).failureClass,
      "renderer_init_failed"
    );
  });

  it("never posts a context loss after the boot window closed", () => {
    sandbox.SceneManager = {
      checkBrowser: () => true,
      goto: () => {},
    };
    sandbox.Graphics = { printError: () => {} };
    loadPlugin();

    class SceneMapForTest {}
    Object.defineProperty(SceneMapForTest, "name", { value: "Scene_Map" });
    (sandbox.SceneManager as { goto: (c: unknown) => void }).goto(SceneMapForTest);
    assert.equal(postedMessages[0].message.type, "ROPODUCTIONS_ENGINE_READY");

    fireDocumentEvent("webglcontextlost");
    assert.equal(
      postedMessages.length,
      1,
      "a mid-game loss must never replace the live session"
    );
  });

  it("single-source verification: generated engine mock stays byte-for-byte identical to its committed sources", () => {    const bridgeSource = path.resolve(process.cwd(), "src/engine-plugins/Ropoductions_WebBridge.js");
    const mockHtmlSource = path.resolve(process.cwd(), "src/engine-plugins/mock-shell.html");

    assert.ok(fs.existsSync(bridgeSource), "src/engine-plugins/Ropoductions_WebBridge.js must exist");
    assert.ok(fs.existsSync(mockHtmlSource), "src/engine-plugins/mock-shell.html must exist");

    const bridgeBytes = fs.readFileSync(bridgeSource);
    const mockHtmlBytes = fs.readFileSync(mockHtmlSource);

    assert.equal(
      Buffer.from(WEB_BRIDGE_SOURCE).equals(bridgeBytes),
      true,
      "Generated WEB_BRIDGE_SOURCE must be byte-for-byte identical to the committed plugin source"
    );
    assert.equal(
      Buffer.from(MOCK_ENGINE_HTML).equals(mockHtmlBytes),
      true,
      "Generated MOCK_ENGINE_HTML must be byte-for-byte identical to the committed mock shell"
    );
  });
});
