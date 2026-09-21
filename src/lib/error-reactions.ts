export const ERROR_REACTION_ASSETS = [
  "/branding/studio-mascot-alarmed.png",
  "/branding/studio-mascot-sheepish.png",
  "/branding/studio-mascot-pensive.png",
] as const;

export type ErrorReactionAsset = (typeof ERROR_REACTION_ASSETS)[number];

const LAST_REACTION_KEY = "ropoductions:lastErrorReaction";

let previousReaction: ErrorReactionAsset | null = null;

function readStoredReaction(): ErrorReactionAsset | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.sessionStorage.getItem(LAST_REACTION_KEY);
    return ERROR_REACTION_ASSETS.find((asset) => asset === stored) ?? null;
  } catch {
    /* private mode: nothing stored, draw freely */
    return null;
  }
}

function persistReaction(asset: ErrorReactionAsset): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(LAST_REACTION_KEY, asset);
  } catch {
    /* private mode: variety still holds for the rest of the session */
  }
}

export function pickDistinctErrorReaction(
  previous: ErrorReactionAsset | null,
  random: number = Math.random()
): ErrorReactionAsset {
  const pool =
    previous === null
      ? ERROR_REACTION_ASSETS
      : ERROR_REACTION_ASSETS.filter((asset) => asset !== previous);
  const index = Math.min(Math.floor(random * pool.length), pool.length - 1);
  return pool[index];
}

/**
 * Draws the reaction for the next error appearance, never repeating the previous one so
 * two errors in a row cannot read as a stuck asset.
 */
export function pickNextErrorReaction(random: number = Math.random()): ErrorReactionAsset {
  const asset = pickDistinctErrorReaction(previousReaction ?? readStoredReaction(), random);
  previousReaction = asset;
  persistReaction(asset);
  return asset;
}
