import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ModelUsageDashboard } from "@deepwrite/contracts";
import { SoftwareTokenUsageReporter } from "./software-token-usage-reporter";

const roots: string[] = [];
const INSTALLATION_ID = "11111111-1111-4111-8111-111111111111";
const FIRST_REPORT_ID = "22222222-2222-4222-8222-222222222222";
const SECOND_REPORT_ID = "33333333-3333-4333-8333-333333333333";
const THIRD_REPORT_ID = "44444444-4444-4444-8444-444444444444";

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "deepwrite-software-token-usage-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

function dashboard(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number
): ModelUsageDashboard {
  return {
    generatedAt: "2026-08-15T00:00:00.000Z",
    totals: {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      totalTokens:
        inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
      requestCount: 1
    },
    trendGranularity: "day",
    trend: [],
    models: [],
    modules: [],
    recentCalls: []
  };
}

function ids(...values: string[]): () => string {
  let index = 0;
  return () => values[index++] ?? THIRD_REPORT_ID;
}

describe("SoftwareTokenUsageReporter", () => {
  it("sends the complete first stock, combines cache tokens, then sends only deltas", async () => {
    const root = await temporaryRoot();
    let current = dashboard(100, 40, 12, 8);
    const bodies: Array<Record<string, unknown>> = [];
    let flushes = 0;
    const reporter = new SoftwareTokenUsageReporter(
      root,
      {
        flush: async () => { flushes += 1; },
        query: async () => current
      },
      {
        enabled: true,
        createId: ids(INSTALLATION_ID, FIRST_REPORT_ID, SECOND_REPORT_ID),
        now: () => Date.parse("2026-08-15T08:00:00.000Z"),
        reportUrl: "https://relay.example.test/deepwrite/v1/software-token-usage",
        headers: () => new Headers({ Authorization: "Bearer invalid-test-key" }),
        fetcher: async (_url, init) => {
          bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return new Response(null, { status: 204 });
        }
      }
    );

    await reporter.reportAtStartup();
    current = dashboard(125, 49, 17, 10);
    await reporter.reportBeforeShutdown();

    expect(flushes).toBe(2);
    expect(bodies).toEqual([
      {
        schemaVersion: 1,
        installationId: INSTALLATION_ID,
        reportId: FIRST_REPORT_ID,
        mode: "initial",
        inputTokens: 100,
        outputTokens: 40,
        cacheTokens: 20
      },
      {
        schemaVersion: 1,
        installationId: INSTALLATION_ID,
        reportId: SECOND_REPORT_ID,
        mode: "increment",
        inputTokens: 25,
        outputTokens: 9,
        cacheTokens: 7
      }
    ]);
  });

  it("reports a zero increment on the first startup of a new local day", async () => {
    const root = await temporaryRoot();
    let now = Date.parse("2026-08-15T08:00:00.000Z");
    const bodies: Array<Record<string, unknown>> = [];
    const reporter = new SoftwareTokenUsageReporter(
      root,
      { flush: async () => undefined, query: async () => dashboard(5, 3, 2, 1) },
      {
        enabled: true,
        createId: ids(INSTALLATION_ID, FIRST_REPORT_ID, SECOND_REPORT_ID),
        now: () => now,
        reportUrl: "https://relay.example.test/deepwrite/v1/software-token-usage",
        headers: () => new Headers(),
        fetcher: async (_url, init) => {
          bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return new Response(null, { status: 204 });
        }
      }
    );

    await reporter.reportAtStartup();
    await reporter.reportAtStartup();
    now = Date.parse("2026-08-16T08:00:00.000Z");
    await reporter.reportAtStartup();

    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toMatchObject({
      mode: "increment",
      inputTokens: 0,
      outputTokens: 0,
      cacheTokens: 0
    });
  });

  it("keeps and retries the same pending report after a network failure", async () => {
    const root = await temporaryRoot();
    const bodies: Array<Record<string, unknown>> = [];
    let attempt = 0;
    const options = {
      enabled: true,
      createId: ids(INSTALLATION_ID, FIRST_REPORT_ID, SECOND_REPORT_ID),
      now: () => Date.parse("2026-08-15T08:00:00.000Z"),
      reportUrl: "https://relay.example.test/deepwrite/v1/software-token-usage",
      headers: () => new Headers(),
      fetcher: async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        attempt += 1;
        return new Response(null, { status: attempt === 1 ? 503 : 204 });
      }
    };
    const usageReader = {
      flush: async () => undefined,
      query: async () => dashboard(10, 4, 2, 1)
    };

    await new SoftwareTokenUsageReporter(root, usageReader, options).reportAtStartup();
    const pendingState = await readFile(
      join(root, "usage", "software-token-report-v1.json"),
      "utf8"
    );
    expect(pendingState).toContain(FIRST_REPORT_ID);

    await new SoftwareTokenUsageReporter(root, usageReader, {
      ...options,
      createId: ids(THIRD_REPORT_ID)
    }).reportAtStartup();

    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.reportId).toBe(FIRST_REPORT_ID);
    expect(bodies[1]?.reportId).toBe(FIRST_REPORT_ID);
  });

  it("rebases regressed local counters without sending a negative correction or new stock", async () => {
    const root = await temporaryRoot();
    let current = dashboard(100, 50, 20, 10);
    const bodies: Array<Record<string, unknown>> = [];
    const reporter = new SoftwareTokenUsageReporter(
      root,
      { flush: async () => undefined, query: async () => current },
      {
        enabled: true,
        createId: ids(INSTALLATION_ID, FIRST_REPORT_ID, SECOND_REPORT_ID),
        now: () => Date.parse("2026-08-15T08:00:00.000Z"),
        reportUrl: "https://relay.example.test/deepwrite/v1/software-token-usage",
        headers: () => new Headers(),
        fetcher: async (_url, init) => {
          bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return new Response(null, { status: 204 });
        }
      }
    );

    await reporter.reportAtStartup();
    current = dashboard(4, 3, 2, 1);
    await reporter.reportBeforeShutdown();
    current = dashboard(9, 5, 3, 2);
    await reporter.reportBeforeShutdown();

    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toMatchObject({
      mode: "increment",
      inputTokens: 5,
      outputTokens: 2,
      cacheTokens: 2
    });
  });
});
