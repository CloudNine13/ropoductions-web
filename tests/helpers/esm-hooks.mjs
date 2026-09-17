import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return {
      url: new URL("./next-server-shim.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  }
  if (specifier.startsWith("@/")) {
    const projectRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../.."
    );
    const subPath = specifier.slice(2);
    const candidates = [
      path.resolve(projectRoot, "src", subPath),
      path.resolve(projectRoot, "src", `${subPath}.ts`),
      path.resolve(projectRoot, "src", `${subPath}.tsx`),
      path.resolve(projectRoot, "src", subPath, "index.ts"),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !path.extname(specifier) &&
    context.parentURL?.startsWith("file:")
  ) {
    const candidate = path.resolve(
      path.dirname(fileURLToPath(context.parentURL)),
      `${specifier}.ts`
    );
    if (existsSync(candidate)) {
      return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier);
}
