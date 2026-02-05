import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { 
  calculateMinRemainingPercent, 
  QuotaGuardCache,
  preflightQuotaCheck,
  maskEmail,
  formatWaitTime,
} from "./quota-guard";
import type { QuotaSummary } from "./quota";

describe("calculateMinRemainingPercent", () => {
  it("returns minimum across all groups", () => {
    const quota: QuotaSummary = {
      groups: {
        claude: { remainingFraction: 0.10, modelCount: 1 },
        "gemini-pro": { remainingFraction: 0.04, modelCount: 1 },
        "gemini-flash": { remainingFraction: 0.20, modelCount: 1 },
      },
      modelCount: 3,
    };
    expect(calculateMinRemainingPercent(quota)).toBe(4);
  });

  it("returns null when no groups have remainingFraction", () => {
    const quota: QuotaSummary = { groups: {}, modelCount: 0 };
    expect(calculateMinRemainingPercent(quota)).toBeNull();
  });

  it("handles single group", () => {
    const quota: QuotaSummary = {
      groups: { claude: { remainingFraction: 0.05, modelCount: 1 } },
      modelCount: 1,
    };
    expect(calculateMinRemainingPercent(quota)).toBe(5);
  });

  it("handles 0% remaining", () => {
    const quota: QuotaSummary = {
      groups: { claude: { remainingFraction: 0, modelCount: 1 } },
      modelCount: 1,
    };
    expect(calculateMinRemainingPercent(quota)).toBe(0);
  });

  it("handles 100% remaining", () => {
    const quota: QuotaSummary = {
      groups: { claude: { remainingFraction: 1.0, modelCount: 1 } },
      modelCount: 1,
    };
    expect(calculateMinRemainingPercent(quota)).toBe(100);
  });

  it("rounds to nearest integer", () => {
    const quota: QuotaSummary = {
      groups: { claude: { remainingFraction: 0.045, modelCount: 1 } },
      modelCount: 1,
    };
    expect(calculateMinRemainingPercent(quota)).toBe(5); // 4.5 rounds to 5
  });

  it("ignores groups without remainingFraction", () => {
    const quota: QuotaSummary = {
      groups: { 
        claude: { modelCount: 1 }, // no remainingFraction
        "gemini-pro": { remainingFraction: 0.10, modelCount: 1 },
      },
      modelCount: 2,
    };
    expect(calculateMinRemainingPercent(quota)).toBe(10);
  });
});

describe("QuotaGuardCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns cached value within TTL", () => {
    const cache = new QuotaGuardCache(60);
    const quota: QuotaSummary = { groups: {}, modelCount: 0 };
    
    cache.set(0, quota);
    expect(cache.get(0)).toBe(quota);
  });

  it("returns null after TTL expires", () => {
    const cache = new QuotaGuardCache(60);
    const quota: QuotaSummary = { groups: {}, modelCount: 0 };
    
    cache.set(0, quota);
    vi.advanceTimersByTime(61000); // 61 seconds
    expect(cache.get(0)).toBeNull();
  });

  it("returns null for non-existent entry", () => {
    const cache = new QuotaGuardCache(60);
    expect(cache.get(999)).toBeNull();
  });

  it("invalidate removes entry", () => {
    const cache = new QuotaGuardCache(60);
    cache.set(0, { groups: {}, modelCount: 0 });
    cache.invalidate(0);
    expect(cache.get(0)).toBeNull();
  });

  it("clear removes all entries", () => {
    const cache = new QuotaGuardCache(60);
    cache.set(0, { groups: {}, modelCount: 0 });
    cache.set(1, { groups: {}, modelCount: 0 });
    cache.clear();
    expect(cache.get(0)).toBeNull();
    expect(cache.get(1)).toBeNull();
  });

  it("handles multiple accounts independently", () => {
    const cache = new QuotaGuardCache(60);
    const quota0: QuotaSummary = { groups: { claude: { remainingFraction: 0.10, modelCount: 1 } }, modelCount: 1 };
    const quota1: QuotaSummary = { groups: { claude: { remainingFraction: 0.20, modelCount: 1 } }, modelCount: 1 };
    
    cache.set(0, quota0);
    cache.set(1, quota1);
    
    expect(cache.get(0)).toBe(quota0);
    expect(cache.get(1)).toBe(quota1);
  });
});

