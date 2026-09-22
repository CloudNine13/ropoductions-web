import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildDiagnosticsReport,
  classifyEngineBootFailure,
  engineBootDiagnosticsRows,
  formatEngineBootDiagnostics,
  isEngineBootFailureReport,
  isEngineReadyReport,
  isSameOriginEngineSrc,
  isSessionRejectedReport,
  parseEngineBootFailureReport,
  playerCopyClass,
  runWebglProbe,
  webglProbeDiagnostics,
  type EngineBootDiagnosticsLabels,
} from "../src/lib/engine-boot-failure";
import {
  ENGINE_BOOT_FAILURE_MESSAGE_TYPE,
  ENGINE_READY_MESSAGE_TYPE,
  type EngineBootFailureClass,
} from "../src/types/engine-boot";

const ORIGIN = "https://ropoductions.com";

const LABELS: EngineBootDiagnosticsLabels = {
  url: "Failing URL",
  status: "Response status",
  networkError: "Network error",
  probe: "WebGL probe",
  probeSupported: "context created",
  probeUnsupported: "context refused",
  statusMessage: "Status message",
  renderer: "Renderer",
  vendor: "Vendor",
  userAgent: "User agent",
  engineScripts: "Engine scripts",
  foreignScript: "not served from this origin",
  retries: "Retry attempts",
  sessionRejected: "Session",
  sessionRejectedValue: "rejected by the server (401/403)",
  none: "None",
};

interface MutableGlobal {
  window?: unknown;
}

const mutableGlobal = globalThis as MutableGlobal;
const originalWindow = mutableGlobal.window;

afterEach(() => {
  if (originalWindow === undefined) {
    delete mutableGlobal.window;
  } else {
    mutableGlobal.window = originalWindow;
  }
});

describe("engine boot failure taxonomy", () => {
  const MATRIX: ReadonlyArray<readonly [string, EngineBootFailureClass]> = [
    ["Your browser does not support WebGL.", "webgl_unavailable"],
    ["Your browser does not support Web Audio API.", "browser_capability"],
    ["Your browser does not support CSS Font Loading.", "browser_capability"],
    ["Your browser does not support IndexedDB.", "browser_capability"],
    ["Your browser does not allow to read local files.", "boot_request_failed"],
    ["Failed to initialize graphics.", "renderer_init_failed"],
    ["Failed to load js/main.js", "asset_load_failed"],
    ["Image: img/pictures/hero.png has failed to load.", "asset_load_failed"],
  ];

  it("maps every engine-browser-compat section 1 raw string to exactly one class", () => {
    for (const [raw, expected] of MATRIX) {
      assert.equal(classifyEngineBootFailure(raw), expected, raw);
    }
  });

  it("classifies the strings MZ wraps around the raw sentence the same way", () => {
    assert.equal(
      classifyEngineBootFailure("Error: Your browser does not support WebGL."),
      "webgl_unavailable"
    );
    assert.equal(
      classifyEngineBootFailure("ErrorYour browser does not support WebGL."),
      "webgl_unavailable"
    );
  });

  it("covers unclassifiable input with the boot request class instead of dropping it", () => {
    assert.equal(classifyEngineBootFailure("TypeError: x is not a function"), "boot_request_failed");
    assert.equal(classifyEngineBootFailure(""), "boot_request_failed");
    assert.equal(classifyEngineBootFailure(undefined), "boot_request_failed");
    assert.equal(classifyEngineBootFailure(42), "boot_request_failed");
  });

  it("renders renderer_init_failed with webgl_unavailable player copy and leaves others alone", () => {
    assert.equal(playerCopyClass("renderer_init_failed"), "webgl_unavailable");
    assert.equal(playerCopyClass("webgl_unavailable"), "webgl_unavailable");
    assert.equal(playerCopyClass("browser_capability"), "browser_capability");
    assert.equal(playerCopyClass("boot_request_failed"), "boot_request_failed");
    assert.equal(playerCopyClass("asset_load_failed"), "asset_load_failed");
  });
});

