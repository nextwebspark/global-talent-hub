import OpenAI from "openai";
import { randomUUID } from "crypto";
import { storage } from "../../storage";
import { createSerperAdapter } from "./serperAdapter";
import type { InferredIntent, SearchSessionCompany, ActivityEvent } from "@shared/schema";
import { applyCoordinateFallback } from "../coordinateFallback";

// All LLM calls go through OpenRouter
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

function makeActivity(type: ActivityEvent["type"], message: string, data?: any): ActivityEvent {
  return { id: randomUUID(), type, message, timestamp: new Date(), data };
}

function parseJsonSafe(content: string): any {
  let cleaned = content.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) cleaned = jsonMatch[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) cleaned = cleaned.substring(start, end + 1);
  try { return JSON.parse(cleaned); } catch { return null; }
}

// ─── Geographic validation ─────────────────────────────────────────────────

const REGION_COUNTRIES: Record<string, string[]> = {
  "middle east": ["uae", "united arab emirates", "saudi arabia", "ksa", "qatar", "kuwait", "bahrain", "oman", "jordan", "lebanon", "iraq", "iran", "syria", "palestine", "yemen", "israel", "turkey"],
  "gcc": ["uae", "united arab emirates", "saudi arabia", "ksa", "qatar", "kuwait", "bahrain", "oman"],
  "mena": ["uae", "united arab emirates", "saudi arabia", "ksa", "qatar", "kuwait", "bahrain", "oman", "egypt", "morocco", "tunisia", "algeria", "libya", "jordan", "lebanon", "iraq", "iran", "syria", "palestine", "yemen", "israel", "turkey"],
  "north africa": ["egypt", "morocco", "tunisia", "algeria", "libya"],
  "europe": ["united kingdom", "uk", "germany", "france", "italy", "spain", "netherlands", "switzerland", "sweden", "norway", "denmark", "finland", "poland", "austria", "belgium", "ireland", "portugal", "greece", "czech republic", "luxembourg", "hungary", "romania", "bulgaria", "croatia", "slovakia", "slovenia", "latvia", "lithuania", "estonia", "malta", "cyprus", "iceland", "serbia", "ukraine", "russia"],
  "north america": ["united states", "usa", "canada", "mexico"],
  "americas": ["united states", "usa", "canada", "mexico", "brazil", "argentina", "chile", "colombia", "peru", "venezuela", "ecuador", "bolivia", "uruguay", "paraguay", "costa rica", "panama", "guatemala", "dominican republic"],
  "latin america": ["mexico", "brazil", "argentina", "chile", "colombia", "peru", "venezuela", "ecuador", "bolivia"],
  "asia pacific": ["china", "japan", "south korea", "india", "australia", "new zealand", "singapore", "hong kong", "taiwan", "malaysia", "thailand", "indonesia", "philippines", "vietnam", "bangladesh", "pakistan", "sri lanka"],
  "southeast asia": ["singapore", "malaysia", "thailand", "indonesia", "philippines", "vietnam", "cambodia", "myanmar", "laos", "brunei"],
  "south asia": ["india", "pakistan", "bangladesh", "sri lanka", "nepal", "bhutan", "maldives"],
  "africa": ["south africa", "nigeria", "kenya", "ghana", "ethiopia", "egypt", "morocco", "algeria", "tanzania", "uganda", "rwanda", "angola", "mozambique", "zimbabwe", "zambia"],
  "sub-saharan africa": ["south africa", "nigeria", "kenya", "ghana", "ethiopia", "tanzania", "uganda", "rwanda", "angola", "mozambique", "zimbabwe", "zambia", "senegal", "cameroon"],
};

/** Expand target geographies (which may be region names or country names) into a
 *  flat normalised set of country names. */
function resolveGeoSet(targetGeographies: string[]): Set<string> {
  const resolved = new Set<string>();
  for (const geo of targetGeographies) {
    const norm = geo.toLowerCase().trim();
    if (REGION_COUNTRIES[norm]) {
      for (const c of REGION_COUNTRIES[norm]) resolved.add(c);
    } else {
      resolved.add(norm);
    }
  }
  return resolved;
}

/** Return true if the enriched country is within the target geography set.
 *  Returns true (don't filter) when targetGeographies is empty or country is unknown. */
function isCountryInScope(country: string | null | undefined, geoSet: Set<string>): boolean {
  if (geoSet.size === 0) return true;
  if (!country) return true; // unknown — allow through (low confidence)
  return geoSet.has(country.toLowerCase().trim());
}

async function extractIntent(query: string, pdContent?: string): Promise<InferredIntent> {
  const pdContext = pdContent ? `\n\nADDITIONAL CONTEXT FROM UPLOADED DOCUMENT:\n${pdContent.substring(0, 3000)}` : "";

  const response = await openrouter.chat.completions.create({
    model: "anthropic/claude-sonnet-4",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `You are a senior research analyst extracting search intent from a business query.

USER QUERY: "${query}"${pdContext}

Analyze this query and return a JSON object with this exact structure:
{
  "primarySectors": ["array of 1-3 primary industry sectors"],
  "adjacentSectors": ["array of 2-4 adjacent/related sectors worth exploring"],
  "inferredSectors": ["array of 1-3 sectors the query doesn't mention but should explore given context"],
  "targetGeographies": ["array of countries or regions mentioned or implied"],
  "commercialRole": "distributor|retailer|manufacturer|operator|any|etc",
  "companySize": "large|mid-market|SME|any (optional)",
  "revenueRange": "e.g. '$100M-$1B' (optional)",
  "searchRationale": "2-3 sentences explaining search strategy",
  "confidenceScore": 0.85,
  "keyInclusions": ["what types of companies to include"],
  "keyExclusions": ["what types to exclude"]
}

Return ONLY the JSON, no other text.`
    }]
  });

  const parsed = parseJsonSafe(response.choices[0].message.content || "");
  if (!parsed) throw new Error("Failed to parse intent JSON");

  return {
    primarySectors: parsed.primarySectors || [],
    adjacentSectors: parsed.adjacentSectors || [],
    inferredSectors: parsed.inferredSectors || [],
    targetGeographies: parsed.targetGeographies || [],
    commercialRole: parsed.commercialRole || "any",
    companySize: parsed.companySize,
    revenueRange: parsed.revenueRange,
    searchRationale: parsed.searchRationale || "",
    confidenceScore: parsed.confidenceScore || 0.7,
    keyInclusions: parsed.keyInclusions || [],
    keyExclusions: parsed.keyExclusions || [],
    refinementSummary: parsed.refinementSummary,
  };
}

