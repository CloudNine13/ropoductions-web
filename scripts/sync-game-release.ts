import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BRANCH_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._\/-]{0,100}$/;

export interface GameStructureValidationResult {
  gameTitle: string;
  versionId: number;
  fileCount: number;
}

export interface WebBridgeInjectionResult {
  injected: boolean;
  alreadyPresent: boolean;
}

export interface AssetSegregationResult {
  mediaFiles: string[];
  shellFiles: string[];
}

export interface BuildMetadataOptions {
  upstreamRepo: string;
  branch: string;
  commitSha: string;
  syncedAt: string;
  outputDir: string;
}

export interface BuildMetadata {
  upstreamRepo: string;
  branch: string;
  commitSha: string;
  syncedAt: string;
}

/**
 * Validates branch name against injection attacks, path traversal, and invalid characters.
 */
export function validateBranchName(branch: unknown): string {
  if (typeof branch !== "string" || branch.trim().length === 0) {
    throw new Error("Invalid branch name format: branch name cannot be empty");
  }

  const trimmed = branch.trim();

  if (trimmed.startsWith("-")) {
    throw new Error(`Invalid branch name format: cannot start with hyphen (${trimmed})`);
  }

  if (trimmed.includes("..") || trimmed.includes("//")) {
    throw new Error(`Invalid branch name format: cannot contain traversal sequences (${trimmed})`);
  }

  if (!BRANCH_REGEX.test(trimmed)) {
    throw new Error(`Invalid branch name format: prohibited characters in ${trimmed}`);
  }

  return trimmed;
}

/**
 * Resolves target branch name, defaulting to 'main' when omitted, empty, or 'auto'.
 */
export async function resolveTargetBranch(
  inputBranch?: string
): Promise<string> {
  const normalized = inputBranch?.trim();
  if (!normalized || normalized === "auto") {
    return "main";
  }

  return validateBranchName(normalized);
}

/**
 * Locates RPG Maker MZ root directory, handling subdirectory (Final Orginity/) or repo root.
 */
export function locateGameRoot(baseDir: string): string {
  const subDirPath = path.join(baseDir, "Final Orginity");
  if (fs.existsSync(path.join(subDirPath, "data", "System.json"))) {
    return subDirPath;
  }

  if (fs.existsSync(path.join(baseDir, "data", "System.json"))) {
    return baseDir;
  }

  throw new Error(`Could not locate RPG Maker MZ game root in ${baseDir} (neither Final Orginity/data/System.json nor data/System.json found)`);
}

/**
 * Validates critical game files and parses all JSON databases to ensure zero schema corruption.
 */
