// Shared R2 HTTP streaming primitives used by both the authenticated game
// asset route (`/api/game/*`) and the engine shell route (`/engine/*`).

export const MIME_MAP: Record<string, string> = {
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
  ".html": "text/html",
  ".txt": "text/plain",
  ".rpgmvp": "application/octet-stream",
  ".rpgmvo": "application/octet-stream",
  ".rpgmvm": "application/octet-stream",
  ".rpgsave": "application/octet-stream",
};

export function resolveContentType(key: string, r2ContentType?: string | null): string {
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

export interface ParsedRange {
  start: number;
  end: number;
  length: number;
  r2Range: { offset: number; length: number } | { suffix: number };
}

export function parseByteRange(
  rangeHeader: string,
  fileSize: number
): ParsedRange | "invalid" | "unsatisfiable" {
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

/**
 * Validates a slash-separated asset path against traversal smuggling (%2f,
 * `..`, hidden files) and restricts it to an allowlisted set of top-level
 * segments. Lowercases the root segment for case-insensitive R2 keys.
 */
export function sanitizeAssetPath(
  segments: string[] | undefined,
  allowedRoots: Record<string, true>
): { key?: string; error?: string } {
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
    // Reject illegal characters including forward slashes within a single
    // segment to prevent traversal smuggling (%2f)
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
  if (!allowedRoots[rootDir]) {
    return { error: "Access outside allowed asset directories is restricted." };
  }
  decodedSegments[0] = rootDir;
  return { key: decodedSegments.join("/") };
}