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

const COUNTRY_ALIASES: Record<string, string[]> = {
  "uae": ["united arab emirates", "uae"],
  "united arab emirates": ["united arab emirates", "uae"],
  "usa": ["united states", "usa", "united states of america", "us"],
  "united states": ["united states", "usa", "united states of america", "us"],
  "united states of america": ["united states", "usa", "united states of america", "us"],
  "us": ["united states", "usa", "united states of america", "us"],
  "uk": ["united kingdom", "uk", "great britain", "britain"],
  "united kingdom": ["united kingdom", "uk", "great britain", "britain"],
  "great britain": ["united kingdom", "uk", "great britain", "britain"],
  "britain": ["united kingdom", "uk", "great britain", "britain"],
  "ksa": ["saudi arabia", "ksa"],
  "saudi arabia": ["saudi arabia", "ksa"],
  "south korea": ["south korea", "korea", "republic of korea"],
  "korea": ["south korea", "korea", "republic of korea"],
};

function normalizeCountryAliases(name: string): string[] {
  const norm = name.toLowerCase().trim();
  return COUNTRY_ALIASES[norm] || [norm];
}

/** Expand target geographies (which may be region names or country names) into a
 *  flat normalised set of country names. */
function resolveGeoSet(targetGeographies: string[]): Set<string> {
  const resolved = new Set<string>();
  for (const geo of targetGeographies) {
    const norm = geo.toLowerCase().trim();
    if (REGION_COUNTRIES[norm]) {
      for (const c of REGION_COUNTRIES[norm]) {
        for (const alias of normalizeCountryAliases(c)) resolved.add(alias);
      }
    } else {
      for (const alias of normalizeCountryAliases(norm)) resolved.add(alias);
    }
  }
  return resolved;
}

/** Return true if the enriched country is within the target geography set.
 *  Returns true (don't filter) when targetGeographies is empty or country is unknown. */
