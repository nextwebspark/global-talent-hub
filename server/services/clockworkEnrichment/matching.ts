import type { ClockworkExecutive, MatchClassification } from "./types";

/**
 * Normalize a string for fuzzy comparison:
 * - Lowercase
 * - Remove extra whitespace
 * - Remove common punctuation
 * - Trim
 */
export function normalizeString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[.,\-–—'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate Levenshtein distance between two strings.
 * Returns the minimum number of single-character edits needed.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-100).
 * Uses normalized Levenshtein distance.
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);

  if (s1 === s2) return 100;
  if (!s1 || !s2) return 0;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 100;

  const distance = levenshteinDistance(s1, s2);
  const similarity = ((maxLen - distance) / maxLen) * 100;

  return Math.round(similarity);
}

/**
 * Calculate token-based Jaccard similarity for names.
 * Better for names where word order might differ.
 */
export function calculateTokenSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);

  if (s1 === s2) return 100;
  if (!s1 || !s2) return 0;

  const tokens1 = s1.split(' ').filter(t => t.length > 1);
  const tokens2 = s2.split(' ').filter(t => t.length > 1);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  // Calculate intersection (tokens in both)
  const tokens2Set = new Set(tokens2);
  const intersectionCount = tokens1.filter(t => tokens2Set.has(t)).length;

  // Calculate union (unique tokens from both)
  const unionSet = new Set(tokens1.concat(tokens2));
  const unionCount = unionSet.size;

  return Math.round((intersectionCount / unionCount) * 100);
}

/**
 * Calculate combined name match score using both Levenshtein and token similarity.
 */
export function calculateNameScore(name1: string, name2: string): number {
  const levenshteinScore = calculateSimilarity(name1, name2);
  const tokenScore = calculateTokenSimilarity(name1, name2);

  // Weight token similarity higher for names (handles "John Smith" vs "Smith, John")
  return Math.round((levenshteinScore * 0.4) + (tokenScore * 0.6));
}

/**
 * Calculate title match score with role normalization.
 */
export function calculateTitleScore(title1: string, title2: string): number {
  const t1 = normalizeString(title1);
  const t2 = normalizeString(title2);

  // Common title abbreviation mappings
  const titleNormalize = (t: string) => t
    .replace(/\bceo\b/g, 'chief executive officer')
    .replace(/\bcfo\b/g, 'chief financial officer')
    .replace(/\bcoo\b/g, 'chief operating officer')
    .replace(/\bcto\b/g, 'chief technology officer')
    .replace(/\bcmo\b/g, 'chief marketing officer')
    .replace(/\bcio\b/g, 'chief information officer')
    .replace(/\bvp\b/g, 'vice president')
    .replace(/\bsvp\b/g, 'senior vice president')
    .replace(/\bevp\b/g, 'executive vice president');

  const normalized1 = titleNormalize(t1);
  const normalized2 = titleNormalize(t2);

  return calculateTokenSimilarity(normalized1, normalized2);
}

/**
 * Classify match based on confidence scores.
 */
export function classifyMatch(nameScore: number, titleScore: number, companyScore: number): {
  classification: MatchClassification;
  confidence: number;
} {
  // Weighted average: name is most important, then company, then title
  const confidence = Math.round(
    (nameScore * 0.5) + (companyScore * 0.3) + (titleScore * 0.2)
  );

  // Classification thresholds
  if (nameScore >= 85 && confidence >= 75) {
    return { classification: 'confirmed', confidence };
  } else if (nameScore >= 60 && confidence >= 50) {
    return { classification: 'possible', confidence };
  } else {
    return { classification: 'no_match', confidence };
  }
}

/**
 * Find the best matching Clockwork executive for a local executive.
 * Returns the best match or null if no good match found.
 */
export function findBestMatch(
  localExec: { name: string; title: string; companyName: string },
  clockworkExecs: ClockworkExecutive[]
): { match: ClockworkExecutive | null; scores: { nameScore: number; titleScore: number; companyScore: number } } {
  let bestMatch: ClockworkExecutive | null = null;
  let bestScores = { nameScore: 0, titleScore: 0, companyScore: 0 };
  let bestConfidence = 0;

  for (const cwExec of clockworkExecs) {
    const nameScore = calculateNameScore(localExec.name, cwExec.name);
    const titleScore = calculateTitleScore(localExec.title, cwExec.title);
    const companyScore = calculateSimilarity(localExec.companyName, cwExec.company);

    const { confidence } = classifyMatch(nameScore, titleScore, companyScore);

    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestMatch = cwExec;
      bestScores = { nameScore, titleScore, companyScore };
    }
  }

  return { match: bestMatch, scores: bestScores };
}
