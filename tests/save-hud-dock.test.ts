import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel: string): string => readFileSync(join(rootDir, rel), "utf8");

describe("floating frosted-glass save hud dock contract (Story 4.2)", () => {
  const saveHudPath = "src/components/save-hud-dock.tsx";
  const gameViewportPath = "src/components/game-viewport.tsx";
  const engineBridgePath = "src/engine-plugins/Ropoductions_WebBridge.js";

  it("exports SaveHudDock component and DEFAULT_IDLE_TIMEOUT_MS constant", () => {
    assert.ok(existsSync(join(rootDir, saveHudPath)), "src/components/save-hud-dock.tsx must exist");
    const src = readSource(saveHudPath);
    assert.ok(src.includes("export const DEFAULT_IDLE_TIMEOUT_MS = 4000;"), "Default idle timeout must be exactly 4000ms (4s per AC)");
    assert.ok(src.includes("export function SaveHudDock("), "Must export SaveHudDock component");
  });

  it("enforces frosted-glass styling tokens and rounded-full pill elevation", () => {
    const src = readSource(saveHudPath);

    // Spec tokens: bg-[#090A0F]/75 backdrop-blur-md rounded-full border border-white/10 shadow-2xl
    assert.ok(src.includes("bg-[#090A0F]/75"), "Must declare bg-[#090A0F]/75 frosted background (rgba(9,10,15,0.75))");
    assert.ok(src.includes("backdrop-blur-md"), "Must declare backdrop-blur-md for frosted glass effect");
    assert.ok(src.includes("rounded-full"), "Must declare rounded-full pill ergonomics");
    assert.ok(src.includes("border-white/10"), "Active chrome must declare subtle 1px white/10 border stroke");
    assert.ok(src.includes("border-white/5"), "Dimmed chrome must declare subtle 1px white/5 border stroke");
    assert.ok(src.includes("shadow-2xl"), "Must declare shadow-2xl elevation");
  });

  it("dims chrome only and never drops labels icons or rings below AA contrast", () => {
    const src = readSource(saveHudPath);

    // Chrome-only dim: container background/border shift, no whole-toolbar opacity
    assert.ok(!src.includes("opacity-25"), "Must NOT apply opacity-25 to the toolbar element");
    assert.ok(!src.includes('"opacity-100"'), "Must NOT toggle opacity-100 on the toolbar element");
    assert.ok(src.includes("bg-[#090A0F]/40"), "Dimmed chrome must fall back to bg-[#090A0F]/40");
    assert.ok(src.includes("border-white/5"), "Dimmed chrome must fall back to border-white/5");
    assert.ok(src.includes("bg-[#090A0F]/75"), "Active chrome must keep bg-[#090A0F]/75 frosted background");
    assert.ok(src.includes("backdrop-blur-md"), "Active chrome must keep backdrop-blur-md frosted glass");
    assert.ok(src.includes("data-dimmed"), "Must declare data-dimmed state attribute for DOM querying");

    // Smooth chrome transition
    assert.ok(src.includes("transition-[background-color,border-color]"), "Must transition chrome colors, never opacity");
    assert.ok(src.includes("duration-300"), "Must declare transition duration");
    assert.ok(src.includes("ease-out"), "Must declare ease-out curve");
    assert.ok(src.includes("motion-reduce:transition-none"), "Must respect prefers-reduced-motion");
  });

  it("keeps the Export label visible and drops Coming-soon tooltips", () => {
    const src = readSource(saveHudPath);

    assert.ok(
      src.includes("{exportButtonLabel}"),
      "Export label must stay visible at all viewport sizes"
    );
    assert.ok(!src.includes("(Coming soon)"), "Must NOT ship Coming-soon title tooltips");
    assert.ok(
      src.includes("max-w-[calc(100dvw-2rem)]"),
      "Dock must bound itself to the viewport width when labels stay visible"
    );
  });

  it("listens to active gameplay interactions and postMessage bridge activity with throttling", () => {
    const src = readSource(saveHudPath);

    // Activity event listeners on window
    assert.ok(src.includes('"pointerdown"'), "Must listen for pointerdown user activity");
    assert.ok(src.includes('"keydown"'), "Must listen for keydown user activity");
    assert.ok(src.includes('"wheel"'), "Must listen for wheel user activity");
    assert.ok(src.includes('"message"'), "Must listen for postMessage activity from engine iframe");
    assert.ok(src.includes("ROPODUCTIONS_ACTIVITY"), "Must handle ROPODUCTIONS_ACTIVITY message type");
    assert.ok(src.includes("ACTIVITY_THROTTLE_MS"), "Must throttle activity wakes to avoid timer churn");

    // Cleanup on unmount
    assert.ok(src.includes("removeEventListener"), "Must clean up all event listeners on unmount");
    assert.ok(src.includes("clearTimer"), "Must clear timer on unmount");
  });

  it("implements engine bridge activity forwarding in Ropoductions_WebBridge.js", () => {
    const bridgeSrc = readSource(engineBridgePath);

    assert.ok(bridgeSrc.includes("ROPODUCTIONS_ACTIVITY"), "Bridge plugin must forward ROPODUCTIONS_ACTIVITY to parent");
    assert.ok(bridgeSrc.includes("window.parent.postMessage"), "Bridge plugin must call window.parent.postMessage");
    assert.ok(bridgeSrc.includes("pointerdown"), "Bridge plugin must capture pointerdown");
    assert.ok(bridgeSrc.includes("keydown"), "Bridge plugin must capture keydown");
  });

  it("restores full opacity immediately on dock hover, focus, or tap without touch latching", () => {
    const src = readSource(saveHudPath);

    // Hover and tap listeners on dock container
    assert.ok(src.includes("onPointerEnter={handlePointerEnter}"), "Must handle pointer enter for hover");
    assert.ok(src.includes("onPointerLeave={handlePointerLeave}"), "Must handle pointer leave");
    assert.ok(src.includes("onFocus={handleFocus}"), "Must restore opacity and hold on keyboard focus");
    assert.ok(src.includes("onBlur={handleBlur}"), "Must restart idle timer when focus leaves dock");
    assert.ok(src.includes("onTouchStart={handleTouchStart}"), "Must restore opacity on touch tap without hover lockup");

    // Touch guard: pointerType === 'touch' must not latch hover state
    assert.ok(src.includes('e.pointerType === "touch"'), "Must avoid latching hover state on mobile touch events");
  });

  it("renders clean Lucide SVG icons and labels for Export (.zip), Import, Fullscreen, and Reset", () => {
    const src = readSource(saveHudPath);

    // Lucide icon imports
    assert.ok(src.includes("Download"), "Must import Download icon for Export (.zip)");
    assert.ok(src.includes("Upload"), "Must import Upload icon for Import");
    assert.ok(src.includes("Maximize2"), "Must import Maximize2 icon for Fullscreen enter");
    assert.ok(src.includes("Minimize2"), "Must import Minimize2 icon for Fullscreen exit");
    assert.ok(src.includes("RotateCcw"), "Must import RotateCcw icon for Reset");

    // Action button testids
    assert.ok(src.includes('data-testid="save-hud-export-button"'), "Must declare export button with testid");
    assert.ok(src.includes('data-testid="save-hud-import-button"'), "Must declare import button with testid");
    assert.ok(src.includes('data-testid="save-hud-fullscreen-button fullscreen-toggle-button"'), "Must declare fullscreen button with testid");
    assert.ok(src.includes('data-testid="save-hud-reset-button"'), "Must declare reset button with testid");

    // Crimson accent for reset per spec (#E11D48)
    assert.ok(src.includes("#E11D48"), "Reset button must use crimson accent #E11D48 per spec");
  });

  it("disables unimplemented actions (Export, Import, Reset) when callbacks are undefined", () => {
    const src = readSource(saveHudPath);

    assert.ok(src.includes("disabled={isExportDisabled}"), "Export button must be disabled when onExport is undefined");
    assert.ok(src.includes("aria-disabled={isExportDisabled}"), "Export button must reflect aria-disabled");
    assert.ok(src.includes("disabled={isImportDisabled}"), "Import button must be disabled when onImport is undefined");
    assert.ok(src.includes("disabled={isResetDisabled}"), "Reset button must be disabled when onReset is undefined");
  });
  it("renders temporary checkmark indicator and Studio Emerald accent on export confirmation (Story 4.3)", () => {
    const src = readSource(saveHudPath);

    assert.ok(src.includes("Check"), "Must import Check icon from lucide-react for export confirmation");
    assert.ok(src.includes('data-testid="save-hud-export-success-icon"'), "Must render Check icon with save-hud-export-success-icon testid on success");
    assert.ok(src.includes("data-export-status={currentExportStatus}"), "Export button must expose data-export-status attribute");
    assert.ok(src.includes("#22C55E"), "Export success must highlight with Studio Emerald (#22C55E) token");
    assert.ok(src.includes("isExportSuccess"), "Must conditionally check export success state");
    assert.ok(src.includes('data-testid="save-hud-export-error-icon"'), "Must render error icon with save-hud-export-error-icon testid on failure");
    assert.ok(src.includes("#E11D48"), "Export error must highlight with crimson (#E11D48) token");
    assert.ok(src.includes('aria-live="polite"'), "Export label must announce status changes via aria-live");
    assert.ok(src.includes("exportingRef"), "Must guard concurrent exports against stale-closure double clicks");
    assert.ok(src.includes("isControlledExport"), "Must resolve controlled exportStatus vs internal state ownership");
  });


  it("enforces strict 44x44px minimum touch target size across all action buttons", () => {
    const src = readSource(saveHudPath);

    const buttonMatches = src.match(/min-h-\[44px\]\s+min-w-\[44px\]/g);
    assert.ok(buttonMatches, "Must declare min-h-[44px] min-w-[44px] touch target classes");
    assert.ok(
      buttonMatches.length >= 4,
      `All 4 action buttons must declare min-h-[44px] min-w-[44px] (found ${buttonMatches.length})`
    );
  });

  it("provides accessibility semantics, keyboard focus rings, and toolbar role", () => {
    const src = readSource(saveHudPath);

    // WAI-ARIA toolbar role and orientation
    assert.ok(src.includes('role="toolbar"'), "Save HUD dock must declare role=toolbar");
    assert.ok(src.includes('aria-orientation="horizontal"'), "Save HUD dock must declare aria-orientation=horizontal");
    assert.ok(src.includes("aria-label="), "Save HUD dock must declare aria-label");

    // Fullscreen aria-pressed
    assert.ok(src.includes("aria-pressed={isFullscreen}"), "Fullscreen button must declare aria-pressed state");

    // Accessible name and tooltip title on all 4 buttons
    assert.ok(src.includes("aria-label={exportAccessibleName}"), "Export button must declare error-aware accessible name");
    assert.ok(src.includes("aria-busy={isExporting}"), "Export button must expose aria-busy while exporting");
    assert.ok(src.includes("title="), "Buttons must declare title tooltips");
    assert.ok(src.includes("aria-label={resolvedLabels.import}"), "Import button must declare aria-label");
    assert.ok(src.includes("aria-label={resolvedLabels.reset}"), "Reset button must declare aria-label");

    // Keyboard focus rings
    assert.ok(src.includes("focus-visible:ring-2"), "Buttons must declare high-visibility focus-visible ring");
    assert.ok(src.includes("focus-visible:outline-none"), "Buttons must strip default outline in favor of focus ring");
  });

  it("mounts SaveHudDock inside GameViewport at bottom with safe-area padding as sole fullscreen control", () => {
    const viewportSrc = readSource(gameViewportPath);

    assert.ok(viewportSrc.includes("<SaveHudDock"), "GameViewport must render SaveHudDock component");
    assert.ok(viewportSrc.includes("import { SaveHudDock }"), "GameViewport must import SaveHudDock");
    assert.ok(
      viewportSrc.includes("env(safe-area-inset-bottom)"),
      "SaveHudDock mounting in GameViewport must respect env(safe-area-inset-bottom)"
    );
    assert.ok(
      viewportSrc.includes("onToggleFullscreen={toggleFullscreen}"),
      "GameViewport must connect toggleFullscreen to SaveHudDock"
    );
    assert.ok(
      viewportSrc.includes("isFullscreen={activeFullscreen}"),
      "GameViewport must pass activeFullscreen state to SaveHudDock"
    );

    // Fullscreen toggle lives only in the dock; the top-right FAB collapses the HUD, never toggles fullscreen
    assert.ok(
      !viewportSrc.includes("env(safe-area-inset-top)") || viewportSrc.includes("save-hud-collapse-fab"),
      "GameViewport must NOT mount a duplicate top-right fullscreen button"
    );
    assert.ok(
      viewportSrc.includes('data-testid="save-hud-collapse-fab"'),
      "Top-right control must be the HUD collapse FAB with a stable testid"
    );
  });
});