const GEO_CITY_MAP: Record<string, string> = {
  "Saudi Arabia": "Riyadh Jeddah Dammam",
  "UAE": "Dubai Abu Dhabi",
  "Qatar": "Doha",
  "Kuwait": "Kuwait City",
  "Bahrain": "Manama",
  "Oman": "Muscat",
  "Egypt": "Cairo",
  "Jordan": "Amman",
};

const ROLE_SYNONYMS: Record<string, string[]> = {
  distributor: ["wholesalers", "distribution companies", "distributors"],
  manufacturer: ["manufacturers", "producers", "manufacturing companies"],
  retailer: ["retailers", "retail companies", "retail chains"],
  operator: ["operators", "operating companies"],
};

const GEO_TRANSLITERATIONS: Record<string, string[]> = {
  "Saudi Arabia": ["السعودية", "KSA"],
  "UAE": ["الامارات", "Emirates"],
  "Qatar": ["قطر"],
  "Kuwait": ["الكويت"],
  "Egypt": ["مصر"],
  "Bahrain": ["البحرين"],
  "Oman": ["عمان"],
  "Jordan": ["الاردن"],
};

function generateSearchQueries(sector: string, mainGeo: string, commercialRole?: string): string[] {
  const role = commercialRole && commercialRole !== "any" ? commercialRole : "";
  const roleStr = role ? ` ${role}` : "";
  const queries: string[] = [];

  queries.push(`${sector}${roleStr} companies in ${mainGeo}`);

  if (role && ROLE_SYNONYMS[role]) {
    for (const syn of ROLE_SYNONYMS[role]) {
      queries.push(`${sector} ${syn} ${mainGeo}`);
    }
  }

  queries.push(`${sector} companies ${mainGeo} market`);

  const cities = GEO_CITY_MAP[mainGeo];
  if (cities) {
    queries.push(`${sector}${roleStr} companies ${cities}`);
  }

  queries.push(`"${sector}"${roleStr ? ` "${role}"` : ""} "${mainGeo}"`);

  const translits = GEO_TRANSLITERATIONS[mainGeo];
  if (translits) {
    for (const t of translits) {
      queries.push(`${sector}${roleStr} ${t}`);
    }
  }

  queries.push(`${sector} industry leaders${roleStr ? ` ${role}s` : ""} ${mainGeo}`);
  queries.push(`${sector} top companies ${mainGeo}`);

  const unique = Array.from(new Set(queries));
  return unique.slice(0, 7);
}

function isSpamAggregator(title: string, snippet: string, url: string): boolean {
  const lower = (title + " " + snippet).toLowerCase();
  const domain = url.toLowerCase();

  const spamDomains = [
    "quora.com", "reddit.com/r/", "answers.yahoo", "wiki.answers",
    "ehow.com", "wikihow.com", "hubpages.com", "buzzfeed.com",
    "listverse.com", "ranker.com", "thetoptens.com",
  ];
  if (spamDomains.some(d => domain.includes(d))) return true;

  const spamSignals = [
    /you\s+(?:should|must|need|can)\s+(?:check|visit|try|consider)/i,
    /click\s+here/i,
    /sign\s+up\s+(?:for|now|today)/i,
    /(?:get|grab)\s+(?:your|a)\s+(?:free|quote)/i,
    /\b(?:affiliate|sponsored|ad|promo)\b/i,
  ];
  let spamCount = 0;
  for (const re of spamSignals) {
    if (re.test(lower)) spamCount++;
  }
  if (spamCount >= 2) return true;

  const hasNamedCompanies = /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Group|Corp|Inc|Ltd|Co|Holdings|Company|LLC|Trading|Distribution|Industries|Enterprises)/g.test(snippet);
  const hasNumbers = /\d+[\.\)]\s*[A-Z]/.test(snippet);
  const hasBullets = /[-•*]\s*[A-Z]/.test(snippet);

  if (!hasNamedCompanies && !hasNumbers && !hasBullets) {
    const vagueSuperlatives = (lower.match(/\b(?:best|top|amazing|awesome|incredible|fantastic|great|superb|outstanding|premier|finest)\b/g) || []).length;
    if (vagueSuperlatives >= 3) return true;
  }

  return false;
}

