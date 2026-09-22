import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  chromium,
  firefox,
  type BrowserType,
  type Cookie,
  type Page,
} from "playwright-core";
import { isAddressedShellRequest } from "../src/lib/engine-addressing";
import { E2E_FIXTURES, sessionCookies } from "../e2e/helpers/session";

/**
 * Boots `/play` in Chromium and Firefox against a target and prints the Epic 7
 * evidence table: boot profile, per-boot WebGL context count and per-request
 * statuses, per load — the cold load plus `--reloads` consecutive reloads, so the
 * brief's reload measurements (one document request, no shell subresource re-fetch)
 * are reproducible on demand (`_bmad-output/specs/spec-ropoductions-web/engine-browser-compat.md`
 * §6).
 *
 * The target must serve the real engine shell for the table to describe production
 * delivery: the private R2 bucket is only reachable through the worker, so point
 * `--target` at the deployed portal (with `PROFILE_SESSION_COOKIE`) or at a local
 * preview whose bucket holds a published shell. A target that still serves the
 * website's mock harness is reported as `mock` and refused unless `--allow-mock`
 * is passed, because the mock boot allocates no WebGL context and issues no boot
 * profile.
 */

const ENGINE_REQUEST = /^\/(engine|api\/game)\//;
const ENGINE_READY_MESSAGE_TYPE = "ROPODUCTIONS_ENGINE_READY";
const BOOT_READY_TIMEOUT_MS = 30000;

/** Counts context creation and `WEBGL_lose_context` releases in every frame. */
const PROBE_INIT = `
(() => {
  const state = { contexts: [], losses: [] };
  window.__ropoductionsProfile = state;
  const wrap = (prototype) => {
    if (!prototype || typeof prototype.getContext !== "function") return;
    const original = prototype.getContext;
    prototype.getContext = function (type, ...rest) {
      const context = original.call(this, type, ...rest);
      if (typeof type !== "string" || !type.toLowerCase().startsWith("webgl")) return context;
      state.contexts.push({
        type,
        created: context !== null,
        attached: this.isConnected === true,
        width: this.width,
        height: this.height,
      });
      if (context && typeof context.getExtension === "function") {
        const originalGetExtension = context.getExtension.bind(context);
        context.getExtension = (name) => {
          const extension = originalGetExtension(name);
          if (name === "WEBGL_lose_context" && extension && typeof extension.loseContext === "function") {
            const originalLoseContext = extension.loseContext.bind(extension);
            extension.loseContext = () => {
              state.losses.push(type);
              return originalLoseContext();
            };
          }
          return extension;
        };
      }
      return context;
    };
  };
  wrap(window.HTMLCanvasElement && HTMLCanvasElement.prototype);
  wrap(window.OffscreenCanvas && OffscreenCanvas.prototype);
})();
`;

const READY_INIT = `
(() => {
  const state = window.__ropoductionsProfile || (window.__ropoductionsProfile = { contexts: [], losses: [] });
  state.readyAtMs = null;
  state.failure = null;
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data.type !== "string") return;
    if (data.type === ${JSON.stringify(ENGINE_READY_MESSAGE_TYPE)} && state.readyAtMs === null) {
      state.readyAtMs = performance.now();
    }
    if (data.type === "ROPODUCTIONS_ENGINE_BOOT_FAILURE") {
      state.failure = data;
    }
  });
})();
`;

interface Options {
  target: string;
  /** Page measured under reload; `/play` is the engine entry point. */
  url: string;
  browsers: string[];
  headed: boolean;
  allowMock: boolean;
  reloads: number;
  /** Budget for the engine's ready report; a shell fixture never reports one. */
  readyTimeoutMs: number;
  outDir: string;
}

interface RequestRecord {
  url: string;
  status: number;
  cacheControl: string;
  cacheServed: boolean;
}

interface ShellProvenance {
  shell: "real" | "mock";
  headers: Record<string, string>;
  documentBytes: number;
}

interface FrameState {
  contexts: number;
  losses: number;
  readyAtMs: number | null;
  failure: string | null;
  resources: Map<string, number>;
}

interface LoadRecord {
  kind: "cold" | "reload";
  bootMs: number | null;
  failure: string | null;
  contextsCreated: number;
  contextsLost: number;
  requests: RequestRecord[];
}

