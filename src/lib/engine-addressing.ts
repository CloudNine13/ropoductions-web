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

/**
 * Keywords after which a `/` opens a regex literal rather than a division, so the
 * masker does not read a `//` or `/*` inside a regular expression as a comment.
 */
const REGEX_PREFIX_KEYWORDS: Record<string, true> = {
  await: true,
  case: true,
  delete: true,
  do: true,
  else: true,
  in: true,
  instanceof: true,
  new: true,
  of: true,
  return: true,
  throw: true,
  typeof: true,
  void: true,
  yield: true,
};

/** Control-flow keywords whose `)` can be followed by a statement, so a `/` opens a regex. */
const CONTROL_PAREN_KEYWORDS: Record<string, true> = {
  catch: true,
  for: true,
  if: true,
  switch: true,
  while: true,
  with: true,
};

/** End of a string literal, exclusive; an unterminated literal stops at its line end. */
function stringEnd(source: string, from: number): number {
  const quote = source[from];
  for (let index = from + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === quote) return index + 1;
    if (char === "\n") return index;
  }
  return source.length;
}

/**
 * End of a regex literal, exclusive, or -1 when the `/` cannot open one: a regex never
 * spans a line, and a `/` immediately followed by another `/` opens a line comment.
 */
function regexEnd(source: string, from: number): number {
  let inCharacterClass = false;
  for (let index = from + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "\n" || char === "\r") return -1;
    if (char === "[") {
      inCharacterClass = true;
      continue;
    }
    if (char === "]") {
      inCharacterClass = false;
      continue;
    }
    if (char === "/" && !inCharacterClass) {
      return source[index + 1] === "/" ? -1 : index + 1;
    }
  }
  return -1;
}

/**
 * Blanks every comment character, preserving length and offsets so a match found
 * against the mask sits at the same offset in the original source. The anchor literal
 * is often only one edit away from a comment that still holds the previous one, and a
 * match inside that comment would otherwise be rewritten while the executable site —
 * the only one a browser ever evaluates — stayed unaddressed.
 *
 * String contents stay verbatim, because the effekseerWasmUrl anchor legitimately
 * matches across a string literal, and a `//` or `/*` inside a string, a template
 * literal or a regex literal is not a comment.
 */
