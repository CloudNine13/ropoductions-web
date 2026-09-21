import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

interface RetryReport {
  type: string;
  failureClass?: string;
  raw?: string;
  diagnostics?: {
    url?: string;
    status?: number;
    networkError?: string;
    retries?: number;
    sessionRejected?: boolean;
  };
}

interface PostedMessage {
  message: RetryReport;
  targetOrigin: string;
}

interface BitmapInstance {
  _url: string;
  _image: unknown;
  _loadingState: string;
  _startLoading: () => void;
  _onLoad: () => void;
  _onError: () => void;
}

interface FakeXhr {
  onload: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onreadystatechange: ((event: unknown) => void) | null;
  status: number;
  responseType: string;
  withCredentials?: boolean;
  timeout?: number;
  open: (method: string, url: string) => void;
  send: (body?: unknown) => void;
  setRequestHeader?: (name: string, value: string) => void;
  overrideMimeType?: (mime: string) => void;
  addEventListener?: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (event: unknown) => void) => void;
  requestHeaders?: Array<[string, string]>;
  mimeType?: string;
}

const ORIGIN = "https://ropoductions.com";

/**
 * The retry policy lives in the injected plugin, so these tests execute the real
 * plugin source inside a sandbox carrying MZ's own shapes: a Bitmap whose
 * `_startLoading` is the loading entry point and whose `_onError` is the failure
 * contract, and an XMLHttpRequest the plugin may re-issue.
 */
