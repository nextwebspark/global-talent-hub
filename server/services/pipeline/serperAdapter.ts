import type { ISearchProvider, DiscoveredCompany, SearchIntent } from './types';
import type { QueryIntent } from './queryIntent';
import OpenAI from "openai";

// ─────────────────────────────────────────────────────────────────────────────
// Query optimisation — rewrites the raw user query into a focused Google
// search query based on the extracted intent. This is the single most
// important quality lever in the entire pipeline. Garbage in = garbage out.
// ─────────────────────────────────────────────────────────────────────────────

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
];

async function callLLMForQuery(prompt: string): Promise<string | null> {
  for (const model of FREE_MODELS) {
    try {
      const response = await openrouter.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }] as any,
        temperature: 0.1,
        max_tokens: 300,
      });
      const content = response.choices[0]?.message?.content?.trim() || '';
      if (content) return content;
    } catch (error: any) {
      console.warn(`[SerperAdapter] Query LLM ${model} failed: ${error.message}`);
    }
  }
  return null;
}

// Builds 2–3 focused Google search queries from the QueryIntent.
// Multiple queries are run and results are merged, so we cast a wider net
// while keeping each individual query precise.
export async function buildOptimisedQueries(
  originalQuery: string,
  intent: QueryIntent
): Promise<string[]> {
  const countries = intent.countries.length > 0 ? intent.countries : [];

  const prompt = `You are building Google search queries to find companies matching a user's intent.

User query: "${originalQuery}"
Target countries: ${countries.join(', ')}
What to include: ${intent.exampleInclusions.join(', ')}
What to exclude: ${intent.exampleExclusions.join(', ')}

CRITICAL PRINCIPLE: Identify what TYPE of company the user wants, then build queries 
that find THAT TYPE — not the products or brands those companies deal in.

Examples of this distinction:
- "luxury fashion retailers in UAE" → find RETAIL GROUPS (Al Tayer, Chalhoub, Apparel Group), 
  NOT fashion brands (Gucci, Chanel). Queries should use "retail group", "franchise operator", 
  "fashion holding company".
- "FMCG distributors in Saudi Arabia" → find DISTRIBUTION COMPANIES, NOT food/drink brands. 
  Queries should use "FMCG distributor", "consumer goods distribution company".
- "pharma distributors in Egypt" → find DISTRIBUTION COMPANIES, NOT drug brands. 
  Queries should use "pharmaceutical distributor", "pharma wholesale".

Apply this principle to the user's query. Ask yourself: what TYPE of company is wanted? 
Then build queries that surface companies OF THAT TYPE, not the products/brands they handle.

Generate exactly 3 Google search queries:
1. Direct company type search with country: use the operator/distributor/group terminology 
   relevant to this sector + country names
2. Curated list article search: start with "top", "leading", or "largest" + company type 
   + region or country  
3. Regional/local variation: use regional synonyms (GCC, Middle East, MENA, Gulf) 
   if relevant, otherwise a third angle on the same company type

Return ONLY a JSON array of 3 query strings, nothing else.
["query one", "query two", "query three"]`;

  try {
    const response = await callLLMForQuery(prompt);
    if (!response) throw new Error('No response');

    // Parse the JSON array
    const cleaned = response.trim().replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error('No array found');

    const parsed = JSON.parse(cleaned.substring(start, end + 1));
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array');

    const queries = parsed
      .map((q: any) => String(q).trim())
      .filter((q: string) => q.length > 3 && q.length < 150);

    console.log(`[SerperAdapter] Optimised queries: ${queries.map(q => `"${q}"`).join(' | ')}`);
    return queries;

  } catch (error: any) {
    console.warn(`[SerperAdapter] Query optimisation failed, using heuristic fallback: ${error.message}`);
    return buildHeuristicQueries(originalQuery, intent);
  }
}

const BUSINESS_TYPE_KEYWORDS: Record<string, string[]> = {
  'distributor': ['distributor', 'distribution company', 'wholesale distributor'],
  'retailer': ['retail group', 'retail company', 'franchise operator'],
  'operator': ['operator', 'operating company'],
  'manufacturer': ['manufacturer', 'manufacturing company'],
  'developer': ['developer', 'development company'],
};