function maskComments(source: string): string {
  type Frame = { kind: "code"; braces: number } | { kind: "template" };
  const pieces: string[] = [];
  const frames: Frame[] = [{ kind: "code", braces: 0 }];

  let cursor = 0;
  let index = 0;
  // The last significant code character and the identifier it closes, which together
  // decide whether a `/` opens a regex literal or divides.
  let lastChar = "";
  let lastWord = "";
  // `if (ready) /re/.test(text)` is a regex even though `)` usually produces a value:
  // the flag records whether the `)` just consumed closed a control-flow condition.
  const parenStack: boolean[] = [];
  let lastControlParen = false;

  while (index < source.length) {
    const frame = frames[frames.length - 1];
    const char = source[index];

    if (frame.kind === "template") {
      if (char === "\\") {
        index += 2;
      } else if (char === "`") {
        frames.pop();
        lastChar = char;
        lastWord = "";
        index += 1;
      } else if (char === "$" && source[index + 1] === "{") {
        frames.push({ kind: "code", braces: 1 });
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    if (char === "/" && source[index + 1] === "/") {
      const found = source.indexOf("\n", index);
      const end = found === -1 ? source.length : found;
      pieces.push(source.slice(cursor, index), " ".repeat(end - index));
      cursor = end;
      index = end;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      const found = source.indexOf("*/", index + 2);
      const end = found === -1 ? source.length : found + 2;
      pieces.push(source.slice(cursor, index), " ".repeat(end - index));
      cursor = end;
      index = end;
      continue;
    }
    if (char === "'" || char === '"') {
      index = stringEnd(source, index);
      lastChar = char;
      lastWord = "";
      continue;
    }
    if (char === "`") {
      frames.push({ kind: "template" });
      lastChar = char;
      lastWord = "";
      index += 1;
      continue;
    }
    if (char === "/") {
      const end = regexEnd(source, index);
      // A `/` divides after something that already produced a value, and opens a regex
      // everywhere else; the keyword list covers the ones that end in a letter.
      const opensRegex =
        lastChar === "" ||
        lastControlParen ||
        (/[A-Za-z0-9_$]/.test(lastChar)
          ? REGEX_PREFIX_KEYWORDS[lastWord] === true
          : !")]\"'`".includes(lastChar));
      if (end !== -1 && opensRegex) {
        // The body is masked like a comment: an anchor-shaped literal inside a regular
        // expression is not a site a browser ever evaluates, and leaving it visible
        // would let it absorb the rewrite. The literal produced a value, so a following
        // `/` reads as division again.
        pieces.push(source.slice(cursor, index), " ".repeat(end - index));
        cursor = end;
        index = end;
        lastChar = ")";
        lastWord = "";
        lastControlParen = false;
        continue;
      }
    }

    if (char === "{") {
      frame.braces += 1;
    } else if (char === "}") {
      frame.braces -= 1;
      if (frame.braces === 0 && frames.length > 1) frames.pop();
    } else if (char === "(") {
      parenStack.push(CONTROL_PAREN_KEYWORDS[lastWord] === true);
    } else if (char === ")") {
      lastControlParen = parenStack.length > 0 ? (parenStack.pop() as boolean) : false;
    }
    if (!/\s/.test(char)) {
      if (char !== ")") {
        lastControlParen = false;
      }
      lastWord = /[A-Za-z0-9_$]/.test(char) ? lastWord + char : "";
      lastChar = char;
    }
    index += 1;
  }

  pieces.push(source.slice(cursor));
  return pieces.join("");
}

/**
 * Blanks `<!-- ... -->` so a commented-out reference is neither counted nor rewritten.
 * An unterminated open comment runs to the end of the document, as a browser reads it.
 */
function maskHtmlComments(source: string): string {
  return source.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment: string) => " ".repeat(comment.length));
}

/**
 * Matches a document attribute that points at a shell-relative path. A bare value ends
 * at whitespace or the tag close, so `src=js/main.js` is addressed rather than only
 * hinted. Attribute names are matched case-insensitively because browsers fold them:
 * `SRC=` is fetched, so it must be addressed too.
 */
