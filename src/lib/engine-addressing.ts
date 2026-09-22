/**
 * Engine shell release addressing.
 *
 * Game versioning belongs to the publish pipeline, never to the runtime:
 * `scripts/sync-game-release.ts` computes a content digest of the staged shell and
 * bakes it into every shell subresource reference it publishes, so a browser cache
 * key changes with the bytes and nothing else. The runtime only applies a cache
 * policy to the URL shape the pipeline produced — it never resolves, compares or
 * stores a release (`engine-browser-compat.md` §2).
 */

/** Query parameter that carries the release identifier. */
export const ENGINE_RELEASE_PARAM = "v";

/** Full-length sha256 in hex: the identifier is a content digest, never a git ref. */
export const ENGINE_RELEASE_ID_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Version of the addressing rules below. It participates in the digest, so changing
 * how references are addressed cannot reuse an identifier that already describes
 * different bytes.
 */
export const ADDRESSING_REVISION = 1;

/**
 * The shell document. It keeps a revalidating cache so a client always discovers the
 * shell that is currently published; every other shell file is addressed in the
 * document's own references and therefore never revalidates.
 */
export const SHELL_DOCUMENT_KEY = "index.html";

export const SHELL_DOCUMENT_CACHE = "private, no-cache";
export const SHELL_IMMUTABLE_CACHE = "private, immutable, max-age=31536000";
export const SHELL_MODERATE_CACHE = "private, max-age=86400";

/** Shell sources that declare or build subresource URLs; the pipeline addresses these. */
export const SHELL_ADDRESSED_SOURCES = [
  "index.html",
  "js/main.js",
  "js/rmmz_managers.js",
] as const;

export interface ShellFile {
  /** POSIX path relative to the staged shell root. */
  path: string;
  bytes: Uint8Array;
}

const encoder = new TextEncoder();

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function comparePaths(left: ShellFile, right: ShellFile): number {
  if (left.path === right.path) return 0;
  return left.path < right.path ? -1 : 1;
}

/**
 * Content identity of a published shell: the digest of every staged shell file plus
 * the addressing revision. Identical content always yields the same identifier, which
 * is what makes a rollback serve the same URLs for the same bytes.
 */
export async function computeReleaseId(files: readonly ShellFile[]): Promise<string> {
  const manifest = ["ropoductions-engine-shell", `addressing-revision ${ADDRESSING_REVISION}`];
  for (const file of [...files].sort(comparePaths)) {
    manifest.push(`${file.path} ${await sha256Hex(file.bytes)}`);
  }
  return sha256Hex(encoder.encode(`${manifest.join("\n")}\n`));
}

export function isAddressedShellRequest(searchParams: URLSearchParams): boolean {
  const value = searchParams.get(ENGINE_RELEASE_PARAM);
  return value !== null && ENGINE_RELEASE_ID_PATTERN.test(value);
}

/**
 * Cache policy for a shell response. Addressed files are immutable because the
 * pipeline gave them a content-addressed URL; an unaddressed file keeps the moderate
 * cache, so a reference the pipeline did not address costs a revalidation rather than
 * a broken boot. The document always revalidates.
 */
export function resolveShellCacheControl(key: string, addressed: boolean): string {
  if (key === SHELL_DOCUMENT_KEY) {
    return SHELL_DOCUMENT_CACHE;
  }
  return addressed ? SHELL_IMMUTABLE_CACHE : SHELL_MODERATE_CACHE;
}

interface AnchorRule {
  file: (typeof SHELL_ADDRESSED_SOURCES)[number];
  label: string;
  pattern: RegExp;
  replacement: string;
}

function anchorRules(releaseId: string): AnchorRule[] {
  const suffix = ` + "?${ENGINE_RELEASE_PARAM}=${releaseId}"`;
  return [
    {
      file: "js/main.js",
      label: "Main.loadMainScripts script source",
      pattern: /(\bscript\.src = url)(;)/,
      replacement: `$1${suffix}$2`,
    },
    {
      file: "js/main.js",
      label: "effekseerWasmUrl",
      pattern: /(\bconst effekseerWasmUrl = "js\/libs\/effekseer\.wasm)(")/,
      replacement: `$1?${ENGINE_RELEASE_PARAM}=${releaseId}$2`,
    },
    {
      file: "js/rmmz_managers.js",
      label: "PluginManager.makeUrl",
      pattern:
        /(PluginManager\.makeUrl = function\(filename\) \{\s+return )("js\/plugins\/" \+ Utils\.encodeURI\(filename\) \+ "\.js")(;\s+\};)/,
      replacement: `$1$2${suffix}$3`,
    },
    {
      file: "js/rmmz_managers.js",
      label: "FontManager.makeUrl",
      pattern:
        /(FontManager\.makeUrl = function\(filename\) \{\s+return )("fonts\/" \+ Utils\.encodeURI\(filename\))(;\s+\};)/,
      replacement: `$1$2${suffix}$3`,
    },
  ];
}

