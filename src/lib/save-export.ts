import JSZip from "jszip";
import type { SaveSlotsPayload } from "../types/save";
import { normalizeSlotKey, requestSaves, DEFAULT_BRIDGE_TIMEOUT_MS } from "./save-bridge";

export interface ExportSavesOptions {
  targetOrigin?: string;
  timeoutMs?: number;
  date?: Date;
  skipDownload?: boolean;
}

export interface ExportSavesResult {
  filename: string;
  blob: Blob;
  fileCount: number;
  files: string[];
}

export function formatSaveZipFilename(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `ropoductions_saves_${year}-${month}-${day}.zip`;
}

export function normalizeSaveFileMap(payload: SaveSlotsPayload): Record<string, string> {
  const result: Record<string, string> = {};

  if (!payload || typeof payload !== "object") {
    return result;
  }

  if (payload.slots && typeof payload.slots === "object") {
    for (const [key, content] of Object.entries(payload.slots)) {
      const normalizedKey = normalizeSlotKey(key);
      if (!normalizedKey) continue;
      if (typeof content !== "string" || content.trim().length === 0) continue;
      result[`${normalizedKey}.rpgsave`] = content;
    }
  }

  if (typeof payload.global === "string" && payload.global.trim().length > 0) {
    result["global.rpgsave"] = payload.global;
  }

  if (typeof payload.config === "string" && payload.config.trim().length > 0) {
    result["config.rpgsave"] = payload.config;
  }

  return result;
}

export async function buildSaveZip(payload: SaveSlotsPayload): Promise<Blob> {
  const zip = new JSZip();
  const fileMap = normalizeSaveFileMap(payload);

  for (const [filename, content] of Object.entries(fileMap)) {
    zip.file(filename, content);
  }

  return await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export function triggerDownload(blob: Blob, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export async function exportSaves(
  targetWindow: Window,
  targetOriginOrOptions?: string | ExportSavesOptions,
  legacyTimeoutMs?: number
): Promise<ExportSavesResult> {
  const options: ExportSavesOptions =
    typeof targetOriginOrOptions === "string"
      ? { targetOrigin: targetOriginOrOptions, timeoutMs: legacyTimeoutMs }
      : targetOriginOrOptions ?? {};

  const timeoutMs = options.timeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS;
  const payload = await requestSaves(targetWindow, options.targetOrigin, timeoutMs);
  const fileMap = normalizeSaveFileMap(payload);
  const blob = await buildSaveZip(payload);
  const filename = formatSaveZipFilename(options.date);

  if (!options.skipDownload) {
    triggerDownload(blob, filename);
  }

  return {
    filename,
    blob,
    fileCount: Object.keys(fileMap).length,
    files: Object.keys(fileMap).sort(),
  };
}