function extractCountriesFromQuery(query: string): string[] {
  const lower = query.toLowerCase();
  const found: string[] = [];
  const countryNames = [
    'saudi arabia', 'saudi', 'united arab emirates', 'uae', 'qatar', 'kuwait',
    'bahrain', 'oman', 'egypt', 'jordan', 'lebanon', 'iraq', 'turkey',
    'united kingdom', 'uk', 'united states', 'usa', 'germany', 'france',
    'india', 'china', 'japan', 'singapore', 'australia', 'canada',
    'south africa', 'nigeria', 'kenya', 'morocco', 'brazil', 'mexico',
    'indonesia', 'malaysia', 'south korea',
  ];
  const regionNames = ['middle east', 'gcc', 'mena', 'gulf', 'asia', 'europe', 'africa'];
  for (const c of countryNames) {
    if (lower.includes(c)) found.push(c.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '));
  }
  if (found.length === 0) {
    for (const r of regionNames) {
      if (lower.includes(r)) found.push(r.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '));
    }
  }
  return found;
}

function buildHeuristicQueries(originalQuery: string, intent: QueryIntent): string[] {
  const lower = originalQuery.toLowerCase();
  const countries = intent.countries.length > 0 ? intent.countries : extractCountriesFromQuery(originalQuery);
  const countryStr = countries.join(' and ');

  let entityType = '';
  for (const [keyword, synonyms] of Object.entries(BUSINESS_TYPE_KEYWORDS)) {
    if (lower.includes(keyword)) {
      entityType = synonyms[0];
      break;
    }
  }

  if (lower.includes('fashion') || lower.includes('luxury')) {
    if (lower.includes('retail') || lower.includes('distributor') || lower.includes('franchise')) {
      entityType = entityType || 'luxury retail group';
    }
  }
  if (lower.includes('fmcg') && !entityType) entityType = 'FMCG distributor';
  if (lower.includes('power generation') && !entityType) entityType = 'power generation company';
  if (lower.includes('pharma') && !entityType) entityType = 'pharmaceutical distributor';

  const queries: string[] = [];

  if (entityType && countryStr) {
    queries.push(`top ${entityType}s ${countryStr}`);
    queries.push(`largest ${entityType} companies ${countryStr}`);
    queries.push(`leading ${entityType} ${countryStr} list`);
  } else if (entityType) {
    queries.push(`top ${entityType}s`);
    queries.push(`largest ${entityType} companies`);
  } else {
    const businessSuffix = ' company OR group OR holdings';
    const truncated = originalQuery.substring(0, 70);
    queries.push(truncated + businessSuffix);
    if (countryStr) {
      queries.push(`top companies ${countryStr} ${intent.sector || ''}`);
    }
  }

  console.log(`[SerperAdapter] Heuristic fallback queries: ${queries.map(q => `"${q}"`).join(' | ')}`);
  return queries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Supporting utilities (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

const NOISE_DOMAINS = new Set([
  'linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com',
  'x.com', 'youtube.com', 'glassdoor.com', 'indeed.com',
  'tiktok.com', 'pinterest.com', 'reddit.com',
]);

const LIST_KEYWORDS = /\b(top|best|largest|leading|biggest|major|fastest|most)\b/i;
const NUMBER_IN_TITLE = /\b\d+\b/;

const COUNTRY_TO_GL: Record<string, string> = {
  'united arab emirates': 'ae', 'uae': 'ae', 'dubai': 'ae', 'abu dhabi': 'ae',
  'saudi arabia': 'sa', 'ksa': 'sa', 'riyadh': 'sa', 'jeddah': 'sa',
  'qatar': 'qa', 'doha': 'qa',
  'kuwait': 'kw',
  'bahrain': 'bh', 'manama': 'bh',
  'oman': 'om', 'muscat': 'om',
  'jordan': 'jo', 'amman': 'jo',
  'egypt': 'eg', 'cairo': 'eg',
  'united kingdom': 'gb', 'uk': 'gb', 'london': 'gb', 'britain': 'gb',
  'united states': 'us', 'usa': 'us', 'america': 'us',
  'germany': 'de', 'france': 'fr', 'india': 'in',
  'china': 'cn', 'japan': 'jp', 'singapore': 'sg',
  'south korea': 'kr', 'australia': 'au', 'canada': 'ca',
  'switzerland': 'ch', 'hong kong': 'hk', 'italy': 'it',
  'spain': 'es', 'brazil': 'br', 'turkey': 'tr',
  'indonesia': 'id', 'malaysia': 'my', 'south africa': 'za',
  'nigeria': 'ng', 'lebanon': 'lb', 'iraq': 'iq', 'iran': 'ir',
};

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.split('/')[2] || url;
  }
}

function isNoiseDomain(url: string): boolean {
  const domain = extractDomain(url);
  for (const noise of NOISE_DOMAINS) {
    if (domain === noise || domain.endsWith('.' + noise)) return true;
  }
  return false;
}

function scoreResult(url: string, title: string): number {
  if (isNoiseDomain(url)) return 0;
  if (LIST_KEYWORDS.test(title) || NUMBER_IN_TITLE.test(title)) return 2;
  return 1;
}

function detectGl(query: string): string {
  const lower = query.toLowerCase();
  // Sort by length descending so longer phrases match first
  const sorted = Object.entries(COUNTRY_TO_GL).sort((a, b) => b[0].length - a[0].length);
  for (const [keyword, code] of sorted) {
    if (lower.includes(keyword)) return code;
  }
  return 'us';
}

// When query covers multiple countries, use neutral gl so Serper does not
// over-bias results toward a single country. Country names in the query text
// itself are sufficient to get regional results.
function detectGlFromIntent(intent: QueryIntent): string {
  if (intent.countries.length === 1) {
    return detectGl(intent.countries[0].toLowerCase());
  }
  return 'us';
}

function extractCompanyNamesFromHtml(text: string): string[] {
  const names: string[] = [];
  const listPatterns = [
    /(?:^|\n)\s*\d+[\.\)]\s*\*?\*?([A-Z][A-Za-z0-9\s&\-'\.,:()]+?)(?:\*?\*?)\s*(?:[\-–—:|]|\n|$)/gm,
    /(?:^|\n)\s*[-•*]\s*\*?\*?([A-Z][A-Za-z0-9\s&\-'\.]+?)(?:\*?\*?)\s*(?:[\-–—:|]|\n|$)/gm,
    /(?:^|\n)\s*\d+[\.\)]\s*\*?\*?([A-Z][A-Za-z0-9\s&\-'\.]+?(?:Inc|Corp|Ltd|LLC|Group|Company|Co|SA|PLC|Holdings|Bank|AG|GmbH|SpA|NV|BV)\.?)\b/gm,
  ];
  for (const pattern of listPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let name = match[1].trim().replace(/\*+/g, '').replace(/\s+/g, ' ').replace(/[,:]$/, '').trim();
      if (name.length > 2 && name.length < 120 && !isCommonPhrase(name)) names.push(name);
    }
  }
  return names;
}

function extractCompanyFromDomainOrTitle(url: string, title: string): string | null {
  let name = title.replace(/\s*[-–—|:].*/g, '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  if (name.length > 2 && name.length < 80 && /[A-Z]/.test(name) && !isCommonPhrase(name)) return name;
  const domain = extractDomain(url)
    .replace(/\.(com|org|net|co|io|ae|sa|uk|de|fr|jp|sg|hk)$/i, '')
    .replace(/\./g, ' ');
  if (domain.length > 2) return domain.charAt(0).toUpperCase() + domain.slice(1);
  return null;
}

function isCommonPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  const phrases = [
    'top', 'best', 'largest', 'leading', 'biggest', 'major', 'list of',
    'home', 'about', 'contact', 'login', 'sign up', 'careers', 'news',
    'privacy policy', 'terms', 'cookie', 'subscribe', 'read more',
    'company', 'companies', 'business', 'market', 'industry', 'sector',
    'wikipedia', 'forbes', 'bloomberg', 'reuters',
  ];
  return phrases.some(p => lower === p);
}

function deduplicateResults(results: Array<{ url: string; title: string; snippet: string }>): Array<{ url: string; title: string; snippet: string }> {
  const seen = new Set<string>();
  return results.filter(r => {
    const key = r.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateNames(names: string[]): string[] {
  const seen = new Map<string, string>();
  for (const name of names) {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seen.has(key) && key.length > 2) seen.set(key, name);
  }
  return Array.from(seen.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// SerperAdapter
// ─────────────────────────────────────────────────────────────────────────────
export class SerperAdapter implements ISearchProvider {
  name = 'serper';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async discoverCompanies(intent: SearchIntent): Promise<DiscoveredCompany[]> {
    const query = this.buildDiscoveryQuery(intent);
    const gl = intent.country ? detectGl(intent.country) : detectGl(intent.originalQuery);

    console.log(`[SerperAdapter] discoverCompanies: "${query}" (gl=${gl})`);

    const serperResults = await this.callSerper(query, gl, 10);
    const scored = serperResults.map(r => ({
      ...r,
      score: scoreResult(r.link, r.title),
    })).filter(r => r.score > 0);

    const allNames: string[] = [];
    const sourceMap = new Map<string, { url: string; title: string }>();

    for (const result of scored.filter(r => r.score === 2)) {
      try {
        const pageContent = await this.fetchPageContent(result.link);
        const extracted = extractCompanyNamesFromHtml(pageContent);
        for (const name of extracted) {
          allNames.push(name);
          if (!sourceMap.has(name.toLowerCase())) {
            sourceMap.set(name.toLowerCase(), { url: result.link, title: result.title });
          }
        }
      } catch (err) {
        console.warn(`[SerperAdapter] Failed to fetch ${result.link}:`, err);
      }
    }

    for (const result of scored.filter(r => r.score === 1)) {
      const name = extractCompanyFromDomainOrTitle(result.link, result.title);
      if (name) {
        allNames.push(name);
        if (!sourceMap.has(name.toLowerCase())) {
          sourceMap.set(name.toLowerCase(), { url: result.link, title: result.title });
        }
      }
    }

    const unique = deduplicateNames(allNames);
    const now = new Date();
    return unique.map(name => {
      const source = sourceMap.get(name.toLowerCase());
      return {
        companyNameRaw: name,
        sourceUrl: source?.url || '',
        sourceTitle: source?.title,
        searchProvider: this.name,
        discoveryTimestamp: now,
      };
    }).slice(0, intent.limit * 2);
  }

  // ── searchWithAnswer — now accepts optional QueryIntent ───────────────────
  // When intent is provided, it rewrites the query before hitting Serper,
  // runs multiple optimised queries, and merges the results.
  // When intent is not provided (fallback), it behaves exactly as before.
  async searchWithAnswer(
    query: string,
    numResults = 10,
    intent?: QueryIntent
  ): Promise<{
    results: Array<{
      url: string;
      title: string;
      snippet: string;
      rawContent?: string;
      domain: string;
      rank: number;
      provider: string;
    }>;
    answer?: string;
  }> {

    let queriesToRun: string[];
    let gl: string;

    if (intent) {
      // Intent-driven path: rewrite the query for precision
      queriesToRun = await buildOptimisedQueries(query, intent);
      gl = detectGlFromIntent(intent);
    } else {
      // Fallback path: use raw query as before
      queriesToRun = [query];
      gl = detectGl(query);
    }

    console.log(`[SerperAdapter] Running ${queriesToRun.length} optimised queries (gl=${gl})`);

    // Run all queries and merge results
    const allRawResults: Array<{ title: string; link: string; snippet: string }> = [];

    for (const q of queriesToRun) {
      try {
        console.log(`[SerperAdapter] Query: "${q}"`);
        const results = await this.callSerper(q, gl, numResults);
        allRawResults.push(...results);
      } catch (err: any) {
        console.warn(`[SerperAdapter] Query failed: "${q}" — ${err.message}`);
      }
    }

    if (allRawResults.length === 0) {
      console.error('[SerperAdapter] All queries returned no results');
      return { results: [] };
    }

    console.log(`[SerperAdapter] Total raw results: ${allRawResults.length}`);

    // Deduplicate by URL and filter noise domains
    const filtered = deduplicateResults(
      allRawResults
        .filter(r => !isNoiseDomain(r.link))
        .map(r => ({ url: r.link, title: r.title, snippet: r.snippet || '' }))
    );

    const results = filtered.map((item, index) => ({
      url: item.url,
      title: item.title,
      snippet: item.snippet,
      rawContent: '',
      domain: extractDomain(item.url),
      rank: index + 1,
      provider: this.name,
    }));

    // Build answer from top snippets
    let answer: string | undefined;
    const snippets = filtered.slice(0, 5).map(r => r.snippet).filter(Boolean).join(' ');
    if (snippets.length > 50) answer = snippets;

    console.log(`[SerperAdapter] searchWithAnswer returning ${results.length} results`);
    return { results, answer };
  }

  private async callSerper(query: string, gl: string, num: number): Promise<Array<{
    title: string;
    link: string;
    snippet: string;
  }>> {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, gl, num }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Serper API error: ${response.status} — ${error}`);
    }

    const data = await response.json();
    return data.organic || [];
  }

  private async fetchPageContent(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TalentMapBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/\n{3,}/g, '\n\n').trim();
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildDiscoveryQuery(intent: SearchIntent): string {
    let query = intent.originalQuery;
    if (intent.sector && !query.toLowerCase().includes(intent.sector.toLowerCase())) {
      query = `${intent.sector} ${query}`;
    }
    if (intent.region && !query.toLowerCase().includes(intent.region.toLowerCase())) {
      query = `${query} ${intent.region}`;
    }
    return query;
  }
}

export function createSerperAdapter(): SerperAdapter | null {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.warn('[SerperAdapter] SERPER_API_KEY not configured');
    return null;
  }
  return new SerperAdapter(apiKey);
}