/** Matches a document attribute that points at a shell-relative path. */
const DOCUMENT_REFERENCE_PATTERN = /(src|href)=(["'])((?:js|css|fonts|icon)\/[^"']*)\2/g;

/** Lenient detector used only to prove the strict rewrite left nothing behind. */
const DOCUMENT_REFERENCE_HINT = /(?:src|href)=["']?(?:js|css|fonts|icon)\//g;

/** Media literals must never carry the identifier: media keeps its moderate cache. */
const ADDRESSED_MEDIA_PATTERN = /"(?:data|img|audio|effects|movies)\/[^"]*[?&]v=/;

/** The identifier counts whether it opened the query or extended an existing one. */
function addressedReferencePattern(releaseId: string): RegExp {
  return new RegExp(`[?&]${ENGINE_RELEASE_PARAM}=${releaseId}`, "g");
}

function replaceOnce(
  sources: Map<string, string>,
  rule: AnchorRule,
  releaseId: string
): void {
  const source = sources.get(rule.file);
  if (source === undefined) {
    throw new Error(`Shell addressing: ${rule.file} is missing from the staged shell`);
  }
  const matches = source.match(new RegExp(rule.pattern, "g"));
  if (!matches || matches.length !== 1) {
    throw new Error(
      `Shell addressing: expected exactly one ${rule.label} in ${rule.file}, found ${
        matches?.length ?? 0
      }. The upstream engine changed; update the addressing rules in src/lib/engine-addressing.ts.`
    );
  }
  sources.set(rule.file, source.replace(rule.pattern, rule.replacement));
}

function addressDocument(source: string, releaseId: string): string {
  const hinted = source.match(DOCUMENT_REFERENCE_HINT)?.length ?? 0;
  let applied = 0;
  const addressed = source.replace(
    DOCUMENT_REFERENCE_PATTERN,
    (match, attribute: string, quote: string, value: string) => {
      applied += 1;
      // A staged reference may carry a query or a fragment already. The identifier
      // belongs inside the query, before the fragment: appended to the whole value it
      // would be swallowed by the query or the fragment and the request would stay
      // unaddressed, costing the immutable cache this addressing exists to give.
      const fragmentIndex = value.indexOf("#");
      const fragment = fragmentIndex === -1 ? "" : value.slice(fragmentIndex);
      const unaddressed = fragmentIndex === -1 ? value : value.slice(0, fragmentIndex);
      const separator = unaddressed.includes("?") ? "&" : "?";
      return `${attribute}=${quote}${unaddressed}${separator}${ENGINE_RELEASE_PARAM}=${releaseId}${fragment}${quote}`;
    }
  );
  if (hinted === 0 || applied !== hinted) {
    throw new Error(
      `Shell addressing: index.html has ${hinted} shell-relative references but ${applied} were addressed. ` +
        "The upstream engine changed; update the addressing rules in src/lib/engine-addressing.ts."
    );
  }
  return addressed;
}

function assertAddressed(sources: Map<string, string>, releaseId: string): void {
  const expectedPerFile = new Map<string, number>([
    ["index.html", 1],
    ["js/main.js", 2],
    ["js/rmmz_managers.js", 2],
  ]);
  for (const [file, expected] of expectedPerFile) {
    const source = sources.get(file) ?? "";
    const found = source.match(addressedReferencePattern(releaseId))?.length ?? 0;
    if (found < expected) {
      throw new Error(
        `Shell addressing: ${file} carries ${found} release-addressed references, expected at least ${expected}.`
      );
    }
    if (ADDRESSED_MEDIA_PATTERN.test(source)) {
      throw new Error(
        `Shell addressing: ${file} addresses a media URL. Media keeps its moderate cache and must never be release-addressed.`
      );
    }
  }
}

/**
 * Bakes the release identifier into every shell subresource reference the pipeline can
 * see, in place. Throws — never degrades silently — when the engine's URL-building
 * expressions are not the ones the rules were written for.
 */
export function addressShellReferences(
  sources: Map<string, string>,
  releaseId: string
): void {
  if (!ENGINE_RELEASE_ID_PATTERN.test(releaseId)) {
    throw new Error(`Shell addressing: "${releaseId}" is not a release identifier`);
  }
  for (const file of SHELL_ADDRESSED_SOURCES) {
    const source = sources.get(file);
    if (source === undefined) {
      throw new Error(`Shell addressing: ${file} is missing from the staged shell`);
    }
    if (new RegExp(`[?&]${ENGINE_RELEASE_PARAM}=`).test(source)) {
      throw new Error(`Shell addressing: ${file} is already addressed`);
    }
  }

  sources.set("index.html", addressDocument(sources.get("index.html") as string, releaseId));
  for (const rule of anchorRules(releaseId)) {
    replaceOnce(sources, rule, releaseId);
  }
  assertAddressed(sources, releaseId);
}
