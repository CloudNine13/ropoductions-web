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
  //
  // Asset loads share that window: one aborted request must not cost a sprite or
  // the cursor, so image and data requests are retried on the same URL, at most
  // twice, with jittered backoff. `401`/`403` are never retried here — they mean
  // the session, not the network, and escalate to the host instead.
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

  const RETRY_MAX_ATTEMPTS = 2;
  const RETRY_BASE_DELAY_MS = 300;
  const RETRY_MAX_DELAY_MS = 2000;

  /** Paths the engine serves its own runtime from; nothing else is retried. */
  const ASSET_PATH_PATTERN = /^\/(?:engine|api\/game|data|img|audio|effects|movies|js|fonts)\//;
  const retryOwnedImages = typeof WeakSet === "function" ? new WeakSet() : null;
  const assetRetryCounts = {};

  function isEngineAssetUrl(url) {
    if (typeof url !== "string" || url === "") return false;
    let parsed;
    try {
      parsed = new URL(url, window.location.href);
    } catch (error) {
      return false;
    }
    if (parsed.origin !== window.location.origin) return false;
    return ASSET_PATH_PATTERN.test(parsed.pathname);
  }

  function retryDelayMs(attempt) {
    const ceiling = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1), RETRY_MAX_DELAY_MS);
    // Equal jitter: half the ceiling fixed, half random, so a burst of failures
    // does not come back in lockstep and re-create the same contention.
    return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
  }

  function scheduleRetry(callback, attempt) {
    if (typeof window.setTimeout !== "function") {
      return false;
    }
    try {
      window.setTimeout(callback, retryDelayMs(attempt));
      return true;
    } catch (error) {
      return false;
    }
  }

  function absoluteUrl(url) {
    try {
      return new URL(url, window.location.href).href;
    } catch (error) {
      return url;
    }
  }

  /**
   * A failed image element carries no status, so the browser's own Resource
   * Timing entry is the only evidence of what answered. No entry at all means the
   * request never completed — a network-level failure, which is retryable.
   */
  function assetFailureKind(url) {
    let status;
    try {
      if (typeof performance !== "undefined" && typeof performance.getEntriesByName === "function") {
        const entries = performance.getEntriesByName(url, "resource");
        const last = entries && entries.length ? entries[entries.length - 1] : null;
        if (last && typeof last.responseStatus === "number" && last.responseStatus > 0) {
          status = last.responseStatus;
        }
      }
    } catch (error) {
      status = undefined;
    }
    if (status === 401 || status === 403) {
      return { retryable: false, sessionRejected: true, status: status };
    }
    if (status !== undefined && status < 500) {
      return { retryable: false, sessionRejected: false, status: status };
    }
    return { retryable: true, sessionRejected: false, status: status };
  }

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

    const merged = {};
    if (diagnostics) {
      const diagnosticKeys = Object.keys(diagnostics);
      for (let i = 0; i < diagnosticKeys.length; i++) {
        const value = diagnostics[diagnosticKeys[i]];
        if (value !== undefined && value !== null) {
          merged[diagnosticKeys[i]] = value;
        }
      }
    }
    // MZ names the same resource both ways ("data/System.json" and its absolute
    // form), so the report carries one URL for both the dedupe key and the panel.
    if (typeof merged.url === "string" && merged.url) {
      merged.url = absoluteUrl(merged.url);
    }

    // One report per failure class per boot; asset failures are keyed by URL so a
    // second missing resource is still named. The same URL reports again only when
    // the new report carries the retry outcome the first one could not know yet.
    const key =
      failureClass === "asset_load_failed"
        ? failureClass + "\u0000" + (merged.url || raw || "")
        : failureClass;
    const carriesRetryOutcome =
      merged.retries !== undefined || merged.sessionRejected === true;
    const previous = reportedFailureKeys[key];
    if (previous && (!carriesRetryOutcome || previous === "retried")) return;
    reportedFailureKeys[key] = carriesRetryOutcome ? "retried" : "reported";

    const payload = { type: BOOT_FAILURE_MESSAGE_TYPE, failureClass: failureClass };
    if (typeof raw === "string" && raw) {
      payload.raw = raw;
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

  /**
   * MZ only needs the yes/no answer from its WebGL check, but it never releases
   * the context it creates. This probe answers the same question, releases the
   * context through `WEBGL_lose_context`, and keeps the browser's own
   * `webglcontextcreationerror.statusMessage` plus the renderer and vendor
   * strings for the report.
   */
  function runWebglProbe() {
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
        context = canvas.getContext("webgl");
      } catch (error) {
        context = null;
      }
      canvas.removeEventListener("webglcontextcreationerror", onCreationError);

      let renderer = null;
      let vendor = null;
      if (
        context &&
        typeof context.getExtension === "function" &&
        typeof context.getParameter === "function"
      ) {
        try {
          const debugInfo = context.getExtension("WEBGL_debug_renderer_info");
          if (debugInfo) {
            const rendererValue = context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            const vendorValue = context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
            renderer = typeof rendererValue === "string" ? rendererValue : null;
            vendor = typeof vendorValue === "string" ? vendorValue : null;
          }
        } catch (error) {
          renderer = null;
          vendor = null;
        }
      }

      if (context && typeof context.getExtension === "function") {
        try {
          const loseContext = context.getExtension("WEBGL_lose_context");
          if (loseContext) loseContext.loseContext();
        } catch (error) {
          // Releasing is best effort: the probe already produced its answer.
        }
      }

      return {
        statusMessage: statusMessage,
        probeSupported: Boolean(context),
        renderer: renderer,
        vendor: vendor
      };
    } catch (error) {
      return null;
    }
  }

  function installWebglProbeHook() {
    if (typeof Utils === "undefined" || typeof Utils.canUseWebGL !== "function") {
      return;
    }
    Utils.canUseWebGL = function () {
      const detail = runWebglProbe();
      if (detail && (!webglProbeDetail || !detail.probeSupported)) {
        webglProbeDetail = detail;
      }
      return Boolean(detail && detail.probeSupported);
    };
  }

  function finishBitmapFailure(bitmap, url, diagnostics) {
    // MZ's own failure contract is the loading state; the game-owned alert that
    // the shipped image guard attaches to it would block the host's own recovery
    // surface, so the report replaces the alert.
    try {
      bitmap._loadingState = "error";
    } catch (error) {
      // Nothing to mark on a bitmap that is already gone.
    }
    const detail = { url: absoluteUrl(url) };
    if (diagnostics) {
      const keys = Object.keys(diagnostics);
      for (let i = 0; i < keys.length; i++) {
        if (diagnostics[keys[i]] !== undefined) {
          detail[keys[i]] = diagnostics[keys[i]];
        }
      }
    }
    reportBootFailure("asset_load_failed", "Failed to load " + url, detail);
  }

  function installBitmapRetryHook() {
    if (typeof Bitmap === "undefined" || !Bitmap.prototype) {
      return;
    }
    if (typeof Bitmap.prototype._startLoading === "function" && retryOwnedImages) {
      const originalStartLoading = Bitmap.prototype._startLoading;
      Bitmap.prototype._startLoading = function () {
        const result = originalStartLoading.apply(this, arguments);
        try {
          if (this._image) {
            retryOwnedImages.add(this._image);
          }
        } catch (error) {
          // Best effort: an unregistered element is only reported by the generic
          // resource-error hook instead of by this retry path.
        }
        return result;
      };
    }
    if (typeof Bitmap.prototype._onError !== "function") {
      return;
    }
    const originalOnError = Bitmap.prototype._onError;
    Bitmap.prototype._onError = function () {
      const bitmap = this;
      const url = bitmap && typeof bitmap._url === "string" ? bitmap._url : "";
      // A mid-game failure belongs to the running game: the retry budget and the
      // host surface both close with the boot window.
      if (bootReady || !url || !isEngineAssetUrl(url) || typeof bitmap._startLoading !== "function") {
        return originalOnError.apply(this, arguments);
      }

      const kind = assetFailureKind(url);
      if (!kind.retryable) {
        finishBitmapFailure(bitmap, url, {
          status: kind.status,
          sessionRejected: kind.sessionRejected ? true : undefined
        });
        return;
      }

      const attempts = (assetRetryCounts[url] || 0) + 1;
      assetRetryCounts[url] = attempts;
      if (attempts > RETRY_MAX_ATTEMPTS) {
        finishBitmapFailure(bitmap, url, {
          retries: RETRY_MAX_ATTEMPTS,
          status: kind.status
        });
        return;
      }

      const scheduled = scheduleRetry(function () {
        if (bootReady) return;
        try {
          bitmap._startLoading();
        } catch (error) {
          finishBitmapFailure(bitmap, url, { retries: attempts });
        }
      }, attempts);
      if (!scheduled) {
        finishBitmapFailure(bitmap, url, { retries: attempts });
      }
    };
  }

  function installAssetRequestRetryHook() {
    if (
      typeof XMLHttpRequest === "undefined" ||
      !XMLHttpRequest.prototype ||
      typeof XMLHttpRequest.prototype.open !== "function" ||
      typeof XMLHttpRequest.prototype.send !== "function"
    ) {
      return;
    }
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const OPEN_KEY = "__ropoductionsAssetOpen";
    const RETRY_KEY = "__ropoductionsAssetRetry";

    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        this[OPEN_KEY] = {
          method: typeof method === "string" ? method.toUpperCase() : "GET",
          url: typeof url === "string" ? url : String(url)
        };
      } catch (error) {
        // Unbookkeeped request: the send hook passes it through untouched.
      }
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      const xhr = this;
      const openState = xhr[OPEN_KEY];
      if (!openState || xhr[RETRY_KEY] || bootReady) {
        return originalSend.apply(xhr, arguments);
      }
      if (openState.method !== "GET" || !isEngineAssetUrl(openState.url)) {
        return originalSend.apply(xhr, arguments);
      }
      // A caller that tracks readiness instead of load/error keeps native
      // behaviour: the retry only re-dispatches handlers it can replay faithfully.
      if (typeof xhr.onreadystatechange === "function") {
        return originalSend.apply(xhr, arguments);
      }
      const savedOnLoad = xhr.onload;
      const savedOnError = xhr.onerror;
      if (typeof savedOnLoad !== "function" && typeof savedOnError !== "function") {
        return originalSend.apply(xhr, arguments);
      }

      const request = {
        url: absoluteUrl(openState.url),
        responseType: xhr.responseType,
        retries: 0
      };
      xhr[RETRY_KEY] = request;

      function finish(status, event) {
        try {
          delete xhr[RETRY_KEY];
        } catch (error) {
          xhr[RETRY_KEY] = undefined;
        }
        // Native semantics: a response that arrived drives onload, whatever its
        // status; a request that never completed drives onerror.
        if (status > 0) {
          if (typeof savedOnLoad === "function") savedOnLoad.call(xhr, event);
        } else if (typeof savedOnError === "function") {
          savedOnError.call(xhr, event);
        }
      }

      function retry() {
        try {
          originalOpen.call(xhr, openState.method, openState.url);
          if (request.responseType) {
            xhr.responseType = request.responseType;
          }
          originalSend.call(xhr, body);
        } catch (error) {
          finish(0, null);
        }
      }

      function retryOrReport(status, event) {
        if (status === 401 || status === 403) {
          reportBootFailure("asset_load_failed", "Failed to load " + request.url, {
            url: request.url,
            status: status,
            sessionRejected: true
          });
          finish(status, event);
          return;
        }
        if (request.retries < RETRY_MAX_ATTEMPTS) {
          request.retries += 1;
          if (scheduleRetry(retry, request.retries)) {
            return;
          }
        }
        const detail = { url: request.url, retries: request.retries };
        if (status > 0) {
          detail.status = status;
        } else {
          detail.networkError = "request did not complete";
        }
        reportBootFailure("asset_load_failed", "Failed to load " + request.url, detail);
        finish(status, event);
      }

      xhr.onload = function (event) {
        const status = xhr.status;
        if (status === 401 || status === 403 || status >= 500 || status === 0) {
          retryOrReport(status, event);
          return;
        }
        finish(status, event);
      };
      xhr.onerror = function (event) {
        retryOrReport(0, event);
      };

      return originalSend.apply(xhr, arguments);
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
        if (tagName === "img" && retryOwnedImages && retryOwnedImages.has(target)) {
          // A MZ bitmap owns this element: the retry hook reports its outcome with
          // the retry count instead of reporting the failure twice.
          return;
        }
        const url = target.currentSrc || target.src || "";
        if (!url) return;
        reportBootFailure("asset_load_failed", "Failed to load " + url, { url: absoluteUrl(url) });
      },
      true
    );
  }

  const hasMzRuntime = typeof SceneManager !== "undefined" || typeof Graphics !== "undefined";

  installWebglProbeHook();
  installBitmapRetryHook();
  installAssetRequestRetryHook();
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
