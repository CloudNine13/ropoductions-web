import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel: string): string => readFileSync(join(rootDir, rel), "utf8");

describe("floating frosted-glass save hud dock contract (Story 4.2)", () => {
  const saveHudPath = "src/components/save-hud-dock.tsx";
  const gameViewportPath = "src/components/game-viewport.tsx";

  it("exports SaveHudDock component and DEFAULT_IDLE_TIMEOUT_MS constant", () => {
    assert.ok(existsSync(join(rootDir, saveHudPath)), "src/components/save-hud-dock.tsx must exist");
    const src = readSource(saveHudPath);
    assert.ok(src.includes("export const DEFAULT_IDLE_TIMEOUT_MS = 4000;"), "Default idle timeout must be exactly 4000ms (4s per AC)");
    assert.ok(src.includes("export function SaveHudDock("), "Must export SaveHudDock component");
  });

  it("enforces frosted-glass styling tokens and rounded-full pill elevation", () => {
    const src = readSource(saveHudPath);

    // Frosted glass background: bg-black/75 backdrop-blur-md rounded-full
    assert.ok(src.includes("bg-black/75"), "Must declare bg-black/75 frosted background");
    assert.ok(src.includes("backdrop-blur-md"), "Must declare backdrop-blur-md for frosted glass effect");
    assert.ok(src.includes("rounded-full"), "Must declare rounded-full pill ergonomics");
    assert.ok(src.includes("border border-white/10"), "Must declare subtle 1px white/10 border stroke");
    assert.ok(src.includes("shadow-2xl"), "Must declare shadow-2xl elevation");
  });

  it("enforces smooth auto-dimming to opacity 0.25 after 4 seconds of idle time", () => {
    const src = readSource(saveHudPath);

    // Dimming opacity values
    assert.ok(src.includes("opacity: isDimmed ? 0.25 : 1"), "Must set inline style opacity to 0.25 when dimmed and 1 when active");
    assert.ok(src.includes('isDimmed ? "opacity-25" : "opacity-100"'), "Must reflect opacity-25 and opacity-100 Tailwind classes");
    assert.ok(src.includes("data-dimmed"), "Must declare data-dimmed state attribute for DOM querying");

    // Smooth transition
    assert.ok(src.includes("transition-opacity"), "Must declare transition-opacity for smooth fade");
    assert.ok(src.includes("duration-300"), "Must declare transition duration");
    assert.ok(src.includes("ease-out"), "Must declare ease-out curve");

    // 4 second timer binding
    assert.ok(src.includes("idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS"), "Must default idle timeout to 4000ms");
    assert.ok(src.includes("setTimeout"), "Must schedule dimming with setTimeout");
    assert.ok(src.includes("clearTimeout"), "Must clear active timer on activity or unmount");
  });

  it("listens to active gameplay interactions and restores opacity 1.0 instantly", () => {
    const src = readSource(saveHudPath);

    // Activity event listeners on window
    const expectedEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "pointerdown",
      "wheel",
      "scroll",
    ];

    for (const evt of expectedEvents) {
      assert.ok(src.includes(`"${evt}"`), `Must listen for ${evt} user activity`);
    }

    // Cleanup on unmount
    assert.ok(src.includes("removeEventListener"), "Must clean up all event listeners on unmount");
    assert.ok(src.includes("clearTimer"), "Must clear timer on unmount");
  });

  it("restores full opacity immediately on dock hover, focus, or tap", () => {
    const src = readSource(saveHudPath);

    // Hover and tap listeners on dock container
    assert.ok(src.includes("onMouseEnter={handleMouseEnter}"), "Must restore opacity on mouse enter");
    assert.ok(src.includes("onMouseLeave={handleMouseLeave}"), "Must restart idle timer on mouse leave");
    assert.ok(src.includes("onFocus={handleFocus}"), "Must restore opacity and hold on keyboard focus");
    assert.ok(src.includes("onBlur={handleBlur}"), "Must restart idle timer when focus leaves dock");
    assert.ok(src.includes("onTouchStart={handleMouseEnter}"), "Must restore opacity on touch tap");
    assert.ok(src.includes("onTouchEnd={handleMouseLeave}"), "Must resume idle timer on touch end");
    assert.ok(src.includes("onTouchCancel={handleMouseLeave}"), "Must resume idle timer on touch cancel");
    // Holds full opacity while hovered or focused
    assert.ok(src.includes("isHoveredOrFocusedRef"), "Must track hover/focus ref to prevent dimming while interacting with dock");
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
    assert.ok(src.includes('data-testid="save-hud-fullscreen-button"'), "Must declare fullscreen button with testid");
    assert.ok(src.includes('data-testid="save-hud-reset-button"'), "Must declare reset button with testid");

    // Icon rendering in JSX
    assert.ok(src.includes("<Download"), "Must render Download icon element");
    assert.ok(src.includes("<Upload"), "Must render Upload icon element");
    assert.ok(src.includes("<Maximize2"), "Must render Maximize2 icon element when windowed");
    assert.ok(src.includes("<Minimize2"), "Must render Minimize2 icon element when fullscreen");
    assert.ok(src.includes("<RotateCcw"), "Must render RotateCcw icon element");
  });

  it("enforces strict 44x44px minimum touch target size across all action buttons", () => {
    const src = readSource(saveHudPath);

    // Each button must include min-h-[44px] min-w-[44px]
    const buttonMatches = src.match(/min-h-\[44px\]\s+min-w-\[44px\]/g);
    assert.ok(buttonMatches, "Must declare min-h-[44px] min-w-[44px] touch target classes");
    assert.ok(
      buttonMatches.length >= 4,
      `All 4 action buttons must declare min-h-[44px] min-w-[44px] (found ${buttonMatches.length})`
    );
  });

  it("provides accessibility semantics, keyboard focus rings, and toolbar role", () => {
    const src = readSource(saveHudPath);

    // WAI-ARIA toolbar role
    assert.ok(src.includes('role="toolbar"'), "Save HUD dock must declare role=toolbar");
    assert.ok(src.includes("aria-label="), "Save HUD dock must declare aria-label");

    // Accessible name and tooltip title on all 4 buttons
    assert.ok(src.includes("aria-label={resolvedLabels.export}"), "Export button must declare aria-label");
    assert.ok(src.includes("title={resolvedLabels.export}"), "Export button must declare title tooltip");
    assert.ok(src.includes("aria-label={resolvedLabels.import}"), "Import button must declare aria-label");
    assert.ok(src.includes("title={resolvedLabels.import}"), "Import button must declare title tooltip");
    assert.ok(src.includes("aria-label={resolvedLabels.reset}"), "Reset button must declare aria-label");
    assert.ok(src.includes("title={resolvedLabels.reset}"), "Reset button must declare title tooltip");
    // Keyboard focus rings
    assert.ok(src.includes("focus-visible:ring-2"), "Buttons must declare high-visibility focus-visible ring");
    assert.ok(src.includes("focus-visible:outline-none"), "Buttons must strip default outline in favor of focus ring");

    // Button types
    const typeButtons = src.match(/type="button"/g);
    assert.ok(typeButtons && typeButtons.length >= 4, "All action buttons must declare type=button");
  });

  it("supports callback props for onExport, onImport, onReset, and onToggleFullscreen", () => {
    const src = readSource(saveHudPath);

    assert.ok(src.includes("onClick={onExport}"), "Export button must attach onExport callback");
    assert.ok(src.includes("onClick={onImport}"), "Import button must attach onImport callback");
    assert.ok(src.includes("onClick={onToggleFullscreen}"), "Fullscreen button must attach onToggleFullscreen callback");
    assert.ok(src.includes("onClick={onReset}"), "Reset button must attach onReset callback");
  });

  it("mounts SaveHudDock inside GameViewport at bottom with safe-area padding", () => {
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
  });
});
