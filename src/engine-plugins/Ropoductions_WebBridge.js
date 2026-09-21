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
  const MAX_TOTAL_PAYLOAD_BYTES = 50 * 1024 * 1024; // 50MB total response cap

  function getByteLength(str) {
    if (typeof str !== "string") return 0;
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(str).length;
    }
    if (typeof Blob !== "undefined") {
      return new Blob([str]).size;
    }
    return encodeURI(str).split(/%..|./).length - 1;
  }
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
    const lower = key.toLowerCase();
    if (lower === "__proto__" || lower === "constructor" || lower === "prototype") {
      return null;
    }
    if (!ALLOWED_SLOT_REGEX.test(lower)) {
      return null;
    }
    return lower.replace(/\.rpgsave$/, "");
  }

  async function handleGetSaves(requestId) {
    const slots = {};
    let globalData = undefined;
    let configData = undefined;
    let totalBytes = 0;

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
              totalBytes += getByteLength(serialized);
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

    if (totalBytes > MAX_TOTAL_PAYLOAD_BYTES) {
      if (window.parent && typeof window.parent.postMessage === "function") {
        window.parent.postMessage(
          {
            type: "ROPODUCTIONS_SAVE_ERROR",
            error: "Total save payload exceeds maximum size limit (50MB)",
            ...(requestId ? { requestId } : {}),
          },
          window.location.origin
        );
      }
      return;
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

    if (typeof StorageManager === "undefined") {
      if (window.parent && typeof window.parent.postMessage === "function") {
        window.parent.postMessage(
          {
            type: "ROPODUCTIONS_SAVE_ERROR",
            error: "StorageManager is not available in engine runtime",
            ...(requestId ? { requestId } : {}),
          },
          window.location.origin
        );
      }
      return;
    }

    let savedCount = 0;
    let errorCount = 0;

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
      if (getByteLength(stringValue) > MAX_SLOT_SIZE_BYTES) {
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

    if (typeof DataManager !== "undefined" && typeof DataManager.loadGlobalInfo === "function") {
      try {
        await DataManager.loadGlobalInfo();
      } catch (err) {
        console.error("[Ropoductions_WebBridge] Failed to reload global info:", err);
      }
    }

    if (window.parent && typeof window.parent.postMessage === "function") {
      if (savedCount === 0) {
        const detail = errorCount > 0 ? "Storage persistence errors occurred" : "Zero valid slots saved to storage";
        window.parent.postMessage(
          {
            type: "ROPODUCTIONS_SAVE_ERROR",
            error: `Failed to persist save slots: ${detail}`,
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

  // ---------------------------------------------------------------------------
  // Engine boot failure reporting
  //
  // Every player-visible boot failure is classified and reported to the host so
  // the raw MZ screen never becomes the outcome. The report vocabulary and
  // taxonomy are duplicated from src/types/engine-boot.ts and
  // src/lib/engine-boot-failure.ts across the runtime boundary, the same way
  // getByteLength above mirrors src/lib/save-import.ts.
  //
  // Reporting is scoped to the boot window: once readiness is posted, a later
  // error inside a running game stays the engine's own problem and never
  // replaces the game with a boot recovery panel.
  // ---------------------------------------------------------------------------

  const BOOT_FAILURE_MESSAGE_TYPE = "ROPODUCTIONS_ENGINE_BOOT_FAILURE";
  const ENGINE_READY_MESSAGE_TYPE = "ROPODUCTIONS_ENGINE_READY";

  const RAW_SENTENCE_CLASSES = [
    ["Your browser does not support WebGL.", "webgl_unavailable"],
    ["Your browser does not support Web Audio API.", "browser_capability"],
    ["Your browser does not support CSS Font Loading.", "browser_capability"],
    ["Your browser does not support IndexedDB.", "browser_capability"],
    ["Your browser does not allow to read local files.", "boot_request_failed"],
    ["Failed to initialize graphics.", "renderer_init_failed"]
  ];
  const ASSET_LOAD_MARKERS = ["Failed to load", "has failed to load"];

  function classifyBootFailure(raw) {
    if (typeof raw !== "string" || raw.trim() === "") {
      return "boot_request_failed";
    }
    for (let i = 0; i < RAW_SENTENCE_CLASSES.length; i++) {
      if (raw.indexOf(RAW_SENTENCE_CLASSES[i][0]) !== -1) {
        return RAW_SENTENCE_CLASSES[i][1];
      }
    }
    for (let i = 0; i < ASSET_LOAD_MARKERS.length; i++) {
      if (raw.indexOf(ASSET_LOAD_MARKERS[i]) !== -1) {
        return "asset_load_failed";
      }
    }
    return "boot_request_failed";
  }

  let bootReady = false;
  let webglProbeDetail = null;
  const reportedFailureKeys = {};

  function postToHost(message) {
    try {
      if (window.parent && window.parent !== window && typeof window.parent.postMessage === "function") {
        window.parent.postMessage(message, window.location.origin);
      }
    } catch {
      // Fallback if window.parent access is restricted
    }
  }

  function hideErrorPrinter() {
    try {
      const printer = document.getElementById("errorPrinter");
      if (printer && printer.style) {
        printer.style.display = "none";
      }
    } catch {
      // Document unavailable: nothing to hide
    }
  }

  function postEngineReady() {
    if (bootReady) return;
    bootReady = true;
    postToHost({ type: ENGINE_READY_MESSAGE_TYPE });
  }

  function reportBootFailure(failureClass, raw, diagnostics) {
    if (bootReady) return;
    // One report per failure class per boot; asset failures are keyed by URL so a
    // second missing resource is still named.
    const key =
      failureClass === "asset_load_failed"
        ? failureClass + "\u0000" + ((diagnostics && diagnostics.url) || raw || "")
        : failureClass;
    if (reportedFailureKeys[key]) return;
    reportedFailureKeys[key] = true;

    const payload = { type: BOOT_FAILURE_MESSAGE_TYPE, failureClass: failureClass };
    if (typeof raw === "string" && raw) {
      payload.raw = raw;
    }

    const merged = {};
    if (diagnostics) {
      const keys = Object.keys(diagnostics);
      for (let i = 0; i < keys.length; i++) {
        const value = diagnostics[keys[i]];
        if (value !== undefined && value !== null) {
          merged[keys[i]] = value;
        }
      }
    }
    if (webglProbeDetail && webglProbeDetail.statusMessage && !merged.statusMessage) {
      merged.statusMessage = webglProbeDetail.statusMessage;
    }
    if (Object.keys(merged).length > 0) {
      payload.diagnostics = merged;
    }

    postToHost(payload);
    hideErrorPrinter();
  }

  // MZ's own probe only answers yes/no; when it says no, re-run it to capture the
  // browser's webglcontextcreationerror.statusMessage for the report.
  function captureWebglFailureDetail() {
    try {
      const canvas = document.createElement("canvas");
      let statusMessage = null;
      const onCreationError = (event) => {
        if (event && typeof event.statusMessage === "string" && event.statusMessage) {
          statusMessage = event.statusMessage;
        }
      };
      canvas.addEventListener("webglcontextcreationerror", onCreationError);
      let context = null;
      try {
        context = canvas.getContext("webgl2") || canvas.getContext("webgl");
      } catch (error) {
        context = null;
      }
      canvas.removeEventListener("webglcontextcreationerror", onCreationError);
      if (context && typeof context.getExtension === "function") {
        try {
          const loseContext = context.getExtension("WEBGL_lose_context");
          if (loseContext) loseContext.loseContext();
        } catch (error) {
          // Probe context release is best effort
        }
      }
      return { statusMessage: statusMessage, probeSupported: Boolean(context) };
    } catch (error) {
      return null;
    }
  }

  function installWebglProbeHook() {
    if (typeof Utils === "undefined" || typeof Utils.canUseWebGL !== "function") {
      return;
    }
    const originalCanUseWebGL = Utils.canUseWebGL;
    Utils.canUseWebGL = function () {
      const supported = originalCanUseWebGL.apply(this, arguments);
      if (!supported && !webglProbeDetail) {
        webglProbeDetail = captureWebglFailureDetail();
      }
      return supported;
    };
  }

  function installCapabilityHook(allowReadyFallback) {
    if (typeof SceneManager === "undefined" || typeof SceneManager.checkBrowser !== "function") {
      return false;
    }
    const originalCheckBrowser = SceneManager.checkBrowser;
    SceneManager.checkBrowser = function () {
      let result;
      try {
        result = originalCheckBrowser.apply(this, arguments);
      } catch (error) {
        const raw = error && error.message ? String(error.message) : String(error);
        reportBootFailure(classifyBootFailure(raw), raw, webglProbeDetail);
        throw error;
      }
      // Readiness is posted by the scene hook below (boot exit), not by the
      // capability gate: checkBrowser runs before DataManager asset loads.
      // Fall back to the gate only when no scene hook is available (e.g. unit
      // mocks exposing checkBrowser without goto).
      if (allowReadyFallback) {
        postEngineReady();
      }
      return result;
    };
    return true;
  }

  function installSceneReadyHook() {
    if (typeof SceneManager === "undefined" || typeof SceneManager.goto !== "function") {
      return false;
    }
    const originalGoto = SceneManager.goto;
    let gotoCount = 0;
    SceneManager.goto = function (sceneClass) {
      const result = originalGoto.apply(this, arguments);
      try {
        gotoCount += 1;
        const name = sceneClass && sceneClass.name ? sceneClass.name : "";
        // First goto is run(Scene_Boot); the second (Boot -> Title/Map) means the
        // database/assets finished loading. A non-Boot first goto (battle test,
        // direct map) is already past boot.
        if (gotoCount >= 2 || (name && name !== "Scene_Boot")) {
          postEngineReady();
        }
      } catch {
        // Readiness is best effort.
      }
      return result;
    };
    if (typeof SceneManager.onSceneStart === "function") {
      const originalOnSceneStart = SceneManager.onSceneStart;
      SceneManager.onSceneStart = function () {
        const result = originalOnSceneStart.apply(this, arguments);
        try {
          const current = SceneManager._scene;
          const currentName =
            current && current.constructor && current.constructor.name
              ? current.constructor.name
              : "";
          if (currentName && currentName !== "Scene_Boot") {
            postEngineReady();
          }
        } catch {
          // Readiness is best effort.
        }
        return result;
      };
    }
    return true;
  }

  function extractAssetUrl(raw) {
    if (typeof raw !== "string" || !raw) return "";
    const match = raw.match(
      /https?:\/\/[^\s"'<>]+|[^\s"'<>]+\.(?:png|jpe?g|webp|gif|ogg|m4a|mp3|wav|json|js)(?:[?#][^\s"'<>]*)?/i
    );
    return match ? match[0].replace(/[),.;:!?]+$/, "") : "";
  }

  function installPrintErrorHook() {
    if (typeof Graphics === "undefined" || typeof Graphics.printError !== "function") {
      return;
    }
    const originalPrintError = Graphics.printError;
    Graphics.printError = function (name, message) {
      const parts = [name, message]
        .map(function (part) {
          if (typeof part === "string") return part;
          if (part && typeof part.message === "string") return part.message;
          return "";
        })
        .filter(function (part) {
          return part !== "";
        });
      const raw = parts.join(": ");
      const failureClass = classifyBootFailure(raw);
      const diagnostics = {};
      if (failureClass === "asset_load_failed") {
        if (typeof message === "string" && message) {
          diagnostics.url = message;
        } else {
          const urlFromRaw = extractAssetUrl(raw);
          if (urlFromRaw) {
            diagnostics.url = urlFromRaw;
          }
        }
      }
      if (webglProbeDetail && webglProbeDetail.probeSupported === false) {
        diagnostics.probeSupported = false;
      }
      reportBootFailure(failureClass, raw, diagnostics);
      hideErrorPrinter();
      const result = originalPrintError.apply(this, arguments);
      hideErrorPrinter();
      return result;
    };
  }

  function installResourceErrorHook() {
    window.addEventListener(
      "error",
      function (event) {
        const target = event && event.target;
        if (!target || target === window || !target.tagName) return;
        const tagName = String(target.tagName).toLowerCase();
        if (tagName !== "script" && tagName !== "img") return;
        const url = target.currentSrc || target.src || "";
        if (!url) return;
        reportBootFailure("asset_load_failed", "Failed to load " + url, { url: url });
      },
      true
    );
  }

  const hasMzRuntime = typeof SceneManager !== "undefined" || typeof Graphics !== "undefined";

  installWebglProbeHook();
  const sceneReadyInstalled = installSceneReadyHook();
  installCapabilityHook(!sceneReadyInstalled);
  installPrintErrorHook();
  installResourceErrorHook();

  if (!hasMzRuntime) {
    // The website-owned mock harness has no MZ runtime to gate on, so the document
    // load is the boot.
    if (document.readyState === "complete") {
      postEngineReady();
    } else {
      window.addEventListener("load", postEngineReady, { once: true });
    }
  }

  let lastActivityPostTime = 0;
  function notifyParentActivity() {
    const now = Date.now();
    if (now - lastActivityPostTime < 500) return;
    lastActivityPostTime = now;
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: "ROPODUCTIONS_ACTIVITY" },
          window.location.origin
        );
      }
    } catch {
      // Fallback if window.parent access is restricted
    }
  }

  window.addEventListener("pointerdown", notifyParentActivity, { passive: true, capture: true });
  window.addEventListener("keydown", notifyParentActivity, { passive: true, capture: true });
  window.addEventListener("wheel", notifyParentActivity, { passive: true, capture: true });
})();
