import { describe, it, expect } from 'vitest';
import { scoreCompany, type ScorableRow, type ScorableFilter } from '../companyScore';

// Helpers — build rows/filters with sensible defaults, override per-case.
function row(overrides: Partial<ScorableRow> = {}): ScorableRow {
  return {
    primarySector: 'Financial Services',
    subTags: [],
    country: 'United States',
    revenueBand: null,
    employeeBand: null,
    isListed: null,
    ...overrides,
  };
}

function filter(overrides: Partial<ScorableFilter> = {}): ScorableFilter {
  return {
    primarySectors: [],
    adjacentSectors: [],
    subTags: [],
    countries: [],
    revenueBands: [],
    employeeBands: [],
    isListed: null,
    ...overrides,
  };
}

describe('scoreCompany', () => {
  it('scores a full primary + tag + country match at 100, Direct', () => {
    const result = scoreCompany(
      row({ primarySector: 'Financial Services', subTags: ['wealth-management'], country: 'United States' }),
      filter({ primarySectors: ['Financial Services'], subTags: ['wealth-management'], countries: ['United States'] }),
    );
    expect(result.matchScore).toBe(100);
    expect(result.relevanceType).toBe('Direct');
    expect(result.breakdown).toMatchObject({ primarySector: true, subTags: true, country: true });
  });

  it('scores primary-only (tag + country requested but missed) at 57', () => {
    // maxScore = 0.50 + 0.25 + 0.12 = 0.87; raw = 0.50; 0.50/0.87 = 0.5747 → 57
    const result = scoreCompany(
      row({ primarySector: 'Financial Services', subTags: ['private-equity'], country: 'Germany' }),
      filter({ primarySectors: ['Financial Services'], subTags: ['wealth-management'], countries: ['United States'] }),
    );
    expect(result.matchScore).toBe(57);
    expect(result.relevanceType).toBe('Direct');
    expect(result.breakdown.subTags).toBe(false);
    expect(result.breakdown.country).toBe(false);
  });

  it('scores adjacent + tag (country requested, missed) at 57, Adjacent', () => {
    // raw = 0.25 (adjacent) + 0.25 (tag) = 0.50; max = 0.50 + 0.25 + 0.12 = 0.87 → 57
    const result = scoreCompany(
      row({ primarySector: 'Insurance', subTags: ['wealth-management'], country: 'Germany' }),
      filter({
        primarySectors: ['Financial Services'],
        adjacentSectors: ['Insurance'],
        subTags: ['wealth-management'],
        countries: ['United States'],
      }),
    );
    expect(result.matchScore).toBe(57);
    expect(result.relevanceType).toBe('Adjacent');
    expect(result.breakdown).toMatchObject({ primarySector: false, adjacentSector: true, subTags: true });
  });

  it('scores tag-only (no sector hit) low and labels it AI Inferred', () => {
    // raw = 0.25 (tag); max = 0.50 (primary requested) + 0.25 (tag) + 0.12 (country) = 0.87
    // 0.25/0.87 = 0.287 → 29
    const result = scoreCompany(
      row({ primarySector: 'Manufacturing', subTags: ['wealth-management'], country: 'Germany' }),
      filter({ primarySectors: ['Financial Services'], subTags: ['wealth-management'], countries: ['United States'] }),
    );
    expect(result.matchScore).toBe(29);
    expect(result.relevanceType).toBe('AI Inferred');
    expect(result.breakdown).toMatchObject({ primarySector: false, adjacentSector: false, subTags: true });
  });

  it('does not let an unrequested dimension dilute the score (denominator independence)', () => {
    // Query asks only for primary sector; row is in a different country — that
    // mismatch must NOT lower the score because country was never requested.
    const result = scoreCompany(
      row({ primarySector: 'Financial Services', country: 'Germany' }),
      filter({ primarySectors: ['Financial Services'] }),
    );
    expect(result.matchScore).toBe(100);
    expect(result.relevanceType).toBe('Direct');
  });

  it('keeps a sector match above zero even when all soft signals miss', () => {
    const result = scoreCompany(
      row({ primarySector: 'Financial Services', country: 'Germany', revenueBand: '$1B-5B', employeeBand: '1000-5000' }),
      filter({
        primarySectors: ['Financial Services'],
        countries: ['United States'],
        revenueBands: ['$10B+'],
        employeeBands: ['10000+'],
      }),
    );
    // raw = 0.50; max = 0.50 + 0.12 + 0.08 + 0.08 = 0.78; 0.50/0.78 = 0.641 → 64
    expect(result.matchScore).toBe(64);
    expect(result.matchScore).toBeGreaterThan(0);
  });

  it('returns 0 with no divide-by-zero for an empty filter, labeled AI Inferred', () => {
    const result = scoreCompany(row(), filter());
    expect(result.matchScore).toBe(0);
    expect(Number.isNaN(result.matchScore)).toBe(false);
    expect(result.relevanceType).toBe('AI Inferred');
  });

  it('gives precedence to primary over adjacent (no double count)', () => {
    // A sector present in BOTH primary and adjacent sets must score as primary only.
    const result = scoreCompany(
      row({ primarySector: 'Financial Services' }),
      filter({ primarySectors: ['Financial Services'], adjacentSectors: ['Financial Services'] }),
    );
    expect(result.matchScore).toBe(100);
    expect(result.relevanceType).toBe('Direct');
    expect(result.breakdown.primarySector).toBe(true);
    expect(result.breakdown.adjacentSector).toBe(false);
  });

  it('treats isListed=false as a requested dimension that can match', () => {
    // raw = 0.50 + 0.04; max = 0.50 + 0.04 = 0.54 → 100
    const result = scoreCompany(
      row({ primarySector: 'Financial Services', isListed: false }),
      filter({ primarySectors: ['Financial Services'], isListed: false }),
    );
    expect(result.matchScore).toBe(100);
    expect(result.breakdown.isListed).toBe(true);
  });

  it('treats isListed mismatch as requested-but-missed', () => {
    // raw = 0.50; max = 0.54; 0.50/0.54 = 0.926 → 93
    const result = scoreCompany(
      row({ primarySector: 'Financial Services', isListed: true }),
      filter({ primarySectors: ['Financial Services'], isListed: false }),
    );
    expect(result.matchScore).toBe(93);
    expect(result.breakdown.isListed).toBe(false);
  });

  it('always returns an integer in [0, 100]', () => {
    const cases: Array<[ScorableRow, ScorableFilter]> = [
      [row({ primarySector: 'A', subTags: ['x'] }), filter({ primarySectors: ['A'], subTags: ['x'], countries: ['United States'], revenueBands: ['$1B-5B'] })],
      [row({ primarySector: 'B', subTags: [] }), filter({ adjacentSectors: ['B'], subTags: ['y'] })],
      [row({ primarySector: 'C' }), filter({ subTags: ['z'] })],
    ];
    for (const [r, f] of cases) {
      const { matchScore } = scoreCompany(r, f);
      expect(Number.isInteger(matchScore)).toBe(true);
      expect(matchScore).toBeGreaterThanOrEqual(0);
      expect(matchScore).toBeLessThanOrEqual(100);
    }
  });
});
