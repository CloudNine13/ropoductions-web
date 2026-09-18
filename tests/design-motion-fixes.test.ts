import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel: string): string => readFileSync(join(rootDir, rel), "utf8");

const FOCUS_RING =
  "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";

describe("design-motion contract fixes (story 4-2 review)", () => {
  it("keeps the paywall modal close on the 44px touch target floor", () => {
    const src = readSource("src/components/paywall-modal.tsx");
    assert.ok(src.includes("h-11 w-11"), "Modal close must declare h-11 w-11");
    assert.ok(!src.includes("h-9 w-9"), "Modal close must NOT stay at h-9 w-9");
  });

  it("pins the reduced-motion kill-switch and age-gate reduce guard in globals.css", () => {
    const src = readSource("src/app/globals.css");
    assert.ok(
      src.includes("@media (prefers-reduced-motion: reduce)"),
      "Must declare the reduced-motion guard"
    );
    assert.ok(
      src.includes(".age-gate-overlay,.age-gate-content") ||
        src.includes(".age-gate-overlay,"),
      "Must collapse age-gate animation duration under reduced-motion"
    );
    assert.ok(
      src.includes("transition-duration: 0ms !important"),
      "Global kill-switch must zero transition durations"
    );
    assert.ok(
      src.includes("animation-iteration-count: 1 !important"),
      "Global kill-switch must stop infinite iterations"
    );
  });

  it("declares high-visibility focus rings on hero, showcase, social, and header triggers", () => {
    for (const rel of [
      "src/components/hero-section.tsx",
      "src/components/project-showcase.tsx",
      "src/components/social-hub.tsx",
      "src/components/studio-header.tsx",
    ]) {
      const src = readSource(rel);
      assert.ok(src.includes(FOCUS_RING), `${rel} must declare the canonical focus ring`);
    }
  });

  it("keeps the age-gate disclaimer at readable size and full strength", () => {
    const src = readSource("src/components/age-gate-dialog.tsx");
    assert.ok(!src.includes("text-[11px]"), "Disclaimer must NOT render below 12px");
    assert.ok(src.includes("text-xs text-muted-foreground"), "Disclaimer must use text-xs at full strength");
    assert.ok(src.includes("text-balance"), "Disclaimer must balance line breaks");
  });

  it("localizes gallery expand labels and returns focus to the invoking card", () => {
    const src = readSource("src/components/project-showcase.tsx");
    assert.ok(
      src.includes('aria-label={`${t("expandScreenshot")}: ${shot.title}`}'),
      "Gallery cards must build aria-label from the localized expandScreenshot key"
    );
    assert.ok(!src.includes("Open full screenshot preview"), "Gallery cards must NOT hardcode English labels");
    assert.ok(src.includes("triggerRefs"), "Showcase must track gallery triggers for focus return");
    assert.ok(
      src.includes("requestAnimationFrame(() => trigger?.focus())"),
      "Lightbox close must return focus via requestAnimationFrame"
    );
  });

  it("names the language trigger with the active locale and keeps menuitemradios direct", () => {
    const src = readSource("src/components/language-switcher.tsx");
    assert.ok(src.includes("Globe"), "Trigger must render the canonical Globe icon");
    assert.ok(
      src.includes('aria-label={`${t("select")}: ${activeLocaleInfo.nativeName}`}'),
      "Trigger name must include the active locale"
    );
    assert.ok(!src.includes("role=\"group\""), "menuitemradio options must be direct children of menu");
    assert.ok(src.includes("rounded-lg border border-border bg-card/95"), "Dropdown must use token lg radius");
  });

  it("keeps the auth toast on the destructive token without a conflicting live region", () => {    const src = readSource("src/components/auth-error-toast.tsx");
    assert.ok(src.includes('role="alert"'), "Toast must keep role=alert");
    assert.ok(!src.includes("aria-live"), "Toast must NOT double-announce with aria-live=polite");
    assert.ok(!src.includes("rose-"), "Toast must NOT use the retired rose palette");
    assert.ok(src.includes("border-destructive/50"), "Toast must use the destructive border token");
    assert.ok(src.includes("text-destructive"), "Toast must use the destructive text token");
  });

  it("renders gallery cards as articles with an inner expand button and vector-safe images", () => {
    const src = readSource("src/components/project-showcase.tsx");
    assert.ok(src.includes("<article"), "Gallery cards must use the article root");
    assert.ok(
      src.includes('<span className="font-display text-xs sm:text-sm font-bold'),
      "Gallery card titles must render as styled spans, never headings"
    );
    assert.ok(src.includes("Images"), "Gallery header must use the Images icon");
    assert.ok(src.includes("text-primary"), "Character badges must NOT use tier-gold");
    assert.ok(!src.includes("group-hover:scale-105"), "Pixel art must NOT scale on hover");
    assert.ok(!src.includes("pixelated object-cover"), "Vector gallery assets must NOT use pixelated");
  });

  it("keeps the kicker budget at one eyebrow per section with two showcase badges max", () => {
    const showcase = readSource("src/components/project-showcase.tsx");
    assert.ok(showcase.includes("{t(\"badgeRpgMaker\")}"), "Showcase keeps the engine badge");
    assert.ok(showcase.includes("{t(\"badgePatronAccess\")}"), "Showcase keeps the access badge");
    assert.ok(!showcase.includes("{t(\"badgeHtml5\")}</span>"), "HTML5 badge must fold into caption prose");
    assert.ok(!showcase.includes("{t(\"badgeActiveChapter\")}</span>"), "Chapter badge must fold into caption prose");
    const social = readSource("src/components/social-hub.tsx");
    assert.ok(
      social.includes('aria-label={t("officialChannels")}'),
      "Social kicker must demote to a section label plus caption"
    );
    assert.ok(!social.includes("rounded-full border border-border bg-card"), "Social must NOT keep the kicker pill");
  });

  it("reserves tier-gold for patron signals and the icon map for social channels", () => {
    const social = readSource("src/components/social-hub.tsx");
    assert.ok(social.includes("icon: Lock,"), "Patreon channel must use the Lock icon");
    assert.ok(social.includes("icon: MessagesSquare,"), "Discord channel must use MessagesSquare");
    assert.ok(social.includes("icon: AtSign,"), "X channel must use AtSign");
    assert.ok(social.includes("lg:grid-cols-3"), "Social grid must break to three columns at lg");
    const play = readSource("src/app/(game)/play/page.tsx");
    assert.ok(play.includes("border-tier-gold/40"), "Session tier pill must use tier-gold");
    assert.ok(!play.includes("Sparkles"), "Session tier pill must NOT use Sparkles");
    assert.ok(play.includes("max-w-[38vw]"), "Session tier pill must truncate long tier names");
  });
});
