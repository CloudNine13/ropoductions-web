import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {
  normalizeSlotKey,
  isValidSlotKey,
  requestSaves,
  restoreSaves,
  resetSaves,
  SAVE_BRIDGE_MESSAGE_TYPES,
} from "../src/lib/save-bridge";
import type { SaveSlotsPayload } from "../src/types/save";

describe("save-bridge client utilities (src/lib/save-bridge.ts)", () => {
  describe("slot key validation and normalization", () => {
    it("normalizes valid slot names", () => {
      assert.equal(normalizeSlotKey("file1"), "file1");
      assert.equal(normalizeSlotKey("file20"), "file20");
      assert.equal(normalizeSlotKey("global"), "global");
      assert.equal(normalizeSlotKey("config"), "config");
    });

    it("strips .rpgsave suffix from valid slot names", () => {
      assert.equal(normalizeSlotKey("file1.rpgsave"), "file1");
      assert.equal(normalizeSlotKey("file20.rpgsave"), "file20");
      assert.equal(normalizeSlotKey("global.rpgsave"), "global");
      assert.equal(normalizeSlotKey("config.rpgsave"), "config");
    });

    it("normalizes uppercase slot names case-insensitively", () => {
      assert.equal(normalizeSlotKey("FILE1"), "file1");
      assert.equal(normalizeSlotKey("FILE1.RPGSAVE"), "file1");
      assert.equal(normalizeSlotKey("Global.rpgsave"), "global");
    });

    it("rejects slot numbers exceeding 20", () => {
      assert.equal(normalizeSlotKey("file0"), null);
      assert.equal(normalizeSlotKey("file21"), null);
      assert.equal(normalizeSlotKey("file99"), null);
      assert.equal(normalizeSlotKey("file21.rpgsave"), null);
    });

    it("rejects prototype pollution and dangerous keys", () => {
      assert.equal(normalizeSlotKey("__proto__"), null);
      assert.equal(normalizeSlotKey("constructor"), null);
      assert.equal(normalizeSlotKey("prototype"), null);
      assert.equal(normalizeSlotKey(""), null);
      assert.equal(normalizeSlotKey(null as unknown as string), null);
    });

    it("identifies valid slot keys correctly with isValidSlotKey", () => {
      assert.equal(isValidSlotKey("file1"), true);
      assert.equal(isValidSlotKey("file20"), true);
      assert.equal(isValidSlotKey("global"), true);
      assert.equal(isValidSlotKey("config"), true);
      assert.equal(isValidSlotKey("file1.rpgsave"), true);
      assert.equal(isValidSlotKey("file21"), false);
      assert.equal(isValidSlotKey("__proto__"), false);
      assert.equal(isValidSlotKey("other"), false);
    });
  });

  describe("window postMessage bridge communication", () => {
    let mockParentListeners: Array<(event: MessageEvent) => void>;
    let mockIframeMessages: Array<{ message: unknown; targetOrigin: string }>;
    let mockIframeWindow: Window;

    beforeEach(() => {
      mockParentListeners = [];
      mockIframeMessages = [];

      // Mock parent window event listeners
      (globalThis as unknown as { window: unknown }).window = {
        location: { origin: "https://ropoductions.com" },
        addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
          if (type === "message") mockParentListeners.push(listener);
        },
        removeEventListener: (type: string, listener: (event: MessageEvent) => void) => {
          if (type === "message") {
            mockParentListeners = mockParentListeners.filter((l) => l !== listener);
          }
        },
      };

      // Mock iframe window
      mockIframeWindow = {
        postMessage: (message: unknown, targetOrigin: string) => {
          mockIframeMessages.push({ message, targetOrigin });
        },
      } as unknown as Window;
    });

    afterEach(() => {
      mockParentListeners = [];
      mockIframeMessages = [];
    });

    function dispatchParentMessage(data: unknown, origin = "https://ropoductions.com", source: unknown = mockIframeWindow) {
      const lastOutgoing = mockIframeMessages[mockIframeMessages.length - 1];
      const lastRequestId = (lastOutgoing?.message as { requestId?: string })?.requestId;
      const enrichedData =
        typeof data === "object" && data !== null && lastRequestId && !("requestId" in (data as Record<string, unknown>))
          ? { requestId: lastRequestId, ...(data as Record<string, unknown>) }
          : data;
      const event = {
        data: enrichedData,
        origin,
        source,
      } as unknown as MessageEvent;
      for (const listener of [...mockParentListeners]) {
        listener(event);
      }
    }

    it("requestSaves sends ROPODUCTIONS_GET_SAVES and resolves payload on response", async () => {
      const promise = requestSaves(mockIframeWindow, "https://ropoductions.com", 1000);

      assert.equal(mockIframeMessages.length, 1);
      const outgoing = mockIframeMessages[0];
      assert.equal(outgoing.targetOrigin, "https://ropoductions.com");
      assert.equal((outgoing.message as { type: string }).type, SAVE_BRIDGE_MESSAGE_TYPES.GET_SAVES);
      assert.ok((outgoing.message as { requestId: string }).requestId);

      const expectedPayload: SaveSlotsPayload = {
        slots: { file1: '{"level":5}', file2: '{"level":10}' },
        global: '{"playtime":1200}',
        config: '{"volume":80}',
      };

      dispatchParentMessage({
        type: SAVE_BRIDGE_MESSAGE_TYPES.SAVES_DATA,
        payload: expectedPayload,
      });

      const result = await promise;
      assert.deepEqual(result, expectedPayload);
    });

    it("requestSaves rejects on timeout if iframe does not reply", async () => {
      await assert.rejects(
        () => requestSaves(mockIframeWindow, "https://ropoductions.com", 50),
        /timed out/i
      );
    });

    it("requestSaves ignores responses from untrusted origins", async () => {
      const promise = requestSaves(mockIframeWindow, "https://ropoductions.com", 100);

      dispatchParentMessage(
        {
          type: SAVE_BRIDGE_MESSAGE_TYPES.SAVES_DATA,
          payload: { slots: {}, global: "spoofed" },
        },
        "https://malicious-origin.com"
      );

      await assert.rejects(() => promise, /timed out/i);
    });

    it("rejects wildcard targetOrigin '*'", async () => {
      await assert.rejects(
        () => requestSaves(mockIframeWindow, "*"),
        /must equal window\.location\.origin/i
      );
    });

    it("rejects targetOrigin that does not match window.location.origin", async () => {
      await assert.rejects(
        () => requestSaves(mockIframeWindow, "https://mismatched-origin.com"),
        /must equal window\.location\.origin/i
      );
    });

    it("ignores messages with null or wrong event.source", async () => {
      const promise = requestSaves(mockIframeWindow, "https://ropoductions.com", 100);

      dispatchParentMessage(
        {
          type: SAVE_BRIDGE_MESSAGE_TYPES.SAVES_DATA,
          payload: { slots: {}, global: "spoofed" },
        },
        "https://ropoductions.com",
        null
      );

      await assert.rejects(() => promise, /timed out/i);
    });

    it("ignores response from wrong window source and times out", async () => {
      const otherWindow = {} as Window;
      const promise = requestSaves(mockIframeWindow, "https://ropoductions.com", 50);

      dispatchParentMessage(
        {
          type: SAVE_BRIDGE_MESSAGE_TYPES.SAVES_DATA,
          payload: { slots: {}, global: "spoofed" },
        },
        "https://ropoductions.com",
        otherWindow
      );

      await assert.rejects(() => promise, /timed out/i);
    });

    it("cleans up message event listener on success and on timeout", async () => {
      assert.equal(mockParentListeners.length, 0);

      const promiseSuccess = requestSaves(mockIframeWindow, "https://ropoductions.com", 1000);
      assert.equal(mockParentListeners.length, 1);

      dispatchParentMessage({
        type: SAVE_BRIDGE_MESSAGE_TYPES.SAVES_DATA,
        payload: { slots: {} },
      });
      await promiseSuccess;
      assert.equal(mockParentListeners.length, 0);

      const promiseTimeout = requestSaves(mockIframeWindow, "https://ropoductions.com", 20);
      assert.equal(mockParentListeners.length, 1);
      await assert.rejects(() => promiseTimeout, /timed out/i);
      assert.equal(mockParentListeners.length, 0);
    });

    it("isolates concurrent requests using correlation IDs without cross-resolving", async () => {
      const promise1 = requestSaves(mockIframeWindow, "https://ropoductions.com", 1000);
      const promise2 = requestSaves(mockIframeWindow, "https://ropoductions.com", 1000);

      assert.equal(mockIframeMessages.length, 2);
      const reqId1 = (mockIframeMessages[0].message as { requestId: string }).requestId;
      const reqId2 = (mockIframeMessages[1].message as { requestId: string }).requestId;
      assert.notEqual(reqId1, reqId2);

      const payload1: SaveSlotsPayload = { slots: { file1: "req1-data" } };
      const payload2: SaveSlotsPayload = { slots: { file2: "req2-data" } };

      // Dispatch response for request 2 FIRST (out-of-order)
      dispatchParentMessage({
        type: SAVE_BRIDGE_MESSAGE_TYPES.SAVES_DATA,
        payload: payload2,
        requestId: reqId2,
      });

      // Dispatch response for request 1 SECOND
      dispatchParentMessage({
        type: SAVE_BRIDGE_MESSAGE_TYPES.SAVES_DATA,
        payload: payload1,
        requestId: reqId1,
      });

      const res1 = await promise1;
      const res2 = await promise2;

      assert.deepEqual(res1, payload1);
      assert.deepEqual(res2, payload2);
    });

    it("restoreSaves sends ROPODUCTIONS_SET_SAVES and resolves on success", async () => {
      const payloadToRestore = {
        file1: '{"level":5}',
        global: '{"playtime":1200}',
      };

      const promise = restoreSaves(mockIframeWindow, payloadToRestore, "https://ropoductions.com", 1000);

      assert.equal(mockIframeMessages.length, 1);
      const outgoing = mockIframeMessages[0];
      assert.equal(outgoing.targetOrigin, "https://ropoductions.com");
      assert.equal((outgoing.message as { type: string }).type, SAVE_BRIDGE_MESSAGE_TYPES.SET_SAVES);
      assert.deepEqual((outgoing.message as { payload: unknown }).payload, payloadToRestore);
      assert.ok((outgoing.message as { requestId: string }).requestId);

      dispatchParentMessage({
        type: SAVE_BRIDGE_MESSAGE_TYPES.SET_SAVES_SUCCESS,
      });

      await promise;
    });

    it("restoreSaves rejects invalid payload argument", async () => {
      await assert.rejects(
        () => restoreSaves(mockIframeWindow, null as unknown as Record<string, string>),
        /invalid payload/i
      );
    });

    it("restoreSaves rejects empty payload", async () => {
      await assert.rejects(
        () => restoreSaves(mockIframeWindow, {}),
        /payload cannot be empty/i
      );
    });

    it("restoreSaves rejects payload with no valid save slot keys", async () => {
      await assert.rejects(
        () => restoreSaves(mockIframeWindow, { invalid_key: "data", file99: "data" }),
        /contains no valid save slot keys/i
      );
    });

    it("resetSaves sends ROPODUCTIONS_RESET_SAVES and resolves on success", async () => {
      const promise = resetSaves(mockIframeWindow, "https://ropoductions.com", 1000);

      assert.equal(mockIframeMessages.length, 1);
      const outgoing = mockIframeMessages[0];
      assert.equal(outgoing.targetOrigin, "https://ropoductions.com");
      assert.equal((outgoing.message as { type: string }).type, SAVE_BRIDGE_MESSAGE_TYPES.RESET_SAVES);
      assert.ok((outgoing.message as { requestId: string }).requestId);

      dispatchParentMessage({
        type: SAVE_BRIDGE_MESSAGE_TYPES.RESET_SAVES_SUCCESS,
      });

      await promise;
    });
  });

  describe("end-to-end bridge round-trip with Ropoductions_WebBridge.js", () => {
    const pluginPath = path.resolve(
      process.cwd(),
      "src/engine-plugins/Ropoductions_WebBridge.js"
    );

    let storageStore: Record<string, unknown>;
    let globalInfoLoaded: boolean;
    let iframeEventListeners: Record<string, Array<(event: unknown) => void>>;
    let parentEventListeners: Array<(event: MessageEvent) => void>;

    beforeEach(() => {
      storageStore = {};
      globalInfoLoaded = false;
      iframeEventListeners = {};
      parentEventListeners = [];

      // Host parent window mock
      (globalThis as unknown as { window: unknown }).window = {
        location: { origin: "https://ropoductions.com" },
        addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
          if (type === "message") parentEventListeners.push(listener);
        },
        removeEventListener: (type: string, listener: (event: MessageEvent) => void) => {
          if (type === "message") {
            parentEventListeners = parentEventListeners.filter((l) => l !== listener);
          }
        },
      };
    });

    function setupEngineSandbox() {
      const mockParent = {
        postMessage: (message: unknown, _targetOrigin: string) => {
          for (const listener of [...parentEventListeners]) {
            listener({
              data: message,
              origin: "https://ropoductions.com",
              source: iframeWindowMock,
            } as unknown as MessageEvent);
          }
        },
      };

      const iframeWindowMock: Record<string, unknown> = {
        location: { origin: "https://ropoductions.com" },
        parent: mockParent,
        addEventListener: (type: string, listener: (event: unknown) => void) => {
          if (!iframeEventListeners[type]) iframeEventListeners[type] = [];
          iframeEventListeners[type].push(listener);
        },
        postMessage: (message: unknown, _origin: string) => {
          const listeners = iframeEventListeners["message"] || [];
          for (const listener of listeners) {
            listener({
              data: message,
              origin: "https://ropoductions.com",
              source: mockParent,
            });
          }
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
        exists: (saveName: string) => Promise.resolve(saveName in storageStore),
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

      const sandbox = {
        window: iframeWindowMock,
        document: {
          readyState: "loading",
          getElementById: () => null,
          createElement: () => ({
            addEventListener: () => {},
            removeEventListener: () => {},
            getContext: () => null,
          }),
        },
        StorageManager: mockStorageManager,
        DataManager: mockDataManager,
        console,
        queueMicrotask,
      };

      const code = fs.readFileSync(pluginPath, "utf-8");
      const script = new vm.Script(code);
      const context = vm.createContext(sandbox);
      script.runInContext(context);

      return iframeWindowMock as unknown as Window;
    }

    it("performs full round-trip getSaves, setSaves, and resetSaves", async () => {
      const iframeWindow = setupEngineSandbox();

      // 1. Initial getSaves should be empty
      const initialSaves = await requestSaves(iframeWindow, "https://ropoductions.com", 1000);
      assert.deepEqual({ ...initialSaves.slots }, {});

      // 2. setSaves should write to StorageManager and trigger DataManager.loadGlobalInfo()
      const savesToSet = {
        file1: JSON.stringify({ hero: "Goruk", level: 25 }),
        global: JSON.stringify({ completedQuests: 12 }),
      };
      await restoreSaves(iframeWindow, savesToSet, "https://ropoductions.com", 1000);
      assert.equal(globalInfoLoaded, true);
      assert.equal(JSON.stringify(storageStore["file1"]), savesToSet.file1);
      assert.equal(JSON.stringify(storageStore["global"]), savesToSet.global);

      // 3. getSaves should now reflect the restored saves
      const retrieved = await requestSaves(iframeWindow, "https://ropoductions.com", 1000);
      assert.equal(retrieved.slots["file1"], savesToSet.file1);
      assert.equal(retrieved.global, savesToSet.global);

      // 4. resetSaves should purge slots and reload global info
      globalInfoLoaded = false;
      await resetSaves(iframeWindow, "https://ropoductions.com", 1000);
      assert.equal(globalInfoLoaded, true);
      assert.equal(storageStore["file1"], undefined);
      const afterReset = await requestSaves(iframeWindow, "https://ropoductions.com", 1000);
      assert.deepEqual({ ...afterReset.slots }, {});
    });

    it("handles non-JSON raw string saves round-trip intact", async () => {
      const iframeWindow = setupEngineSandbox();
      const rawStringSaves = {
        file1: "plain-text-unserialized-save-content-not-json",
      };

      await restoreSaves(iframeWindow, rawStringSaves, "https://ropoductions.com", 1000);
      const retrieved = await requestSaves(iframeWindow, "https://ropoductions.com", 1000);

      assert.equal(retrieved.slots["file1"], rawStringSaves.file1);
    });
  });
});
