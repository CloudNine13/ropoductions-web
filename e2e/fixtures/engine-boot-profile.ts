import { ENGINE_RELEASE_PARAM } from "../../src/lib/engine-addressing";

/**
 * The boot request profile a published RPG Maker MZ 1.8.0 shell issues, replayed by
 * the e2e harness and by `tests/asset-burst.test.ts`.
 *
 * Measurements behind the shape (Epic 7 brief, §Evidence): one boot costs 65+ gated
 * requests — 13 core scripts, ~45 plugin scripts, the document's css/icon, the
 * Effekseer wasm, font files and the data JSONs — before the media tail.
 *
 * The upstream file names live only in the private bucket, so every entry is served
 * under a fixture-named path (`ropoductions-e2e-fixture`) that no published shell can
 * contain. Seeding therefore never overwrites a real game object, while the route,
 * the session gate and the cache policy under test are the production ones.
 */

/** Full-length lowercase sha256 shape: the cache policy keys off this. */
export const E2E_RELEASE_ID =
  "8e6a3fbd6ce4297158ca154ede5a6075dffe6fcbf988dc1df1c78f1af68d02ba";

export const FIXTURE_SEGMENT = "ropoductions-e2e-fixture";

/** Core boot scripts (`Main.loadMainScripts` + `scriptUrls`, MZ 1.8.0). */
const CORE_SCRIPT_SOURCES = [
  "js/libs/pixi.js",
  "js/libs/pixi-tilemap.js",
  "js/libs/pixi-picture.js",
  "js/libs/vibrant.js",
  "js/rmmz_core.js",
  "js/rmmz_scenes.js",
  "js/rmmz_windows.js",
  "js/rmmz_objects.js",
  "js/rmmz_sprites.js",
  "js/rmmz_managers.js",
  "js/plugins.js",
  "js/main.js",
  "js/libs/effekseer.min.js",
] as const;

/** The measured plugin-script count of one upstream boot. */
const PLUGIN_SOURCE_COUNT = 45;

export type BootProfileRoute = "shell" | "media";

export interface BootProfileRequest {
  /** R2 object key, relative to the bucket root. */
  key: string;
  /** Request path relative to the origin; media paths cross the engine rewrite. */
  url: string;
  route: BootProfileRoute;
  /** Whether the URL carries the release identifier. */
  addressed: boolean;
  contentType: string;
  /** The upstream path this fixture stands in for. */
  represents: string;
  /** The fixture bytes the harness seeds into R2. */
  body: string;
}

function fixtureBody(key: string): string {
  return `/* ${FIXTURE_SEGMENT} fixture: ${key} */\n`;
}

function addressedUrl(path: string): string {
  return `/engine/${path}?${ENGINE_RELEASE_PARAM}=${E2E_RELEASE_ID}`;
}

function shellEntry(path: string, contentType: string, represents: string): BootProfileRequest {
  return {
    key: path,
    url: addressedUrl(path),
    route: "shell",
    addressed: true,
    contentType,
    represents,
    body: fixtureBody(path),
  };
}

function mediaEntry(path: string, contentType: string, represents: string): BootProfileRequest {
  return {
    key: path,
    url: `/engine/${path}`,
    route: "media",
    addressed: false,
    contentType,
    represents,
    body: fixtureBody(path),
  };
}

const CORE_SCRIPT_ENTRIES: BootProfileRequest[] = CORE_SCRIPT_SOURCES.map((source, index) =>
  shellEntry(
    `js/${FIXTURE_SEGMENT}/core-${String(index + 1).padStart(2, "0")}.js`,
    "text/javascript",
    source
  )
);

const PLUGIN_ENTRIES: BootProfileRequest[] = Array.from(
  { length: PLUGIN_SOURCE_COUNT },
  (_, index) =>
    shellEntry(
      `js/${FIXTURE_SEGMENT}/plugins/plugin-${String(index + 1).padStart(2, "0")}.js`,
      "text/javascript",
      `js/plugins/upstream-plugin-${String(index + 1).padStart(2, "0")}.js`
    )
);

/**
 * The document the harness serves for the addressed-shell reload measurement. It is
 * requested without an identifier, so it mirrors the published document's
 * revalidating cache, and every reference it carries is addressed.
 */
