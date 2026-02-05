/**
 * Quota Guard - Proactive account switching before quota exhaustion.
 * 
 * Checks account quota before each request (with TTL caching) and switches
 * to another account when remaining quota drops below threshold.
 * 
 * This prevents 429 errors and avoids the 2-day wait penalty when quota hits 0%.
 */

import type { QuotaSummary } from "./quota";
import type { ManagedAccount } from "./accounts";
import { createLogger } from "./logger";

const log = createLogger("quota-guard");

// ============================================================================
// Pure Functions: Calculate remaining percent
// ============================================================================

/**
 * Calculate the minimum remaining percent across all quota groups.
 * 
 * @param quota - Quota summary from API
 * @returns 0-100 percentage, or null if no data available
 * 
 * @example
 * const quota = { groups: { claude: { remainingFraction: 0.04 } } };
 * calculateMinRemainingPercent(quota); // returns 4
 */
export function calculateMinRemainingPercent(quota: QuotaSummary): number | null {
  const fractions: number[] = [];
  
  for (const group of Object.values(quota.groups)) {
    if (group?.remainingFraction !== undefined) {
      fractions.push(group.remainingFraction);
    }
  }
  
  if (fractions.length === 0) {
    return null;
  }
  
  const minFraction = Math.min(...fractions);
  return Math.round(minFraction * 100);
}

// ============================================================================
// TTL Cache for Quota Results
// ============================================================================

interface CacheEntry {
  quota: QuotaSummary;
  fetchedAt: number;
}

/**
 * Simple TTL cache for quota results.
 * Reduces API calls by caching quota data for a configurable duration.
 */
export class QuotaGuardCache {
  private cache = new Map<number, CacheEntry>();
  private ttlMs: number;

  constructor(ttlSeconds: number) {
    this.ttlMs = ttlSeconds * 1000;
  }

  /**
   * Get cached quota for an account, or null if expired/missing.
   */
  get(accountIndex: number): QuotaSummary | null {
    const entry = this.cache.get(accountIndex);
    if (!entry) {
      return null;
    }
    
    if (Date.now() - entry.fetchedAt > this.ttlMs) {
      this.cache.delete(accountIndex);
      return null;
    }
    
    return entry.quota;
  }

  /**
   * Cache quota for an account.
   */
  set(accountIndex: number, quota: QuotaSummary): void {
    this.cache.set(accountIndex, {
      quota,
      fetchedAt: Date.now(),
    });
  }

  /**
   * Invalidate cache for a specific account.
   */
  invalidate(accountIndex: number): void {
    this.cache.delete(accountIndex);
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }
}

// ============================================================================
// Preflight Quota Check
// ============================================================================

export interface QuotaGuardConfig {
  enabled: boolean;
  switchRemainingPercent: number;
  cooldownMinutes: number;
  waitWhenNoAccount: boolean;
  waitPollSeconds: number;
  maxWaitSeconds: number;
  quotaCacheTtlSeconds: number;
}

export interface PreflightResult {
  /** Whether the account should be switched due to low quota */
  shouldSwitch: boolean;
  /** Calculated minimum remaining percent across all groups */
  remainingPercent: number | null;
  /** Human-readable reason for switching */
  reason?: string;
}

/**
 * Check account quota and determine if switching is needed.
 * 
 * Uses cached quota data when available to minimize API calls.
 * 
 * @param account - Account to check
 * @param cache - Quota cache instance
 * @param config - Quota guard configuration
 * @param fetchQuota - Function to fetch fresh quota data
 * @returns Preflight check result
 */
export async function preflightQuotaCheck(
  account: ManagedAccount,
  cache: QuotaGuardCache,
  config: QuotaGuardConfig,
  fetchQuota: () => Promise<QuotaSummary | null>,
): Promise<PreflightResult> {
  // Try cache first
  let quota = cache.get(account.index);
  
  if (!quota) {
    try {
      quota = await fetchQuota();
      if (quota) {
        cache.set(account.index, quota);
      }
    } catch (error) {
      log.warn("Failed to fetch quota for preflight check", { 
        account: account.index, 
        error: String(error),
      });
      // On fetch failure, don't switch - rely on existing rate-limit logic
      return { shouldSwitch: false, remainingPercent: null };
    }
  }

  if (!quota) {
    return { shouldSwitch: false, remainingPercent: null };
  }

  const remainingPercent = calculateMinRemainingPercent(quota);
  
  if (remainingPercent === null) {
    return { shouldSwitch: false, remainingPercent: null };
  }

  if (remainingPercent <= config.switchRemainingPercent) {
    return {
      shouldSwitch: true,
      remainingPercent,
      reason: `Quota at ${remainingPercent}% (threshold: ${config.switchRemainingPercent}%)`,
    };
  }

  return { shouldSwitch: false, remainingPercent };
}

// ============================================================================
// Email Masking (for logging)
// ============================================================================

/**
 * Mask email address for privacy in logs.
 * 
 * @example
 * maskEmail("user@example.com") // "u***r@example.com"
 * maskEmail("ab@example.com")   // "***@example.com"
 * maskEmail(undefined)          // "Account"
 */
export function maskEmail(email?: string): string {
  if (!email) {
    return "Account";
  }
  
  const atIndex = email.indexOf("@");
  if (atIndex < 0) {
    return "***";
  }
  
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  
  if (local.length <= 2) {
    return `***${domain}`;
  }
  
  return `${local[0]}***${local.slice(-1)}${domain}`;
}

// ============================================================================
// Wait Time Formatting
// ============================================================================

/**
 * Format wait time for display in toasts.
 */
export function formatWaitTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return remainingSeconds > 0 
      ? `${minutes}m ${remainingSeconds}s` 
      : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return remainingMinutes > 0 
    ? `${hours}h ${remainingMinutes}m` 
    : `${hours}h`;
}
