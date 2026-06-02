// Shared pipeline helpers.

// Canonical country names recognised in user queries, keyed by lowercase
// keyword/alias. Used as the whitelist for country filters — the LLM never
// supplies free-form country strings to the DB query.
const COUNTRY_ALIASES: Array<[string, string]> = [
  ['saudi arabia', 'Saudi Arabia'], ['saudi', 'Saudi Arabia'],
  ['united arab emirates', 'United Arab Emirates'], ['uae', 'United Arab Emirates'],
  ['qatar', 'Qatar'], ['kuwait', 'Kuwait'], ['bahrain', 'Bahrain'],
  ['oman', 'Oman'], ['egypt', 'Egypt'], ['jordan', 'Jordan'],
  ['lebanon', 'Lebanon'], ['iraq', 'Iraq'], ['turkey', 'Turkey'],
  ['united kingdom', 'United Kingdom'], ['uk', 'United Kingdom'],
  ['united states', 'United States'], ['usa', 'United States'],
  ['germany', 'Germany'], ['france', 'France'], ['india', 'India'],
  ['china', 'China'], ['japan', 'Japan'], ['singapore', 'Singapore'],
  ['australia', 'Australia'], ['canada', 'Canada'],
  ['south africa', 'South Africa'], ['nigeria', 'Nigeria'],
  ['brazil', 'Brazil'], ['mexico', 'Mexico'],
];

// Set of canonical country names (for whitelisting LLM-supplied countries).
export const CANONICAL_COUNTRIES: Set<string> = new Set(
  COUNTRY_ALIASES.map(([, name]) => name),
);

// Extract canonical country names mentioned in a free-text query.
export function extractCountriesFromRawQuery(query: string): string[] {
  const lower = query.toLowerCase();
  const found: string[] = [];
  const seen = new Set<string>();
  for (const [kw, name] of COUNTRY_ALIASES) {
    if (lower.includes(kw) && !seen.has(name)) {
      seen.add(name);
      found.push(name);
    }
  }
  return found;
}

// Normalize a list of LLM-supplied country strings to canonical names, dropping
// anything not in the whitelist (matched case-insensitively against aliases).
export function normalizeCountries(countries: string[]): string[] {
  const out = new Set<string>();
  for (const raw of countries) {
    const lower = raw.trim().toLowerCase();
    for (const [kw, name] of COUNTRY_ALIASES) {
      if (lower === kw || lower === name.toLowerCase()) {
        out.add(name);
        break;
      }
    }
  }
  return [...out];
}

// Best-effort JSON extraction from an LLM response: strips markdown fences and
// isolates the first {...} block before parsing. Returns null on failure.
export function parseJsonSafe(content: string): any {
  let cleaned = content.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) cleaned = jsonMatch[1].trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1) cleaned = cleaned.substring(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}
