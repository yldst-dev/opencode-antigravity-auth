# AGENTS.md

Guidance for AI agents working with this repository.

## Overview

This is an **OpenCode plugin** that enables OAuth authentication with Google's Antigravity API. It allows access to models like `gemini-3-pro-high` and `claude-opus-4-5-thinking` using Google credentials.

## Build & Test Commands

```bash
npm install           # Install dependencies
npm run build         # Compile TypeScript (tsconfig.build.json)
npm run typecheck     # Type checking only (no emit)
npm test              # Run all tests (vitest)
npm run test:watch    # Run tests in watch mode
npm run test:ui       # Run tests with UI
npm run test:coverage # Run tests with coverage report
```

### Running a Single Test

```bash
# Run a specific test file
npx vitest run src/plugin/quota-guard.test.ts

# Run tests matching a pattern
npx vitest run -t "calculateMinRemainingPercent"

# Run a single test file in watch mode
npx vitest src/plugin/accounts.test.ts
```

### E2E Tests

```bash
npm run test:e2e:models      # Test model availability
npm run test:e2e:regression  # Run regression tests
```

## Module Structure

```
src/
├── plugin.ts                # Main entry, fetch interceptor
├── constants.ts             # Endpoints, headers, config (SINGLE SOURCE OF TRUTH for version)
├── antigravity/oauth.ts     # OAuth token exchange
├── hooks/                   # OpenCode lifecycle hooks
│   └── auto-update-checker/ # Plugin version checking
└── plugin/
    ├── accounts.ts          # Multi-account management
    ├── auth.ts              # Token validation & refresh
    ├── cache.ts             # Auth & signature caching
    ├── config/              # Configuration schema (Zod)
    ├── debug.ts             # Debug logging
    ├── quota.ts             # Quota checking (API usage stats)
    ├── quota-guard.ts       # Proactive quota switching
    ├── recovery.ts          # Session recovery (tool_result_missing)
    ├── request.ts           # Request transformation (main logic)
    ├── request-helpers.ts   # Schema cleaning, thinking filters
    ├── rotation.ts          # Account rotation strategy
    ├── storage.ts           # Persistent account storage
    ├── thinking-recovery.ts # Turn boundary detection
    ├── transform/           # Model-specific transformations
    │   ├── claude.ts        # Claude request/response handling
    │   └── gemini.ts        # Gemini request/response handling
    └── ui/                  # CLI UI components
```

## Code Style Guidelines

### TypeScript Configuration

- **Target**: ESNext with ESM modules (`"type": "module"` in package.json)
- **Strict mode**: Enabled with additional checks:
  - `noUncheckedIndexedAccess`: true
  - `noImplicitOverride`: true
  - `noFallthroughCasesInSwitch`: true

### Imports

```typescript
// 1. External packages first
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

// 2. Local imports with relative paths
import type { QuotaSummary } from "./quota";
import type { ManagedAccount } from "./accounts";
import { createLogger } from "./logger";

// 3. Use 'import type' for type-only imports
import type { OAuthAuthDetails, RefreshParts } from "./types";
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `quota-guard.ts`, `request-helpers.ts` |
| Test files | `*.test.ts` suffix | `quota-guard.test.ts` |
| Classes | PascalCase | `QuotaGuardCache`, `AccountManager` |
| Functions | camelCase | `calculateMinRemainingPercent()` |
| Constants | SCREAMING_SNAKE_CASE | `ANTIGRAVITY_VERSION`, `MIN_BACKOFF_MS` |
| Types/Interfaces | PascalCase | `RateLimitReason`, `CacheEntry` |
| Type exports | Re-export from index | `export type { ModelFamily } from "./storage"` |

### Constants & Configuration

- All version strings derive from `ANTIGRAVITY_VERSION` in `constants.ts`
- Use `as const` for readonly arrays and objects
- Group related constants with section comments:

```typescript
// ============================================================================
// SECTION NAME
// ============================================================================
```

### Functions & Documentation

```typescript
/**
 * Brief description of what the function does.
 * 
 * @param quota - Description of parameter
 * @returns Description of return value
 * 
 * @example
 * const quota = { groups: { claude: { remainingFraction: 0.04 } } };
 * calculateMinRemainingPercent(quota); // returns 4
 */
export function calculateMinRemainingPercent(quota: QuotaSummary): number | null {
  // Implementation
}
```

### Error Handling

- Use explicit error types where possible
- Parse API error responses to determine `RateLimitReason`:

```typescript
export type RateLimitReason = 
  | "QUOTA_EXHAUSTED"
  | "RATE_LIMIT_EXCEEDED" 
  | "MODEL_CAPACITY_EXHAUSTED"
  | "SERVER_ERROR"
  | "UNKNOWN";
```

### Testing (Vitest)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("FeatureName", () => {
  it("does something specific", () => {
    const result = someFunction(input);
    expect(result).toBe(expected);
  });

  it("handles edge case", () => {
    expect(calculateMinRemainingPercent({ groups: {}, modelCount: 0 })).toBeNull();
  });
});
```

### Zod Schemas

- Define schemas in `src/plugin/config/schema.ts`
- Use `.optional()` with defaults for optional fields
- Export inferred types:

```typescript
export const QuotaGuardConfigSchema = z.object({
  enabled: z.boolean().default(true),
  switchRemainingPercent: z.number().min(1).max(50).default(5),
});

export type QuotaGuardConfig = z.infer<typeof QuotaGuardConfigSchema>;
```

## Key Design Patterns

### 1. Request Interception
Plugin intercepts `fetch()` for `generativelanguage.googleapis.com`, transforms to Antigravity format.

### 2. Claude Thinking Blocks
For Claude models, ALL thinking blocks are stripped from outgoing requests. Claude generates fresh thinking each turn. This eliminates signature validation errors.

### 3. Session Recovery
When tool execution is interrupted (ESC/timeout), the plugin injects synthetic `tool_result` blocks to recover the session.

### 4. Schema Sanitization
Tool schemas are cleaned via allowlist approach. Unsupported fields (`const`, `$ref`, `$defs`) are removed or converted.

### 5. Multi-Account Load Balancing
Accounts are rotated on rate limits. Gemini has dual quota pools (Antigravity + Gemini CLI headers).

### 6. Quota Guard
Proactive switching before quota exhaustion. Checks remaining % before each request and switches accounts when below threshold (default 5%).

## Key Files

| File | Purpose |
|------|---------|
| `src/plugin.ts` | Main entry, orchestrates flow |
| `src/constants.ts` | Single source of truth for version/headers |
| `src/plugin/request.ts` | Request/response transformation |
| `src/plugin/accounts.ts` | Multi-account management |
| `src/plugin/quota-guard.ts` | Proactive quota switching |
| `src/plugin/transform/claude.ts` | Claude-specific transformations |
| `src/plugin/transform/gemini.ts` | Gemini-specific transformations |

## Documentation

- [README.md](README.md) - Installation & usage
- [README.ko.md](README.ko.md) - Korean documentation
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Detailed architecture guide
- [docs/ANTIGRAVITY_API_SPEC.md](docs/ANTIGRAVITY_API_SPEC.md) - API reference
