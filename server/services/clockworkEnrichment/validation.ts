import type { ClockworkExecutive } from "./types";

/**
 * System/test account names to detect invalid data
 */
export const SYSTEM_ACCOUNT_PATTERNS = [
  /^clockwork\s*admin$/i,
  /^data$/i,
  /^test\s*user$/i,
  /^admin$/i,
  /^system$/i,
  /^clockwork$/i,
  /^api\s*user$/i,
  /^support$/i,
];

/**
 * Check if a name appears to be a system/test account
 */
export function isSystemAccount(name: string): boolean {
  return SYSTEM_ACCOUNT_PATTERNS.some(pattern => pattern.test(name.trim()));
}

/**
 * Verify that fetched data looks like real project candidates
 * Returns validation result with warnings
 */
export function validateFetchedCandidates(candidates: ClockworkExecutive[]): {
  valid: boolean;
  warnings: string[];
  systemAccountCount: number;
} {
  const systemAccountCount = candidates.filter(c => isSystemAccount(c.name)).length;
  const warnings: string[] = [];

  if (candidates.length === 0) {
    return { valid: true, warnings: [], systemAccountCount: 0 };
  }

  // More than 50% system accounts suggests the project filter isn't working
  if (systemAccountCount > candidates.length * 0.5) {
    warnings.push(`CLOCKWORK API LIMITATION: Found ${systemAccountCount}/${candidates.length} system/test accounts. The Clockwork API v3.0 ignores the project_id filter and returns all firm contacts instead of project-specific candidates. Contact Clockwork support for the correct endpoint.`);
    return { valid: false, warnings, systemAccountCount };
  }

  // All candidates have identical names suggests duplicate data
  const uniqueNames = new Set(candidates.map(c => c.name.toLowerCase()));
  if (candidates.length > 5 && uniqueNames.size < candidates.length * 0.3) {
    warnings.push(`Found many duplicate names (${uniqueNames.size} unique out of ${candidates.length}) - API may be returning incorrect data`);
  }

  // Warn about system accounts but don't invalidate if < 50%
  if (systemAccountCount > 0 && systemAccountCount <= candidates.length * 0.5) {
    warnings.push(`Found ${systemAccountCount} system/test accounts that will be filtered out`);
  }

  return { valid: true, warnings, systemAccountCount };
}