describe("engine boot failure report validation", () => {
  it("accepts only the boot failure message shape", () => {
    assert.equal(
      isEngineBootFailureReport({
        type: ENGINE_BOOT_FAILURE_MESSAGE_TYPE,
        failureClass: "webgl_unavailable",
      }),
      true
    );
    assert.equal(
      isEngineBootFailureReport({
        type: ENGINE_BOOT_FAILURE_MESSAGE_TYPE,
        failureClass: "not_a_class",
      }),
      false
    );
    assert.equal(isEngineBootFailureReport({ type: ENGINE_READY_MESSAGE_TYPE }), false);
    assert.equal(isEngineBootFailureReport(null), false);
    assert.equal(isEngineBootFailureReport("ROPODUCTIONS_ENGINE_BOOT_FAILURE"), false);
  });

  it("ignores reports from a foreign origin or another frame", () => {
    const frame = {} as Window;
    const data = { type: ENGINE_BOOT_FAILURE_MESSAGE_TYPE, failureClass: "asset_load_failed" };

    assert.equal(
      parseEngineBootFailureReport({ origin: "https://evil.test", source: frame, data }, frame, ORIGIN),
      null
    );
    assert.equal(
      parseEngineBootFailureReport({ origin: ORIGIN, source: {} as Window, data }, frame, ORIGIN),
      null
    );
    assert.equal(
      parseEngineBootFailureReport({ origin: ORIGIN, source: null, data }, frame, ORIGIN),
      null
    );
    assert.equal(parseEngineBootFailureReport(null, frame, ORIGIN), null);
  });

  it("returns a sanitized report for a genuine engine frame message", () => {
    const frame = {} as Window;
    const report = parseEngineBootFailureReport(
      {
        origin: ORIGIN,
        source: frame,
        data: {
          type: ENGINE_BOOT_FAILURE_MESSAGE_TYPE,
          failureClass: "asset_load_failed",
          raw: "Failed to load js/main.js",
          diagnostics: {
            url: "js/main.js",
            status: 404,
            engineScripts: ["js/main.js", "js/plugins/Ropoductions_WebBridge.js"],
            nested: { ignored: true },
          },
        },
      },
      frame,
      ORIGIN
    );

    assert.ok(report);
    assert.equal(report.failureClass, "asset_load_failed");
    assert.equal(report.raw, "Failed to load js/main.js");
    assert.equal(report.diagnostics?.url, "js/main.js");
    assert.equal(report.diagnostics?.status, 404);
    assert.deepEqual(report.diagnostics?.engineScripts, [
      "js/main.js",
      "js/plugins/Ropoductions_WebBridge.js",
    ]);
    assert.equal("nested" in (report.diagnostics ?? {}), false);
  });

  it("accepts ready reports only from the engine frame on our own origin", () => {
    const frame = {} as Window;
    const ready = { type: ENGINE_READY_MESSAGE_TYPE };
    assert.equal(isEngineReadyReport({ origin: ORIGIN, source: frame, data: ready }, frame, ORIGIN), true);
    assert.equal(
      isEngineReadyReport({ origin: ORIGIN, source: {} as Window, data: ready }, frame, ORIGIN),
      false
    );
    assert.equal(
      isEngineReadyReport(
        { origin: "https://evil.test", source: frame, data: ready },
        frame,
        ORIGIN
      ),
      false
    );
  });

  it("never lets a later part overwrite detail an earlier part already carried", () => {
    const merged = buildDiagnosticsReport(
      { url: "js/main.js", status: 500 },
      { url: "js/plugins/other.js", networkError: "Failed to fetch" }
    );
    assert.equal(merged.url, "js/main.js");
    assert.equal(merged.status, 500);
    assert.equal(merged.networkError, "Failed to fetch");
  });
});

interface FakeCanvasOptions {
  context: unknown;
  statusMessage?: string;
}

function createFakeDocument(options: FakeCanvasOptions): Document {
  const context = options.context as {
    getExtension?: (name: string) => unknown;
  } | null;
  const listeners: Record<string, Array<(event: unknown) => void>> = {};
  const canvas = {
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      (listeners[type] ??= []).push(listener);
    },
    removeEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = (listeners[type] ?? []).filter((entry) => entry !== listener);
    },
    getContext: () => {
      if (!context && options.statusMessage) {
        for (const listener of listeners.webglcontextcreationerror ?? []) {
          listener({ statusMessage: options.statusMessage });
        }
      }
      return context;
    },
  };

  const doc = {
    createElement: () => canvas,
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as Document;

  return doc;
}

