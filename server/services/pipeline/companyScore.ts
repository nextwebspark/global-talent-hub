// companyScore — pure, deterministic match scoring for enriched-company rows.
//
// The search no longer hard-ANDs every filter dimension. Instead, a row surfaces
// on any *crucial* signal (primary sector, adjacent sector, or sub-tag overlap)
// and is scored on how many of the query's dimensions it satisfies. *Soft* signals
// (country, revenue band, employee band, listing status) only raise the score —
// they never exclude a row.
//
// No I/O, no DB client: this module is independently unit-testable. It accepts
// minimal structural shapes (ScorableRow / ScorableFilter) rather than the storage
// types so it carries no dependency on the storage layer (and avoids an import
// cycle with DatabaseStorage). EnrichedCompanyRow / EnrichedCompanyQuery structurally
// satisfy these at the call site.

// Crucial signals — the reason a row is a candidate at all. Primary and adjacent
// are mutually exclusive by construction (adjacentSectorsFor excludes the primaries).
const W_PRIMARY_SECTOR = 0.5;
const W_ADJACENT_SECTOR = 0.25;
const W_SUB_TAGS = 0.25;

// Soft signals — boost only.
const W_COUNTRY = 0.12;
const W_REVENUE_BAND = 0.08;
const W_EMPLOYEE_BAND = 0.08;
const W_IS_LISTED = 0.04;

export interface MatchBreakdown {
  primarySector: boolean;
  adjacentSector: boolean;
  subTags: boolean;
  country: boolean;
  revenueBand: boolean;
  employeeBand: boolean;
  isListed: boolean;
}

export interface ScoredMatch {
  matchScore: number; // 0..100 integer (percentage)
  relevanceType: "Direct" | "Adjacent" | "AI Inferred";
  breakdown: MatchBreakdown;
}

// The fields scoreCompany reads off an enriched-company row.
export interface ScorableRow {
  primarySector: string;
  subTags: string[];
  country: string;
  revenueBand: string | null;
  employeeBand: string | null;
  isListed: boolean | null;
}

// The fields scoreCompany reads off a vocabulary-validated filter.
export interface ScorableFilter {
  primarySectors: string[];
  adjacentSectors: string[];
  subTags: string[];
  countries: string[];
  revenueBands: string[];
  employeeBands: string[];
  isListed: boolean | null;
}

function arraysOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  return b.some((v) => set.has(v));
}

// Score a row against a query. matchScore is the fraction of the *requested*
// dimensions the row satisfies, weighted, expressed 0..100. A dimension the query
// did not request never contributes to the denominator, so it can't dilute the score.
export function scoreCompany(row: ScorableRow, filter: ScorableFilter): ScoredMatch {
  const primarySector = filter.primarySectors.includes(row.primarySector);
  // Adjacent only counts when the row is not already a primary-sector hit
  // (precedence: primary > adjacent), preventing double-counting.
  const adjacentSector = !primarySector && filter.adjacentSectors.includes(row.primarySector);
  const subTags = arraysOverlap(row.subTags, filter.subTags);
  const country = filter.countries.includes(row.country);
  const revenueBand = row.revenueBand != null && filter.revenueBands.includes(row.revenueBand);
  const employeeBand = row.employeeBand != null && filter.employeeBands.includes(row.employeeBand);
  const isListed = filter.isListed != null && row.isListed === filter.isListed;

  // Sector weight: a primary hit earns the full weight, an adjacent hit half.
  // maxScore uses the best a row *could* have earned for the sector dimension
  // given what the query asked for.
  const sectorRaw = primarySector ? W_PRIMARY_SECTOR : adjacentSector ? W_ADJACENT_SECTOR : 0;
  const sectorMax =
    filter.primarySectors.length > 0
      ? W_PRIMARY_SECTOR
      : filter.adjacentSectors.length > 0
        ? W_ADJACENT_SECTOR
        : 0;

  let rawScore = sectorRaw;
  let maxScore = sectorMax;

  if (filter.subTags.length > 0) {
    maxScore += W_SUB_TAGS;
    if (subTags) rawScore += W_SUB_TAGS;
  }
  if (filter.countries.length > 0) {
    maxScore += W_COUNTRY;
    if (country) rawScore += W_COUNTRY;
  }
  if (filter.revenueBands.length > 0) {
    maxScore += W_REVENUE_BAND;
    if (revenueBand) rawScore += W_REVENUE_BAND;
  }
  if (filter.employeeBands.length > 0) {
    maxScore += W_EMPLOYEE_BAND;
    if (employeeBand) rawScore += W_EMPLOYEE_BAND;
  }
  if (filter.isListed != null) {
    maxScore += W_IS_LISTED;
    if (isListed) rawScore += W_IS_LISTED;
  }

  const fraction = maxScore > 0 ? rawScore / maxScore : 0;
  const matchScore = Math.round(fraction * 100);

  const relevanceType: ScoredMatch["relevanceType"] = primarySector
    ? "Direct"
    : adjacentSector
      ? "Adjacent"
      : "AI Inferred";

  return {
    matchScore,
    relevanceType,
    breakdown: {
      primarySector,
      adjacentSector,
      subTags,
      country,
      revenueBand,
      employeeBand,
      isListed,
    },
  };
}
