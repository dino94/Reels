import { describe, expect, it } from "vitest";
import { retryDelay } from "@/lib/gemini";

function responseWithRetryAfter(value: string | null) {
  return new Response(null, { status: 429, headers: value ? { "retry-after": value } : {} });
}

describe("retryDelay", () => {
  it("utilise retry-after en secondes, plafonné à 15 s", () => {
    expect(retryDelay(responseWithRetryAfter("30"), 0)).toBe(15_000);
    expect(retryDelay(responseWithRetryAfter("2"), 0)).toBe(2_000);
  });

  it("utilise retry-after sous forme de date HTTP", () => {
    const future = new Date(Date.now() + 5_000).toUTCString();
    const delay = retryDelay(responseWithRetryAfter(future), 0);
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(15_000);
  });

  it("retombe sur le backoff exponentiel sans en-tête", () => {
    const delay = retryDelay(responseWithRetryAfter(null), 3);
    expect(delay).toBeGreaterThanOrEqual(8_000);
    expect(delay).toBeLessThanOrEqual(15_000);
  });

  it("rejette un en-tête invalide et utilise le backoff", () => {
    const delay = retryDelay(responseWithRetryAfter("not-a-date"), 1);
    expect(delay).toBeGreaterThanOrEqual(2_000);
    expect(delay).toBeLessThanOrEqual(15_000);
  });
});
