import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

interface BridgeResponsePayload {
  slots: Record<string, string>;
  global?: string;
  config?: string;
}

interface BridgeMessage {
  type: string;
  payload?: BridgeResponsePayload | Record<string, string>;
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
  let sandbox: Record<string, unknown>;

  function setupEnvironment(currentOrigin = "https://ropoductions.com") {
    storageStore = {};
    postedMessages = [];
    globalInfoLoaded = false;
    eventListeners = {};

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

    sandbox = {
      window: mockWindow,
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

  function loadPlugin() {
    assert.ok(
      fs.existsSync(pluginPath),
      `Expected plugin file to exist at ${pluginPath}`
    );
    const code = fs.readFileSync(pluginPath, "utf-8");
    const script = new vm.Script(code);
    const context = vm.createContext(sandbox);
    script.runInContext(context);
  }

  beforeEach(() => {
    setupEnvironment();
  });

  it("fails when plugin file does not exist", () => {
    loadPlugin();
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

    assert.equal(storageStore["file1"], newSaves.file1);
    assert.equal(storageStore["file2"], newSaves.file2);
    assert.equal(storageStore["global"], newSaves.global);
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

  it("rejects invalid save slot keys in ROPODUCTIONS_SET_SAVES", async () => {
    loadPlugin();
    const invalidPayload: Record<string, string> = {
      unauthorized_slot: "some-data",
      file99: "exceeds-slot-20",
    };

    await dispatchMessage({ type: "ROPODUCTIONS_SET_SAVES", payload: invalidPayload });

    assert.equal(storageStore["unauthorized_slot"], undefined);
    assert.equal(storageStore["file99"], undefined);
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
});