function extractCompanyNamesFromListicle(snippet: string): string[] {
  const names: string[] = [];

  const numberedRe = /(?:\d+[\.\)]\s*)([A-Z][A-Za-z0-9\s&\-'\.,:()]{2,55}?)(?=\s*(?:\d+[\.\)]|$|\n|[,;]|–|—))/g;
  let m;
  while ((m = numberedRe.exec(snippet)) !== null) {
    const n = m[1].trim().replace(/[,;:]$/, "").trim();
    if (n.length > 2 && n.length < 60 && !isGenericPhrase(n) && isValidCompanyName(n)) names.push(n);
  }

  const bulletRe = /(?:^|\n)\s*[-•*]\s*([A-Z][A-Za-z0-9\s&\-'\.]{2,55}?)(?=\s*(?:[-•*]|$|\n))/gm;
  while ((m = bulletRe.exec(snippet)) !== null) {
    const n = m[1].trim().replace(/[,;:]$/, "").trim();
    if (n.length > 2 && n.length < 60 && !isGenericPhrase(n) && isValidCompanyName(n)) names.push(n);
  }

  const commaRe = /(?:including|such as|like|are|:)\s*((?:[A-Z][A-Za-z0-9\s&\-'\.]+,?\s*){2,})/gi;
  while ((m = commaRe.exec(snippet)) !== null) {
    const parts = m[1].split(/,\s*|;\s*|\band\b/i).map(p => p.trim()).filter(p => p.length > 2 && p.length < 60);
    for (const p of parts) {
      if (/^[A-Z]/.test(p) && !isGenericPhrase(p) && isValidCompanyName(p)) names.push(p);
    }
  }

  return Array.from(new Set(names)).slice(0, 15);
}

async function searchCompaniesForSector(
  sector: string,
  geographies: string[],
  commercialRole?: string
): Promise<Array<{ name: string; website?: string; snippet?: string; url?: string }>> {
  const serper = createSerperAdapter();
  if (!serper) return [];

  const mainGeo = geographies[0] || "";
  const queries = generateSearchQueries(sector, mainGeo, commercialRole);
  const companies: Array<{ name: string; website?: string; snippet?: string; url?: string }> = [];
  const seenNames = new Set<string>();

  const addCompany = (name: string, url?: string, snippet?: string) => {
    if (!isValidCompanyName(name)) return;
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seenNames.has(key)) return;
    seenNames.add(key);
    companies.push({ name, website: url, snippet, url });
  };

  for (const q of queries) {
    if (companies.length >= 30) break;
    try {
      const result = await serper.searchWithAnswer(q, 10);
      for (const r of result.results.slice(0, 8)) {
        const isListicle = ARTICLE_TITLE_RE.test(r.title || "");

        if (isListicle) {
          if (isSpamAggregator(r.title || "", r.snippet || "", r.url || "")) continue;
          const listicleNames = extractCompanyNamesFromListicle(r.snippet || "");
          for (const n of listicleNames) addCompany(n, r.url, r.snippet);
          const resultNames = extractCompanyNamesFromResult(r.title, r.snippet, r.url);
          for (const n of resultNames) addCompany(n, r.url, r.snippet);
        } else {
          const names = extractCompanyNamesFromResult(r.title, r.snippet, r.url);
          for (const n of names) addCompany(n, r.url, r.snippet);
        }
      }
    } catch (err) {
      console.warn(`[EnhancedPipeline] Serper search failed for query "${q}":`, err);
    }
  }

  return companies;
}

// Patterns that indicate an article/listicle title rather than a company name.
// E.g. "Top 20 Logistics Companies In Dubai", "Top FMCG Companies in UAE",
// "Best FMCG Companies 2025", "List of distributors in UAE",
// "10 Leading companies in GCC", "The Biggest Pharma Companies",
// "Leading Distributors in KSA", "Key Players in FMCG"
const ARTICLE_TITLE_RE = /^(?:top\s+|best\s+|leading\s+|biggest\s+|major\s+|key\s+|the\s+(?:top|best|biggest|leading|major)\s+|list\s+of\s+|\d+\s+|the\s+\d+)/i;

function extractCompanyNamesFromResult(title: string, snippet: string, url: string): string[] {
  const names: string[] = [];

  const listPattern = /(?:\d+[\.\)]\s+)([A-Z][A-Za-z0-9\s&\-'\.,:()]{2,60}?)(?=\s*(?:\d+[\.\)]|$|\n|·|•|–|--))/g;
  const bulletPattern = /(?:^|\n)\s*[-•*]\s*([A-Z][A-Za-z0-9\s&\-'\.]{2,60}?)(?=\s*(?:[-•*]|$|\n))/gm;

  const titleName = title
    .replace(/\s*[-–—|:]\s*(?:Wikipedia|Forbes|Bloomberg|Reuters|Company Profile|Overview|About|Review|Careers|Jobs|News|Home|Official|Top \d+|List of|Best .+).*$/i, "")
    .replace(/\s*\|\s*.*$/, "")
    .replace(/\s*\(\d{4}(?:\s+List)?\)\s*$/i, "")  // strip "(2024)" / "(2025 List)"
    .trim();

  const COMPANY_SUFFIXES = /\b(?:group|corp|inc|ltd|co|holdings|company|llc|sa|saog|international|trading|distribution|retail|enterprises|plc|ag|gmbh|spa|nv|bv|industries|partners|capital|investments|bank|logistics|solutions|services|ventures|associates|consulting)\b/i;
  
  // Only add a title-derived name if it looks like an actual company (not an article headline)
  if (
    titleName.length > 2 &&
    titleName.length < 80 &&
    COMPANY_SUFFIXES.test(titleName) &&
    !ARTICLE_TITLE_RE.test(titleName)
  ) {
    names.push(titleName);
  }

  const text = `${title} ${snippet}`;
  let match;
  while ((match = listPattern.exec(text)) !== null) {
    const n = match[1].trim().replace(/[,:]$/, "").trim();
    if (n.length > 2 && n.length < 80 && !isGenericPhrase(n) && !ARTICLE_TITLE_RE.test(n)) names.push(n);
  }
  while ((match = bulletPattern.exec(text)) !== null) {
    const n = match[1].trim().replace(/[,:]$/, "").trim();
    if (n.length > 2 && n.length < 80 && !isGenericPhrase(n) && !ARTICLE_TITLE_RE.test(n)) names.push(n);
  }

  return Array.from(new Set(names)).slice(0, 5);
}

function isGenericPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  const bad = ["top", "best", "largest", "leading", "biggest", "major", "list", "company", "companies", "business", "market", "industry", "you", "we", "here", "click", "read"];
  return bad.some(p => lower === p || lower.startsWith(p + " ") || lower.endsWith(" " + p));
}

const COUNTRY_AND_CITY_NAMES = new Set([
  "saudi arabia", "ksa", "uae", "united arab emirates", "qatar", "kuwait", "bahrain", "oman",
  "egypt", "jordan", "lebanon", "iraq", "iran", "syria", "turkey", "israel", "yemen",
  "united states", "usa", "canada", "mexico", "brazil", "argentina", "chile", "colombia",
  "united kingdom", "uk", "germany", "france", "italy", "spain", "netherlands", "switzerland",
  "china", "japan", "south korea", "india", "australia", "singapore", "hong kong", "malaysia",
  "south africa", "nigeria", "kenya", "ghana",
  "riyadh", "jeddah", "dammam", "dubai", "abu dhabi", "doha", "muscat", "manama", "kuwait city",
  "cairo", "amman", "beirut", "london", "new york", "tokyo", "mumbai",
]);

function isValidCompanyName(name: string): boolean {
  if (name.length > 60) return false;
  if (name.endsWith("...") || name.endsWith("…")) return false;
  const lower = name.toLowerCase().trim();
  if (COUNTRY_AND_CITY_NAMES.has(lower)) return false;
  const badPatterns = [
    /\bcompanies\s+in\b/i,
    /\blist\s+of\b/i,
    /\btop\s+\d+/i,
    /^top\s+/i,
    /^best\s+/i,
    /^leading\s+/i,
    /^major\s+/i,
    /^key\s+/i,
    /^biggest\s+/i,
    /\bdirectory\b/i,
    /\bservices\s+in\b/i,
    /\bwww\./i,
    /\.com\b/i,
    /\.org\b/i,
    /\.net\b/i,
    /https?:/i,
    /\/{2,}/,
    /\.\.\./,
    /\bcompanies\b.*\bmarket\b/i,
    /\.(?:qxd|pdf|doc|docx|ppt|pptx|xls|xlsx)\b/i,
    /\bcommuniqu[eé]\b/i,
    /\bpgs\b.*\bqxd\b/i,
  ];
  if (badPatterns.some(p => p.test(name))) return false;
  if (/^[a-z\s-]+$/.test(lower) && lower.split(/\s+/).length > 5) return false;
  return true;
}

function extractTargetCount(query: string): number {
  const patterns = [
    /\b(?:top|find|get|show|list|identify)\s+(\d+)\b/i,
    /\b(\d+)\s+(?:companies|distributors|manufacturers|retailers|operators|firms|businesses|players|brands)\b/i,
  ];
  for (const p of patterns) {
    const m = query.match(p);
    if (m) return Math.min(parseInt(m[1], 10), 50);
  }
  return 15;
}

const PAGE_PREFIXES_RE = /^(?:about\s+us|employee\s+directory|contact\s*(?:us)?|home|services|careers|jobs|overview|profile|who\s+we\s+are|our\s+team)\s*[-–—:|]\s*/i;
const COMPANY_SUFFIX_STRIP_RE = /\s*(?:trd\.?\s*co\.?|trading\s+co\.?|l\.?l\.?c\.?|inc\.?|corp\.?|ltd\.?|pvt\.?|p\.?l\.?c\.?|s\.?a\.?|gmbh|ag|bv|nv)\s*\.?\s*$/i;

function cleanCompanyName(rawName: string): string {
  let name = rawName.trim();
  name = name.replace(PAGE_PREFIXES_RE, "");
  name = name.replace(/\s*[-–—|]\s*(?:Home|About|Contact|Overview|Profile|Wikipedia|LinkedIn|Careers|Jobs|Official).*$/i, "");
  name = name.replace(/\s*\(\d{4}(?:\s+List)?\)\s*$/i, "");
  name = name.replace(/\s*[-–—|/]\s*(?:about|contact|services|careers|home|products|solutions|team|blog|news|press|media|investors|faq).*$/i, "");
  name = name.replace(/\/[a-z-]+$/i, "");
  name = name.replace(/\s*[-–—]\s*(?:Your\s+|We\s+|The\s+|A\s+|An\s+|Our\s+|trusted|leading|premier|one[\s-]stop|partner|providing|delivering|excellence).*$/i, "");
  name = name.replace(/\s*[-–—]\s+\w+\s+\w+\s+\w+\s+\w+.*$/i, "");
  name = name.replace(/\.\s*(?:qxd|pdf|doc|docx|ppt|pptx|xls|xlsx)\b.*$/i, "");
  name = name.replace(/^.*?(?:pgs|pages?)\s*\.\s*\w+\s*[-–—]\s*/i, "");
  return name.trim();
}

function fuzzyCompanySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(COMPANY_SUFFIX_STRIP_RE, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeCompanyKey(name: string, website?: string): string {
  const slug = fuzzyCompanySlug(name);
  if (website) {
    try {
      const domain = new URL(website).hostname.replace(/^www\./, "");
      return `${slug}::${domain}`;
    } catch (_urlErr) {}
  }
  return slug;
}

async function enrichCompany(
  companyName: string,
  sector: string,
  geographies: string[],
  intent: InferredIntent,
  relevanceType: "Direct" | "Adjacent" | "AI Inferred"
): Promise<Partial<SearchSessionCompany> & { sectorMatch?: boolean }> {
  const geoStr = geographies.join(", ");
  const primarySectorList = intent.primarySectors.join(", ") || sector;
  const commercialRole = intent.commercialRole || "any";

  const prompt = `You are a Talent Advisory (TA) research analyst evaluating a company for an executive search mandate.

SEARCH CONTEXT:
- Target sectors: "${primarySectorList}"
- Target commercial function: "${commercialRole}"
- Target geography: ${geoStr}
- Original query: "${intent.searchRationale || primarySectorList + " in " + geoStr}"

COMPANY TO EVALUATE: "${companyName}"

Your job: determine if "${companyName}" is a genuine operating company that matches BOTH the target sector AND the target commercial function.

Return JSON with this EXACT structure:
{
  "sectorMatch": true,
  "sector": "specific sector this company actually operates in",
  "country": "headquarters country (e.g. 'Saudi Arabia', 'UAE')",
  "geography": "primary market geography (e.g. 'GCC', 'Middle East')",
  "revenue": "$500M or null",
  "employees": 5000,
  "website": "https://example.com or null",
  "summary": "2-3 sentence factual company overview",
  "relevanceRationale": "one sentence: why this company matches or does not match",
  "confidenceScore": 75
}

SCORING RULES (universal — no hardcoded industry logic):

1. SECTOR CHECK: Does this company primarily operate in or directly serve "${primarySectorList}"?
   - Yes → proceed to function check
   - No → sectorMatch: false, confidenceScore ≤ 30

2. FUNCTION CHECK: Does this company's primary business function match "${commercialRole}"?
   - If commercialRole is "any" → skip this check
   - If the company is in the right sector but the WRONG function (e.g., a restaurant when searching for distributors, a retailer when searching for manufacturers, a law firm when searching for fintech operators) → sectorMatch: false, confidenceScore ≤ 35
   - If the company's function overlaps with the target (e.g., a wholesaler/logistics company that distributes the target product) → sectorMatch: true with appropriate confidence
   - IMPORTANT: Large conglomerates that BOTH manufacture AND distribute products in the target sector should return sectorMatch: true. A manufacturer with a distribution arm IS a distributor. Do not penalise vertically-integrated companies.

3. CONGLOMERATE AND MULTI-BUSINESS RULE:
   Many of the most important companies in any market are diversified — they may operate in manufacturing, distribution, retail, and services simultaneously. Evaluate whether the target sector is a SIGNIFICANT business line, not whether it is the company's ONLY business. If a company derives meaningful revenue from the searched sector and would credibly employ executives with the relevant expertise, return sectorMatch: true and tag it Direct regardless of what other businesses it operates. This applies to conglomerates, holding companies, family groups, and diversified corporations across all markets and sectors. Do NOT penalise a company for also operating in other sectors — only penalise if the target sector is trivial or non-existent in their portfolio.

4. SECTOR BOUNDARY RULES:
   - "FMCG" primarily means food & beverage, household goods, personal care basics, and tobacco. It does NOT primarily mean beauty, cosmetics, luxury personal care, or healthcare.
   - If the search is for "FMCG" and the company is primarily a beauty/cosmetics/luxury personal care specialist, set confidenceScore ≤ 55 (partial match, not core FMCG).
   - Conversely, an FMCG conglomerate that also sells personal care/beauty products IS core FMCG — do not downgrade.

4. CONFIDENCE CALIBRATION:
   - 80-100: Perfect match on sector + function + geography. A well-known company in the exact target sector, performing the exact target function, in the target geography.
   - 60-79: Good match with minor gaps (e.g., slightly adjacent sub-sector, different city but same country)
   - 40-59: Partial match (overlapping sector, plausible function, or sub-segment specialist)
   - ≤ 39: Poor match — wrong sector, wrong function, or unverifiable company

Return ONLY the JSON.`;

  try {
    const response = await openrouter.chat.completions.create({
      model: "anthropic/claude-sonnet-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 600,
    });

    const content = response.choices[0]?.message?.content || "";
    const parsed = parseJsonSafe(content);

    if (!parsed) return { sectorMatch: undefined, relevanceType, relevanceRationale: `Relevant to ${sector} in ${geoStr}`, confidenceScore: 25 };

    return {
      sectorMatch: typeof parsed.sectorMatch === "boolean" ? parsed.sectorMatch : undefined, // undefined = unknown
      sector: parsed.sector || sector,
      country: parsed.country || null,
      geography: parsed.geography || null,
      revenue: parsed.revenue || null,
      employees: parsed.employees || null,
      website: parsed.website || null,
      summary: parsed.summary || null,
      relevanceType,
      relevanceRationale: parsed.relevanceRationale || `Relevant to ${sector}`,
      confidenceScore: Math.min(100, Math.max(0, parsed.confidenceScore || 60)),
    };
  } catch {
    return {
      sectorMatch: undefined, // unknown — will be penalised downstream
      relevanceType,
      relevanceRationale: `Relevant to ${sector} in ${geoStr}`,
      confidenceScore: 25,
    };
  }
}

async function persistCompany(
  name: string,
  enriched: Partial<SearchSessionCompany>,
  intent: InferredIntent,
  searchQueryId: number,
  sessionId: string
): Promise<number | null> {
  try {
    const countryStr = enriched.country || intent.targetGeographies[0] || null;
    let lat: string | null = null;
    let lng: string | null = null;

    if (countryStr) {
      const fallback = applyCoordinateFallback({ latitude: null, longitude: null, country: countryStr });
      if (fallback.latitude) lat = String(fallback.latitude);
      if (fallback.longitude) lng = String(fallback.longitude);
    }

    const revenueNumeric = enriched.revenue
      ? parseFloat(enriched.revenue.replace(/[^0-9.]/g, "") || "0") * (enriched.revenue.includes("B") ? 1e9 : enriched.revenue.includes("M") ? 1e6 : 1)
      : null;

    const companyData = {
      name,
      sector: enriched.sector || intent.primarySectors[0] || null,
      country: countryStr,
      latitude: lat,
      longitude: lng,
      revenue: revenueNumeric ? String(revenueNumeric) : null,
      employees: enriched.employees || null,
      website: enriched.website || null,
      summary: enriched.summary || null,
      confidence: Math.round((enriched.confidenceScore || 60) / 10),
      relevanceReason: enriched.relevanceRationale || null,
      searchQueryId,
      relevanceType: enriched.relevanceType || null,
      relevanceRationale: enriched.relevanceRationale || null,
      confidenceScore: enriched.confidenceScore || null,
      searchSessionId: sessionId,
    };

    const { company } = await storage.upsertCompanyNonDestructive(companyData as Parameters<typeof storage.upsertCompanyNonDestructive>[0], searchQueryId, {});

    return company.id;
  } catch (err) {
    console.error(`[EnhancedPipeline] Failed to persist ${name}:`, err);
    return null;
  }
}

// ─── Phase 1: Claude Seed List Generation ─────────────────────────────────
function parseJsonArray(content: string): string[] {
  let cleaned = content.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) cleaned = jsonMatch[1].trim();
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd !== -1) cleaned = cleaned.substring(arrStart, arrEnd + 1);
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed.filter((n: unknown) => typeof n === "string" && n.length > 1);
  } catch { /* ignore */ }
  return [];
}

async function generateSeedList(
  intent: InferredIntent,
  sectorOverride: string | null,
  relevanceType: "Direct" | "Adjacent" | "AI Inferred",
  count: number = 25,
  excludeNames?: string[],
): Promise<string[]> {
  const sector = sectorOverride || intent.primarySectors[0] || "";
  if (!sector) return [];

  const geoStr = intent.targetGeographies.join(", ") || "globally";
  const hasRole = intent.commercialRole && intent.commercialRole !== "any";
  const role = hasRole ? intent.commercialRole! : "";

  let prompt: string;

  if (relevanceType === "Direct") {
    const roleInstruction = hasRole
      ? `List the most significant companies whose PRIMARY business is ${role} in the ${sector} sector operating in ${geoStr}. Focus specifically on ${role} companies — not manufacturers, not retailers, not logistics providers unless their primary business is ${role}.`
      : `List the most significant companies in the ${sector} sector operating in ${geoStr}.`;

    prompt = `${roleInstruction}

Requirements:
- Return ONLY a JSON array of company names, ordered by market significance
- Include ${count} names
- Focus on real, operating companies — not trade associations, government bodies, brand owners, or generic brands
${hasRole ? `- Every company must be primarily a ${role} — not a brand owner that also distributes, not a retailer, not a manufacturer unless they are primarily known as a ${role}\n` : ""}- Include a mix of: major players, established regional companies, and notable mid-sized companies
- For conglomerates/holding companies, include ONLY if ${sector} ${hasRole ? role : "operations"} is a significant business line
- Do NOT include parent company and subsidiary separately

Return ONLY the JSON array, e.g. ["Company A", "Company B", ...]`;
  } else {
    const excludeList = excludeNames && excludeNames.length > 0
      ? `\n- Do NOT include any of these companies (they are already in the core results): ${excludeNames.slice(0, 30).join(", ")}`
      : "";

    prompt = `List companies in the ${sector} sector operating in ${geoStr} that are DIFFERENT from typical ${intent.primarySectors.join("/")} companies.

These are for an "AI Suggested" tab showing adjacent/related companies that a search for "${intent.primarySectors.join(", ")}" might also want to consider.

Requirements:
- Return ONLY a JSON array of company names, ordered by relevance
- Include ${count} names
- Focus on companies in ${sector} that are genuinely different from mainstream ${intent.primarySectors.join("/")} companies
- These should be companies from a related but distinct sector${excludeList}
${hasRole ? `- Prefer companies that employ ${role}-type executives\n` : ""}- Real, operating companies only

Return ONLY the JSON array, e.g. ["Company A", "Company B", ...]`;
  }

  try {
    const response = await openrouter.chat.completions.create({
      model: "anthropic/claude-sonnet-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const names = parseJsonArray(response.choices[0]?.message?.content || "");
    return names.slice(0, count + 5);
  } catch (err) {
    console.warn("[Pipeline] Seed list generation failed:", err);
  }
  return [];
}

// ─── Phase 2: Parallel Enrichment ──────────────────────────────────────────
const PARALLEL_CONCURRENCY = 5;

async function enrichBatch(
  names: string[],
  sector: string,
  intent: InferredIntent,
  relevanceType: "Direct" | "Adjacent" | "AI Inferred",
  geoSet: Set<string>,
  seenKeys: Set<string>,
  searchQueryId: number,
  sessionId: string,
  signal?: AbortSignal,
  onFound?: (name: string, sector: string, relevanceType: string) => void,
  onEnriched?: (company: SearchSessionCompany) => void,
  onFiltered?: (name: string, reason: string) => void,
): Promise<SearchSessionCompany[]> {
  const results: SearchSessionCompany[] = [];
  let counter = 0;

  const processOne = async (rawName: string) => {
    if (signal?.aborted) return;

    const name = cleanCompanyName(rawName);
    if (!name || name.length < 2) return;
    if (!isValidCompanyName(name)) return;

    const fuzzyKey = fuzzyCompanySlug(name);
    if (seenKeys.has(fuzzyKey)) return;
    seenKeys.add(fuzzyKey);

    onFound?.(name, sector, relevanceType);

    const enriched = await enrichCompany(name, sector, intent.targetGeographies, intent, relevanceType);

    if (enriched.sectorMatch === false) {
      onFiltered?.(name, `sector mismatch: ${enriched.sector || "wrong sector"}`);
      return;
    }
    if (enriched.sectorMatch === undefined) {
      enriched.confidenceScore = Math.min(enriched.confidenceScore ?? 25, 25);
    }

    if (!isCountryInScope(enriched.country, geoSet)) {
      onFiltered?.(name, `out of region: ${enriched.country || "unknown"}`);
      return;
    }
    if (!enriched.country && geoSet.size > 0) {
      enriched.confidenceScore = Math.min(enriched.confidenceScore ?? 50, 35);
    }

    let finalRelevanceType = relevanceType;
    const score = enriched.confidenceScore ?? 50;
    if (finalRelevanceType === "Direct" && score < 70) {
      finalRelevanceType = "Adjacent";
    }
    enriched.relevanceType = finalRelevanceType;

    const companyId = await persistCompany(name, enriched, intent, searchQueryId, sessionId);

    const company: SearchSessionCompany = {
      id: companyId ?? counter++,
      name,
      sector: enriched.sector || sector,
      country: enriched.country || null,
      geography: enriched.geography || null,
      revenue: enriched.revenue || null,
      employees: enriched.employees || null,
      website: enriched.website || null,
      summary: enriched.summary || null,
      latitude: null,
      longitude: null,
      relevanceType: finalRelevanceType,
      relevanceRationale: enriched.relevanceRationale || `Relevant to ${sector}`,
      confidenceScore: score,
      isUserAccepted: false,
      isUserRejected: false,
    };

    results.push(company);
    onEnriched?.(company);
  };

  // Process in batches of PARALLEL_CONCURRENCY for controlled parallelism
  for (let i = 0; i < names.length; i += PARALLEL_CONCURRENCY) {
    if (signal?.aborted) break;
    const batch = names.slice(i, i + PARALLEL_CONCURRENCY);
    await Promise.all(batch.map(n => processOne(n).catch(err => {
      console.warn(`[Pipeline] Enrichment failed for "${n}":`, err);
    })));
  }

  return results;
}

export async function* runEnhancedSearchPipeline(
  query: string,
  sessionId: string,
  searchQueryId: number,
  pdContent?: string,
  signal?: AbortSignal,
  precomputedIntent?: InferredIntent,
  changedCriteria?: string[]
): AsyncGenerator<ActivityEvent> {

  const emit = (type: ActivityEvent["type"], message: string, data?: any): ActivityEvent => {
    return makeActivity(type, message, data);
  };

  try {
    await storage.updateSearchSession(sessionId, { status: "searching", searchQueryId });
  } catch (sessionErr) {
    console.warn("[Pipeline] Could not update session status to searching:", sessionErr);
  }

  // ── Intent Extraction ──────────────────────────────────────────────────────
  let intent: InferredIntent;
  if (precomputedIntent) {
    intent = precomputedIntent;
    yield emit("status", "Using refined search intent...");
    yield emit("intent_extracted", "Refined intent applied", { intent });
  } else {
    yield emit("status", "Extracting search intent...");
    try {
      intent = await extractIntent(query, pdContent);
      try {
        await storage.updateSearchSession(sessionId, { inferredIntent: intent });
      } catch (intentErr) {
        console.warn("[Pipeline] Could not persist inferred intent:", intentErr);
      }
      yield emit("intent_extracted", "Intent understood", { intent });
    } catch (err: any) {
      await storage.updateSearchSession(sessionId, { status: "error" }).catch(() => {});
      yield emit("error", `Failed to extract intent: ${err.message}`);
      return;
    }
  }

  if (signal?.aborted) return;

  const seenKeys = new Set<string>();
  const companies: SearchSessionCompany[] = [];
  const targetCount = extractTargetCount(query);
  const geoSet = resolveGeoSet(intent.targetGeographies);

  // Queues for events generated by parallel enrichment (since we can't yield from callbacks)
  const pendingEvents: ActivityEvent[] = [];

  const flushEvents = function* (): Generator<ActivityEvent> {
    while (pendingEvents.length > 0) {
      yield pendingEvents.shift()!;
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — AI Seed List (fast, Claude's knowledge)
  // ══════════════════════════════════════════════════════════════════════════
  yield emit("status", "Phase 1: Generating company list from AI knowledge...");

  const seedNames = await generateSeedList(intent, null, "Direct", Math.max(targetCount + 5, 30));

  if (signal?.aborted) return;

  yield emit("status", `AI identified ${seedNames.length} companies — enriching in parallel...`);

  // Emit all seed names as "found" immediately so the UI shows skeletons
  for (const name of seedNames) {
    yield emit("company_found", `Found: ${name}`, { companyName: name, name, sector: intent.primarySectors[0] || "", relevanceType: "Direct" });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Parallel Enrichment of seed list
  // ══════════════════════════════════════════════════════════════════════════
  const seedCompanies = await enrichBatch(
    seedNames,
    intent.primarySectors[0] || "",
    intent,
    "Direct",
    geoSet,
    seenKeys,
    searchQueryId,
    sessionId,
    signal,
    undefined,
    (company) => {
      pendingEvents.push(emit("company_enriched", `Enriched: ${company.name}`, { company }));
    },
    (name, reason) => {
      pendingEvents.push(emit("status", `Filtered: ${name} — ${reason}`));
    },
  );

  companies.push(...seedCompanies);
  yield* flushEvents();

  if (signal?.aborted) return;

  yield emit("status", `Phase 1 complete: ${companies.length} companies validated`);

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — Web Search Supplement (catches what Claude missed)
  // ══════════════════════════════════════════════════════════════════════════
  if (companies.length < targetCount && !signal?.aborted) {
    yield emit("status", `Phase 3: Web search for additional companies (${companies.length}/${targetCount})...`);

    const serper = createSerperAdapter();
    if (serper) {
      const mainGeo = intent.targetGeographies[0] || "";
      const role = intent.commercialRole && intent.commercialRole !== "any" ? intent.commercialRole : "";
      const primarySector = intent.primarySectors[0] || "";
      const webSearchNames: string[] = [];

      const supplementQueries: string[] = [];
      if (role) {
        supplementQueries.push(`${primarySector} ${role} companies ${mainGeo} site:linkedin.com/company`);
        supplementQueries.push(`"${primarySector}" "${role}" "${mainGeo}" company directory 2024`);
        supplementQueries.push(`${primarySector} ${role} ${mainGeo} smaller regional companies`);
      } else {
        supplementQueries.push(`${primarySector} companies ${mainGeo} site:linkedin.com/company`);
        supplementQueries.push(`"${primarySector}" "${mainGeo}" company directory 2024`);
        supplementQueries.push(`${primarySector} emerging companies ${mainGeo}`);
      }

      for (const q of supplementQueries) {
        if (signal?.aborted) break;
        try {
          const result = await serper.searchWithAnswer(q, 10);
          for (const r of result.results.slice(0, 8)) {
            const isListicle = ARTICLE_TITLE_RE.test(r.title || "");
            if (isListicle && isSpamAggregator(r.title || "", r.snippet || "", r.url || "")) continue;
            const names = isListicle
              ? [...extractCompanyNamesFromListicle(r.snippet || ""), ...extractCompanyNamesFromResult(r.title, r.snippet, r.url)]
              : extractCompanyNamesFromResult(r.title, r.snippet, r.url);

            for (let name of names) {
              name = cleanCompanyName(name);
              if (!name || name.length < 2) continue;
              if (!isValidCompanyName(name)) continue;
              const fuzzyKey = fuzzyCompanySlug(name);
              if (seenKeys.has(fuzzyKey)) continue;
              webSearchNames.push(name);
            }
          }
        } catch (err) {
          console.warn(`[Pipeline] Web search failed for "${q}":`, err);
        }
      }

      if (webSearchNames.length > 0 && !signal?.aborted) {
        const uniqueWebNames = Array.from(new Set(webSearchNames));
        yield emit("status", `Found ${uniqueWebNames.length} additional candidates from web — enriching...`);

        for (const name of uniqueWebNames) {
          yield emit("company_found", `Found: ${name}`, { companyName: name, name, sector: intent.primarySectors[0] || "", relevanceType: "Direct" });
        }

        const webCompanies = await enrichBatch(
          uniqueWebNames,
          intent.primarySectors[0] || "",
          intent,
          "Direct",
          geoSet,
          seenKeys,
          searchQueryId,
          sessionId,
          signal,
          undefined,
          (company) => {
            pendingEvents.push(emit("company_enriched", `Enriched: ${company.name}`, { company }));
          },
          (name, reason) => {
            pendingEvents.push(emit("status", `Filtered: ${name} — ${reason}`));
          },
        );

        companies.push(...webCompanies);
        yield* flushEvents();
      }
    }
  }

  if (signal?.aborted) return;

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3b — Adjacent & Inferred Sectors (for AI Suggested tab)
  // ══════════════════════════════════════════════════════════════════════════
  const adjacentSectors = intent.adjacentSectors || [];
  const inferredSectors = intent.inferredSectors || [];
  const aiSuggestedSectors = [...adjacentSectors, ...inferredSectors];

  if (aiSuggestedSectors.length > 0 && !signal?.aborted) {
    yield emit("status", `Exploring ${aiSuggestedSectors.length} adjacent/inferred sectors...`);

    const coreCompanyNames = companies.map(c => c.name);

    for (const sector of adjacentSectors) {
      if (signal?.aborted) break;
      const relType: "Adjacent" | "AI Inferred" = "Adjacent";
      yield emit("adjacent_sector_found", `Adjacent sector: ${sector}`, { sector });

      const sectorSeedNames = await generateSeedList(
        intent,
        sector,
        relType,
        10,
        coreCompanyNames,
      );

      if (sectorSeedNames.length > 0 && !signal?.aborted) {
        for (const name of sectorSeedNames) {
          yield emit("company_found", `Found: ${name}`, { companyName: name, name, sector, relevanceType: relType });
        }

        const sectorCompanies = await enrichBatch(
          sectorSeedNames, sector, intent, relType,
          geoSet, seenKeys, searchQueryId, sessionId, signal,
          undefined,
          (company) => { pendingEvents.push(emit("company_enriched", `Enriched: ${company.name}`, { company })); },
          (name, reason) => { pendingEvents.push(emit("status", `Filtered: ${name} — ${reason}`)); },
        );
        companies.push(...sectorCompanies);
        yield* flushEvents();
      }
    }

    for (const sector of inferredSectors) {
      if (signal?.aborted) break;
      const relType: "Adjacent" | "AI Inferred" = "AI Inferred";
      yield emit("adjacent_sector_found", `AI-inferred sector: ${sector}`, { sector });

      const sectorSeedNames = await generateSeedList(
        intent,
        sector,
        relType,
        8,
        coreCompanyNames,
      );

      if (sectorSeedNames.length > 0 && !signal?.aborted) {
        for (const name of sectorSeedNames) {
          yield emit("company_found", `Found: ${name}`, { companyName: name, name, sector, relevanceType: relType });
        }

        const sectorCompanies = await enrichBatch(
          sectorSeedNames, sector, intent, relType,
          geoSet, seenKeys, searchQueryId, sessionId, signal,
          undefined,
          (company) => { pendingEvents.push(emit("company_enriched", `Enriched: ${company.name}`, { company })); },
          (name, reason) => { pendingEvents.push(emit("status", `Filtered: ${name} — ${reason}`)); },
        );
        companies.push(...sectorCompanies);
        yield* flushEvents();
      }
    }
  }

  // ── Mark complete ──────────────────────────────────────────────────────────
  try {
    await storage.updateSearchSession(sessionId, { status: "complete" });
  } catch (completionErr) {
    console.warn("[Pipeline] Could not mark session complete:", completionErr);
  }

  yield emit("search_complete", `Search complete: ${companies.length} companies found`, {
    totalCompanies: companies.length,
    searchQueryId,
    sessionId,
  });
}
