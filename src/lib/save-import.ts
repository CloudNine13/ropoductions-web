import JSZip from "jszip";
import { normalizeSlotKey, restoreSaves, DEFAULT_BRIDGE_TIMEOUT_MS } from "./save-bridge";

export const INVALID_SAVE_FORMAT_ERROR =
  "Invalid save file format. Please upload a valid .zip archive or .rpgsave file.";

export const MAX_SLOT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per slot
export const MAX_TOTAL_ARCHIVE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB aggregate cap
export interface ImportSavesOptions {
  targetOrigin?: string;
  timeoutMs?: number;
}

export interface ImportSavesResult {
  slotCount: number;
  slots: string[];
}

/**
 * Validates a save filename and resolves it to a canonical slot key (file1..file20, global, config).
 * Supports explicit slot names, case-insensitivity, and defaults generic .rpgsave files to file1.
 */
export function validateSaveFileName(filename: string): string | null {
  if (typeof filename !== "string" || filename.trim().length === 0) {
    return null;
  }
  // Strip directory paths if present
  const basename = filename.split(/[/\\]/).pop()?.trim() ?? "";
  if (!basename) {
    return null;
  }

  // Reject files with explicit extensions other than .rpgsave
  const lower = basename.toLowerCase();
  if (!lower.endsWith(".rpgsave") && lower.includes(".")) {
    return null;
  }

  // Exact normalized match for standard slot names (file1..file20, global, config, with optional .rpgsave)
  const normalized = normalizeSlotKey(lower);
  if (normalized) {
    return normalized;
  }

  // For files with explicit slot pattern like file2, slot3, save_slot_3, file21
  const slotMatch = lower.match(/(?:file|slot)[_-]?(\d+)(?:\.rpgsave)?$/);
  if (slotMatch && slotMatch[1]) {
    const slotNum = parseInt(slotMatch[1], 10);
    if (slotNum >= 1 && slotNum <= 20) {
      return `file${slotNum}`;
    }
    return null; // Explicit slot number outside 1..20 is invalid
  }

  const genericNumberMatch = lower.match(/(?:^|[^0-9])([1-9]|1[0-9]|20)\.rpgsave$/);
  if (genericNumberMatch && genericNumberMatch[1]) {
    return `file${genericNumberMatch[1]}`;
  }
  // Generic .rpgsave without explicit slot number defaults to file1
  if (lower.endsWith(".rpgsave")) {
    return "file1";
  }

  return null;
}

function getByteLength(str: string): number {
  if (typeof Buffer !== "undefined") {
    return Buffer.byteLength(str, "utf8");
  }
  return new TextEncoder().encode(str).length;
}

/**
 * Decompresses and validates a .zip archive containing save slots.
 */