describe("engine asset load retry in Ropoductions_WebBridge.js", () => {
  const pluginPath = path.resolve(
    process.cwd(),
    "src/engine-plugins/Ropoductions_WebBridge.js"
  );

  let postedMessages: PostedMessage[];
  let timers: Array<{ fn: () => void; delay: number }>;
  let resourceEntries: Record<string, { responseStatus?: number }>;
  let lostContexts: number;
  let contextRequests: string[];
  let imageLoads: string[];
  let sandbox: Record<string, unknown>;
  let windowListeners: Record<string, Array<(event: unknown) => void>>;
  let errorPrinterElement: { style: { display: string } };

  let makeBitmap: (url: string) => BitmapInstance;
  let failBitmapLoads: (count: number) => void;
  let loadedBitmaps: () => number;
  let makeXhr: () => FakeXhr;
  let queueXhrOutcomes: (steps: Array<{ kind: "error" | "response"; status: number }>) => void;
  let xhrRequestUrls: () => string[];

  function setupEnvironment(options: { mzRuntime?: boolean; readyState?: string; sceneManager?: boolean } = {}) {
    postedMessages = [];
    timers = [];
    resourceEntries = {};
    lostContexts = 0;
    contextRequests = [];
    imageLoads = [];

    let bitmapFailures = 0;
    let bitmapLoadCount = 0;
    let xhrOutcomes: Array<{ kind: "error" | "response"; status: number }> = [];
    const requests: string[] = [];

    // Fresh prototypes per test: the plugin wraps them, so a shared class would
    // stack one plugin's wrappers under the next test's.
    class Bitmap {
      _url: string;
      _image: unknown = null;
      _loadingState = "none";

      constructor(url: string) {
        this._url = url;
      }

      // MZ's loading entry point: it always ends in `_onLoad` or `_onError`.
      _startLoading() {
        this._loadingState = "loading";
        this._image = { url: this._url };
        if (bitmapFailures > 0) {
          bitmapFailures -= 1;
          this._onError();
        } else {
          this._onLoad();
        }
      }

      _onLoad() {
        this._loadingState = "loaded";
        bitmapLoadCount += 1;
        imageLoads.push(`load ${this._url}`);
      }

      // The shipped image guard's shape: mark the bitmap, alert the player.
      _onError() {
        this._loadingState = "error";
        imageLoads.push(`error ${this._url}`);
      }
    }

    class XmlHttpRequest {
      onload: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onreadystatechange: ((event: unknown) => void) | null = null;
      status = 0;
      responseType = "";
      withCredentials = false;
      timeout = 0;
      method = "";
      url = "";
      requestHeaders: Array<[string, string]> = [];
      headerCalls: Array<[string, string]> = [];
      mimeType = "";
      mimeCalls: string[] = [];
      responseTypesAtSend: string[] = [];
      listeners: Record<string, Array<(event: unknown) => void>> = {};

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
        this.requestHeaders = [];
        requests.push(url);
      }

      setRequestHeader(name: string, value: string) {
        this.requestHeaders.push([name, value]);
        this.headerCalls.push([name, value]);
      }

      overrideMimeType(mime: string) {
        this.mimeType = mime;
        this.mimeCalls.push(mime);
      }

      addEventListener(type: string, listener: (event: unknown) => void) {
        (this.listeners[type] ??= []).push(listener);
      }

      removeEventListener(type: string, listener: (event: unknown) => void) {
        this.listeners[type] = (this.listeners[type] ?? []).filter((entry) => entry !== listener);
      }

      send() {
        this.responseTypesAtSend.push(this.responseType);
        const step = xhrOutcomes.shift() ?? { kind: "response", status: 200 };
        this.status = step.kind === "error" ? 0 : step.status;
        if (step.kind === "error") {
          if (typeof this.onerror === "function") this.onerror({ type: "error" });
          for (const listener of this.listeners["error"] ?? []) listener({ type: "error" });
        } else {
          if (typeof this.onload === "function") this.onload({ type: "load" });
          for (const listener of this.listeners["load"] ?? []) listener({ type: "load" });
        }
      }
    }

    makeBitmap = (url) => new Bitmap(url) as BitmapInstance;
    failBitmapLoads = (count) => {
      bitmapFailures = count;
    };
    loadedBitmaps = () => bitmapLoadCount;
    makeXhr = () => new XmlHttpRequest() as unknown as FakeXhr;
    queueXhrOutcomes = (steps) => {
      xhrOutcomes = [...steps];
    };
    xhrRequestUrls = () => [...requests];

    const mockWindow: Record<string, unknown> = {
      location: { origin: ORIGIN, href: `${ORIGIN}/engine/index.html` },
      setTimeout: (fn: () => void, delay: number) => {
        timers.push({ fn, delay });
        return timers.length;
      },
      clearTimeout: () => {},
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        (windowListeners[type] ??= []).push(listener);
      },
      removeEventListener: (type: string, listener: (event: unknown) => void) => {
        windowListeners[type] = (windowListeners[type] ?? []).filter((entry) => entry !== listener);
      },
      parent: {
        postMessage: (message: RetryReport, targetOrigin: string) => {
          postedMessages.push({ message, targetOrigin });
        },
      },
    };
    windowListeners = {};

    errorPrinterElement = { style: { display: "" } };

    const loseContextExtension = {
      loseContext: () => {
        lostContexts += 1;
      },
    };

    const mockDocument = {
      readyState: options.readyState ?? "loading",
      currentScript: { src: `${ORIGIN}/engine/js/main.js` },
      getElementById: (id: string) => (id === "errorPrinter" ? errorPrinterElement : null),
      querySelectorAll: () => [],
      createElement: () => ({
        addEventListener: () => {},
        removeEventListener: () => {},
        getContext: (kind: string) => {
          contextRequests.push(kind);
          return {
            getExtension: (name: string) =>
              name === "WEBGL_lose_context" ? loseContextExtension : null,
            getParameter: () => "fake-gpu",
          };
        },
      }),
    };

    sandbox = {
      window: mockWindow,
      document: mockDocument,
      Bitmap,
      XMLHttpRequest: XmlHttpRequest,
      URL,
      performance: {
        getEntriesByName: (name: string) => {
          const entry = resourceEntries[name];
          return entry ? [entry] : [];
        },
      },
      console,
      queueMicrotask,
    };

    if (options.mzRuntime !== false) {
      sandbox.Graphics = { printError: () => {} };
    }

    if (options.sceneManager) {
      sandbox.SceneManager = { goto: () => {} };
    }
  }

  function loadPlugin() {
    const code = fs.readFileSync(pluginPath, "utf-8");
    new vm.Script(code).runInContext(vm.createContext(sandbox));
  }

  function startBitmap(url: string): BitmapInstance {
    const bitmap = makeBitmap(url);
    bitmap._startLoading();
    return bitmap;
  }

  function runTimers(limit = 10) {
    let guard = 0;
    while (timers.length > 0 && guard < limit) {
      guard += 1;
      const next = timers.shift();
      assert.ok(next, "expected a scheduled retry");
      next.fn();
    }
  }

  beforeEach(() => {
    setupEnvironment();
  });

  it("retries a network-level image failure on the same URL and renders the sprite when it succeeds", () => {
    failBitmapLoads(1);
    loadPlugin();

    const bitmap = startBitmap("/engine/img/system/Load/Load1.png");

    assert.equal(timers.length, 1, "one retry must be scheduled");
    assert.ok(timers[0].delay >= 150 && timers[0].delay <= 600, "backoff carries jitter");
    assert.equal(bitmap._loadingState, "loading", "the bitmap keeps loading across the retry");

    runTimers();

    assert.equal(bitmap._loadingState, "loaded");
    assert.equal(loadedBitmaps(), 1);
    assert.deepEqual(
      imageLoads,
      ["load /engine/img/system/Load/Load1.png"],
      "the engine never sees the failure the retry absorbed"
    );
    assert.equal(postedMessages.length, 0, "a recovered asset is not a failure");
  });

  it("gives up after two retries and reports the URL with its retry count", () => {
    failBitmapLoads(10);
    loadPlugin();

    const bitmap = startBitmap("/engine/img/pictures/hero.png");
    runTimers();

    assert.equal(bitmap._loadingState, "error");
    assert.equal(postedMessages.length, 1);
    const report = postedMessages[0].message;
    assert.equal(report.type, "ROPODUCTIONS_ENGINE_BOOT_FAILURE");
    assert.equal(report.failureClass, "asset_load_failed");
    assert.equal(report.diagnostics?.url, `${ORIGIN}/engine/img/pictures/hero.png`);
    assert.equal(report.diagnostics?.retries, 2);
    assert.equal(report.raw, "Failed to load /engine/img/pictures/hero.png");
  });

  it("never retries an image answered 401/403 and escalates it to the host", () => {
    failBitmapLoads(10);
    resourceEntries["/engine/img/pictures/hero.png"] = { responseStatus: 403 };
    loadPlugin();

    startBitmap("/engine/img/pictures/hero.png");

    assert.equal(timers.length, 0, "an entitlement answer is not retried");
    assert.equal(postedMessages.length, 1);
    const report = postedMessages[0].message;
    assert.equal(report.diagnostics?.sessionRejected, true);
    assert.equal(report.diagnostics?.status, 403);
    assert.equal(report.diagnostics?.retries, undefined);
  });

  it("does not retry a response that already failed for a reason retrying cannot change", () => {
    failBitmapLoads(10);
    resourceEntries["/engine/img/pictures/missing.png"] = { responseStatus: 404 };
    loadPlugin();

    startBitmap("/engine/img/pictures/missing.png");

    assert.equal(timers.length, 0);
    const report = postedMessages[0].message;
    assert.equal(report.diagnostics?.status, 404);
    assert.equal(report.diagnostics?.sessionRejected, undefined);
  });

  it("leaves mid-game image failures to the running game", () => {
    // No MZ runtime: the document load is the boot, so the panel window closes here.
    setupEnvironment({ mzRuntime: false, readyState: "complete" });
    loadPlugin();
    assert.equal(postedMessages.length, 1, "the harness boot posts readiness");
    assert.equal(postedMessages[0].message.type, "ROPODUCTIONS_ENGINE_READY");

    failBitmapLoads(10);
    const bitmap = startBitmap("/engine/img/pictures/hero.png");

    assert.equal(timers.length, 0);
    assert.equal(postedMessages.length, 1);
    assert.equal(bitmap._loadingState, "error", "the engine's own failure handling runs");
  });

  it("answers MZ's capability check with a probe that releases its context", () => {
    sandbox.Utils = { canUseWebGL: () => false };
    loadPlugin();

    const utils = sandbox.Utils as { canUseWebGL: () => boolean };
    assert.equal(utils.canUseWebGL(), true);
    assert.equal(lostContexts, 1, "the probe context is released through WEBGL_lose_context");
    assert.equal(contextRequests.length, 1, "one context per capability check");
  });

  it("retries a network-level data request on the same URL and hands the response to the engine", () => {
    queueXhrOutcomes([
      { kind: "error", status: 0 },
      { kind: "response", status: 200 },
    ]);
    loadPlugin();

    const xhr = makeXhr();
    const outcomes: Array<{ kind: string; status: number }> = [];
    xhr.open("GET", "data/System.json");
    xhr.onload = function () {
      outcomes.push({ kind: "load", status: xhr.status });
    };
    xhr.onerror = function () {
      outcomes.push({ kind: "error", status: xhr.status });
    };
    xhr.send();

    assert.equal(timers.length, 1);
    runTimers();

    assert.deepEqual(outcomes, [{ kind: "load", status: 200 }]);
    assert.deepEqual(
      xhrRequestUrls(),
      ["data/System.json", "data/System.json"],
      "retries reuse the same URL"
    );
    assert.equal(postedMessages.length, 0, "a recovered data file is not a failure");
  });

  it("never retries a data request answered 403 and reports the session rejection", () => {
    queueXhrOutcomes([{ kind: "response", status: 403 }]);
    loadPlugin();

    const xhr = makeXhr();
    const outcomes: string[] = [];
    xhr.open("GET", "data/System.json");
    xhr.onload = function () {
      outcomes.push("load");
    };
    xhr.onerror = function () {
      outcomes.push("error");
    };
    xhr.send();

    assert.equal(timers.length, 0);
    assert.deepEqual(outcomes, ["load"], "the engine still sees the response it would have seen");
    const report = postedMessages[0].message;
    assert.equal(report.diagnostics?.sessionRejected, true);
    assert.equal(report.diagnostics?.status, 403);
    assert.equal(report.diagnostics?.url, `${ORIGIN}/engine/data/System.json`);
  });

  it("reports an exhausted server-error retry budget with the request outcome", () => {
    queueXhrOutcomes([
      { kind: "response", status: 500 },
      { kind: "response", status: 503 },
      { kind: "response", status: 500 },
    ]);
    loadPlugin();

    const xhr = makeXhr();
    const outcomes: number[] = [];
    xhr.open("GET", "data/Actors.json");
    xhr.onload = function () {
      outcomes.push(xhr.status);
    };
    xhr.onerror = function () {
      outcomes.push(0);
    };
    xhr.send();

    runTimers();

    assert.deepEqual(outcomes, [500], "the engine keeps its own failure handling");
    assert.equal(postedMessages.length, 1);
    const report = postedMessages[0].message;
    assert.equal(report.failureClass, "asset_load_failed");
    assert.equal(report.diagnostics?.retries, 2);
    assert.equal(report.diagnostics?.status, 500);
  });

  it("leaves data requests untouched once the boot window is closed", () => {
    setupEnvironment({ mzRuntime: false, readyState: "complete" });
    loadPlugin();
    assert.equal(postedMessages[0].message.type, "ROPODUCTIONS_ENGINE_READY");

    queueXhrOutcomes([
      { kind: "error", status: 0 },
      { kind: "response", status: 200 },
    ]);
    const xhr = makeXhr();
    const outcomes: string[] = [];
    xhr.open("GET", "data/System.json");
    xhr.onload = function () {
      outcomes.push("load");
    };
    xhr.onerror = function () {
      outcomes.push("error");
    };
    xhr.send();

    assert.equal(timers.length, 0, "no retry is scheduled for a running game");
    assert.deepEqual(outcomes, ["error"]);
    assert.equal(postedMessages.length, 1, "only the readiness report was posted");
  });

  it("keeps the retry outcome when MZ names the same resource through its own error path", () => {
    queueXhrOutcomes([
      { kind: "response", status: 500 },
      { kind: "response", status: 500 },
      { kind: "response", status: 500 },
    ]);
    loadPlugin();

    const xhr = makeXhr();
    xhr.open("GET", "data/System.json");
    xhr.onload = function () {};
    xhr.send();
    runTimers();

    assert.equal(postedMessages.length, 1, "the retry outcome is reported once");

    const graphics = sandbox.Graphics as { printError: (name: string, message: string) => void };
    graphics.printError("Failed to load", "data/System.json");

    assert.equal(postedMessages.length, 1, "the engine's own report does not blur the outcome");
    assert.equal(postedMessages[0].message.diagnostics?.retries, 2);
    assert.equal(postedMessages[0].message.diagnostics?.url, `${ORIGIN}/engine/data/System.json`);
  });

  it("reports an image failure once, with the retry outcome, when the element is also a resource error", () => {
    failBitmapLoads(10);
    loadPlugin();

    const bitmap = startBitmap("/engine/img/pictures/hero.png");
    runTimers();

    for (const listener of windowListeners["error"] ?? []) {
      listener({ type: "error", target: bitmap._image });
    }

    assert.equal(postedMessages.length, 1, "the resource-error hook does not duplicate the report");
    assert.equal(postedMessages[0].message.diagnostics?.retries, 2);
  });

  it("detects an entitlement answer through the absolute resource-timing entry for a relative bitmap URL", () => {
    failBitmapLoads(10);
    resourceEntries[`${ORIGIN}/engine/img/pictures/hero.png`] = { responseStatus: 403 };
    loadPlugin();

    startBitmap("/engine/img/pictures/hero.png");

    assert.equal(timers.length, 0, "an entitlement answer is not retried");
    assert.equal(postedMessages.length, 1);
    const report = postedMessages[0].message;
    assert.equal(report.diagnostics?.sessionRejected, true);
    assert.equal(report.diagnostics?.status, 403);
  });

  it("shares one retry budget between MZ's relative and absolute names for one image", () => {
    failBitmapLoads(10);
    loadPlugin();

    const first = startBitmap("/engine/img/pictures/hero.png");
    runTimers();
    assert.equal(first._loadingState, "error");
    assert.equal(postedMessages.length, 1);

    const second = startBitmap(`${ORIGIN}/engine/img/pictures/hero.png`);

    assert.equal(timers.length, 0, "the shared budget is already spent");
    assert.equal(second._loadingState, "error");
    assert.equal(postedMessages.length, 1, "the reported outcome is not duplicated");
  });

  it("clears the retry budget once the image loads", () => {
    failBitmapLoads(1);
    loadPlugin();

    const bitmap = startBitmap("/engine/img/pictures/hero.png");
    runTimers();
    assert.equal(bitmap._loadingState, "loaded");

    failBitmapLoads(10);
    const again = startBitmap("/engine/img/pictures/hero.png");

    assert.equal(timers.length, 1, "a recovered asset earns a fresh budget");
    runTimers();
    assert.equal(again._loadingState, "error");
  });

  it("reports a data request answered 404 without retrying it", () => {
    queueXhrOutcomes([{ kind: "response", status: 404 }]);
    loadPlugin();

    const xhr = makeXhr();
    const outcomes: number[] = [];
    xhr.open("GET", "data/System.json");
    xhr.onload = function () {
      outcomes.push(xhr.status);
    };
    xhr.send();

    assert.equal(timers.length, 0, "a missing file is not a network failure");
    assert.deepEqual(outcomes, [404], "the engine still sees the response it would have seen");
    assert.equal(postedMessages.length, 1);
    const report = postedMessages[0].message;
    assert.equal(report.diagnostics?.status, 404);
    assert.equal(report.diagnostics?.sessionRejected, undefined);
    assert.equal(report.diagnostics?.retries, undefined);
  });

  it("replays headers, mime type and response type when a data request is retried", () => {
    queueXhrOutcomes([
      { kind: "error", status: 0 },
      { kind: "response", status: 200 },
    ]);
    loadPlugin();

    const xhr = makeXhr();
    xhr.open("GET", "data/System.json");
    xhr.setRequestHeader?.("Authorization", "Bearer session");
    xhr.overrideMimeType?.("application/json");
    xhr.responseType = "json";
    xhr.onload = function () {};
    xhr.send();
    runTimers();

    const raw = xhr as unknown as {
      headerCalls: Array<[string, string]>;
      mimeCalls: string[];
      responseTypesAtSend: string[];
    };
    assert.deepEqual(xhrRequestUrls(), ["data/System.json", "data/System.json"]);
    assert.deepEqual(raw.headerCalls, [
      ["Authorization", "Bearer session"],
      ["Authorization", "Bearer session"],
    ]);
    assert.deepEqual(raw.mimeCalls, ["application/json", "application/json"]);
    assert.deepEqual(raw.responseTypesAtSend, ["json", "json"]);
  });

  it("retries a data request whose engine listens through addEventListener", () => {
    queueXhrOutcomes([
      { kind: "error", status: 0 },
      { kind: "response", status: 200 },
    ]);
    loadPlugin();

    const xhr = makeXhr();
    const outcomes: string[] = [];
    xhr.open("GET", "data/System.json");
    xhr.addEventListener?.("load", () => {
      outcomes.push(`load:${xhr.status}`);
    });
    xhr.addEventListener?.("error", () => {
      outcomes.push("error");
    });
    xhr.send();

    assert.equal(timers.length, 1);
    runTimers();

    assert.deepEqual(outcomes, ["load:200"], "the engine sees only the final outcome");
    assert.deepEqual(xhrRequestUrls(), ["data/System.json", "data/System.json"]);
    assert.equal(postedMessages.length, 0);
  });

  it("hands a pending data failure to the running game when the boot window closes first", () => {
    setupEnvironment({ sceneManager: true });
    queueXhrOutcomes([
      { kind: "error", status: 0 },
      { kind: "response", status: 200 },
    ]);
    loadPlugin();

    const xhr = makeXhr();
    const outcomes: string[] = [];
    xhr.open("GET", "data/System.json");
    xhr.onload = function () {
      outcomes.push("load");
    };
    xhr.onerror = function () {
      outcomes.push("error");
    };
    xhr.send();
    assert.equal(timers.length, 1);

    const sceneManager = sandbox.SceneManager as { goto: (scene: unknown) => void };
    sceneManager.goto({ name: "Scene_Boot" });
    sceneManager.goto({ name: "Scene_Title" });
    runTimers();

    assert.deepEqual(xhrRequestUrls(), ["data/System.json"], "no request leaves after readiness");
    assert.deepEqual(outcomes, ["error"], "the running game owns the failure");
  });
});