describe("webgl preflight probe", () => {
  it("reports refusal with the browser's status message", () => {
    const doc = createFakeDocument({ context: null, statusMessage: "GPU process crashed" });
    const probe = runWebglProbe(doc);

    assert.equal(probe.supported, false);
    assert.equal(probe.statusMessage, "GPU process crashed");
  });

  it("reports the renderer and vendor and releases the probe context", () => {
    let lost = false;
    const gl = {
      getExtension: (name: string) => {
        if (name === "WEBGL_debug_renderer_info") {
          return { UNMASKED_RENDERER_WEBGL: 0x9246, UNMASKED_VENDOR_WEBGL: 0x9245 };
        }
        if (name === "WEBGL_lose_context") {
          return {
            loseContext: () => {
              lost = true;
            },
          };
        }
        return null;
      },
      getParameter: (parameter: number) => (parameter === 0x9246 ? "Apple M1" : "Apple"),
    };
    const doc = createFakeDocument({ context: gl });
    const probe = runWebglProbe(doc);

    assert.equal(probe.supported, true);
    assert.equal(probe.renderer, "Apple M1");
    assert.equal(probe.vendor, "Apple");
    assert.equal(lost, true);

    const diagnostics = webglProbeDiagnostics(probe);
    assert.equal(diagnostics.probeSupported, true);
    assert.equal(diagnostics.renderer, "Apple M1");
  });

  it("refuses when no document is available to probe", () => {
    const probe = runWebglProbe(null);
    assert.equal(probe.supported, false);
    assert.ok(probe.statusMessage);
  });
});

describe("engine boot diagnostics rendering", () => {
  const report = {
    type: ENGINE_BOOT_FAILURE_MESSAGE_TYPE,
    failureClass: "webgl_unavailable" as EngineBootFailureClass,
    raw: "Your browser does not support WebGL.",
    diagnostics: {
      probeSupported: false,
      statusMessage: "GPU process crashed",
      renderer: "SwiftShader",
      vendor: "Google",
      userAgent: "Mozilla/5.0",
      engineScripts: ["js/main.js", "https://cdn.example.test/injected.js"],
    },
  };

  it("labels every diagnostic the repository-invisible report carries", () => {
    mutableGlobal.window = { location: { origin: ORIGIN } };
    const rows = engineBootDiagnosticsRows(report, LABELS);
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row.value]));

    assert.equal(byLabel["WebGL probe"], "context refused");
    assert.equal(byLabel["Status message"], "GPU process crashed");
    assert.equal(byLabel["Renderer"], "SwiftShader");
    assert.equal(byLabel["Vendor"], "Google");
    assert.equal(byLabel["User agent"], "Mozilla/5.0");
    assert.equal(
      byLabel["Engine scripts"],
      `js/main.js\nhttps://cdn.example.test/injected.js (${LABELS.foreignScript})`
    );
    assert.equal("Failing URL" in byLabel, false);
  });

  it("flags a script that is not served from our own origin", () => {
    mutableGlobal.window = { location: { origin: ORIGIN } };
    const rows = engineBootDiagnosticsRows(
      {
        ...report,
        diagnostics: { engineScripts: [`${ORIGIN}/engine/js/main.js`] },
      },
      LABELS
    );

    assert.equal(rows[0].value, `${ORIGIN}/engine/js/main.js`);
  });

  it("renders the clipboard payload with the class and the raw engine string", () => {
    mutableGlobal.window = { location: { origin: ORIGIN } };
    const text = formatEngineBootDiagnostics(report, LABELS);

    assert.ok(text.startsWith("class: webgl_unavailable"));
    assert.ok(text.includes("raw: Your browser does not support WebGL."));
    assert.ok(text.includes("Renderer: SwiftShader"));
  });

  it("names the retry outcome an exhausted asset failure carries", () => {
    mutableGlobal.window = { location: { origin: ORIGIN } };
    const rows = engineBootDiagnosticsRows(
      {
        type: ENGINE_BOOT_FAILURE_MESSAGE_TYPE,
        failureClass: "asset_load_failed",
        raw: "Failed to load img/pictures/hero.png",
        diagnostics: {
          url: `${ORIGIN}/engine/img/pictures/hero.png`,
          status: 503,
          retries: 2,
        },
      },
      LABELS
    );
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row.value]));

    assert.equal(byLabel[LABELS.retries], "2");
    assert.equal(byLabel["Failing URL"], `${ORIGIN}/engine/img/pictures/hero.png`);
    assert.equal(LABELS.sessionRejected in byLabel, false);
  });

  it("marks an asset the server answered 401/403 as a session rejection", () => {
    mutableGlobal.window = { location: { origin: ORIGIN } };
    const rows = engineBootDiagnosticsRows(
      {
        type: ENGINE_BOOT_FAILURE_MESSAGE_TYPE,
        failureClass: "asset_load_failed",
        diagnostics: { url: `${ORIGIN}/engine/data/System.json`, status: 403, sessionRejected: true },
      },
      LABELS
    );
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row.value]));

    assert.equal(byLabel[LABELS.sessionRejected], LABELS.sessionRejectedValue);
    assert.equal(LABELS.retries in byLabel, false);
  });
});

