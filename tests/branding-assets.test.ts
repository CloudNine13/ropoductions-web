import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ERROR_REACTION_ASSETS,
  pickDistinctErrorReaction,
  pickNextErrorReaction,
} from "@/lib/error-reactions";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel: string): string => readFileSync(join(rootDir, rel), "utf8");

const ERROR_MESSAGE_SURFACES = [
  "src/components/auth-error-toast.tsx",
  "src/components/save-import-dialog.tsx",
  "src/components/save-reset-dialog.tsx",
  "src/components/admin/revoke-override-button.tsx",
];

const EMBLEM_SURFACES = [
  "src/components/hero-section.tsx",
  "src/components/studio-header.tsx",
  "src/components/studio-footer.tsx",
  "src/components/game-viewport.tsx",
];

describe("error reaction art contract", () => {
  it("ships every reaction asset inside public/branding", () => {
    for (const asset of ERROR_REACTION_ASSETS) {
      assert.ok(existsSync(join(rootDir, "public", asset)), `${asset} must exist in public/branding`);
    }
  });

  it("reaches every reaction from a free draw and clamps out-of-range draws", () => {
    const drawn = new Set([
      pickDistinctErrorReaction(null, 0),
      pickDistinctErrorReaction(null, 0.5),
      pickDistinctErrorReaction(null, 0.999),
    ]);
    assert.equal(drawn.size, ERROR_REACTION_ASSETS.length, "Every reaction must be reachable from a draw");
    assert.equal(pickDistinctErrorReaction(null, 0), ERROR_REACTION_ASSETS[0], "Zero must select the first reaction");
    assert.equal(
      pickDistinctErrorReaction(null, 1),
      ERROR_REACTION_ASSETS[ERROR_REACTION_ASSETS.length - 1],
      "An out-of-range draw must clamp instead of returning undefined"
    );
  });

  it("excludes the previous reaction from every draw", () => {
    for (const previous of ERROR_REACTION_ASSETS) {
      for (const random of [0, 0.25, 0.5, 0.75, 1]) {
        assert.notEqual(
          pickDistinctErrorReaction(previous, random),
          previous,
          "A draw must never repeat the reaction that was just shown"
        );
      }
    }
  });

  it("never repeats the same reaction on consecutive error appearances", () => {
    const drawn = Array.from({ length: 12 }, () => pickNextErrorReaction(0));
    for (let i = 1; i < drawn.length; i += 1) {
      assert.notEqual(drawn[i], drawn[i - 1], "Consecutive errors must not show the same face");
    }
    assert.ok(
      drawn.every((asset) => ERROR_REACTION_ASSETS.includes(asset)),
      "Every draw must come from the shipped reaction set"
    );
  });

  it("renders the shared reaction art inside every error message", () => {
    for (const rel of ERROR_MESSAGE_SURFACES) {
      const src = readSource(rel);
      assert.ok(src.includes("<ErrorReactionIcon"), `${rel} must render ErrorReactionIcon in its error message`);
      assert.ok(src.includes('role="alert"'), `${rel} must keep role="alert" on the error message`);
    }
  });

  it("draws the reaction on the client instead of committing to one on the server", () => {
    const src = readSource("src/components/error-reaction-icon.tsx");
    assert.ok(src.includes("pickNextErrorReaction()"), "Icon must draw a fresh reaction per appearance");
    assert.ok(src.includes("useEffect"), "The draw must happen after hydration to keep server markup stable");
    assert.ok(!src.includes("ERROR_REACTION_ASSETS[0]"), "Icon must not fall back to a fixed reaction");
  });
});

describe("emblem art contract", () => {
  it("serves an animated hero emblem with a static reduced-motion fallback", () => {
    const hero = readSource("src/components/hero-section.tsx");
    assert.ok(hero.includes('"/branding/studio-logo-animated.gif"'), "Hero must reference the animated emblem");
    assert.ok(hero.includes("motion-reduce:hidden"), "Animated emblem must be hidden under reduced motion");
    assert.ok(hero.includes("motion-reduce:block"), "Static emblem must replace it under reduced motion");
    for (const asset of ["/branding/studio-logo-animated.gif", "/branding/studio-logo.png"]) {
      assert.ok(existsSync(join(rootDir, "public", asset)), `${asset} must exist in public/branding`);
    }
  });

  it("points the browser tab icon at a shipped emblem asset", () => {
    const layout = readSource("src/app/layout.tsx");
    const declared = [...layout.matchAll(/"(\/branding\/[^"]+\.(?:png|webp|gif))"/g)].map((match) => match[1]);
    assert.ok(declared.length > 0, "The layout must declare at least one branding asset as the tab icon");
    assert.ok(declared.includes("/branding/studio-logo.png"), "The tab icon must be the studio emblem");
    for (const asset of declared) {
      assert.ok(existsSync(join(rootDir, "public", asset)), `${asset} must exist in public/branding`);
    }
  });

  it("keeps every emblem free of the emerald glow filter", () => {
    const emeraldGlow = /drop-shadow-\[0_0_\d+px_rgba\(34,197,94/;
    for (const rel of EMBLEM_SURFACES) {
      const src = readSource(rel);
      assert.ok(
        !emeraldGlow.test(src),
        `${rel} must not glow the emblem: the filter paints a halo around its transparent box`
      );
    }
  });
});
