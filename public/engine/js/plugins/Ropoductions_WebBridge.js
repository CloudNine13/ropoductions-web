//=============================================================================
// RPG Maker MZ - Ropoductions Web Bridge Plugin
//=============================================================================

/*:
 * @target MZ
 * @plugindesc In-game PostMessage Web Bridge for Save I/O and Origin Locking.
 * @author Ropoductions
 * @help Ropoductions_WebBridge.js
 *
 * This plugin facilitates secure postMessage communication between the host
 * Web Shell and RPG Maker MZ's StorageManager, strictly locking operations
 * to window.location.origin.
 */

(() => {
  "use strict";

  const ALLOWED_SLOT_REGEX = /^(file([1-9]|1[0-9]|20)|global|config)(\.rpgsave)?$/;
  const MAX_SLOT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per slot

  const ALL_SLOTS = [];
  for (let i = 1; i <= 20; i++) {
    ALL_SLOTS.push(`file${i}`);
  }
  ALL_SLOTS.push("global", "config");

  function isPlainObject(value) {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.prototype.toString.call(value) === "[object Object]"
    );
  }

  function normalizeSlotKey(key) {
    if (typeof key !== "string") return null;
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return null;
    }
    if (!ALLOWED_SLOT_REGEX.test(key)) {
      return null;
    }
    return key.replace(/\.rpgsave$/, "");
  }

  async function handleGetSaves(requestId) {
    const slots = {};
    let globalData = undefined;
    let configData = undefined;

    if (typeof StorageManager !== "undefined") {
      for (const slotName of ALL_SLOTS) {
        try {
          const exists = typeof StorageManager.exists === "function"
            ? await StorageManager.exists(slotName)
            : true;

          if (exists) {
            const data = await StorageManager.loadObject(slotName);
            if (data !== undefined && data !== null) {
              const serialized = typeof data === "string" ? data : JSON.stringify(data);
              if (slotName === "global") {
                globalData = serialized;
              } else if (slotName === "config") {
                configData = serialized;
              } else {
                slots[slotName] = serialized;
              }
            }
          }
        } catch {
          // Slot does not exist or failed to load
        }
      }
    }

    const payload = {
      slots,
      global: globalData,
      config: configData,
    };

    if (window.parent && typeof window.parent.postMessage === "function") {
      const message = {
        type: "ROPODUCTIONS_SAVES_DATA",
        payload,
        ...(requestId ? { requestId } : {}),
      };
      window.parent.postMessage(message, window.location.origin);
    }
  }

  async function handleSetSaves(rawPayload, requestId) {
    if (!isPlainObject(rawPayload)) {
      if (window.parent && typeof window.parent.postMessage === "function") {
        window.parent.postMessage(
          {
            type: "ROPODUCTIONS_SAVE_ERROR",
            error: "Invalid payload: payload must be a plain object",
            ...(requestId ? { requestId } : {}),
          },
          window.location.origin
        );
      }
      return;
    }

    let savedCount = 0;
    let errorCount = 0;

    if (typeof StorageManager !== "undefined") {
      const keys = Object.keys(rawPayload);
      for (const key of keys) {
        const normalizedKey = normalizeSlotKey(key);
        if (!normalizedKey) {
          continue;
        }

        const value = rawPayload[key];
        if (typeof value !== "string" && !isPlainObject(value)) {
          continue;
        }

        const stringValue = typeof value === "string" ? value : JSON.stringify(value);
        if (stringValue.length > MAX_SLOT_SIZE_BYTES) {
          continue;
        }

        // Parse JSON string into object if possible to avoid double serialization in native RPG Maker MZ
        let objectToSave = value;
        if (typeof value === "string") {
          try {
            objectToSave = JSON.parse(value);
          } catch {
            objectToSave = value;
          }
        }

        try {
          await StorageManager.saveObject(normalizedKey, objectToSave);
          savedCount++;
        } catch (err) {
          errorCount++;
          console.error(`[Ropoductions_WebBridge] Failed to save slot ${normalizedKey}:`, err);
        }
      }
    }

    if (typeof DataManager !== "undefined" && typeof DataManager.loadGlobalInfo === "function") {
      try {
        await DataManager.loadGlobalInfo();
      } catch (err) {
        console.error("[Ropoductions_WebBridge] Failed to reload global info:", err);
      }
    }

    if (window.parent && typeof window.parent.postMessage === "function") {
      if (errorCount > 0 && savedCount === 0) {
        window.parent.postMessage(
          {
            type: "ROPODUCTIONS_SAVE_ERROR",
            error: "Failed to persist any save slots to storage",
            ...(requestId ? { requestId } : {}),
          },
          window.location.origin
        );
      } else {
        window.parent.postMessage(
          {
            type: "ROPODUCTIONS_SET_SAVES_SUCCESS",
            ...(requestId ? { requestId } : {}),
          },
          window.location.origin
        );
      }
    }
  }

  async function handleResetSaves(requestId) {
    if (typeof StorageManager !== "undefined") {
      for (const slotName of ALL_SLOTS) {
        try {
          if (typeof StorageManager.remove === "function") {
            await StorageManager.remove(slotName);
          }
        } catch {
          // Slot remove failed or not supported
        }
      }
    }

    if (typeof DataManager !== "undefined" && typeof DataManager.loadGlobalInfo === "function") {
      try {
        await DataManager.loadGlobalInfo();
      } catch (err) {
        console.error("[Ropoductions_WebBridge] Failed to reload global info:", err);
      }
    }

    if (window.parent && typeof window.parent.postMessage === "function") {
      window.parent.postMessage(
        {
          type: "ROPODUCTIONS_RESET_SAVES_SUCCESS",
          ...(requestId ? { requestId } : {}),
        },
        window.location.origin
      );
    }
  }

  async function onMessage(event) {
    if (!event || event.origin !== window.location.origin) {
      return;
    }

    if (window.parent && window.parent !== window && event.source !== window.parent) {
      return;
    }

    try {
      const data = event.data;
      if (!isPlainObject(data) || typeof data.type !== "string") {
        return;
      }

      const requestId = typeof data.requestId === "string" ? data.requestId : undefined;
      switch (data.type) {
        case "ROPODUCTIONS_GET_SAVES":
          await handleGetSaves(requestId);
          break;
        case "ROPODUCTIONS_SET_SAVES":
          await handleSetSaves(data.payload, requestId);
          break;
        case "ROPODUCTIONS_RESET_SAVES":
          await handleResetSaves(requestId);
          break;
        default:
          break;
      }
    } catch (err) {
      console.error("[Ropoductions_WebBridge] Error processing message:", err);
    }
  }
  window.addEventListener("message", onMessage);
})();
