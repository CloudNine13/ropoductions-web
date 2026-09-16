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