interface BootProfile {
  browser: string;
  provenance: ShellProvenance;
  loads: LoadRecord[];
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    target: "http://127.0.0.1:3100",
    browsers: ["chromium", "firefox"],
    url: "/play",
    headed: false,
    allowMock: false,
    reloads: 1,
    readyTimeoutMs: BOOT_READY_TIMEOUT_MS,
    outDir: "tmp/profile-boot",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = argv[index].split("=");
    const value = inline ?? argv[index + 1];
    const take = () => {
      if (inline === undefined) index += 1;
      if (value === undefined) throw new Error(`${flag} requires a value`);
      return value;
    };
    switch (flag) {
      case "--target":
        options.target = take().replace(/\/$/, "");
        break;
      case "--browsers":
        options.browsers = take()
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean);
        break;
      case "--headed":
        options.headed = true;
        break;
      case "--allow-mock":
        options.allowMock = true;
        break;
      case "--url": {
        const url = take();
        if (!url.startsWith("/")) {
          throw new Error("--url expects a path on the target origin, e.g. /play");
        }
        options.url = url;
        break;
      }
      case "--ready-timeout": {
        const timeout = Number(take());
        if (!Number.isFinite(timeout) || timeout <= 0) {
          throw new Error("--ready-timeout expects milliseconds");
        }
        options.readyTimeoutMs = timeout;
        break;
      }
      case "--reloads": {
        const reloads = Number(take());
        if (!Number.isInteger(reloads) || reloads < 0) {
          throw new Error("--reloads expects a non-negative integer");
        }
        options.reloads = reloads;
        break;
      }
      case "--out":
        options.outDir = take();
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return options;
}

async function resolveCookies(target: string): Promise<Cookie[]> {
  const sessionCookie = process.env.PROFILE_SESSION_COOKIE;
  const origin = new URL(target);
  const domain = origin.hostname;
  if (sessionCookie) {
    const cookie = (name: string, value: string): Cookie => ({
      name,
      value,
      domain,
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    });
    return [cookie("ropoductions_session", sessionCookie), cookie("ropoductions_age_verified", "true")];
  }
  if (!/^127\.0\.0\.1|^localhost$/i.test(domain)) {
    throw new Error(
      `Set PROFILE_SESSION_COOKIE to a patron session cookie for ${target}, or target the local preview.`
    );
  }
  const cookies = await sessionCookies(E2E_FIXTURES.plainPatron.sessionId);
  return cookies as Cookie[];
}

async function inspectShell(provenance: ShellProvenance, headers: Record<string, string>, body: string): Promise<void> {
  provenance.headers = headers;
  provenance.documentBytes = Buffer.byteLength(body);
  // A published MZ shell always boots through `js/main.js`; the website harness never does.
  provenance.shell = /(^|["'/])main\.js(\?|["'#]|$)/m.test(body) ? "real" : "mock";
}

async function collectFrameState(page: Page): Promise<{
  contexts: number;
  losses: number;
  readyAtMs: number | null;
  failure: string | null;
  resources: Map<string, number>;
}> {
  let contexts = 0;
  let losses = 0;
  let readyAtMs: number | null = null;
  let failure: string | null = null;
  const resources = new Map<string, number>();

  for (const frame of page.frames()) {
    if (frame.isDetached()) {
      continue;
    }
    try {
      const state = await frame.evaluate(() => {
        const profile = (window as unknown as {
          __ropoductionsProfile?: {
            contexts: Array<{ created: boolean }>;
            losses: string[];
            readyAtMs: number | null;
            failure: { failureClass?: string } | null;
          };
        }).__ropoductionsProfile;
        return {
          contexts: profile?.contexts?.filter((entry) => entry.created).length ?? 0,
          losses: profile?.losses?.length ?? 0,
          readyAtMs: profile?.readyAtMs ?? null,
          failure: profile?.failure?.failureClass ?? null,
          resources: performance.getEntriesByType("resource").map((entry) => ({
            name: entry.name,
            transferSize: (entry as PerformanceResourceTiming).transferSize,
          })),
        };
      });
      contexts += state.contexts;
      losses += state.losses;
      readyAtMs = readyAtMs ?? state.readyAtMs;
      failure = failure ?? state.failure;
      for (const entry of state.resources) {
        const url = new URL(entry.name);
        resources.set(`${url.pathname}${url.search}`, entry.transferSize);
      }
    } catch {
      // A frame that navigated away mid-read contributes nothing.
    }
  }
  return { contexts, losses, readyAtMs, failure, resources };
}

/** Waits for the engine's own ready report, bounded by the host's own boot budget. */
async function waitForBoot(page: Page, startedAt: number, timeoutMs: number): Promise<FrameState> {
  let state = await collectFrameState(page);
  while (state.readyAtMs === null && !state.failure && Date.now() - startedAt < timeoutMs) {
    await page.waitForTimeout(250);
    state = await collectFrameState(page);
  }
  return state;
}

async function profileBrowser(
  name: string,
  browserType: BrowserType,
  options: Options,
  cookies: Cookie[]
): Promise<BootProfile> {
  const browser = await browserType.launch({ headless: !options.headed });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addCookies(cookies);
    await context.addInitScript({ content: PROBE_INIT });
    await context.addInitScript({ content: READY_INIT });

    const page = await context.newPage();
    let requests: RequestRecord[] = [];
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (!ENGINE_REQUEST.test(url.pathname)) return;
      requests.push({
        url: `${url.pathname}${url.search}`,
        status: response.status(),
        cacheControl: response.headers()["cache-control"] ?? "",
        cacheServed: false,
      });
    });

    const shellResponse = await context.request.get(`${options.target}/engine/index.html`);
    const provenance: ShellProvenance = { shell: "mock", headers: {}, documentBytes: 0 };
    await inspectShell(provenance, shellResponse.headers(), await shellResponse.text());

    const loads: LoadRecord[] = [];
    for (let index = 0; index <= options.reloads; index += 1) {
      requests = [];
      const startedAt = Date.now();
      if (index === 0) {
        await page.goto(`${options.target}${options.url}`, { waitUntil: "load" });
      } else {
        await page.reload({ waitUntil: "load" });
      }
      const state = await waitForBoot(page, startedAt, options.readyTimeoutMs);
      for (const request of requests) {
        request.cacheServed = state.resources.get(request.url) === 0;
      }
      loads.push({
        kind: index === 0 ? "cold" : "reload",
        bootMs: state.readyAtMs === null ? null : Math.round(Date.now() - startedAt),
        failure: state.failure,
        contextsCreated: state.contexts,
        contextsLost: state.losses,
        requests,
      });
    }

    return { browser: name, provenance, loads };
  } finally {
    // A failure mid-run must not leave a browser process holding the event loop open.
    await browser.close();
  }
}

