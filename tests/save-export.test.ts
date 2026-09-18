import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  formatSaveZipFilename,
  normalizeSaveFileMap,
  buildSaveZip,
  triggerDownload,
  exportSaves,
} from "../src/lib/save-export";
import type { SaveSlotsPayload } from "../src/types/save";

describe("client-side zip save export (Story 4.3)", () => {
  describe("formatSaveZipFilename contract", () => {
    it("formats ISO date into ropoductions_saves_{YYYY-MM-DD}.zip format", () => {
      const fixedDate = new Date(Date.UTC(2026, 8, 18, 12, 0, 0)); // 2026-09-18
      const filename = formatSaveZipFilename(fixedDate);
      assert.equal(filename, "ropoductions_saves_2026-09-18.zip");
    });

    it("pads single-digit month and day with leading zeroes", () => {
      const winterDate = new Date(Date.UTC(2026, 0, 5, 8, 30, 0)); // 2026-01-05
      const filename = formatSaveZipFilename(winterDate);
      assert.equal(filename, "ropoductions_saves_2026-01-05.zip");
    });

    it("defaults to today's date when no argument is passed", () => {
      const filename = formatSaveZipFilename();
      const regex = /^ropoductions_saves_\d{4}-\d{2}-\d{2}\.zip$/;
      assert.ok(regex.test(filename), `Filename ${filename} must match format pattern`);
    });
  });

  describe("normalizeSaveFileMap slot mapping and validation", () => {
    it("packages populated slot keys into .rpgsave filenames", () => {
      const payload: SaveSlotsPayload = {
        slots: {
          file1: "save_data_slot_1",
          file5: "save_data_slot_5",
          file20: "save_data_slot_20",
        },
        global: "global_save_data",
        config: "config_save_data",
      };

      const result = normalizeSaveFileMap(payload);

      assert.deepEqual(result, {
        "file1.rpgsave": "save_data_slot_1",
        "file5.rpgsave": "save_data_slot_5",
        "file20.rpgsave": "save_data_slot_20",
        "global.rpgsave": "global_save_data",
        "config.rpgsave": "config_save_data",
      });
    });

    it("avoids duplicate extension when keys already include .rpgsave suffix", () => {
      const payload: SaveSlotsPayload = {
        slots: {
          "file2.rpgsave": "slot_2_data",
        },
        global: "global_slot_data",
      };

      const result = normalizeSaveFileMap(payload);

      assert.equal(result["file2.rpgsave"], "slot_2_data");
      assert.equal(result["global.rpgsave"], "global_slot_data");
      assert.equal(result["file2.rpgsave.rpgsave"], undefined);
    });

    it("filters out empty or whitespace-only save slots", () => {
      const payload: SaveSlotsPayload = {
        slots: {
          file1: "valid_content",
          file2: "",
          file3: "   \n\t  ",
        },
        global: "",
        config: "  valid_config  ",
      };

      const result = normalizeSaveFileMap(payload);

      assert.equal(result["file1.rpgsave"], "valid_content");
      assert.equal(result["file2.rpgsave"], undefined);
      assert.equal(result["file3.rpgsave"], undefined);
      assert.equal(result["global.rpgsave"], undefined);
      assert.equal(result["config.rpgsave"], "  valid_config  ");
    });

    it("rejects unauthorized slot numbers, invalid keys, and prototype pollution", () => {
      const payload: SaveSlotsPayload = {
        slots: {
          file0: "invalid_slot_0",
          file21: "out_of_bounds_21",
          file99: "out_of_bounds_99",
          malicious: "arbitrary_key",
          __proto__: "polluted",
          constructor: "polluted",
          prototype: "polluted",
          file1: "legitimate_slot_1",
        },
      };

      const result = normalizeSaveFileMap(payload);

      assert.deepEqual(result, {
        "file1.rpgsave": "legitimate_slot_1",
      });
    });

    it("returns an empty map for empty or malformed payload", () => {
      assert.deepEqual(normalizeSaveFileMap({} as SaveSlotsPayload), {});
      assert.deepEqual(normalizeSaveFileMap(null as unknown as SaveSlotsPayload), {});
      assert.deepEqual(normalizeSaveFileMap(undefined as unknown as SaveSlotsPayload), {});
    });

    it("rejects invalid export dates instead of writing NaN filenames", () => {
      assert.throws(() => formatSaveZipFilename(new Date(Number.NaN)), /Invalid export date/);
    });

    it("ignores global and config keys nested inside slots to avoid collisions", () => {
      const payload: SaveSlotsPayload = {
        slots: {
          "global.rpgsave": "nested_global",
          "config.rpgsave": "nested_config",
          file1: "legit_slot",
        },
        global: "top_level_global",
      };

      assert.deepEqual(normalizeSaveFileMap(payload), {
        "file1.rpgsave": "legit_slot",
        "global.rpgsave": "top_level_global",
      });
    });

    it("returns an empty map when slots is an array", () => {
      const payload = { slots: ["file1"] } as unknown as SaveSlotsPayload;
      assert.deepEqual(normalizeSaveFileMap(payload), {});
    });
  });

  describe("buildSaveZip client-side compression via JSZip", () => {
    it("packages populated saves into a compressed ZIP blob readable by JSZip", async () => {
      const payload: SaveSlotsPayload = {
        slots: {
          file1: '{"party":["hero","mage"],"gold":500}',
          file2: '{"party":["hero","archer"],"gold":1200}',
        },
        global: '{"titleUnlocked":true}',
        config: '{"bgmVolume":80}',
      };

      const blob = await buildSaveZip(payload);
      assert.ok(blob instanceof Blob, "Must return a standard Blob instance");
      assert.ok(blob.size > 0, "Blob must have non-zero byte length");

      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const fileNames = Object.keys(zip.files).sort();

      assert.deepEqual(fileNames, [
        "config.rpgsave",
        "file1.rpgsave",
        "file2.rpgsave",
        "global.rpgsave",
      ]);

      const file1Text = await zip.files["file1.rpgsave"].async("string");
      assert.equal(file1Text, '{"party":["hero","mage"],"gold":500}');

      const globalText = await zip.files["global.rpgsave"].async("string");
      assert.equal(globalText, '{"titleUnlocked":true}');
    });

    it("generates an empty archive when no save slots are populated", async () => {
      const payload: SaveSlotsPayload = {
        slots: {},
      };

      const blob = await buildSaveZip(payload);
      assert.ok(blob instanceof Blob);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      assert.equal(Object.keys(zip.files).length, 0);
    });
  });

  describe("triggerDownload DOM orchestration", () => {
    let originalWindow: unknown;
    let originalDocument: unknown;
    let originalURL: unknown;
    let appendedElements: unknown[];
    let clickedAnchors: Array<{ download: string; href: string }>;
    let revokedUrls: string[];

    interface GlobalDOMScope {
      window?: unknown;
      document?: unknown;
      URL?: {
        createObjectURL: (blob: Blob) => string;
        revokeObjectURL: (url: string) => void;
      };
    }

    const globalScope = globalThis as unknown as GlobalDOMScope;

    beforeEach(() => {
      originalWindow = globalScope.window;
      originalDocument = globalScope.document;
      originalURL = globalScope.URL;
      appendedElements = [];
      clickedAnchors = [];
      revokedUrls = [];

      globalScope.URL = {
        createObjectURL: (blob: Blob) => `blob:mock-${blob.size}`,
        revokeObjectURL: (url: string) => {
          revokedUrls.push(url);
        },
      };

      globalScope.window = {};
      globalScope.document = {
        createElement: (tag: string) => {
          if (tag === "a") {
            const anchor = {
              href: "",
              download: "",
              style: {},
              click: () => {
                clickedAnchors.push({ download: anchor.download, href: anchor.href });
              },
            };
            return anchor;
          }
          return {};
        },
        body: {
          appendChild: (el: unknown) => {
            appendedElements.push(el);
          },
          removeChild: (el: unknown) => {
            const index = appendedElements.indexOf(el);
            if (index !== -1) appendedElements.splice(index, 1);
          },
        },
      };
    });

    afterEach(() => {
      globalScope.window = originalWindow;
      globalScope.document = originalDocument;
      globalScope.URL = originalURL as GlobalDOMScope["URL"];
    });

    it("creates an invisible anchor, clicks it with download filename, and detaches", () => {
      const blob = new Blob(["mock_zip_content"], { type: "application/zip" });
      triggerDownload(blob, "ropoductions_saves_2026-09-18.zip");

      assert.equal(clickedAnchors.length, 1);
      assert.equal(clickedAnchors[0].download, "ropoductions_saves_2026-09-18.zip");
      assert.ok(clickedAnchors[0].href.startsWith("blob:mock-"));
      assert.equal(appendedElements.length, 0, "Anchor must be detached after click");
    });

    it("throws outside a browser environment instead of reporting success", () => {
      const globalScope = globalThis as unknown as { window?: unknown; document?: unknown };
      globalScope.window = undefined;
      globalScope.document = undefined;

      const blob = new Blob(["content"]);
      assert.throws(() => {
        triggerDownload(blob, "test.zip");
      }, /browser environment/);
    });
  });

  describe("exportSaves end-to-end bridge round-trip", () => {
    let mockParentListeners: Array<(event: MessageEvent) => void>;
    let mockIframeWindow: Window;

    beforeEach(() => {
      mockParentListeners = [];

      (globalThis as unknown as { window: unknown }).window = {
        location: { origin: "https://ropoductions.com" },
        addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
          if (type === "message") mockParentListeners.push(listener);
        },
        removeEventListener: (type: string, listener: (event: MessageEvent) => void) => {
          mockParentListeners = mockParentListeners.filter((l) => l !== listener);
        },
      };

      mockIframeWindow = {
        postMessage: (message: { type: string; requestId: string }, targetOrigin: string) => {
          assert.equal(targetOrigin, "https://ropoductions.com");
          if (message.type === "ROPODUCTIONS_GET_SAVES") {
            const responseEvent = {
              origin: "https://ropoductions.com",
              source: mockIframeWindow,
              data: {
                type: "ROPODUCTIONS_SAVES_DATA",
                requestId: message.requestId,
                payload: {
                  slots: {
                    file1: '{"level":15,"area":"Labyrinth"}',
                    file2: '{"level":22,"area":"Sanctum"}',
                  },
                  global: '{"cleared":false}',
                  config: '{"alwaysDash":true}',
                },
              },
            } as MessageEvent;

            queueMicrotask(() => {
              for (const listener of [...mockParentListeners]) {
                listener(responseEvent);
              }
            });
          }
        },
      } as unknown as Window;
    });

    it("requests saves from bridge, packages zip, and returns result summary", async () => {
      const fixedDate = new Date(Date.UTC(2026, 8, 18));
      const result = await exportSaves(mockIframeWindow, {
        targetOrigin: "https://ropoductions.com",
        date: fixedDate,
        skipDownload: true,
      });

      assert.equal(result.filename, "ropoductions_saves_2026-09-18.zip");
      assert.equal(result.fileCount, 4);
      assert.deepEqual(result.files, [
        "config.rpgsave",
        "file1.rpgsave",
        "file2.rpgsave",
        "global.rpgsave",
      ]);

      const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
      const file1 = await zip.files["file1.rpgsave"].async("string");
      assert.equal(file1, '{"level":15,"area":"Labyrinth"}');
    });

    it("supports legacy positional arguments (targetOrigin, timeoutMs)", async () => {
      const scope = globalThis as unknown as {
        document?: unknown;
        URL?: unknown;
      };
      const savedDocument = scope.document;
      const savedURL = scope.URL;
      scope.document = {
        createElement: () => ({ style: {}, click: () => {} }),
        body: { appendChild: () => {}, removeChild: () => {} },
      };
      scope.URL = {
        createObjectURL: () => "blob:mock-legacy",
        revokeObjectURL: () => {},
      };
      try {
        const result = await exportSaves(
          mockIframeWindow,
          "https://ropoductions.com",
          3000
        );

        assert.ok(result.filename.startsWith("ropoductions_saves_"));
        assert.equal(result.fileCount, 4);
      } finally {
        scope.document = savedDocument;
        scope.URL = savedURL;
      }
    });

    it("rejects empty save sets instead of downloading an empty zip", async () => {
      const emptyIframeWindow = {
        postMessage: (message: { type: string; requestId: string }, targetOrigin: string) => {
          assert.equal(targetOrigin, "https://ropoductions.com");
          if (message.type === "ROPODUCTIONS_GET_SAVES") {
            const responseEvent = {
              origin: "https://ropoductions.com",
              source: emptyIframeWindow,
              data: {
                type: "ROPODUCTIONS_SAVES_DATA",
                requestId: message.requestId,
                payload: { slots: {} },
              },
            } as MessageEvent;

            queueMicrotask(() => {
              for (const listener of [...mockParentListeners]) {
                listener(responseEvent);
              }
            });
          }
        },
      } as unknown as Window;

      await assert.rejects(
        exportSaves(emptyIframeWindow, {
          targetOrigin: "https://ropoductions.com",
          skipDownload: true,
        }),
        /No populated saves to export/
      );
    });
  });
});