export async function parseAndValidateZipArchive(
  data: ArrayBuffer | Uint8Array | Buffer | Blob
): Promise<Record<string, string>> {
  if (!data) {
    throw new Error(INVALID_SAVE_FORMAT_ERROR);
  }

  if (typeof (data as Blob).size === "number" && (data as Blob).size === 0) {
    throw new Error(INVALID_SAVE_FORMAT_ERROR);
  }

  let zipInput: ArrayBuffer | Uint8Array | Buffer = data as ArrayBuffer;
  if (typeof (data as Blob).arrayBuffer === "function") {
    zipInput = await (data as Blob).arrayBuffer();
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipInput);
  } catch {
    throw new Error(INVALID_SAVE_FORMAT_ERROR);
  }

  const entries = Object.values(zip.files);
  const result: Record<string, string> = {};
  let totalExtractedBytes = 0;

  for (const entry of entries) {
    if (entry.dir) {
      continue;
    }

    const entryPath = entry.name;
    // Skip macOS metadata and dotfiles
    if (
      entryPath.includes("__MACOSX/") ||
      entryPath.startsWith(".") ||
      entryPath.includes("/.")
    ) {
      continue;
    }

    const basename = entryPath.split(/[/\\]/).pop()?.trim() ?? "";
    // Case-insensitive normalization so FILE1.RPGSAVE or global.rpgsave are valid
    const slotKey = normalizeSlotKey(basename.toLowerCase());
    if (!slotKey) {
      continue;
    }

    // Pre-decompression size check if metadata is available
    const uncompressedSize = (entry as unknown as { _data?: { uncompressedSize?: number } })
      ._data?.uncompressedSize;
    if (typeof uncompressedSize === "number" && uncompressedSize > MAX_SLOT_SIZE_BYTES) {
      throw new Error(INVALID_SAVE_FORMAT_ERROR);
    }

    const content = await entry.async("string");
    if (!content || content.trim().length === 0) {
      continue;
    }

    const entryBytes = getByteLength(content);
    if (entryBytes > MAX_SLOT_SIZE_BYTES) {
      throw new Error(INVALID_SAVE_FORMAT_ERROR);
    }

    totalExtractedBytes += entryBytes;
    if (totalExtractedBytes > MAX_TOTAL_ARCHIVE_SIZE_BYTES) {
      throw new Error(INVALID_SAVE_FORMAT_ERROR);
    }

    result[slotKey] = content;
  }
  if (Object.keys(result).length === 0) {
    throw new Error(INVALID_SAVE_FORMAT_ERROR);
  }

  return result;
}

/**
 * Validates and parses either a .zip archive or individual .rpgsave File/Blob.
 */
export async function parseAndValidateSaveFile(
  file: File | Blob,
  filename?: string
): Promise<Record<string, string>> {
  if (!file || file.size === 0 || file.size > MAX_TOTAL_ARCHIVE_SIZE_BYTES) {
    throw new Error(INVALID_SAVE_FORMAT_ERROR);
  }
  const resolvedName = (filename || (file as File).name || "").trim();
  const lowerName = resolvedName.toLowerCase();

  // Check if it's a zip archive by extension or MIME type
  const isZip =
    lowerName.endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed";

  if (isZip) {
    return parseAndValidateZipArchive(file);
  }

  // Check if it's an .rpgsave file
  const isRpgsave = lowerName.endsWith(".rpgsave");
  if (isRpgsave) {
    // Pre-validation before buffering file into memory
    if (file.size > MAX_SLOT_SIZE_BYTES) {
      throw new Error(INVALID_SAVE_FORMAT_ERROR);
    }

    const slotKey = validateSaveFileName(resolvedName);
    if (!slotKey) {
      throw new Error(INVALID_SAVE_FORMAT_ERROR);
    }
    const text = await file.text();
    if (!text || text.trim().length === 0) {
      throw new Error(INVALID_SAVE_FORMAT_ERROR);
    }

    if (getByteLength(text) > MAX_SLOT_SIZE_BYTES) {
      throw new Error(INVALID_SAVE_FORMAT_ERROR);
    }

    return { [slotKey]: text };
  }

  // Attempt to check if the file is a zip by magic bytes (PK\x03\x04)
  try {
    const slice = file.slice(0, 4);
    const headerBuffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(headerBuffer);
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return await parseAndValidateZipArchive(file);
    }
  } catch {
    // Not a readable zip
  }

  throw new Error(INVALID_SAVE_FORMAT_ERROR);
}

/**
 * End-to-end import orchestration: validates file client-side and transmits save slots
 * to the engine iframe via ROPODUCTIONS_SET_SAVES.
 */
export async function importSaves(
  targetWindow: Window,
  file: File | Blob,
  filename?: string,
  options?: ImportSavesOptions
): Promise<ImportSavesResult> {
  const slotMap = await parseAndValidateSaveFile(file, filename);
  const slots = Object.keys(slotMap);

  await restoreSaves(
    targetWindow,
    slotMap,
    options?.targetOrigin,
    options?.timeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS
  );

  return {
    slotCount: slots.length,
    slots,
  };
}
