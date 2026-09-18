import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel: string): string => readFileSync(join(rootDir, rel), "utf8");

describe("save import and reset dialogs contract (Story 4.4)", () => {
  const importDialogPath = "src/components/save-import-dialog.tsx";
  const resetDialogPath = "src/components/save-reset-dialog.tsx";
  const gameViewportPath = "src/components/game-viewport.tsx";

  it("exports SaveImportDialog and adheres to Radix Dialog accessibility contract", () => {
    assert.ok(existsSync(join(rootDir, importDialogPath)), "src/components/save-import-dialog.tsx must exist");
    const src = readSource(importDialogPath);

    assert.ok(src.includes("export function SaveImportDialog("), "Must export SaveImportDialog component");
    assert.ok(src.includes("@radix-ui/react-dialog"), "Must use Radix UI Dialog primitives");
    assert.ok(src.includes("Dialog.Root"), "Must use Dialog.Root");
    assert.ok(src.includes("Dialog.Portal"), "Must use Dialog.Portal");
    assert.ok(src.includes("Dialog.Overlay"), "Must use Dialog.Overlay");
    assert.ok(src.includes("Dialog.Content"), "Must use Dialog.Content");
    assert.ok(src.includes("Dialog.Title"), "Must use Dialog.Title");
    assert.ok(src.includes("Dialog.Description"), "Must use Dialog.Description");
    assert.ok(src.includes("Dialog.Close"), "Must use Dialog.Close");
    assert.ok(src.includes("container={container}"), "Dialog.Portal must forward container prop for fullscreen top-layer rendering");
    assert.ok(src.includes("SAVE_DIALOG_DISMISS_MS"), "Must use shared SAVE_DIALOG_DISMISS_MS instead of a magic timeout");
    assert.ok(!src.includes("NodeJS.Timeout"), "Browser dialog must not depend on NodeJS.Timeout typing");
  });

  it("SaveImportDialog provides keyboard-operable dropzone, file input, and error banner with spec testids", () => {
    const src = readSource(importDialogPath);

    assert.ok(src.includes('data-testid="save-import-dialog"'), "Must declare save-import-dialog testid");
    assert.ok(src.includes('data-testid="save-import-dropzone"'), "Must declare save-import-dropzone testid");
    assert.ok(src.includes('data-testid="save-import-file-input"'), "Must declare save-import-file-input testid");
    assert.ok(src.includes('data-testid="save-import-confirm-button"'), "Must declare save-import-confirm-button testid");
    assert.ok(src.includes('data-testid="save-import-error-banner"'), "Must declare save-import-error-banner testid");
    assert.ok(src.includes('role="alert"'), "Error banner must declare role='alert' for screen readers");
    assert.ok(src.includes('accept=".zip,.rpgsave'), "File input must accept .zip and .rpgsave files");
    assert.ok(src.includes('role="button"'), "Dropzone must expose role=button for keyboard users");
    assert.ok(src.includes("tabIndex={0}"), "Dropzone must be focusable via keyboard");
    assert.ok(src.includes("onKeyDown"), "Dropzone must handle Enter/Space keyboard activation");
    assert.ok(src.includes("getTargetWindow"), "Dialog must resolve the engine window via getter at click time");
    assert.ok(src.includes('t("saveImportSelectedFile"'), "Selected file must use the saveImportSelectedFile translation key");
    assert.ok(src.includes('t("saveImportError")'), "Invalid-format errors must map to the localized saveImportError copy");
    assert.ok(!src.includes("pointer-events-none"), "Dropzone affordance must remain interactive");
  });

  it("exports SaveResetDialog with destructive warning modal and 44px touch targets", () => {
    assert.ok(existsSync(join(rootDir, resetDialogPath)), "src/components/save-reset-dialog.tsx must exist");
    const src = readSource(resetDialogPath);

    assert.ok(src.includes("export function SaveResetDialog("), "Must export SaveResetDialog component");
    assert.ok(src.includes("@radix-ui/react-dialog"), "Must use Radix UI Dialog primitives");
    assert.ok(src.includes('data-testid="save-reset-dialog"'), "Must declare save-reset-dialog testid");
    assert.ok(src.includes('data-testid="save-reset-confirm-button"'), "Must declare save-reset-confirm-button testid");
    assert.ok(src.includes('data-testid="save-reset-cancel-button"'), "Must declare save-reset-cancel-button testid");
    assert.ok(src.includes("bg-[#E11D48]"), "Destructive confirmation button must declare #E11D48 crimson style");
    assert.ok(src.includes("min-h-[44px]"), "Buttons must respect 44px minimum touch target size");
    assert.ok(src.includes("container={container}"), "Dialog.Portal must forward container prop for fullscreen top-layer rendering");
    assert.ok(src.includes("getTargetWindow"), "Dialog must resolve the engine window via getter at click time");
    assert.ok(src.includes("SAVE_DIALOG_DISMISS_MS"), "Must use shared SAVE_DIALOG_DISMISS_MS instead of a magic timeout");
    assert.ok(src.includes("inFlightRef"), "Reset must guard against double-submit dispatches");
    assert.ok(!src.includes("NodeJS.Timeout"), "Browser dialog must not depend on NodeJS.Timeout typing");
  });

  it("integrates SaveImportDialog and SaveResetDialog into GameViewport and wires HUD triggers", () => {
    const src = readSource(gameViewportPath);

    assert.ok(src.includes("SaveImportDialog"), "GameViewport must import and mount SaveImportDialog");
    assert.ok(src.includes("SaveResetDialog"), "GameViewport must import and mount SaveResetDialog");
    assert.ok(src.includes("isImportOpen") || src.includes("importDialogOpen") || src.includes("setIsImportOpen"), "GameViewport must manage import dialog open state");
    assert.ok(src.includes("isResetOpen") || src.includes("resetDialogOpen") || src.includes("setIsResetOpen"), "GameViewport must manage reset dialog open state");
    assert.ok(src.includes("getEngineWindow"), "GameViewport must resolve the engine window lazily via getter");
    assert.ok(src.includes("getTargetWindow={getEngineWindow}"), "GameViewport must pass the engine window getter to dialogs");
    assert.ok(src.includes("container={portalElement}"), "GameViewport must supply a live portal element to dialogs for fullscreen rendering");
    assert.ok(!src.includes("targetWindow={iframeRef.current"), "Dialogs must not receive a stale render-time contentWindow snapshot");
    assert.ok(!src.includes("container={containerRef.current}"), "Dialogs must not receive a stale render-time container snapshot");
  });
});
