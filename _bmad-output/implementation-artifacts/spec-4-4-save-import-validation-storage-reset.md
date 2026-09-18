---
title: 'Story 4.4: Save Import Validation Dialog & Safe Storage Reset Modal'
type: 'feature'
created: '2026-09-18'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-ropoductions-web-2026-09-15/ARCHITECTURE-SPINE.md'
  - '_bmad-output/specs/spec-ropoductions-web/save-and-runtime-contract.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/DESIGN.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-ropoductions-web-2026-09-15/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Players playing the web client need the ability to restore their exported saves (`.zip` archives or `.rpgsave` files) across different browsers or devices, as well as safely reset browser storage if save state becomes corrupted or if they want a fresh run. Without client-side decompression and validation, uploading invalid or corrupted archives could break game engine storage or fail silently. Furthermore, resetting storage must be guarded by an accessible destructive confirmation modal with prominent warnings to prevent accidental data loss.

**Approach:**
1. Implement `src/lib/save-import.ts` with client-side decompression and validation:
   - Identifies `.zip` vs `.rpgsave` files.
   - Decompresses `.zip` archives with `JSZip`, validates entries against allowed slot keys (`file1`..`file20`, `global`, `config`), filters non-save files/metadata, and enforces the 10MB per-slot limit.
   - Emits the exact required error string: `"Invalid save file format. Please upload a valid .zip archive or .rpgsave file."` when an invalid or corrupt file is selected without mutating storage.
   - Dispatches validated save slots to the game engine iframe via `restoreSaves()` (`ROPODUCTIONS_SET_SAVES`).
2. Build `src/components/save-import-dialog.tsx`:
   - Accessible Radix UI Dialog modal (`@radix-ui/react-dialog`) styled with dark studio aesthetic (`#090A0F` backdrop with blur, `#121522` card surface, Studio Emerald `#22C55E` affirmative accents).
   - Drag-and-drop dropzone with file input fallback for `.zip` and `.rpgsave` files.
   - Accessible error banner (`role="alert"`) and success indicators.
   - 44x44px minimum touch targets and keyboard navigation.
3. Build `src/components/save-reset-dialog.tsx`:
   - Accessible Radix UI Dialog modal with prominent destructive warning banner.
   - `#E11D48` crimson styling on the confirmation CTA ("Reset All Saves").
   - Dispatches `resetSaves()` (`ROPODUCTIONS_RESET_SAVES`) through the bridge and confirms success.
4. Wire both dialogs in `src/components/game-viewport.tsx` so clicking Import or Reset on `SaveHudDock` triggers the respective modal.
5. Provide complete internationalization across all 6 locales (`en`, `es`, `ja`, `pl`, `ru`, `zh`).
6. Register all unit test suites in `package.json` under `test:unit` and verify 100% passing tests.

## Boundaries & Constraints

**Always:**
- Keep exact error string `"Invalid save file format. Please upload a valid .zip archive or .rpgsave file."` on invalid or corrupt uploads.
- Reject corrupt, empty, or unallowed files without mutating browser storage or dispatching bridge requests.
- Use Radix UI Dialog primitives for full accessibility (focus trap, ARIA dialog roles, escape dismissal).
- Enforce 44x44px touch targets on all interactive triggers.
- Translate all UI copy across all 6 supported locales (`en`, `es`, `ja`, `pl`, `ru`, `zh`).
- Zero emojis in UI or console messages.
- Run all tests before review.

**Never:**
- Never mutate storage or send bridge messages on invalid files.
- Never bypass destructive confirmation prompts on storage reset.
- Never hardcode English strings into UI components without translation keys.
