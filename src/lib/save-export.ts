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
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("Invalid export date");
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `ropoductions_saves_${year}-${month}-${day}.zip`;
}

export function normalizeSaveFileMap(payload: SaveSlotsPayload): Record<string, string> {
  const result: Record<string, string> = {};

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return result;
  }

  if (payload.slots && typeof payload.slots === "object" && !Array.isArray(payload.slots)) {
    for (const [key, content] of Object.entries(payload.slots)) {
      const normalizedKey = normalizeSlotKey(key);
      if (!normalizedKey) continue;
      if (normalizedKey === "global" || normalizedKey === "config") continue;
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

export async function buildSaveZipFromMap(fileMap: Record<string, string>): Promise<Blob> {
  if (!fileMap || typeof fileMap !== "object" || Object.keys(fileMap).length === 0) {
    throw new Error("No populated saves to export");
  }
  const zip = new JSZip();

  for (const [filename, content] of Object.entries(fileMap)) {
    zip.file(filename, content);
  }

  return await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export async function buildSaveZip(payload: SaveSlotsPayload): Promise<Blob> {
  return buildSaveZipFromMap(normalizeSaveFileMap(payload));
}

const DOWNLOAD_URL_REVOKE_DELAY_MS = 60_000;

export function triggerDownload(blob: Blob, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Save export download requires a browser environment");
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    document.body.removeChild(anchor);
  }

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, DOWNLOAD_URL_REVOKE_DELAY_MS);
}

export async function exportSaves(
  targetWindow: Window,
  targetOriginOrOptions?: string | ExportSavesOptions,
  legacyTimeoutMs?: number
): Promise<ExportSavesResult> {
  const baseOptions: ExportSavesOptions =
    typeof targetOriginOrOptions === "string"
      ? { targetOrigin: targetOriginOrOptions, timeoutMs: legacyTimeoutMs }
      : targetOriginOrOptions ?? {};
  const options: ExportSavesOptions =
    targetOriginOrOptions === undefined && legacyTimeoutMs !== undefined
      ? { timeoutMs: legacyTimeoutMs }
      : baseOptions;

  const timeoutMs = options.timeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS;
  if (options.date !== undefined && (!(options.date instanceof Date) || Number.isNaN(options.date.getTime()))) {
    throw new Error("Invalid export date");
  }
  const payload = await requestSaves(targetWindow, options.targetOrigin, timeoutMs);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid save data received from game engine");
  }
  const fileMap = normalizeSaveFileMap(payload);
  if (Object.keys(fileMap).length === 0) {
    throw new Error("No populated saves to export");
  }
  const blob = await buildSaveZipFromMap(fileMap);
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