describe("preflightQuotaCheck", () => {
  const defaultConfig = {
    enabled: true,
    switchRemainingPercent: 5,
    cooldownMinutes: 300,
    waitWhenNoAccount: true,
    waitPollSeconds: 30,
    maxWaitSeconds: 0,
    quotaCacheTtlSeconds: 60,
  };

  const createAccount = (index: number) => ({
    index,
    addedAt: Date.now(),
    lastUsed: Date.now(),
    parts: { refreshToken: "test" },
    enabled: true,
    rateLimitResetTimes: {},
    touchedForQuota: {},
  });

  it("returns shouldSwitch=true when below threshold", async () => {
    const cache = new QuotaGuardCache(60);
    const account = createAccount(0);
    
    const result = await preflightQuotaCheck(
      account as any,
      cache,
      defaultConfig,
      async () => ({
        groups: { claude: { remainingFraction: 0.04, modelCount: 1 } },
        modelCount: 1,
      })
    );
    
    expect(result.shouldSwitch).toBe(true);
    expect(result.remainingPercent).toBe(4);
    expect(result.reason).toContain("4%");
  });

  it("returns shouldSwitch=true when exactly at threshold", async () => {
    const cache = new QuotaGuardCache(60);
    const account = createAccount(0);
    
    const result = await preflightQuotaCheck(
      account as any,
      cache,
      defaultConfig,
      async () => ({
        groups: { claude: { remainingFraction: 0.05, modelCount: 1 } },
        modelCount: 1,
      })
    );
    
    expect(result.shouldSwitch).toBe(true);
    expect(result.remainingPercent).toBe(5);
  });

  it("returns shouldSwitch=false when above threshold", async () => {
    const cache = new QuotaGuardCache(60);
    const account = createAccount(0);
    
    const result = await preflightQuotaCheck(
      account as any,
      cache,
      defaultConfig,
      async () => ({
        groups: { claude: { remainingFraction: 0.10, modelCount: 1 } },
        modelCount: 1,
      })
    );
    
    expect(result.shouldSwitch).toBe(false);
    expect(result.remainingPercent).toBe(10);
  });

  it("uses cached value on second call", async () => {
    const cache = new QuotaGuardCache(60);
    const account = createAccount(0);
    const fetchQuota = vi.fn().mockResolvedValue({
      groups: { claude: { remainingFraction: 0.10, modelCount: 1 } },
      modelCount: 1,
    });
    
    await preflightQuotaCheck(account as any, cache, defaultConfig, fetchQuota);
    await preflightQuotaCheck(account as any, cache, defaultConfig, fetchQuota);
    
    expect(fetchQuota).toHaveBeenCalledTimes(1);
  });

  it("handles fetch failure gracefully", async () => {
    const cache = new QuotaGuardCache(60);
    const account = createAccount(0);
    
    const result = await preflightQuotaCheck(
      account as any,
      cache,
      defaultConfig,
      async () => { throw new Error("Network error"); }
    );
    
    expect(result.shouldSwitch).toBe(false);
    expect(result.remainingPercent).toBeNull();
  });

  it("handles null quota result", async () => {
    const cache = new QuotaGuardCache(60);
    const account = createAccount(0);
    
    const result = await preflightQuotaCheck(
      account as any,
      cache,
      defaultConfig,
      async () => null
    );
    
    expect(result.shouldSwitch).toBe(false);
    expect(result.remainingPercent).toBeNull();
  });

  it("respects custom threshold", async () => {
    const cache = new QuotaGuardCache(60);
    const account = createAccount(0);
    const customConfig = { ...defaultConfig, switchRemainingPercent: 10 };
    
    const result = await preflightQuotaCheck(
      account as any,
      cache,
      customConfig,
      async () => ({
        groups: { claude: { remainingFraction: 0.08, modelCount: 1 } },
        modelCount: 1,
      })
    );
    
    expect(result.shouldSwitch).toBe(true);
    expect(result.remainingPercent).toBe(8);
  });
});

describe("maskEmail", () => {
  it("masks middle of email", () => {
    expect(maskEmail("user@example.com")).toBe("u***r@example.com");
  });

  it("masks long local part", () => {
    expect(maskEmail("verylongemail@example.com")).toBe("v***l@example.com");
  });

  it("handles short local part (2 chars)", () => {
    expect(maskEmail("ab@example.com")).toBe("***@example.com");
  });

  it("handles single char local part", () => {
    expect(maskEmail("a@example.com")).toBe("***@example.com");
  });

  it("returns 'Account' for undefined", () => {
    expect(maskEmail(undefined)).toBe("Account");
  });

  it("returns 'Account' for empty string", () => {
    expect(maskEmail("")).toBe("Account");
  });

  it("handles email without @ symbol", () => {
    expect(maskEmail("invalid")).toBe("***");
  });
});

describe("formatWaitTime", () => {
  it("formats seconds", () => {
    expect(formatWaitTime(30)).toBe("30s");
  });

  it("formats minutes", () => {
    expect(formatWaitTime(120)).toBe("2m");
  });

  it("formats minutes and seconds", () => {
    expect(formatWaitTime(90)).toBe("1m 30s");
  });

  it("formats hours", () => {
    expect(formatWaitTime(3600)).toBe("1h");
  });

  it("formats hours and minutes", () => {
    expect(formatWaitTime(5400)).toBe("1h 30m");
  });

  it("handles zero", () => {
    expect(formatWaitTime(0)).toBe("0s");
  });
});
