import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel: string): string => readFileSync(join(rootDir, rel), "utf8");

describe("game viewport and engine container contract", () => {
  const engineHtmlPath = "src/engine-plugins/mock-shell.html";
  const gameViewportPath = "src/components/game-viewport.tsx";

  it("provisions the same-origin lightweight engine shell harness at src/engine-plugins/mock-shell.html", () => {
    assert.ok(existsSync(join(rootDir, engineHtmlPath)), "src/engine-plugins/mock-shell.html must exist");
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

  it("renders a single tree in both modes so the engine frame is never re-parented", () => {
    const src = readSource(gameViewportPath);

    assert.ok(
      !src.includes("if (activeFullscreen) {"),
      "GameViewport must not branch into a second returned tree for fullscreen"
    );
    assert.equal(
      (src.match(/data-testid="game-viewport-container"/g) ?? []).length,
      1,
      "Exactly one viewport container may exist in the component source"
    );
    assert.equal(
      (src.match(/\{engineFrame\}/g) ?? []).length,
      1,
      "The engine frame must be placed exactly once, in one shared stage slot"
    );
  });

  it("keeps the container children slots constant and mode-switched by class names only", () => {
    const src = readSource(gameViewportPath);
    const slots = ["{stage}", "{dockArea}", "{fabSlot}", "{importDialog}", "{resetDialog}"];
    const positions = slots.map((slot) => src.indexOf(slot));

    assert.ok(
      positions.every((position) => position >= 0),
      `Every container slot must exist as a named element: ${slots.join(", ")}`
    );
    assert.deepEqual(
      positions,
      [...positions].sort((left, right) => left - right),
      "Container children must keep the constant order [stage, dockArea, fabSlot, importDialog, resetDialog]"
    );
  });

  it("sets the dialog portal container once against a stable viewport node", () => {
    const src = readSource(gameViewportPath);

    assert.match(
      src,
      /setPortalElement\(containerRef\.current\);\s*\},\s*\[\]\);/,
      "The portal element effect must run once with empty dependencies"
    );
  });

  it("manages fullscreen state with WebKit prefix fallbacks and delegates toggle to SaveHudDock", () => {
    const src = readSource(gameViewportPath);

    // In-container mounting: SaveHudDock is a child inside containerRef
    assert.ok(src.includes("ref={containerRef}"), "Container must attach containerRef");
    assert.ok(src.includes("<SaveHudDock"), "SaveHudDock must be mounted inside container");
    assert.ok(src.includes("onToggleFullscreen={toggleFullscreen}"), "Must delegate toggleFullscreen to SaveHudDock");
    assert.ok(src.includes("isFullscreen={activeFullscreen}"), "Must delegate activeFullscreen to SaveHudDock");

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
    assert.ok(src.includes("fixed inset-0 z-40"), "Active fullscreen must expand to fixed inset-0 z-40");
    assert.ok(src.includes("rounded-none border-0"), "Active fullscreen must strip rounded corners and borders");

    // Strict React Rules of Hooks compliance (no try/catch wrapping hooks)
    assert.ok(src.includes('const t = useTranslations("game");'), "Must invoke useTranslations unconditionally");

    // Prevent external element false positives
    assert.ok(src.includes("currentFsElem === containerRef.current"), "Must verify fullscreen element belongs to containerRef");
  });

  it("integrates the floating Save HUD dock with fullscreen state delegation and safe-area insets", () => {
    const src = readSource(gameViewportPath);

    assert.ok(src.includes("import { SaveHudDock }"), "GameViewport must import SaveHudDock");
    assert.ok(src.includes("<SaveHudDock"), "GameViewport must mount SaveHudDock component");
    assert.ok(
      src.includes("onToggleFullscreen={toggleFullscreen}"),
      "GameViewport must delegate toggleFullscreen handler to SaveHudDock"
    );
    assert.ok(
      src.includes("isFullscreen={activeFullscreen}"),
      "GameViewport must delegate activeFullscreen state to SaveHudDock"
    );
    assert.ok(
      src.includes("env(safe-area-inset-bottom)"),
      "SaveHudDock wrapper must respect env(safe-area-inset-bottom)"
    );
  });
  it("wires client save export via exportSaves and guards against unready iframe", () => {
    const src = readSource(gameViewportPath);

    assert.ok(src.includes("import { exportSaves }"), "GameViewport must import exportSaves");
    assert.ok(src.includes("onExport={handleExport}"), "GameViewport must wire handleExport to SaveHudDock");
    assert.ok(src.includes('throw new Error("Game engine iframe is not ready")'), "Must throw error if iframe targetWindow is unavailable");
  });


  it("renders the dock as a static sibling in standard layout and overlays it only in fullscreen", () => {
    const src = readSource(gameViewportPath);

    assert.ok(src.includes("isHudCollapsed"), "Must track user-invoked HUD collapse state");
    assert.ok(
      src.includes('data-testid="save-hud-collapse-fab"'),
      "Fullscreen overlay must expose a 44px collapse FAB"
    );
    assert.ok(src.includes("aria-expanded={!isHudCollapsed}"), "FAB must expose aria-expanded");
    assert.ok(src.includes("aria-controls={hudId}"), "FAB must expose aria-controls pointing at the dock");
    assert.ok(src.includes("h-11 w-11"), "FAB must meet the 44px touch target floor");

    const dockSlotStart = src.indexOf("const dockArea = (");
    const dockSlotEnd = src.indexOf("const fabSlot =", dockSlotStart);
    assert.ok(
      dockSlotStart >= 0 && dockSlotEnd > dockSlotStart,
      "The dock must be declared once as its own container slot"
    );
    const dockSlot = src.slice(dockSlotStart, dockSlotEnd);
    assert.ok(
      dockSlot.includes("flex w-full shrink-0 items-center justify-center"),
      "The single dock slot must carry the windowed static sibling classes"
    );
    assert.ok(
      dockSlot.includes(
        "absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-20 pointer-events-none"
      ),
      "The same dock slot must carry the fullscreen click-through overlay classes"
    );
    assert.ok(
      src.includes('[role="dialog"][data-state="open"]'),
      "Viewport Escape handler must no-op while a dialog is open"
    );
  });

  it("shows a determinate loading state while the engine boots", () => {
    const src = readSource(gameViewportPath);

    assert.ok(src.includes('role="progressbar"'), "Loading overlay must expose role=progressbar");
    assert.ok(src.includes("aria-valuenow"), "Loading overlay must expose aria-valuenow");
    assert.ok(src.includes("hud-load-pulse"), "Loading emblem may pulse as the sanctioned live-state exception");
    assert.ok(src.includes("motion-reduce:animate-none"), "Loading pulse must stop under reduced-motion");
    assert.ok(src.includes("onError={handleIframeError}"), "Iframe must surface load errors");
  });

  it("reboots the full document on renderer_init_failed retry instead of reloading only the frame", () => {
    const src = readSource(gameViewportPath);
    const branch = 'bootFailure?.failureClass === "renderer_init_failed"';

    assert.ok(src.includes(branch), "Retry must branch on the renderer_init_failed class");
    const branchAt = src.indexOf(branch);
    const reloadAt = src.indexOf("window.location.reload()", branchAt);
    const iframeReloadAt = src.indexOf("contentWindow?.location.reload()", branchAt);
    assert.ok(
      reloadAt !== -1 && (iframeReloadAt === -1 || reloadAt < iframeReloadAt),
      "A context-loss retry must reboot the document before any iframe-only reload"
    );
  });
});
