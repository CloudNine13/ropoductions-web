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
// [CLEANUP_TAG: CF_DIAGNOSTIC]
import {
  extractCloudflareContext,
  logCloudflareDiagnostic,
} from "@/lib/cloudflare-diagnostic";

export const dynamic = "force-dynamic";

const ALLOWED_ROOT_DIRS: Record<string, true> = {
  audio: true,
  img: true,
  effects: true,
  movies: true,
  data: true,
};

async function handleAssetRequest(
  request: NextRequest,
  paramsPromise: Promise<{ asset?: string[] }>,
  isHead: boolean
): Promise<Response> {
  // [CLEANUP_TAG: CF_DIAGNOSTIC]
  const startMs = Date.now();
  const cfContext = extractCloudflareContext(request);

  const ageVerified = unquoteCookieValue(request.cookies.get(AGE_VERIFIED_COOKIE_NAME)?.value) === "true";
  const sessionCookie = unquoteCookieValue(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!ageVerified || !sessionCookie) {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "game_asset_unauthorized",
      {
        ...cfContext,
        reason: "missing_cookies",
        hasAgeCookie: ageVerified,
        hasSessionCookie: Boolean(sessionCookie),
        durationMs: Date.now() - startMs,
      },
      "warn"
    );
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
          "Cache-Control": "no-store",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      }
    );
  }

  let db;
  let authEnv;
  try {
    db = await getDatabase();
    authEnv = await getAuthEnv();
  } catch {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "game_asset_infra_error",
      { ...cfContext, reason: "database_or_auth_env_failed", durationMs: Date.now() - startMs },
      "error"
    );
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
          "Cache-Control": "no-store",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      }
    );
  }

  try {
    const validation = await resolveSessionValidation({
      db,
      sessionCookie,
      sessionSecret: authEnv.sessionSecret,
      initialAdminIds: authEnv.initialAdminPatreonIds,
    });

    if (validation.status !== "authorized") {
      // [CLEANUP_TAG: CF_DIAGNOSTIC]
      logCloudflareDiagnostic(
        "game_asset_session_rejected",
        { ...cfContext, validationStatus: validation.status, durationMs: Date.now() - startMs },
        "warn"
      );
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid or unverified patron session.",
          },
        },
        {
          status: 403,
          headers: {
            "Cache-Control": "no-store",
            "Cross-Origin-Resource-Policy": "same-origin",
          },
        }
      );
    }
  } catch {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "game_asset_validation_error",
      { ...cfContext, reason: "resolveSessionValidation_threw", durationMs: Date.now() - startMs },
      "error"
    );
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
          "Cache-Control": "no-store",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      }
    );
  }

  const { asset } = await paramsPromise;
  const pathResult = sanitizeAssetPath(asset, ALLOWED_ROOT_DIRS);
  if (pathResult.error || !pathResult.key) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: pathResult.error || "Invalid asset path.",
        },
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      }
    );
  }
  const key = pathResult.key;

  let bucket;
  try {
    bucket = await getGameAssetsBucket();
  } catch {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "game_asset_bucket_error",
      { ...cfContext, key, reason: "getGameAssetsBucket_threw", durationMs: Date.now() - startMs },
      "error"
    );
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
          "Cache-Control": "no-store",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      }
    );
  }

  const rangeHeader = request.headers.get("range");

  let headOrObject: R2Object | R2ObjectBody | null = null;
  let objectBody: ReadableStream | null = null;

  if (isHead || rangeHeader) {
    try {
      headOrObject = await bucket.head(key);
    } catch {
      // [CLEANUP_TAG: CF_DIAGNOSTIC]
      logCloudflareDiagnostic(
        "game_asset_head_error",
        { ...cfContext, key, durationMs: Date.now() - startMs },
        "error"
      );
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
            "Cache-Control": "no-store",
            "Cross-Origin-Resource-Policy": "same-origin",
          },
        }
      );
    }
  } else {
    try {
      const obj = await bucket.get(key);
      headOrObject = obj;
      if (obj && "body" in obj && obj.body) {
        objectBody = obj.body as ReadableStream;
      }
    } catch {
      // [CLEANUP_TAG: CF_DIAGNOSTIC]
      logCloudflareDiagnostic(
        "game_asset_read_error",
        { ...cfContext, key, durationMs: Date.now() - startMs },
        "error"
      );
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
            "Cache-Control": "no-store",
            "Cross-Origin-Resource-Policy": "same-origin",
          },
        }
      );
    }
  }

  if (!headOrObject) {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "game_asset_not_found",
      { ...cfContext, key, durationMs: Date.now() - startMs },
      "warn"
    );
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Asset not found.",
        },
      },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      }
    );
  }
  const head = headOrObject;

  const ifMatch = request.headers.get("if-match");
  if (ifMatch && ifMatch.trim() !== "*") {
    const normalizedHeadEtag = head.httpEtag ? head.httpEtag.replace(/^W\//i, "").replace(/^"|"$/g, "") : undefined;
    const isMatch = ifMatch.split(",").some((tag) => {
      const normalized = tag.trim().replace(/^W\//i, "").replace(/^"|"$/g, "");
      return normalized === normalizedHeadEtag;
    });
    if (!isMatch) {
      return NextResponse.json(
        {
          error: {
            code: "PRECONDITION_FAILED",
            message: "Precondition failed.",
          },
        },
        {
          status: 412,
          headers: {
            "Cache-Control": "no-store",
            "Cross-Origin-Resource-Policy": "same-origin",
          },
        }
      );
    }
  }

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) {
    const normalizedHeadEtag = head.httpEtag ? head.httpEtag.replace(/^W\//i, "").replace(/^"|"$/g, "") : undefined;
    const isMatch = ifNoneMatch.trim() === "*" || ifNoneMatch.split(",").some((tag) => {
      const normalized = tag.trim().replace(/^W\//i, "").replace(/^"|"$/g, "");
      return normalized === normalizedHeadEtag;
    });
    if (isMatch) {
      const headers = new Headers();
      headers.set("Cache-Control", "private, max-age=86400");
      headers.set("Vary", "Cookie");
      headers.set("Cross-Origin-Resource-Policy", "same-origin");
      if (head.httpEtag) {
        headers.set("ETag", head.httpEtag);
      }
      // [CLEANUP_TAG: CF_DIAGNOSTIC]
      logCloudflareDiagnostic(
        "game_asset_304",
        { ...cfContext, key, etag: head.httpEtag, durationMs: Date.now() - startMs },
        "info"
      );
      return new Response(null, {
        status: 304,
        headers,
      });
    }
  }

  const headers = new Headers();
  headers.set("Cache-Control", "private, max-age=86400");
  headers.set("Vary", "Cookie");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Accept-Ranges", "bytes");
  if (head.httpEtag) {
    headers.set("ETag", head.httpEtag);
  }
  const contentType = resolveContentType(key, head.httpMetadata?.contentType);
  headers.set("Content-Type", contentType);

  if (rangeHeader) {
    const parsedRange = parseByteRange(rangeHeader, head.size);
    if (parsedRange === "unsatisfiable") {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${head.size}`,
          "Cache-Control": "no-store",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      });
    }

    if (parsedRange !== "invalid") {
      headers.set(
        "Content-Range",
        `bytes ${parsedRange.start}-${parsedRange.end}/${head.size}`
      );
      headers.set("Content-Length", parsedRange.length.toString());

      if (isHead) {
        return new Response(null, {
          status: 206,
          headers,
        });
      }

      let rangeObject;
      try {
        rangeObject = await bucket.get(key, { range: parsedRange.r2Range });
      } catch {
        // [CLEANUP_TAG: CF_DIAGNOSTIC]
        logCloudflareDiagnostic(
          "game_asset_range_read_error",
          { ...cfContext, key, range: rangeHeader, durationMs: Date.now() - startMs },
          "error"
        );
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
              "Cache-Control": "no-store",
              "Cross-Origin-Resource-Policy": "same-origin",
            },
          }
        );
      }

      if (!rangeObject || !rangeObject.body) {
        return NextResponse.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Asset not found.",
            },
          },
          {
            status: 404,
            headers: {
              "Cache-Control": "no-store",
              "Cross-Origin-Resource-Policy": "same-origin",
            },
          }
        );
      }

      // [CLEANUP_TAG: CF_DIAGNOSTIC]
      logCloudflareDiagnostic(
        "game_asset_206",
        {
          ...cfContext,
          key,
          range: rangeHeader,
          contentLength: parsedRange.length,
          totalSize: head.size,
          durationMs: Date.now() - startMs,
        },
        "info"
      );
      return new Response(rangeObject.body, {
        status: 206,
        headers,
      });
    }
  }

  if (isHead) {
    headers.set("Content-Length", head.size.toString());
    return new Response(null, {
      status: 200,
      headers,
    });
  }

  if (!objectBody) {
    let object;
    try {
      object = await bucket.get(key);
    } catch {
      console.error("[GAME_ASSET] Asset reread failed.", key);
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
            "Cache-Control": "no-store",
            "Cross-Origin-Resource-Policy": "same-origin",
          },
        }
      );
    }

    if (!object || !object.body) {
      console.warn("[GAME_ASSET] Asset vanished on reread.", key);
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Asset not found.",
          },
        },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store",
            "Cross-Origin-Resource-Policy": "same-origin",
          },
        }
      );
    }
    objectBody = object.body as ReadableStream;
  }

  headers.set("Content-Length", head.size.toString());

  // [CLEANUP_TAG: CF_DIAGNOSTIC]
  logCloudflareDiagnostic(
    "game_asset_200",
    {
      ...cfContext,
      key,
      size: head.size,
      contentType,
      etag: head.httpEtag,
      isHead,
      durationMs: Date.now() - startMs,
    },
    "info"
  );
  return new Response(objectBody, {
    status: 200,
    headers,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ asset?: string[] }> }
) {
  try {
    return await handleAssetRequest(request, params, false);
  } catch {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "game_asset_unhandled_get_error",
      { path: request.nextUrl.pathname, rayId: request.headers.get("cf-ray") },
      "error"
    );
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
          "Cache-Control": "no-store",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      }
    );
  }
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ asset?: string[] }> }
) {
  try {
    return await handleAssetRequest(request, params, true);
  } catch {
    // [CLEANUP_TAG: CF_DIAGNOSTIC]
    logCloudflareDiagnostic(
      "game_asset_unhandled_head_error",
      { path: request.nextUrl.pathname, rayId: request.headers.get("cf-ray") },
      "error"
    );
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
          "Cache-Control": "no-store",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      }
    );
  }
}