export function validateGameStructure(gameDir: string): GameStructureValidationResult {
  const requiredFiles = ["index.html", "package.json", path.join("data", "System.json")];

  for (const relPath of requiredFiles) {
    const fullPath = path.join(gameDir, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing required game file: ${relPath}`);
    }
  }

  const systemJsonPath = path.join(gameDir, "data", "System.json");
  let systemJsonContent: string;
  try {
    systemJsonContent = fs.readFileSync(systemJsonPath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read data/System.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  interface SystemJsonShape {
    gameTitle?: string;
    versionId?: number;
    variables?: unknown[];
    switches?: unknown[];
  }

  let systemData: SystemJsonShape;
  try {
    systemData = JSON.parse(systemJsonContent) as SystemJsonShape;
  } catch (err) {
    throw new Error(`Corrupted JSON in data/System.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (typeof systemData.gameTitle !== "string" || !systemData.gameTitle) {
    throw new Error("data/System.json is missing valid gameTitle");
  }

  // Iterate and validate all JSON files under data/
  const dataDir = path.join(gameDir, "data");
  const dataEntries = fs.readdirSync(dataDir);
  let fileCount = 0;

  for (const entry of dataEntries) {
    if (entry.endsWith(".json")) {
      fileCount++;
      const entryPath = path.join(dataDir, entry);
      const stat = fs.statSync(entryPath);
      if (stat.size === 0) {
        throw new Error(`Corrupted JSON in data/${entry}: file is empty (0 bytes)`);
      }

      const content = fs.readFileSync(entryPath, "utf-8");
      try {
        JSON.parse(content);
      } catch (err) {
        throw new Error(`Corrupted JSON in data/${entry}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return {
    gameTitle: systemData.gameTitle,
    versionId: typeof systemData.versionId === "number" ? systemData.versionId : 0,
    fileCount: fileCount + 2, // data json files + package.json + index.html
  };
}

/**
 * Injects Ropoductions_WebBridge.js into js/plugins/ and registers in js/plugins.js idempotently.
 */
export function injectWebBridge(gameDir: string, bridgeSourcePath: string): WebBridgeInjectionResult {
  const targetPluginDir = path.join(gameDir, "js", "plugins");
  fs.mkdirSync(targetPluginDir, { recursive: true });

  const targetPluginPath = path.join(targetPluginDir, "Ropoductions_WebBridge.js");
  fs.copyFileSync(bridgeSourcePath, targetPluginPath);

  const pluginsJsPath = path.join(gameDir, "js", "plugins.js");
  if (!fs.existsSync(pluginsJsPath)) {
    throw new Error(`Missing js/plugins.js in ${gameDir}`);
  }

  const pluginsJsContent = fs.readFileSync(pluginsJsPath, "utf-8");

  if (pluginsJsContent.includes('"Ropoductions_WebBridge"') || pluginsJsContent.includes("'Ropoductions_WebBridge'")) {
    return { injected: false, alreadyPresent: true };
  }

  const bridgeEntry = '{"name":"Ropoductions_WebBridge","status":true,"description":"Web Shell PostMessage Save Bridge","parameters":{}}';

  const lastBracketIndex = pluginsJsContent.lastIndexOf("]");
  if (lastBracketIndex === -1) {
    throw new Error("Could not find closing bracket ']' of $plugins in js/plugins.js");
  }

  const arrayPrefix = pluginsJsContent.slice(0, lastBracketIndex).trimEnd();
  const arraySuffix = pluginsJsContent.slice(lastBracketIndex);

  let updatedContent: string;

  if (arrayPrefix.endsWith("[")) {
    // Empty array: var $plugins = [
    updatedContent = `${arrayPrefix}\n${bridgeEntry}\n${arraySuffix}`;
  } else if (arrayPrefix.endsWith(",")) {
    // Trailing comma present
    updatedContent = `${arrayPrefix}\n${bridgeEntry}\n${arraySuffix}`;
  } else {
    // Items present without trailing comma
    updatedContent = `${arrayPrefix},\n${bridgeEntry}\n${arraySuffix}`;
  }

  // Syntax validation using new Function()
  try {
    new Function(`${updatedContent}; return $plugins;`);
  } catch (err) {
    throw new Error(`Injected js/plugins.js has invalid JavaScript syntax: ${err instanceof Error ? err.message : String(err)}`);
  }

  fs.writeFileSync(pluginsJsPath, updatedContent, "utf-8");
  return { injected: true, alreadyPresent: false };
}

/**
 * Segregates assets into media files (for R2) and shell files (for the engine
 * shell staging directory, uploaded to the R2 `engine/` prefix by the
 * workflow), rejecting symlinks.
 */
export function segregateAssets(gameDir: string, publicEngineDir: string): AssetSegregationResult {
  const mediaRootDirs = new Set(["audio", "img", "effects", "movies", "data"]);
  const shellDirsOrFiles = new Set(["index.html", "js", "css", "fonts", "icon", "package.json"]);

  const mediaFiles: string[] = [];
  const shellFiles: string[] = [];

  const canonicalEngineDir = path.resolve(publicEngineDir);

  function walk(currentDir: string, relativeDir: string) {
    const entries = fs.readdirSync(currentDir);

    for (const entry of entries) {
      if (entry === ".git" || entry === ".github" || entry === "tools") {
        continue;
      }

      const fullPath = path.join(currentDir, entry);
      const relPath = relativeDir ? path.join(relativeDir, entry) : entry;

      const stat = fs.lstatSync(fullPath);
      if (stat.isSymbolicLink()) {
        throw new Error(`Symbolic links are forbidden in game release: ${relPath}`);
      }

      if (stat.isDirectory()) {
        const topLevelDir = relPath.split(path.sep)[0];
        if (mediaRootDirs.has(topLevelDir)) {
          walk(fullPath, relPath);
        } else if (shellDirsOrFiles.has(topLevelDir)) {
          walk(fullPath, relPath);
        }
      } else if (stat.isFile()) {
        const topLevelSegment = relPath.split(path.sep)[0];
        const posixRelPath = relPath.split(path.sep).join("/");
        if (mediaRootDirs.has(topLevelSegment)) {
          mediaFiles.push(posixRelPath);
        } else if (shellDirsOrFiles.has(topLevelSegment)) {
          shellFiles.push(posixRelPath);

          const destPath = path.resolve(publicEngineDir, relPath);
          const allowedPrefix = canonicalEngineDir.endsWith(path.sep)
            ? canonicalEngineDir
            : canonicalEngineDir + path.sep;
          if (destPath !== canonicalEngineDir && !destPath.startsWith(allowedPrefix)) {
            throw new Error(`Path containment violation: ${destPath} outside ${canonicalEngineDir}`);
          }
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(fullPath, destPath);
        }
      }
    }
  }

  walk(gameDir, "");
  return { mediaFiles, shellFiles };
}

/**
 * Generates build-metadata.json in the public engine directory.
 */
export function generateBuildMetadata(options: BuildMetadataOptions): BuildMetadata {
  const metadata: BuildMetadata = {
    upstreamRepo: options.upstreamRepo,
    branch: options.branch,
    commitSha: options.commitSha,
    syncedAt: options.syncedAt,
  };

  const dest = path.join(options.outputDir, "build-metadata.json");
  fs.mkdirSync(options.outputDir, { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(metadata, null, 2) + "\n", "utf-8");

  return metadata;
}

// CLI Execution Entry Point
async function runCli() {
  const upstreamBaseDir = process.env.UPSTREAM_DIR || process.argv[2];
  const shellOutputDir = process.env.SHELL_OUTPUT_DIR || process.argv[3] || "tmp_engine_shell";
  const bridgePluginPath = process.env.BRIDGE_PLUGIN_PATH || "src/engine-plugins/Ropoductions_WebBridge.js";
  const branchInput = process.env.BRANCH_INPUT || process.argv[4] || "main";

  if (!upstreamBaseDir) {
    console.error("Usage: tsx scripts/sync-game-release.ts <upstream-dir> [shell-output-dir] [branch]");
    process.exit(1);
  }

  console.log("=== Ropoductions Game Release Ingestion ===");
  console.log(`Upstream Directory: ${upstreamBaseDir}`);
  console.log(`Target Shell Staging Directory: ${shellOutputDir}`);

  const resolvedBranch = await resolveTargetBranch(branchInput);
  console.log(`Resolved Target Branch: ${resolvedBranch}`);

  const gameRoot = locateGameRoot(upstreamBaseDir);
  console.log(`Detected Game Root: ${gameRoot}`);

  const validation = validateGameStructure(gameRoot);
  console.log(`Validated Game: "${validation.gameTitle}" (version ${validation.versionId}, ${validation.fileCount} files)`);

  const injection = injectWebBridge(gameRoot, bridgePluginPath);
  console.log(`WebBridge Injection: injected=${injection.injected}, alreadyPresent=${injection.alreadyPresent}`);

  const segregation = segregateAssets(gameRoot, shellOutputDir);
  console.log(`Segregated: ${segregation.mediaFiles.length} media files, ${segregation.shellFiles.length} shell files staged.`);

  generateBuildMetadata({
    upstreamRepo: "salamin888/Final_Orginity",
    branch: resolvedBranch,
    commitSha: process.env.UPSTREAM_COMMIT_SHA || "unknown",
    syncedAt: new Date().toISOString(),
    outputDir: shellOutputDir,
  });

  console.log("Ingestion engine execution completed successfully.");
}

const isDirectExecution =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  runCli().catch((err) => {
    console.error("Fatal ingestion error:", err);
    process.exit(1);
  });
}
