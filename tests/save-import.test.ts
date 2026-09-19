import { test, describe } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  INVALID_SAVE_FORMAT_ERROR,
  MAX_SLOT_SIZE_BYTES,
  MAX_ZIP_ENTRY_COUNT,
  SAVE_DIALOG_DISMISS_MS,
  validateSaveFileName,
  parseAndValidateZipArchive,
  parseAndValidateSaveFile,
  importSaves,
} from "../src/lib/save-import";

describe("save-import client utilities (Story 4.4)", () => {
  describe("INVALID_SAVE_FORMAT_ERROR contract", () => {
    test("matches exact acceptance criteria specification string", () => {
      assert.equal(
        INVALID_SAVE_FORMAT_ERROR,
        "Invalid save file format. Please upload a valid .zip archive or .rpgsave file."
      );
    });
  });

  describe("validateSaveFileName slot resolution", () => {
    test("resolves file1..file20 with .rpgsave suffix", () => {
      assert.equal(validateSaveFileName("file1.rpgsave"), "file1");
      assert.equal(validateSaveFileName("file20.rpgsave"), "file20");
      assert.equal(validateSaveFileName("FILE7.RPGSAVE"), "file7");
    });

    test("resolves global and config slots", () => {
      assert.equal(validateSaveFileName("global.rpgsave"), "global");
      assert.equal(validateSaveFileName("config.rpgsave"), "config");
      assert.equal(validateSaveFileName("GLOBAL.rpgsave"), "global");
      assert.equal(validateSaveFileName("CONFIG.rpgsave"), "config");
    });

    test("resolves bare slot names without suffix", () => {
      assert.equal(validateSaveFileName("file1"), "file1");
      assert.equal(validateSaveFileName("file15"), "file15");
      assert.equal(validateSaveFileName("global"), "global");
      assert.equal(validateSaveFileName("config"), "config");
    });

    test("maps generic .rpgsave files with slot numbers in name or defaults to file1", () => {
      assert.equal(validateSaveFileName("save_slot_3.rpgsave"), "file3");
      assert.equal(validateSaveFileName("FinalOrginity_file2.rpgsave"), "file2");
      assert.equal(validateSaveFileName("my_save.rpgsave"), "file1");
    });

    test("rejects invalid extensions and non-save files", () => {
      assert.equal(validateSaveFileName("save.txt"), null);
      assert.equal(validateSaveFileName("backup.json"), null);
      assert.equal(validateSaveFileName("exploit.exe"), null);
      assert.equal(validateSaveFileName("image.png"), null);
      assert.equal(validateSaveFileName("file21.rpgsave"), null);
      assert.equal(validateSaveFileName("file0.rpgsave"), null);
      assert.equal(validateSaveFileName(""), null);
    });
  });

  describe("parseAndValidateZipArchive client-side decompression and validation", () => {
    test("unzips valid archive containing save slots and returns normalized slot map", async () => {
      const zip = new JSZip();
      zip.file("file1.rpgsave", JSON.stringify({ actors: [{ id: 1, name: "Kael", level: 12 }] }));
      zip.file("global.rpgsave", JSON.stringify({ 1: { title: "Chapter 1", playtime: 1240 } }));
      zip.file("config.rpgsave", JSON.stringify({ bgmVolume: 80, bgsVolume: 70 }));

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await parseAndValidateZipArchive(buffer);

      assert.equal(Object.keys(result).length, 3);
      assert.ok(result.file1);
      assert.ok(result.global);
      assert.ok(result.config);
      assert.deepEqual(JSON.parse(result.file1), { actors: [{ id: 1, name: "Kael", level: 12 }] });
    });
    test("unzips archive containing uppercase entry names (e.g. FILE1.RPGSAVE, Global.rpgsave)", async () => {
      const zip = new JSZip();
      zip.file("FILE1.RPGSAVE", JSON.stringify({ hero: "Lyra" }));
      zip.file("Global.rpgsave", JSON.stringify({ volume: 90 }));

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await parseAndValidateZipArchive(buffer);

      assert.equal(Object.keys(result).length, 2);
      assert.ok(result.file1);
      assert.ok(result.global);
      assert.deepEqual(JSON.parse(result.file1), { hero: "Lyra" });
    });

    test("ignores directory entries, macOS metadata, and unallowed files in archive", async () => {
      const zip = new JSZip();
      zip.file("file2.rpgsave", JSON.stringify({ actors: [] }));
      zip.file("__MACOSX/._file2.rpgsave", "binary-junk");
      zip.file(".DS_Store", "ds-store-junk");
      zip.file("readme.txt", "Please enjoy this save!");
      zip.file("screenshots/screen.png", "fake-png");

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await parseAndValidateZipArchive(buffer);

      assert.equal(Object.keys(result).length, 1);
      assert.ok(result.file2);
      assert.equal(result.readme, undefined);
    });

    test("handles nested paths within zip archive (e.g. saves/file3.rpgsave)", async () => {
      const zip = new JSZip();
      zip.file("saves/file3.rpgsave", JSON.stringify({ stepCount: 42 }));

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await parseAndValidateZipArchive(buffer);

      assert.equal(Object.keys(result).length, 1);
      assert.ok(result.file3);
    });

    test("throws INVALID_SAVE_FORMAT_ERROR when zip contains zero valid save slots", async () => {
      const zip = new JSZip();
      zip.file("notes.txt", "Some text");
      zip.file("music.mp3", "fake audio");

      const buffer = await zip.generateAsync({ type: "nodebuffer" });

      await assert.rejects(
        () => parseAndValidateZipArchive(buffer),
        (err: Error) => {
          assert.equal(err.message, INVALID_SAVE_FORMAT_ERROR);
          return true;
        }
      );
    });

    test("throws INVALID_SAVE_FORMAT_ERROR on corrupt or empty zip buffer", async () => {
      const corruptBuffer = Buffer.from("not a zip archive content");

      await assert.rejects(
        () => parseAndValidateZipArchive(corruptBuffer),
        (err: Error) => {
          assert.equal(err.message, INVALID_SAVE_FORMAT_ERROR);
          return true;
        }
      );

      await assert.rejects(
        () => parseAndValidateZipArchive(Buffer.alloc(0)),
        (err: Error) => {
          assert.equal(err.message, INVALID_SAVE_FORMAT_ERROR);
          return true;
        }
      );
    });

    test("rejects slot content exceeding 10MB limit", async () => {
      const zip = new JSZip();
      // Generate a string exceeding 10MB
      const hugeString = "x".repeat(10 * 1024 * 1024 + 10);
      zip.file("file1.rpgsave", hugeString);

      const buffer = await zip.generateAsync({ type: "nodebuffer" });

      await assert.rejects(
        () => parseAndValidateZipArchive(buffer),
        (err: Error) => {
          assert.equal(err.message, INVALID_SAVE_FORMAT_ERROR);
          return true;
        }
      );
    });
    test("rejects archive whose total extracted size exceeds 50MB aggregate cap", async () => {
      const zip = new JSZip();
      const chunk = "y".repeat(9 * 1024 * 1024);
      for (let i = 1; i <= 6; i++) {
        zip.file(`file${i}.rpgsave`, chunk);
      }

      const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

      await assert.rejects(
        () => parseAndValidateZipArchive(buffer),
        (err: Error) => {
          assert.equal(err.message, INVALID_SAVE_FORMAT_ERROR);
          return true;
        }
      );
    });
  });

  describe("parseAndValidateSaveFile dispatch", () => {
    test("processes valid .rpgsave file", async () => {
      const saveContent = JSON.stringify({ system: { savefileId: 4 } });
      const blob = new Blob([saveContent], { type: "application/octet-stream" });

      const result = await parseAndValidateSaveFile(blob, "file4.rpgsave");
      assert.equal(Object.keys(result).length, 1);
      assert.equal(result.file4, saveContent);
    });

    test("processes valid .zip archive blob", async () => {
      const zip = new JSZip();
      zip.file("file1.rpgsave", JSON.stringify({ money: 5000 }));
      const buffer = await zip.generateAsync({ type: "uint8array" });
      const blob = new Blob([buffer], { type: "application/zip" });

      const result = await parseAndValidateSaveFile(blob, "saves.zip");
      assert.equal(Object.keys(result).length, 1);
      assert.ok(result.file1);
    });
    test("rejects single .rpgsave file with size exceeding 10MB limit prior to buffering", async () => {
      const largeBlob = {
        size: 11 * 1024 * 1024,
        type: "application/octet-stream",
        text: async () => {
          throw new Error("text() should not be called on oversized file");
        },
      } as unknown as Blob;

      await assert.rejects(
        () => parseAndValidateSaveFile(largeBlob, "file1.rpgsave"),
        (err: Error) => {
          assert.equal(err.message, INVALID_SAVE_FORMAT_ERROR);
          return true;
        }
      );
    });

    test("rejects invalid file extension with INVALID_SAVE_FORMAT_ERROR", async () => {
      const blob = new Blob(["hello"], { type: "text/plain" });

      await assert.rejects(
        () => parseAndValidateSaveFile(blob, "notes.txt"),
        (err: Error) => {
          assert.equal(err.message, INVALID_SAVE_FORMAT_ERROR);
          return true;
        }
      );
    });

    test("rejects empty .rpgsave file with INVALID_SAVE_FORMAT_ERROR", async () => {
      const blob = new Blob(["   "], { type: "application/octet-stream" });

      await assert.rejects(
        () => parseAndValidateSaveFile(blob, "file1.rpgsave"),
        (err: Error) => {
          assert.equal(err.message, INVALID_SAVE_FORMAT_ERROR);
          return true;
        }
      );
    });

    test("rejects empty blob with INVALID_SAVE_FORMAT_ERROR", async () => {
      const blob = new Blob([], { type: "application/octet-stream" });

      await assert.rejects(
        () => parseAndValidateSaveFile(blob, "file1.rpgsave"),
        (err: Error) => {
          assert.equal(err.message, INVALID_SAVE_FORMAT_ERROR);
          return true;
        }
      );
    });
  });

  describe("importSaves end-to-end bridge coordination", () => {
    test("validates file, posts ROPODUCTIONS_SET_SAVES, and returns restored slot metadata", async () => {
      const origin = "https://ropoductions.com";
      const listeners: Array<(event: MessageEvent) => void> = [];

      const prevWindow = (globalThis as unknown as { window?: unknown }).window;

      (globalThis as unknown as { window: unknown }).window = {
        location: { origin },
        addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
          if (type === "message") listeners.push(listener);
        },
        removeEventListener: (type: string, listener: (event: MessageEvent) => void) => {
          const idx = listeners.indexOf(listener);
          if (idx !== -1) listeners.splice(idx, 1);
        },
      };

      const messageLog: Array<{ type: string; payload?: unknown; requestId?: string }> = [];

      const mockIframeWindow = {
        postMessage: (msg: { type: string; payload?: unknown; requestId?: string }, targetOrigin: string) => {
          assert.equal(targetOrigin, origin);
          messageLog.push(msg);

          if (msg.type === "ROPODUCTIONS_SET_SAVES") {
            queueMicrotask(() => {
              const responseEvent = {
                origin,
                source: mockIframeWindow,
                data: {
                  type: "ROPODUCTIONS_SET_SAVES_SUCCESS",
                  requestId: msg.requestId,
                },
              } as MessageEvent;

              for (const listener of [...listeners]) {
                listener(responseEvent);
              }
            });
          }
        },
      } as unknown as Window;

      try {
        const zip = new JSZip();
        zip.file("file1.rpgsave", JSON.stringify({ party: [1, 2] }));
        zip.file("config.rpgsave", JSON.stringify({ autoSave: true }));
        const zipBuffer = await zip.generateAsync({ type: "uint8array" });
        const blob = new Blob([zipBuffer], { type: "application/zip" });

        const result = await importSaves(mockIframeWindow, blob, "my_backup.zip", {
          targetOrigin: origin,
          timeoutMs: 1000,
        });

        assert.equal(result.slotCount, 2);
        assert.deepEqual(result.slots.sort(), ["config", "file1"].sort());
        assert.equal(messageLog.length, 1);
        assert.equal(messageLog[0].type, "ROPODUCTIONS_SET_SAVES");
      } finally {
        (globalThis as unknown as { window: unknown }).window = prevWindow;
      }
    });

    test("fails without mutating storage if file format is invalid", async () => {
      const origin = "https://ropoductions.com";
      const prevWindow = (globalThis as unknown as { window?: unknown }).window;

      (globalThis as unknown as { window: unknown }).window = {
        location: { origin },
        addEventListener: () => {},
        removeEventListener: () => {},
      };

      const postMessageCalls: unknown[] = [];
      const mockIframeWindow = {
        postMessage: (msg: unknown) => {
          postMessageCalls.push(msg);
        },
      } as unknown as Window;

      const badBlob = new Blob(["corrupt"], { type: "text/plain" });

      try {
        await assert.rejects(
          () => importSaves(mockIframeWindow, badBlob, "bad_file.txt", { targetOrigin: origin }),
          (err: Error) => {
            assert.equal(err.message, INVALID_SAVE_FORMAT_ERROR);
            return true;
          }
        );

        assert.equal(postMessageCalls.length, 0, "No bridge message should be sent for invalid files");
      } finally {
        (globalThis as unknown as { window: unknown }).window = prevWindow;
      }
    });
  });

  describe("review hardening (PR #38 follow-up)", () => {
    test("exposes shared dismiss delay and zip entry cap", () => {
      assert.equal(SAVE_DIALOG_DISMISS_MS, 1200);
      assert.ok(MAX_ZIP_ENTRY_COUNT >= 22);
    });

    test("rejects duplicate slot entries instead of last-wins overwrite", async () => {
      const zip = new JSZip();
      zip.file("file1.rpgsave", JSON.stringify({ a: 1 }));
      zip.file("saves/FILE1.RPGSAVE", JSON.stringify({ a: 2 }));
      const buffer = await zip.generateAsync({ type: "nodebuffer" });

      await assert.rejects(
        () => parseAndValidateZipArchive(buffer),
        (err: Error) => {
          assert.equal(err.message, INVALID_SAVE_FORMAT_ERROR);
          return true;
        }
      );
    });

    test("rejects archives exceeding the entry count cap", async () => {
      const zip = new JSZip();
      for (let i = 0; i < MAX_ZIP_ENTRY_COUNT + 1; i++) {
        zip.file(`notes-${i}.txt`, "filler");
      }
      const buffer = await zip.generateAsync({ type: "nodebuffer" });

      await assert.rejects(
        () => parseAndValidateZipArchive(buffer),
        (err: Error) => {
          assert.equal(err.message, INVALID_SAVE_FORMAT_ERROR);
          return true;
        }
      );
    });

    test("skips case-variant macOS metadata entries", async () => {
      const zip = new JSZip();
      zip.file("file2.rpgsave", JSON.stringify({ actors: [] }));
      zip.file("__macosx/._file2.rpgsave", "binary-junk");
      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await parseAndValidateZipArchive(buffer);

      assert.equal(Object.keys(result).length, 1);
      assert.ok(result.file2);
    });

    test("accepts saves nested under dot-directories by basename", async () => {
      const zip = new JSZip();
      zip.file("saves/.hidden/file3.rpgsave", JSON.stringify({ stepCount: 7 }));
      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await parseAndValidateZipArchive(buffer);

      assert.equal(Object.keys(result).length, 1);
      assert.ok(result.file3);
    });

    test("strips BOM from single .rpgsave files", async () => {
      const blob = new Blob(["﻿" + JSON.stringify({ hero: "Lyra" })], {
        type: "application/octet-stream",
      });
      const result = await parseAndValidateSaveFile(blob, "file1.rpgsave");

      assert.equal(result.file1, JSON.stringify({ hero: "Lyra" }));
    });

    test("accepts a single .rpgsave at exactly the per-slot byte limit", async () => {
      const content = "x".repeat(MAX_SLOT_SIZE_BYTES);
      const blob = new Blob([content], { type: "application/octet-stream" });
      const result = await parseAndValidateSaveFile(blob, "file1.rpgsave");

      assert.equal(result.file1, content);
    });
  });
});
