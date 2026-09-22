import type { Page } from "@playwright/test";
import {
  ENGINE_BOOT_FAILURE_MESSAGE_TYPE,
  ENGINE_READY_MESSAGE_TYPE,
} from "../../src/types/engine-boot";

/**
 * Records the engine's own boot reports in every frame before any page script runs,
 * so a spec can assert the player-visible outcome and the report stream independently
 * of the recovery surface.
 */
export const BOOT_REPORT_RECORDER = `
window.__ropoductionsE2eBootReports = { ready: 0, failures: [] };
window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object" || typeof data.type !== "string") return;
  if (data.type === ${JSON.stringify(ENGINE_READY_MESSAGE_TYPE)}) {
    window.__ropoductionsE2eBootReports.ready += 1;
  }
  if (data.type === ${JSON.stringify(ENGINE_BOOT_FAILURE_MESSAGE_TYPE)}) {
    window.__ropoductionsE2eBootReports.failures.push(data);
  }
});
`;

export interface BootReports {
  ready: number;
  failures: Array<{ failureClass: string; raw?: string; diagnostics?: Record<string, unknown> }>;
}

export async function installBootReportRecorder(page: Page): Promise<void> {
  await page.addInitScript({ content: BOOT_REPORT_RECORDER });
}

/** Reports seen since the current document was created; a reload resets the recorder. */
export async function readBootReports(page: Page): Promise<BootReports> {
  return page.evaluate(
    () =>
      (window as unknown as { __ropoductionsE2eBootReports: BootReports })
        .__ropoductionsE2eBootReports ?? { ready: 0, failures: [] }
  );
}

export interface ResourceEntry {
  name: string;
  /** Bytes that crossed the network; `0` is the signature of a cache-served response. */
  transferSize: number;
}

export async function readResourceEntries(page: Page): Promise<ResourceEntry[]> {
  return page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      transferSize: (entry as PerformanceResourceTiming).transferSize,
    }))
  );
}