describe("session rejection escalation", () => {
  it("escalates only the reports an entitlement answer produced", () => {
    const base = {
      type: ENGINE_BOOT_FAILURE_MESSAGE_TYPE,
      failureClass: "asset_load_failed" as EngineBootFailureClass,
    };

    assert.equal(isSessionRejectedReport({ ...base }), false);
    assert.equal(
      isSessionRejectedReport({ ...base, diagnostics: { url: "js/main.js", retries: 2 } }),
      false
    );
    assert.equal(
      isSessionRejectedReport({ ...base, diagnostics: { url: "js/main.js", sessionRejected: true } }),
      true
    );
  });
});

describe("engine source boundary", () => {
  it("admits only addresses that resolve to our own origin", () => {
    const origin = "https://ropoductions.com";

    assert.equal(isSameOriginEngineSrc("/engine/index.html", origin), true);
    assert.equal(isSameOriginEngineSrc("engine/index.html", origin), true);
    assert.equal(isSameOriginEngineSrc("https://ropoductions.com/engine/index.html", origin), true);
    assert.equal(isSameOriginEngineSrc("https://ropoductions.com:443/engine/index.html", origin), true);

    assert.equal(isSameOriginEngineSrc("//tracker.example/engine/index.html", origin), false);
    assert.equal(isSameOriginEngineSrc("https://tracker.example/engine/index.html", origin), false);
    assert.equal(isSameOriginEngineSrc("http://ropoductions.com/engine/index.html", origin), false);
    assert.equal(isSameOriginEngineSrc("javascript:alert(1)", origin), false);
    assert.equal(isSameOriginEngineSrc("data:text/html,<canvas>", origin), false);
    assert.equal(isSameOriginEngineSrc("blob:https://ropoductions.com/uuid", origin), false);
    assert.equal(isSameOriginEngineSrc("", origin), false);
    assert.equal(isSameOriginEngineSrc(null, origin), false);
  });
});

describe("diagnostics inventory boundary", () => {
  it("drops a script inventory that is not a string array instead of failing to render", () => {
    const merged = buildDiagnosticsReport({
      url: "/engine/index.html",
      engineScripts: "not-an-array" as unknown as string[],
    });

    assert.equal(merged.url, "/engine/index.html");
    assert.equal(merged.engineScripts, undefined);

    const report = {
      type: ENGINE_BOOT_FAILURE_MESSAGE_TYPE,
      failureClass: "boot_request_failed" as EngineBootFailureClass,
      diagnostics: merged,
    };
    const rows = engineBootDiagnosticsRows(report, LABELS);

    assert.equal(
      rows.some((row) => row.label === LABELS.engineScripts),
      false,
      "a non-array inventory must not produce a scripts row"
    );
    assert.doesNotThrow(() => formatEngineBootDiagnostics(report, LABELS));
  });

  it("still keeps a well-formed inventory, capped and truncated", () => {
    const merged = buildDiagnosticsReport({
      engineScripts: ["/engine/js/main.js", "/engine/js/plugins/x.js"],
    });

    assert.deepEqual(merged.engineScripts, ["/engine/js/main.js", "/engine/js/plugins/x.js"]);

    const rows = engineBootDiagnosticsRows(
      {
        type: ENGINE_BOOT_FAILURE_MESSAGE_TYPE,
        failureClass: "boot_request_failed" as EngineBootFailureClass,
        diagnostics: merged,
      },
      LABELS
    );
    const scriptsRow = rows.find((row) => row.label === LABELS.engineScripts);

    assert.ok(scriptsRow);
    assert.match(scriptsRow.value, /main\.js/);
  });
});