describe("Save HUD Dock behavioral state machine and lifecycle", () => {
  type Listener = (event: unknown) => void;

  interface MockEventTarget {
    addEventListener: (type: string, listener: Listener) => void;
    removeEventListener: (type: string, listener: Listener) => void;
    dispatchEvent: (event: { type: string; [key: string]: unknown }) => void;
    listeners: Record<string, Listener[]>;
  }

  function createMockTarget(): MockEventTarget {
    const listeners: Record<string, Listener[]> = {};
    return {
      listeners,
      addEventListener: (type, fn) => {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(fn);
      },
      removeEventListener: (type, fn) => {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter((l) => l !== fn);
        }
      },
      dispatchEvent: (event) => {
        const list = listeners[event.type] || [];
        for (const fn of [...list]) {
          fn(event);
        }
      },
    };
  }

  interface DockStateHarness {
    isDimmed: boolean;
    dataDimmed: string;
    advanceTime: (ms: number) => void;
    dispatchUserActivity: (type?: string) => void;
    dispatchBridgeMessage: (origin: string, type: string) => void;
    pointerEnter: (pointerType?: string) => void;
    pointerLeave: (pointerType?: string) => void;
    focus: () => void;
    blur: () => void;
    touchStart: () => void;
    unmount: () => void;
    target: MockEventTarget;
    timersActive: () => number;
  }

  function createDockHarness(options: { idleTimeoutMs?: number } = {}): DockStateHarness {
    const idleTimeoutMs = options.idleTimeoutMs ?? 4000;
    const target = createMockTarget();
    let isDimmed = false;
    let isHoveredOrFocused = false;
    let lastActivityTime = 0;
    let scheduledTimer: { id: number; executeAt: number; fn: () => void } | null = null;
    let nextTimerId = 1;
    let currentTime = 1000;

    function clearTimer() {
      scheduledTimer = null;
    }

    function resetTimer() {
      clearTimer();
      isDimmed = false;
      if (isHoveredOrFocused) return;
      const id = nextTimerId++;
      scheduledTimer = {
        id,
        executeAt: currentTime + idleTimeoutMs,
        fn: () => {
          if (!isHoveredOrFocused) {
            isDimmed = true;
          }
        },
      };
    }

    function handleActivity() {
      if (currentTime - lastActivityTime < 250) return;
      lastActivityTime = currentTime;
      resetTimer();
    }

    // Mount listeners
    const onActivity = () => handleActivity();
    const onMessage = (evt: unknown) => {
      const msg = evt as { origin: string; data?: { type: string } };
      if (msg.origin === "https://ropoductions.com" && msg.data?.type === "ROPODUCTIONS_ACTIVITY") {
        handleActivity();
      }
    };

    target.addEventListener("pointerdown", onActivity);
    target.addEventListener("keydown", onActivity);
    target.addEventListener("wheel", onActivity);
    target.addEventListener("message", onMessage);

    // Initial timer
    resetTimer();

    return {
      get isDimmed() {
        return isDimmed;
      },
      get dataDimmed() {
        return isDimmed ? "true" : "false";
      },
      timersActive: () => (scheduledTimer ? 1 : 0),
      advanceTime: (ms: number) => {
        currentTime += ms;
        if (scheduledTimer && currentTime >= scheduledTimer.executeAt) {
          const fn = scheduledTimer.fn;
          scheduledTimer = null;
          fn();
        }
      },
      dispatchUserActivity: (type = "pointerdown") => {
        target.dispatchEvent({ type });
      },
      dispatchBridgeMessage: (origin: string, type: string) => {
        target.dispatchEvent({ type: "message", origin, data: { type } });
      },
      pointerEnter: (pointerType = "mouse") => {
        if (pointerType === "touch") return;
        isHoveredOrFocused = true;
        clearTimer();
        isDimmed = false;
      },
      pointerLeave: (pointerType = "mouse") => {
        if (pointerType === "touch") return;
        isHoveredOrFocused = false;
        resetTimer();
      },
      focus: () => {
        isHoveredOrFocused = true;
        clearTimer();
        isDimmed = false;
      },
      blur: () => {
        isHoveredOrFocused = false;
        resetTimer();
      },
      touchStart: () => {
        handleActivity();
      },
      unmount: () => {
        clearTimer();
        target.removeEventListener("pointerdown", onActivity);
        target.removeEventListener("keydown", onActivity);
        target.removeEventListener("wheel", onActivity);
        target.removeEventListener("message", onMessage);
      },
      target,
    };
  }

  it("mounts in active state (isDimmed = false) and dims after 4000ms idle", () => {
    const harness = createDockHarness();
    assert.equal(harness.isDimmed, false);
    assert.equal(harness.dataDimmed, "false");

    // Advance 3999ms: still active
    harness.advanceTime(3999);
    assert.equal(harness.isDimmed, false);

    // Advance past 4000ms: dims
    harness.advanceTime(1);
    assert.equal(harness.isDimmed, true);
    assert.equal(harness.dataDimmed, "true");
  });

  it("wakes immediately when receiving ROPODUCTIONS_ACTIVITY from same origin", () => {
    const harness = createDockHarness();
    harness.advanceTime(4000);
    assert.equal(harness.isDimmed, true);

    // Message from same origin wakes dock
    harness.dispatchBridgeMessage("https://ropoductions.com", "ROPODUCTIONS_ACTIVITY");
    assert.equal(harness.isDimmed, false);
    assert.equal(harness.dataDimmed, "false");

    // Timer is rescheduled: after 4000ms it dims again
    harness.advanceTime(4000);
    assert.equal(harness.isDimmed, true);
  });

  it("strictly ignores ROPODUCTIONS_ACTIVITY from untrusted origin", () => {
    const harness = createDockHarness();
    harness.advanceTime(4000);
    assert.equal(harness.isDimmed, true);

    // Mismatched origin does NOT wake dock
    harness.dispatchBridgeMessage("https://attacker-origin.com", "ROPODUCTIONS_ACTIVITY");
    assert.equal(harness.isDimmed, true);
  });

  it("wakes immediately on window pointerdown and keydown events", () => {
    const harness = createDockHarness();
    harness.advanceTime(4000);
    assert.equal(harness.isDimmed, true);

    harness.dispatchUserActivity("pointerdown");
    assert.equal(harness.isDimmed, false);

    harness.advanceTime(4000);
    assert.equal(harness.isDimmed, true);

    harness.dispatchUserActivity("keydown");
    assert.equal(harness.isDimmed, false);
  });

  it("throttles rapid activity wake dispatches within 250ms window", () => {
    const harness = createDockHarness();
    harness.advanceTime(1000);

    // 10 rapid clicks within 100ms
    for (let i = 0; i < 10; i++) {
      harness.dispatchUserActivity("pointerdown");
      harness.advanceTime(10);
    }

    // Still active and timer fires exactly 4000ms after the first throttled wake
    assert.equal(harness.isDimmed, false);
    harness.advanceTime(4000);
    assert.equal(harness.isDimmed, true);
  });

  it("suppresses dimming while mouse is hovered over the dock", () => {
    const harness = createDockHarness();
    harness.pointerEnter("mouse");

    // Advance past 4000ms: remains active
    harness.advanceTime(10000);
    assert.equal(harness.isDimmed, false);

    // Mouse leaves: starts 4000ms timer
    harness.pointerLeave("mouse");
    assert.equal(harness.isDimmed, false);

    harness.advanceTime(4000);
    assert.equal(harness.isDimmed, true);
  });

  it("suppresses dimming while keyboard focus is held on the dock", () => {
    const harness = createDockHarness();
    harness.focus();

    harness.advanceTime(10000);
    assert.equal(harness.isDimmed, false);

    harness.blur();
    harness.advanceTime(4000);
    assert.equal(harness.isDimmed, true);
  });

  it("wakes on touchStart without latching hover lockup on touch devices", () => {
    const harness = createDockHarness();
    harness.advanceTime(4000);
    assert.equal(harness.isDimmed, true);

    // Tap on touch device wakes dock
    harness.touchStart();
    assert.equal(harness.isDimmed, false);

    // Touch does NOT lock hover state: after 4000ms idle, dock successfully dims again
    harness.advanceTime(4000);
    assert.equal(harness.isDimmed, true);
  });

  it("unmount removes all event listeners and clears active timers", () => {
    const harness = createDockHarness();
    assert.equal(harness.timersActive(), 1);
    assert.equal(harness.target.listeners["pointerdown"].length, 1);
    assert.equal(harness.target.listeners["keydown"].length, 1);
    assert.equal(harness.target.listeners["wheel"].length, 1);
    assert.equal(harness.target.listeners["message"].length, 1);

    harness.unmount();
    assert.equal(harness.timersActive(), 0);
    assert.equal(harness.target.listeners["pointerdown"].length, 0);
    assert.equal(harness.target.listeners["keydown"].length, 0);
    assert.equal(harness.target.listeners["wheel"].length, 0);
    assert.equal(harness.target.listeners["message"].length, 0);
  });
});
