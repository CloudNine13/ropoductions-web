import { NextRequest, NextResponse } from "next/server";
import {
  AGE_VERIFIED_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  unquoteCookieValue,
} from "@/lib/cookies";
import { validateSessionAccess } from "@/lib/auth";
import { getAuthEnv, getDatabase, getGameAssetsBucket } from "@/lib/cloudflare";

export const dynamic = "force-dynamic";

const ALLOWED_ROOT_DIRS: Record<string, true> = {
  audio: true,
  img: true,
  effects: true,
  movies: true,
  data: true,
};

// In-isolate memory cache to absorb burst asset storms and maintain <300ms latency (PRD SM-C2).
// Only stores verified "authorized" session tokens to prevent cache eviction DoS via invalid tokens.
const sessionCache = new Map<string, number>();
const CACHE_TTL_MS = 20_000;
const MAX_CACHE_ENTRIES = 500;

function isSessionCached(token: string): boolean {
  const expiresAt = sessionCache.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessionCache.delete(token);
    return false;
  }
  return true;
}

function cacheAuthorizedSession(token: string) {
  if (sessionCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = sessionCache.keys().next().value;
    if (firstKey) sessionCache.delete(firstKey);
  }
  sessionCache.set(token, Date.now() + CACHE_TTL_MS);
}

const MIME_MAP: Record<string, string> = {
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".wasm": "application/wasm",
  ".css": "text/css",
  ".js": "text/javascript",
  ".rpgmvp": "application/octet-stream",
  ".rpgmvo": "application/octet-stream",
  ".rpgmvm": "application/octet-stream",
  ".rpgsave": "application/octet-stream",
};

function resolveContentType(key: string, r2ContentType?: string | null): string {
  if (r2ContentType && r2ContentType !== "application/octet-stream") {
    return r2ContentType;
  }
  const lastDot = key.lastIndexOf(".");
  if (lastDot !== -1) {
    const ext = key.slice(lastDot).toLowerCase();
    if (MIME_MAP[ext]) {
      return MIME_MAP[ext];
    }
  }
  return r2ContentType || "application/octet-stream";
}

function sanitizeAssetPath(segments?: string[]): { key?: string; error?: string } {
  if (!segments || segments.length === 0) {
    return { error: "Asset path is required." };
  }
  const decodedSegments: string[] = [];
  for (const rawSeg of segments) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(rawSeg);
    } catch {
      return { error: "Invalid URI encoding in asset path." };
    }
    // Reject illegal characters including forward slashes within a single segment to prevent traversal smuggling (%2f)
    if (decoded.includes("\0") || decoded.includes("\\") || decoded.includes("/")) {
      return { error: "Illegal characters in asset path." };
    }
    if (decoded === "") {
      continue;
    }
    if (decoded === "." || decoded === ".." || decoded.startsWith(".")) {
      return { error: "Path traversal or invalid segment in asset path." };
    }
    decodedSegments.push(decoded);
  }
  if (decodedSegments.length === 0) {
    return { error: "Asset path is required." };
  }
  const rootDir = decodedSegments[0].toLowerCase();
  if (!ALLOWED_ROOT_DIRS[rootDir]) {
    return { error: "Access outside allowed asset directories is restricted." };
  }
  decodedSegments[0] = rootDir;
  return { key: decodedSegments.join("/") };
}

interface ParsedRange {
  start: number;
  end: number;
  length: number;
  r2Range: { offset: number; length: number } | { suffix: number };
}

function parseByteRange(rangeHeader: string, fileSize: number): ParsedRange | "invalid" | "unsatisfiable" {
  const match = /^bytes=(?:(\d+)-(\d+)?|-(\d+))$/.exec(rangeHeader.trim());
  if (!match) {
    return "invalid";
  }

  if (fileSize === 0) {
    return "unsatisfiable";
  }

  if (match[3] !== undefined) {
    const suffix = parseInt(match[3], 10);
    if (suffix <= 0) return "unsatisfiable";
    const actualLength = Math.min(suffix, fileSize);
    const start = fileSize - actualLength;
    const end = fileSize - 1;
    return {
      start,
      end,
      length: actualLength,
      r2Range: { suffix: actualLength },
    };
  }

  const startStr = match[1];
  const endStr = match[2];
  const start = parseInt(startStr, 10);

  if (start >= fileSize) {
    return "unsatisfiable";
  }

  let end: number;
  if (endStr !== undefined) {
    end = parseInt(endStr, 10);
    if (start > end) {
      return "invalid";
    }
    end = Math.min(end, fileSize - 1);
  } else {
    end = fileSize - 1;
  }

  const length = end - start + 1;
  return {
    start,
    end,
    length,
    r2Range: { offset: start, length },
  };
}

async function handleAssetRequest(
  request: NextRequest,
  paramsPromise: Promise<{ asset?: string[] }>,
  isHead: boolean
): Promise<Response> {
  const ageVerified = unquoteCookieValue(request.cookies.get(AGE_VERIFIED_COOKIE_NAME)?.value) === "true";
  const sessionCookie = unquoteCookieValue(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!ageVerified || !sessionCookie) {
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

  if (!isSessionCached(sessionCookie)) {
    let db;
    let authEnv;
    try {
      db = await getDatabase();
      authEnv = await getAuthEnv();
    } catch {
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
      const validation = await validateSessionAccess({
        db,
        sessionCookie,
        sessionSecret: authEnv.sessionSecret,
        initialAdminIds: authEnv.initialAdminPatreonIds,
      });

      if (validation.status !== "authorized") {
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

      cacheAuthorizedSession(sessionCookie);
    } catch {
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

  const { asset } = await paramsPromise;
  const pathResult = sanitizeAssetPath(asset);
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
