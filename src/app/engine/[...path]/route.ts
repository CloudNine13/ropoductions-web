import { NextRequest, NextResponse } from "next/server";
import {
  AGE_VERIFIED_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  unquoteCookieValue,
} from "@/lib/cookies";
import { resolveSessionValidation } from "@/lib/session-validation-memo";
import { getAuthEnv, getDatabase, getGameAssetsBucket } from "@/lib/cloudflare";
import {
  resolveContentType,
  parseByteRange,
  sanitizeAssetPath,
} from "@/lib/r2-http";
import {
  isAddressedShellRequest,
  resolveShellCacheControl,
} from "@/lib/engine-addressing";
// [CLEANUP_TAG: CF_DIAGNOSTIC]
import {
  extractCloudflareContext,
  logCloudflareDiagnostic,
} from "@/lib/cloudflare-diagnostic";
import {
  MOCK_ENGINE_HTML,
  WEB_BRIDGE_SOURCE,
  MOCK_ENGINE_PATHS,
} from "@/lib/engine-mock.generated";

export const dynamic = "force-dynamic";

// Top-level segments the engine shell may expose. Media directories
// (data/img/audio/effects/movies) never reach this route: the `rewrites()`
// block in next.config.ts forwards them to the authenticated /api/game route.
// `build-metadata.json` is deliberately absent: the publish pipeline owns release
// identity and never publishes that file to the runtime.
const SHELL_TOP_LEVEL: Record<string, true> = {
  "index.html": true,
  js: true,
  css: true,
  fonts: true,
  icon: true,
  "package.json": true,
};

// Website-owned decoupled test harness served only while R2 holds no
// published shell yet (local dev, CI, pre-release prod). It contains no game
// content, so it stays reachable without a patron session — matching the
// pre-R2 public-static behavior of the mock at /engine/index.html.
const MOCK_BY_PATH: Record<string, string> = {
  "index.html": MOCK_ENGINE_HTML,
  "js/plugins/Ropoductions_WebBridge.js": WEB_BRIDGE_SOURCE,
};
const MOCK_PATH_SET: Record<string, true> = Object.fromEntries(
  MOCK_ENGINE_PATHS.map((p) => [p, true])
);

function isMockPath(key: string): boolean {
  return key in MOCK_BY_PATH && MOCK_PATH_SET[key] === true;
}

const NO_STORE = "no-store";
const CORP = "same-origin";

function serveMock(key: string, isHead: boolean): Response {
  const body = MOCK_BY_PATH[key];
  return new Response(isHead ? null : body, {
    status: 200,
    headers: {
      "Cache-Control": NO_STORE,
      "Content-Type": resolveContentType(key),
      "Cross-Origin-Resource-Policy": CORP,
    },
  });
}

function notFound(): Response {
  return NextResponse.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "Shell not found.",
      },
    },
    {
      status: 404,
      headers: {
        "Cache-Control": NO_STORE,
        "Cross-Origin-Resource-Policy": CORP,
      },
    }
  );
}

// Serves the open mock for the two website-owned harness paths and 404 for
// everything else — identical regardless of whether an R2 shell exists, so
// this response never acts as an existence oracle.
function mockOrNotFound(key: string, isHead: boolean): Response {
  return isMockPath(key) ? serveMock(key, isHead) : notFound();
}

// Mirrors the fail-closed contract of /api/game: infra errors surface as 500
// in production, but fall back to the placeholder in local dev/CI so the
// iframe and bridge stay testable without a running bucket or database.
function infraFailure(key: string, isHead: boolean): Response {
  if (process.env.NODE_ENV !== "production") {
    return mockOrNotFound(key, isHead);
  }
  return internalError();
}

function unauthorized(): Response {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Active patron session and 21+ age verification required.",
      },
    },
    {
      status: 403,
      headers: {
        "Cache-Control": NO_STORE,
        "Cross-Origin-Resource-Policy": CORP,
      },
    }
  );
}

function internalError(): Response {
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    },
    {
      status: 500,
      headers: {
        "Cache-Control": NO_STORE,
        "Cross-Origin-Resource-Policy": CORP,
      },
    }
  );
}

