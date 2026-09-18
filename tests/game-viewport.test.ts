import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel: string): string => readFileSync(join(rootDir, rel), "utf8");

describe("game viewport and engine container contract", () => {
  const engineHtmlPath = "public/engine/index.html";
  const gameViewportPath = "src/components/game-viewport.tsx";

  it("provisions the same-origin lightweight engine shell at public/engine/index.html", () => {
    assert.ok(existsSync(join(rootDir, engineHtmlPath)), "public/engine/index.html must exist");
    const html = readSource(engineHtmlPath);

    assert.ok(html.includes("<!DOCTYPE html>"), "Must be a valid HTML5 document");
    assert.ok(html.includes('<canvas id="gameCanvas" width="1280" height="720"></canvas>'), "Must declare 1280x720 game canvas");
    assert.ok(html.includes("aspect-ratio: 16 / 9;"), "Engine container must enforce 16:9 aspect ratio");
    assert.ok(html.includes("touch-action: manipulation;"), "Engine document must suppress 300ms double-tap zoom delay");
    assert.ok(html.includes("overscroll-behavior: none;"), "Engine document must suppress mobile pull-to-refresh");
    assert.ok(html.includes("touch-action: none;"), "Game canvas must suppress browser gestures for direct coordinate mapping");
  });

  it("safely handles touch and pointer coordinates with pillarbox/letterbox scaling in engine script", () => {
    const html = readSource(engineHtmlPath);

    // Guard array index access
    assert.ok(html.includes("e.touches && e.touches.length > 0"), "Must guard e.touches length before indexing [0]");
    // PointerEvent deduplication
    assert.ok(html.includes("window.PointerEvent"), "Must check window.PointerEvent to avoid redundant listener triggers");
    // Letterbox/pillarbox aspect ratio calculation
    assert.ok(html.includes("canvasAspect = canvas.width / canvas.height"), "Must compute canvasAspect");
    assert.ok(html.includes("elementAspect = rect.width / rect.height"), "Must compute elementAspect");
  });

  it("configures the same-origin iframe with strict security sandbox and feature policies", () => {
    assert.ok(existsSync(join(rootDir, gameViewportPath)), "src/components/game-viewport.tsx must exist");
    const src = readSource(gameViewportPath);

    // Same-origin path constraint
    assert.ok(
      src.includes('engineSrc = "/engine/index.html"') || src.includes('src={engineSrc}'),
      "Iframe must default to same-origin path /engine/index.html"
    );

    // Feature policy delegation: fullscreen, autoplay, gamepad
    assert.ok(src.includes('allow="fullscreen; autoplay; gamepad"'), "Must delegate fullscreen, autoplay, and gamepad permissions");

    // Sandbox tokens: script execution and same-origin storage allowed
    assert.ok(src.includes("allow-scripts"), "Sandbox must allow scripts for MZ runtime");
    assert.ok(src.includes("allow-same-origin"), "Sandbox must allow same-origin for IndexedDB (rmmz_save)");
    assert.ok(src.includes("allow-forms"), "Sandbox must allow form submission");
    assert.ok(src.includes("allow-downloads"), "Sandbox must allow save file export downloads");
    assert.ok(src.includes("allow-pointer-lock"), "Sandbox must allow pointer lock for mouse capture");
    assert.ok(src.includes("allow-orientation-lock"), "Sandbox must allow mobile orientation lock");

    // Anti-hijacking security boundary: strictly no top-level navigation
    assert.ok(!src.includes("allow-top-navigation"), "Sandbox MUST NOT include allow-top-navigation");
    assert.ok(!src.includes("allow-top-navigation-by-user-activation"), "Sandbox MUST NOT include allow-top-navigation-by-user-activation");
  });

  it("enforces 16:9 aspect ratio locking and prevents vertical scrollbar overflow", () => {
    const src = readSource(gameViewportPath);

    assert.ok(src.includes("aspect-[16/9]"), "Viewport container must enforce 16:9 aspect ratio");
    assert.ok(src.includes("max-h-full"), "Viewport container must not exceed available vertical space");
    assert.ok(src.includes("max-w-full"), "Viewport container must not exceed available horizontal space");
    assert.ok(src.includes("w-auto"), "Viewport container must use w-auto to prevent aspect ratio collapse in flex parent");
    assert.ok(src.includes("overflow-hidden"), "Container must prevent overflow scrollbars");
    assert.ok(src.includes("touch-manipulation"), "Container must declare touch-manipulation");
  });

  it("mounts the Fullscreen toggle inside the container with WebKit prefix fallbacks and safe-area insets", () => {
    const src = readSource(gameViewportPath);

    // In-container mounting: toggle button is a child inside containerRef
    assert.ok(src.includes("ref={containerRef}"), "Container must attach containerRef");
    assert.ok(src.includes('data-testid="fullscreen-toggle-button"'), "Fullscreen toggle button must be present");
    assert.ok(src.includes("min-h-[44px] min-w-[44px]"), "Fullscreen toggle must maintain minimum 44x44px touch target");

    // Safe area insets for mobile notches / dynamic islands
    assert.ok(src.includes("env(safe-area-inset-top)"), "Toggle button must respect safe-area-inset-top");
    assert.ok(src.includes("env(safe-area-inset-right)"), "Toggle button must respect safe-area-inset-right");

    // Cross-browser WebKit prefixes and rejection handling
    assert.ok(src.includes("webkitFullscreenElement"), "Must check webkitFullscreenElement for Safari");
    assert.ok(src.includes("webkitRequestFullscreen"), "Must support webkitRequestFullscreen for Safari");
    assert.ok(src.includes("webkitExitFullscreen"), "Must support webkitExitFullscreen for Safari");
    assert.ok(src.includes("fullscreenchange"), "Must listen to standard fullscreenchange event");
    assert.ok(src.includes("webkitfullscreenchange"), "Must listen to webkitfullscreenchange event");
    assert.ok(src.includes("fullscreenerror"), "Must listen to fullscreenerror event");
    assert.ok(src.includes("webkitfullscreenerror"), "Must listen to webkitfullscreenerror event");

    // iOS Safari fallback (pseudo-fullscreen)
    assert.ok(src.includes("isPseudoFullscreen"), "Must implement pseudo-fullscreen fallback for iOS Safari");
    assert.ok(src.includes("fixed inset-0 z-50"), "Active fullscreen must expand to fixed inset-0 z-50");
    assert.ok(src.includes("rounded-none border-0"), "Active fullscreen must strip rounded corners and borders");

    // Strict React Rules of Hooks compliance (no try/catch wrapping hooks)
    assert.ok(src.includes('const t = useTranslations("game");'), "Must invoke useTranslations unconditionally");

    // Prevent external element false positives
    assert.ok(src.includes("currentFsElem === containerRef.current"), "Must verify fullscreen element belongs to containerRef");

    // Icons: Maximize2 and Minimize2 toggles
    assert.ok(src.includes("Maximize2"), "Must render Maximize2 icon when windowed");
    assert.ok(src.includes("Minimize2"), "Must render Minimize2 icon when fullscreen");
  });
});
