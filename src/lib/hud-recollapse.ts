/**
 * Collapse policy for the save dock's fullscreen overlay (owner decision Q13,
 * DESIGN amendment A-2026-09-21-01). The timer mechanics live in SaveHudDock;
 * the two precedence rules live here so they stay testable without a DOM.
 */

/** A re-collapse countdown only ever runs for an expanded dock inside fullscreen. */
export function shouldArmHudRecollapse(collapsed: boolean, isFullscreen: boolean): boolean {
  return !collapsed && isFullscreen;
}

/** An in-flight export, an open save dialog, or chrome the user is actively holding
 * (hover or focus-within) keeps the expanded dock on screen past the idle window. */
export function shouldHoldHudRecollapse(
  exporting: boolean,
  dialogOpen: boolean,
  chromeActive: boolean
): boolean {
  return exporting || dialogOpen || chromeActive;
}