const DOCUMENT_REFERENCE_PATTERN = /(src|href)=(["']?)((?:js|css|fonts|icon)\/[^"'\s<>]*)\2/gi;

/** Lenient detector used only to prove the strict rewrite left nothing behind. */
const DOCUMENT_REFERENCE_HINT = /(?:src|href)=["']?(?:js|css|fonts|icon)\//gi;

/** Media literals must never carry the identifier: media keeps its moderate cache. */
const ADDRESSED_MEDIA_PATTERN = /"(?:data|img|audio|effects|movies)\/[^"]*[?&]v=/;

/** The identifier counts whether it opened the query or extended an existing one. */
function addressedReferencePattern(releaseId: string): RegExp {
  return new RegExp(`[?&]${ENGINE_RELEASE_PARAM}=${releaseId}`, "g");
}

function replaceOnce(sources: Map<string, string>, rule: AnchorRule): void {
  const source = sources.get(rule.file);
  if (source === undefined) {
    throw new Error(`Shell addressing: ${rule.file} is missing from the staged shell`);
  }
  const masked = maskComments(source);
  const matches = [...masked.matchAll(new RegExp(rule.pattern.source, `${rule.pattern.flags}g`))];
  if (matches.length !== 1) {
    throw new Error(
      `Shell addressing: expected exactly one ${rule.label} in ${rule.file}, found ${
        matches.length
      }. The upstream engine changed; update the addressing rules in src/lib/engine-addressing.ts.`
    );
  }
  const start = matches[0].index as number;
  const end = start + matches[0][0].length;
  const region = source.slice(start, end);
  // The mask only ever blanks comments, so a rule whose pattern spans whitespace can
  // match the mask while the source holds a comment in that gap. Rewriting the source
  // region would then no-op; naming it here keeps the failure honest.
  if (masked.slice(start, end) !== region) {
    throw new Error(
      `Shell addressing: the ${rule.label} site in ${rule.file} is not plain code (a comment sits inside it); update the addressing rules in src/lib/engine-addressing.ts.`
    );
  }
  // The rewrite is spliced into the original text at the offset the mask located, so a
  // comment that still holds the previous literal can never absorb it.
  const replacement = region.replace(rule.pattern, rule.replacement);
  sources.set(rule.file, source.slice(0, start) + replacement + source.slice(end));
}

function addressDocument(source: string, releaseId: string): string {
  const masked = maskHtmlComments(source);
  const hinted = masked.match(DOCUMENT_REFERENCE_HINT)?.length ?? 0;
  const matches = [...masked.matchAll(DOCUMENT_REFERENCE_PATTERN)];
  const applied = matches.length;
  if (hinted === 0 || applied !== hinted) {
    throw new Error(
      `Shell addressing: index.html has ${hinted} shell-relative references but ${applied} were addressed. ` +
        "The upstream engine changed; update the addressing rules in src/lib/engine-addressing.ts."
    );
  }
  let addressed = "";
  let cursor = 0;
  for (const match of matches) {
    const start = match.index as number;
    const [attribute, quote, value] = [match[1], match[2], match[3]];
    // A staged reference may carry a query or a fragment already. The identifier
    // belongs inside the query, before the fragment: appended to the whole value it
    // would be swallowed by the query or the fragment and the request would stay
    // unaddressed, costing the immutable cache this addressing exists to give.
    const fragmentIndex = value.indexOf("#");
    const fragment = fragmentIndex === -1 ? "" : value.slice(fragmentIndex);
    const unaddressed = fragmentIndex === -1 ? value : value.slice(0, fragmentIndex);
    const separator = unaddressed.includes("?") ? "&" : "?";
    addressed +=
      source.slice(cursor, start) +
      `${attribute}=${quote}${unaddressed}${separator}${ENGINE_RELEASE_PARAM}=${releaseId}${fragment}${quote}`;
    cursor = start + match[0].length;
  }

  const rewritten = addressed + source.slice(cursor);
  // The count check above proves only that every reference the hint saw was rewritten;
  // this proves none survived, whatever its attribute casing or value shape. Comments
  // are masked again because a commented-out reference is legitimately unaddressed.
  for (const match of maskHtmlComments(rewritten).matchAll(DOCUMENT_REFERENCE_PATTERN)) {
    if (!addressedReferencePattern(releaseId).test(match[3])) {
      throw new Error(
        `Shell addressing: index.html kept an unaddressed shell reference (${match[0]}); update the addressing rules in src/lib/engine-addressing.ts.`
      );
    }
  }
  return rewritten;
}

function assertAddressed(sources: Map<string, string>, releaseId: string): void {
  // One addressed reference per anchor rule, exactly: the document's own invariant is
  // asserted where it is rewritten (every reference carries the identifier).
  const expectedPerFile = new Map<string, number>([
    ["js/main.js", 2],
    ["js/rmmz_managers.js", 2],
  ]);
  for (const file of SHELL_ADDRESSED_SOURCES) {
    const source = sources.get(file) ?? "";
    const expected = expectedPerFile.get(file);
    if (expected !== undefined) {
      const found = source.match(addressedReferencePattern(releaseId))?.length ?? 0;
      if (found !== expected) {
        throw new Error(
          `Shell addressing: ${file} carries ${found} release-addressed references, expected exactly ${expected}.`
        );
      }
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
    replaceOnce(sources, rule);
  }
  assertAddressed(sources, releaseId);
}