function isCountryInScope(country: string | null | undefined, geoSet: Set<string>): boolean {
  if (geoSet.size === 0) return true;
  if (!country) return true;
  const aliases = normalizeCountryAliases(country);
  return aliases.some(a => geoSet.has(a));
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

interface ClassificationResult {
  sectorMatch?: boolean;
  sector: string | null;
  country: string | null;
  geography: string | null;
  relevanceType: "Direct" | "Adjacent" | "AI Inferred";
  relevanceRationale: string;
  confidenceScore: number;
}

async function classifyCompany(
  companyName: string,
  sector: string,
  geographies: string[],
  intent: InferredIntent,
  relevanceType: "Direct" | "Adjacent" | "AI Inferred"
): Promise<ClassificationResult> {
  const geoStr = geographies.join(", ");
  const primarySectorList = intent.primarySectors.join(", ") || sector;
  const commercialRole = intent.commercialRole || "any";

  const prompt = `You are helping a Talent Acquisition professional build a target company list for an executive search mandate.

SEARCH CONTEXT:
- Target sector: "${primarySectorList}"
- Target commercial role: "${commercialRole}"
- Target geography: ${geoStr}

COMPANY TO EVALUATE: "${companyName}"

STEP 1 — Identify what "${companyName}" actually does. What is this company's primary business activity? Is it a manufacturer, distributor, retailer, service provider, brand owner, trading house, logistics company, or something else? Where is it headquartered?

STEP 2 — Apply the three-tier test. The question is: would executives at "${companyName}" have expertise transferable to ${commercialRole} in ${primarySectorList}?

TIER 1 — DIRECT (sectorMatch: true, confidenceScore 70-100):
The company's PRIMARY business activity is ${commercialRole} in ${primarySectorList}. They are the first companies any industry professional thinks of when asked about ${commercialRole} in this space. This includes conglomerates where ${commercialRole} in ${primarySectorList} is a major business line.
${commercialRole !== "any" ? `CRITICAL: A company that operates in ${primarySectorList} but whose primary activity is NOT ${commercialRole} does NOT qualify as Direct. A brand owner is not a distributor. A retailer is not a manufacturer. A product company is not a trading house. Classify based on PRIMARY business activity, not sector presence.` : ""}

TIER 2 — ADJACENT (sectorMatch: true, confidenceScore 55-69):
The company operates meaningful capability in ${commercialRole} but it is not their primary business. Their leadership would have directly transferable expertise in ${commercialRole}.

TRANSFERABILITY TEST — apply before tagging Adjacent:
Would a senior executive from this company be a credible candidate for a leadership role in ${commercialRole} within ${primarySectorList}? If the answer is no — because their expertise is in a fundamentally different commercial activity (e.g., retail vs distribution, brand management vs trading) — exclude entirely.

TIER 3 — EXCLUDE (sectorMatch: false, confidenceScore ≤ 30):
No meaningful connection to ${commercialRole} in ${primarySectorList}. No transferable expertise. This includes: wrong sector, wrong function with no overlap, brand owners when searching for distributors, retailers when searching for manufacturers, and entities that are not real operating companies.

Return JSON with this EXACT structure:
{
  "primaryBusinessActivity": "what this company actually does (e.g. 'FMCG distributor', 'retail chain', 'food manufacturer', 'cosmetics brand owner')",
  "sectorMatch": true,
  "sector": "specific sector this company actually operates in",
  "country": "headquarters country (e.g. 'Saudi Arabia', 'UAE')",
  "geography": "primary market geography (e.g. 'GCC', 'Middle East')",
  "relevanceRationale": "one sentence: why this company's primary activity does or does not match ${commercialRole} in ${primarySectorList}",
  "confidenceScore": 75
}

CONFIDENCE CALIBRATION:
- 85-100: Tier 1 — primary business activity is exactly ${commercialRole} in ${primarySectorList}.
- 70-84: Tier 1 — strong match, primary activity aligns well with ${commercialRole}.
- 55-69: Tier 2 — passes transferability test, meaningful ${commercialRole} capability but secondary.
- ≤ 30: Tier 3 — primary activity is fundamentally different from ${commercialRole}, or wrong sector.
- IMPORTANT: Do not score between 31 and 54. Either passes transferability test (≥55) or belongs in Tier 3 (≤30).

Return ONLY the JSON.`;

  try {
    const response = await openrouter.chat.completions.create({
      model: "anthropic/claude-sonnet-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 400,
    });

    const content = response.choices[0]?.message?.content || "";
    const parsed = parseJsonSafe(content);

    if (!parsed) return { sectorMatch: undefined, sector: sector, country: null, geography: null, relevanceType, relevanceRationale: `Relevant to ${sector} in ${geoStr}`, confidenceScore: 25 };

    return {
      sectorMatch: typeof parsed.sectorMatch === "boolean" ? parsed.sectorMatch : undefined,
      sector: parsed.sector || sector,
      country: parsed.country || null,
      geography: parsed.geography || null,
      relevanceType,
      relevanceRationale: parsed.relevanceRationale || `Relevant to ${sector}`,
      confidenceScore: Math.min(100, Math.max(0, parsed.confidenceScore || 60)),
    };
  } catch {
    return {
      sectorMatch: undefined,
      sector: sector,
      country: null,
      geography: null,
      relevanceType,
      relevanceRationale: `Relevant to ${sector} in ${geoStr}`,
      confidenceScore: 25,
    };
  }
}

async function persistCompany(
  name: string,
  classified: ClassificationResult,
  intent: InferredIntent,
  searchQueryId: number,
  sessionId: string
): Promise<number | null> {
  try {
    const countryStr = classified.country || intent.targetGeographies[0] || null;
    let lat: string | null = null;
    let lng: string | null = null;

    if (countryStr) {
      const fallback = applyCoordinateFallback({ latitude: null, longitude: null, country: countryStr });
      if (fallback.latitude) lat = String(fallback.latitude);
      if (fallback.longitude) lng = String(fallback.longitude);
    }

    const companyData = {
      name,
      sector: classified.sector || intent.primarySectors[0] || null,
      country: countryStr,
      latitude: lat,
      longitude: lng,
      revenue: null,
      employees: null,
      website: null,
      summary: null,
      confidence: Math.round((classified.confidenceScore || 60) / 10),
      relevanceReason: classified.relevanceRationale || null,
      searchQueryId,
      relevanceType: classified.relevanceType || null,
      relevanceRationale: classified.relevanceRationale || null,
      confidenceScore: classified.confidenceScore || null,
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
    const geoCountries = intent.targetGeographies.join(", ");
    const excludeList = excludeNames && excludeNames.length > 0
      ? `\n- The following companies are already known — do NOT include them. Focus on companies NOT on this list: ${excludeNames.slice(0, 50).join(", ")}`
      : "";
    const roleInstruction = hasRole
      ? `List ${excludeNames && excludeNames.length > 0 ? "additional " : ""}companies whose PRIMARY business activity is ${role} in the ${sector} sector, headquartered in ${geoStr}.`
      : `List ${excludeNames && excludeNames.length > 0 ? "additional " : ""}companies in the ${sector} sector headquartered in ${geoStr}.`;

    prompt = `${roleInstruction}

COMMERCIAL ROLE FILTER — apply carefully:
${hasRole ? `The target commercial role is "${role}". Classify each candidate before including:
- Type A (MANUFACTURER/BRAND OWNER): Companies that make or own products. Their primary expertise is in production, R&D, brand management. Examples: product companies, brand owners, factories. → EXCLUDE unless they are also primarily known as a ${role}.
- Type B (RETAILER/END SELLER): Companies that sell directly to consumers. Their primary expertise is in retail operations, store management, consumer experience. Examples: supermarket chains, retail stores, e-commerce platforms. → EXCLUDE.
- Type C (${role.toUpperCase()}): Companies whose primary revenue comes from ${role} — acting as intermediaries between manufacturers/brand owners and retailers/end customers. Their expertise is in supply chain, channel management, partner relationships, warehousing, ${role} logistics. → INCLUDE.
ONLY include Type C companies. If a conglomerate has a significant Type C business line alongside other activities, include it.` : `Include companies across all commercial functions in ${sector}.`}

GEOGRAPHY FILTER:
- Companies must be HEADQUARTERED in ${geoCountries} — not just selling products there
- A global company headquartered elsewhere (e.g., P&G headquartered in USA) does NOT qualify even if it operates in ${geoCountries}
- Regional headquarters count only if the company is primarily managed from ${geoCountries}

Requirements:
- Return ONLY a JSON array of company names, ordered by market significance
- Include ${count} names
- Focus on real, operating companies — not trade associations, government bodies, or generic product brand names
- Include a mix of: major players, established regional companies, and notable mid-sized companies
- Do NOT include parent company and subsidiary separately${excludeList}

Return ONLY the JSON array, e.g. ["Company A", "Company B", ...]`;
  } else {
    const excludeList = excludeNames && excludeNames.length > 0
      ? `\n- Do NOT include any of these companies (they are already in the core results): ${excludeNames.slice(0, 30).join(", ")}`
      : "";

    prompt = `List companies in the ${sector} sector operating in ${geoStr} that are DIFFERENT from typical ${intent.primarySectors.join("/")} companies${hasRole ? ` but whose executives would have transferable expertise in ${role}` : ""}.

These are for an "AI Suggested" tab showing adjacent/related companies that a search for "${intent.primarySectors.join(", ")}${hasRole ? ` (${role})` : ""}" might also want to consider.

Requirements:
- Return ONLY a JSON array of company names, ordered by relevance
- Include ${count} names
- Focus on companies in ${sector} that are genuinely different from mainstream ${intent.primarySectors.join("/")} companies
- These should be companies from a related but distinct sector${excludeList}
${hasRole ? `- IMPORTANT: Every company must have meaningful ${role} operations or employ executives with ${role} expertise. Do NOT include companies that are only in ${sector} generally — they must be relevant to ${role} specifically.\n` : ""}- Real, operating companies only

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

// ─── Phase 2: Parallel Classification (lightweight — no enrichment) ─────────
const PARALLEL_CONCURRENCY = 5;

async function classifyBatch(
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
  onClassified?: (company: SearchSessionCompany) => void,
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

    const classified = await classifyCompany(name, sector, intent.targetGeographies, intent, relevanceType);

    if (classified.sectorMatch === false) {
      onFiltered?.(name, `sector mismatch: ${classified.sector || "wrong sector"}`);
      return;
    }
    if (classified.sectorMatch === undefined) {
      classified.confidenceScore = Math.min(classified.confidenceScore ?? 25, 25);
    }

    const score = classified.confidenceScore ?? 0;
    if (score < 45) {
      onFiltered?.(name, `below confidence floor (${score}%)`);
      return;
    }

    if (!isCountryInScope(classified.country, geoSet)) {
      onFiltered?.(name, `out of region: ${classified.country || "unknown"}`);
      return;
    }

    let finalRelevanceType = relevanceType;
    if (finalRelevanceType === "Direct" && score < 70) {
      finalRelevanceType = "Adjacent";
    }
    classified.relevanceType = finalRelevanceType;

    const companyId = await persistCompany(name, classified, intent, searchQueryId, sessionId);

    const company: SearchSessionCompany = {
      id: companyId ?? counter++,
      name,
      sector: classified.sector || sector,
      country: classified.country || null,
      geography: classified.geography || null,
      revenue: null,
      employees: null,
      website: null,
      summary: null,
      latitude: null,
      longitude: null,
      relevanceType: finalRelevanceType,
      relevanceRationale: classified.relevanceRationale || `Relevant to ${sector}`,
      confidenceScore: score,
      isUserAccepted: false,
      isUserRejected: false,
    };

    results.push(company);
    onClassified?.(company);
  };

  for (let i = 0; i < names.length; i += PARALLEL_CONCURRENCY) {
    if (signal?.aborted) break;
    const batch = names.slice(i, i + PARALLEL_CONCURRENCY);
    await Promise.all(batch.map(n => processOne(n).catch(err => {
      console.warn(`[Pipeline] Classification failed for "${n}":`, err);
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
  // PHASE 1 — Web-First Seed Discovery (Serper)
  // ══════════════════════════════════════════════════════════════════════════
  const mainGeo = intent.targetGeographies[0] || "";
  const hasRole = intent.commercialRole && intent.commercialRole !== "any";
  const role = hasRole ? intent.commercialRole! : "";
  const primarySector = intent.primarySectors[0] || "";
  const currentYear = new Date().getFullYear();

  const serper = createSerperAdapter();
  const webSeedNames: string[] = [];

  if (serper) {
    yield emit("status", "Phase 1: Searching web for companies...");
  } else {
    yield emit("status", "Web search unavailable — using AI knowledge as primary source");
  }

  if (serper) {

    const webQueries: string[] = hasRole
      ? [
          `${primarySector} ${role} companies ${mainGeo}`,
          `${primarySector} ${role} companies ${mainGeo} site:linkedin.com/company`,
          `top ${role} ${primarySector} ${mainGeo} ${currentYear}`,
          `${primarySector} ${role} ${mainGeo} established companies`,
          `${mainGeo} ${primarySector} ${role} market leaders`,
        ]
      : [
          `${primarySector} companies ${mainGeo}`,
          `${primarySector} companies ${mainGeo} site:linkedin.com/company`,
          `top ${primarySector} companies ${mainGeo} ${currentYear}`,
          `${primarySector} ${mainGeo} established companies`,
          `${mainGeo} ${primarySector} market leaders`,
        ];

    for (const q of webQueries) {
      if (signal?.aborted) break;
      try {
        yield emit("status", `Searching: "${q.slice(0, 60)}..."`);
        const result = await serper.searchWithAnswer(q, 10);
        for (const r of result.results.slice(0, 10)) {
          const isListicle = ARTICLE_TITLE_RE.test(r.title || "");
          if (isListicle && isSpamAggregator(r.title || "", r.snippet || "", r.url || "")) continue;
          const names = isListicle
            ? [...extractCompanyNamesFromListicle(r.snippet || ""), ...extractCompanyNamesFromResult(r.title, r.snippet, r.url)]
            : extractCompanyNamesFromResult(r.title, r.snippet, r.url);

          for (let name of names) {
            name = cleanCompanyName(name);
            if (!name || name.length < 2) continue;
            if (!isValidCompanyName(name)) continue;
            webSeedNames.push(name);
          }
        }
      } catch (err) {
        console.warn(`[Pipeline] Web search failed for "${q}":`, err);
      }
    }
  }

  if (signal?.aborted) return;

  const uniqueWebSeeds = Array.from(new Set(webSeedNames));
  yield emit("status", `Web search found ${uniqueWebSeeds.length} company candidates`);

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Claude Knowledge Supplement (gap-filling only)
  // ══════════════════════════════════════════════════════════════════════════
  yield emit("status", "Phase 2: Checking AI knowledge for additional companies...");

  const claudeSupplementNames = await generateSeedList(
    intent, null, "Direct",
    Math.max(15, targetCount - uniqueWebSeeds.length + 10),
    uniqueWebSeeds,
  );

  if (signal?.aborted) return;

  const allSeedNames = [...uniqueWebSeeds, ...claudeSupplementNames];
  const deduplicatedSeeds = Array.from(new Set(allSeedNames.map(n => {
    const key = fuzzyCompanySlug(n);
    return { key, name: n };
  }).filter((item, i, arr) => arr.findIndex(x => x.key === item.key) === i).map(x => x.name)));

  yield emit("status", `${deduplicatedSeeds.length} candidates (${uniqueWebSeeds.length} web + ${claudeSupplementNames.length} AI supplement) — classifying...`);

  for (const name of deduplicatedSeeds) {
    yield emit("company_found", `Found: ${name}`, { companyName: name, name, sector: primarySector, relevanceType: "Direct" });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — Parallel Classification
  // ══════════════════════════════════════════════════════════════════════════
  const seedCompanies = await classifyBatch(
    deduplicatedSeeds,
    primarySector,
    intent,
    "Direct",
    geoSet,
    seenKeys,
    searchQueryId,
    sessionId,
    signal,
    undefined,
    (company) => {
      pendingEvents.push(emit("company_enriched", `Classified: ${company.name}`, { company }));
    },
    (name, reason) => {
      pendingEvents.push(emit("status", `Filtered: ${name} — ${reason}`));
    },
  );

  companies.push(...seedCompanies);
  yield* flushEvents();

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

        const sectorCompanies = await classifyBatch(
          sectorSeedNames, sector, intent, relType,
          geoSet, seenKeys, searchQueryId, sessionId, signal,
          undefined,
          (company) => { pendingEvents.push(emit("company_enriched", `Classified: ${company.name}`, { company })); },
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

        const sectorCompanies = await classifyBatch(
          sectorSeedNames, sector, intent, relType,
          geoSet, seenKeys, searchQueryId, sessionId, signal,
          undefined,
          (company) => { pendingEvents.push(emit("company_enriched", `Classified: ${company.name}`, { company })); },
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
