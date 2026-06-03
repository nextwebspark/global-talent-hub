// Shared pipeline helpers.

// Country aliases used for normalizing LLM-supplied country strings.
// The LLM never supplies free-form strings to DB queries — this is the whitelist.
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

// Like parseJsonSafe but targets the first [...] array block instead of an object.
// Falls back to parseJsonSafe if no array is found.
export function parseJsonArraySafe(content: string): any {
  let cleaned = content.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end !== -1) {
    try {
      return JSON.parse(cleaned.substring(start, end + 1));
    } catch {
      // fall through
    }
  }
  return parseJsonSafe(content);
}