export const SHELL_FIXTURE_KEY = `js/${FIXTURE_SEGMENT}/shell.html`;
export const SHELL_FIXTURE_URL = `/engine/${SHELL_FIXTURE_KEY}`;

const DOCUMENT_CSS_ENTRY = shellEntry(
  `css/${FIXTURE_SEGMENT}/game.css`,
  "text/css",
  "css/game.css"
);
const DOCUMENT_ICON_ENTRY = shellEntry(
  `icon/${FIXTURE_SEGMENT}/icon.png`,
  "image/png",
  "icon/icon.png"
);

const REMAINING_SHELL_ENTRIES: BootProfileRequest[] = [
  shellEntry(`js/${FIXTURE_SEGMENT}/libs/effekseer.wasm`, "application/wasm", "js/libs/effekseer.wasm"),
  shellEntry(`fonts/${FIXTURE_SEGMENT}/mplus-1m-regular.woff`, "font/woff", "fonts/mplus-1m-regular.woff"),
  shellEntry(`fonts/${FIXTURE_SEGMENT}/mplus-1m-bold.woff`, "font/woff", "fonts/mplus-1m-bold.woff"),
];

const MEDIA_ENTRIES: BootProfileRequest[] = [
  mediaEntry(`data/${FIXTURE_SEGMENT}/System.json`, "application/json", "data/System.json"),
  mediaEntry(`data/${FIXTURE_SEGMENT}/MapInfos.json`, "application/json", "data/MapInfos.json"),
  mediaEntry(`data/${FIXTURE_SEGMENT}/Tilesets.json`, "application/json", "data/Tilesets.json"),
  mediaEntry(`data/${FIXTURE_SEGMENT}/CommonEvents.json`, "application/json", "data/CommonEvents.json"),
  mediaEntry(`img/${FIXTURE_SEGMENT}/system/Load1.png`, "image/png", "img/system/Load/Load1.png"),
  mediaEntry(`img/${FIXTURE_SEGMENT}/pictures/cursor.png`, "image/png", "img/pictures/cursor.png"),
];

/** The document itself: shell-routed, unaddressed, session-gated. */
export const SHELL_FIXTURE_DOCUMENT: BootProfileRequest = {
  key: SHELL_FIXTURE_KEY,
  url: SHELL_FIXTURE_URL,
  route: "shell",
  addressed: false,
  contentType: "text/html",
  represents: "index.html",
  body: "",
};

/** Every request one boot issues, in the order MZ reaches it. */
export const ENGINE_BOOT_PROFILE: BootProfileRequest[] = [
  SHELL_FIXTURE_DOCUMENT,
  DOCUMENT_CSS_ENTRY,
  DOCUMENT_ICON_ENTRY,
  ...CORE_SCRIPT_ENTRIES,
  ...PLUGIN_ENTRIES,
  ...REMAINING_SHELL_ENTRIES,
  ...MEDIA_ENTRIES,
];

/** Addressed shell subresources the fixture document references, so a reload proves their cache. */
export const DOCUMENT_REFERENCED_SHELL_REQUESTS: BootProfileRequest[] = [
  DOCUMENT_CSS_ENTRY,
  DOCUMENT_ICON_ENTRY,
  ...CORE_SCRIPT_ENTRIES,
  ...PLUGIN_ENTRIES,
];

export function shellFixtureDocument(): string {
  const css = DOCUMENT_CSS_ENTRY;
  const icon = DOCUMENT_ICON_ENTRY;
  const scripts = DOCUMENT_REFERENCED_SHELL_REQUESTS.filter(
    (entry) => entry !== css && entry !== icon
  );
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8">',
    "<title>Engine shell fixture</title>",
    `<link rel="stylesheet" href="${css.url}">`,
    `<link rel="icon" href="${icon.url}">`,
    "</head>",
    "<body>",
    ...scripts.map((entry) => `<script src="${entry.url}"></script>`),
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export function seededShellFixture(): BootProfileRequest[] {
  return [
    { ...SHELL_FIXTURE_DOCUMENT, body: shellFixtureDocument() },
    ...DOCUMENT_REFERENCED_SHELL_REQUESTS,
    ...REMAINING_SHELL_ENTRIES,
    ...MEDIA_ENTRIES,
  ];
}