function printReport(profiles: BootProfile[], options: Options): void {
  for (const profile of profiles) {
    const allRequests = profile.loads.flatMap((load) => load.requests);
    const shell = allRequests.filter((request) => request.url.startsWith("/engine/"));
    const addressed = shell.filter((request) =>
      isAddressedShellRequest(new URLSearchParams(request.url.split("?")[1] ?? ""))
    ).length;
    const media = allRequests.filter((request) => request.url.startsWith("/api/game/")).length;
    const failures = allRequests.filter((request) => ![200, 304].includes(request.status));
    const cached = allRequests.filter((request) => request.cacheServed).length;

    console.log("");
    console.log(`=== ${profile.browser} ===`);
    console.log(`target                ${options.target}${options.url}`);
    console.log(
      `shell source          ${profile.provenance.shell}${profile.provenance.shell === "mock" ? " (website mock harness, not the published shell)" : ""}`
    );
    console.log(
      `document headers      ${Object.entries(profile.provenance.headers)
        .filter(([key]) => ["content-security-policy", "x-frame-options", "x-content-type-options"].includes(key))
        .map(([key, value]) => `${key}=${value.slice(0, 40)}`)
        .join(" | ")}`
    );
    console.log(
      `requests              shell ${shell.length} (addressed ${addressed}), media ${media}, cache-served ${cached}, non-200/304 ${failures.length}`
    );
    console.log(`loads                 ${profile.loads.length} (cold + ${profile.loads.length - 1} reload(s))`);
    for (const [index, load] of profile.loads.entries()) {
      const loadShell = load.requests.filter((request) => request.url.startsWith("/engine/"));
      const loadMedia = load.requests.filter((request) => request.url.startsWith("/api/game/"));
      const loadCached = load.requests.filter((request) => request.cacheServed).length;
      const loadFailures = load.requests.filter((request) => ![200, 304].includes(request.status)).length;
      console.log(
        `  load ${String(index + 1).padEnd(2)}${load.kind.padEnd(7)}ready ${
          load.bootMs === null ? "none" : `${load.bootMs} ms`
        }, webgl ${load.contextsCreated}/${load.contextsLost}, shell ${loadShell.length}, media ${loadMedia.length}, cache-served ${loadCached}, non-200/304 ${loadFailures}, failure ${load.failure ?? "none"}`
      );
      for (const request of load.requests) {
        console.log(
          `      ${String(request.status).padEnd(4)}${request.cacheServed ? "cache" : "net  "}  ${request.url}`
        );
      }
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const cookies = await resolveCookies(options.target);
  const browserTypes: Record<string, BrowserType> = { chromium, firefox };
  const profiles: BootProfile[] = [];

  for (const name of options.browsers) {
    const browserType = browserTypes[name];
    if (!browserType) {
      throw new Error(`Unknown browser "${name}"; expected chromium or firefox`);
    }
    profiles.push(await profileBrowser(name, browserType, options, cookies));
  }

  const mocked = profiles.filter((profile) => profile.provenance.shell === "mock");
  printReport(profiles, options);

  mkdirSync(options.outDir, { recursive: true });
  const outPath = resolve(options.outDir, `boot-profile-${Date.now()}.json`);
  writeFileSync(outPath, `${JSON.stringify({ target: options.target, profiles }, null, 2)}\n`, "utf-8");
  console.log("");
  console.log(`report: ${outPath}`);

  if (mocked.length > 0 && !options.allowMock) {
    console.error(
      `\n${mocked.length} of ${profiles.length} run(s) served the website mock harness. ` +
        "Point --target at the deployed portal (PROFILE_SESSION_COOKIE=...) or a preview whose bucket holds a published shell, " +
        "or pass --allow-mock to record the harness plumbing only."
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`profile:boot failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