async function handleEngineRequest(
  request: NextRequest,
  paramsPromise: Promise<{ path?: string[] }>,
  isHead: boolean
): Promise<Response> {
  // [CLEANUP_TAG: CF_DIAGNOSTIC]
  const startMs = Date.now();
  const cfContext = extractCloudflareContext(request);
  const { path } = await paramsPromise;
  if (path?.length === 1) {
    try {
      if (decodeURIComponent(path[0]).toLowerCase() === "cordova.js") {
        return new Response(isHead ? null : "/* cordova is not part of the web shell */\n", {
          status: 200,
          headers: {
            "Cache-Control": "private, max-age=86400",
            "Content-Type": "text/javascript",
            "Cross-Origin-Resource-Policy": CORP,
          },
        });
      }
    } catch {
    }
  }
  const pathResult = sanitizeAssetPath(path, SHELL_TOP_LEVEL);
  if (pathResult.error || !pathResult.key) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: pathResult.error || "Invalid shell path.",
        },
      },
      {
        status: 400,
        headers: {
          "Cache-Control": NO_STORE,
          "Cross-Origin-Resource-Policy": CORP,
        },
      }
    );
  }
  const key = pathResult.key;

  // Release addressing is baked into the published content by the ingest pipeline;
  // the runtime only reads the URL shape and never resolves or remembers a release.
  const isAddressed = isAddressedShellRequest(request.nextUrl.searchParams);

  const ageVerified =
    unquoteCookieValue(request.cookies.get(AGE_VERIFIED_COOKIE_NAME)?.value) === "true";
  const sessionCookie = unquoteCookieValue(
    request.cookies.get(SESSION_COOKIE_NAME)?.value
  );

  // Anonymous (no patron cookies): serve only the open mock harness / 404,
  // independently of whether an R2 shell exists. No R2 read and no D1 read,
  // so this path discloses nothing about release state and costs nothing.
  if (!ageVerified || !sessionCookie) {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "engine_unauthorized",
      {
        ...cfContext,
        key,
        isAddressed,
        hasAgeCookie: ageVerified,
        hasSessionCookie: Boolean(sessionCookie),
        durationMs: Date.now() - startMs,
      },
      "warn"
    );
    return mockOrNotFound(key, isHead);
  }

  // Cookies present: establish a valid patron session, fail-closed on errors.
  let db;
  let authEnv;
  try {
    db = await getDatabase();
    authEnv = await getAuthEnv();
  } catch {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "engine_infra_error",
      { ...cfContext, key, durationMs: Date.now() - startMs },
      "error"
    );
    return infraFailure(key, isHead);
  }

  let validation;
  try {
    validation = await resolveSessionValidation({
      db,
      sessionCookie,
      sessionSecret: authEnv.sessionSecret,
      initialAdminIds: authEnv.initialAdminPatreonIds,
    });
  } catch {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "engine_validation_error",
      { ...cfContext, key, durationMs: Date.now() - startMs },
      "error"
    );
    return infraFailure(key, isHead);
  }
  if (validation.status !== "authorized") {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "engine_session_rejected",
      { ...cfContext, key, validationStatus: validation.status, durationMs: Date.now() - startMs },
      "warn"
    );
    return unauthorized();
  }

  // Authorized: resolve the shell bucket. It is patron content and streams
  // with the same private cache semantics as /api/game assets.
  let bucket;
  try {
    bucket = await getGameAssetsBucket();
  } catch {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "engine_bucket_error",
      { ...cfContext, key, durationMs: Date.now() - startMs },
      "error"
    );
    return infraFailure(key, isHead);
  }

  const objectKey = `engine/${key}`;
  const head = await bucket.head(objectKey);

  // No published shell yet: authorized patrons see the placeholder harness.
  if (!head) {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "engine_shell_missing_mock",
      { ...cfContext, key, objectKey, isAddressed, durationMs: Date.now() - startMs },
      "warn"
    );
    return mockOrNotFound(key, isHead);
  }

  const headers = new Headers();
  headers.set("Cache-Control", resolveShellCacheControl(key, isAddressed));
  headers.set("Vary", "Cookie");
  headers.set("Cross-Origin-Resource-Policy", CORP);
  headers.set("Accept-Ranges", "bytes");
  if (head.httpEtag) {
    headers.set("ETag", head.httpEtag);
  }
  headers.set(
    "Content-Type",
    resolveContentType(objectKey, head.httpMetadata?.contentType)
  );

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) {
    const normalizedHeadEtag = head.httpEtag
      ? head.httpEtag.replace(/^W\//i, "").replace(/^"|"$/g, "")
      : undefined;
    const isMatch =
      ifNoneMatch.trim() === "*" ||
      ifNoneMatch.split(",").some((tag) => {
        const normalized = tag.trim().replace(/^W\//i, "").replace(/^"|"$/g, "");
        return normalized === normalizedHeadEtag;
      });
    if (isMatch) {
      // [CLEANUP_TAG: CF_DIAGNOSTIC]
      logCloudflareDiagnostic(
        "engine_304",
        { ...cfContext, key, isAddressed, etag: head.httpEtag, durationMs: Date.now() - startMs },
        "info"
      );
      return new Response(null, { status: 304, headers });
    }
  }

  const rangeHeader = request.headers.get("range");
  if (rangeHeader && !isHead) {
    const parsedRange = parseByteRange(rangeHeader, head.size);
    if (parsedRange === "unsatisfiable") {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${head.size}`,
          "Cache-Control": NO_STORE,
          "Vary": "Cookie",
          "Cross-Origin-Resource-Policy": CORP,
        },
      });
    }
    if (parsedRange !== "invalid") {
      headers.set(
        "Content-Range",
        `bytes ${parsedRange.start}-${parsedRange.end}/${head.size}`
      );
      headers.set("Content-Length", parsedRange.length.toString());
      let rangeObject;
      try {
        rangeObject = await bucket.get(objectKey, { range: parsedRange.r2Range });
      } catch {
        // [CLEANUP_TAG: CF_DIAGNOSTIC]
        logCloudflareDiagnostic(
          "engine_range_read_error",
          { ...cfContext, objectKey, durationMs: Date.now() - startMs },
          "error"
        );
        return internalError();
      }
      if (!rangeObject || !rangeObject.body) {
        return NextResponse.json(
          {
            error: { code: "NOT_FOUND", message: "Shell not found." },
          },
          {
            status: 404,
            headers: {
              "Cache-Control": NO_STORE,
              "Cross-Origin-Resource-Policy": CORP,
            },
          }
        );
      }
      // [CLEANUP_TAG: CF_DIAGNOSTIC]
      logCloudflareDiagnostic(
        "engine_206",
        {
          ...cfContext,
          key,
          isAddressed,
          range: rangeHeader,
          contentLength: parsedRange.length,
          totalSize: head.size,
          durationMs: Date.now() - startMs,
        },
        "info"
      );
      return new Response(rangeObject.body, { status: 206, headers });
    }
  }

  if (isHead) {
    headers.set("Content-Length", head.size.toString());
    return new Response(null, { status: 200, headers });
  }

  let object;
  try {
    object = await bucket.get(objectKey);
  } catch {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "engine_read_error",
      { ...cfContext, objectKey, durationMs: Date.now() - startMs },
      "error"
    );
    return internalError();
  }
  if (!object || !object.body) {
    return NextResponse.json(
      {
        error: { code: "NOT_FOUND", message: "Shell not found." },
      },
      {
        status: 404,
        headers: {
          "Cache-Control": NO_STORE,
          "Cross-Origin-Resource-Policy": CORP,
        },
      }
    );
  }
  headers.set("Content-Length", head.size.toString());
  // [CLEANUP_TAG: CF_DIAGNOSTIC]
  logCloudflareDiagnostic(
    "engine_200",
    {
      ...cfContext,
      key,
      isAddressed,
      size: head.size,
      isHead,
      durationMs: Date.now() - startMs,
    },
    "info"
  );
  return new Response(object.body as ReadableStream, { status: 200, headers });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  try {
    return await handleEngineRequest(request, params, false);
  } catch {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "engine_unhandled_get_error",
      { path: request.nextUrl.pathname, rayId: request.headers.get("cf-ray") },
      "error"
    );
    return internalError();
  }
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  try {
    return await handleEngineRequest(request, params, true);
  } catch {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "engine_unhandled_head_error",
      { path: request.nextUrl.pathname, rayId: request.headers.get("cf-ray") },
      "error"
    );
    return internalError();
  }
}