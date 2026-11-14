import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { checkForUpdate, VERSION } from "../src/version";

const realFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof mock>;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const recent = () => String(Date.now() - 60_000);
const stale = () => String(Date.now() - 2 * 24 * 60 * 60 * 1000);

beforeEach(() => {
  fetchMock = mock(async () => new Response(JSON.stringify({ version: "999.0.0" })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("checkForUpdate", () => {
  it("skips the fetch when a sync KV (v1) says it checked today", async () => {
    checkForUpdate(() => {}, { get: () => recent(), set: () => {} });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the fetch when an async KV (v2) says it checked today", async () => {
    checkForUpdate(() => {}, { get: async () => recent(), set: async () => {} });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches, records the check and toasts when the last check is stale", async () => {
    const toast = mock(() => {});
    const set = mock(() => {});
    checkForUpdate(toast, { get: () => stale(), set });
    await flush();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("lastUpdateCheck", expect.any(String));
    expect(toast).toHaveBeenCalledWith({
      message: `vimcode update available: v${VERSION} → v999.0.0`,
      variant: "info",
      duration: 5000,
    });
  });

  it("fetches when there is no KV", async () => {
    checkForUpdate(() => {});
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
