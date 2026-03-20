import type { ISearchProvider, DiscoveredCompany, SearchIntent } from './types';
import type { QueryIntent } from './queryIntent';

export function buildOptimisedQueries(
  originalQuery: string,
  intent: QueryIntent
): string[] {
  return buildHeuristicQueries(originalQuery, intent);
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

function extractSectorFromQuery(query: string): string {
  const lower = query.toLowerCase();
  if (lower.includes('fashion') || lower.includes('luxury retail') || lower.includes('luxury brand')) return 'luxury fashion';
  if (lower.includes('luxury') && (lower.includes('watch') || lower.includes('jewel'))) return 'luxury watches and jewellery';
  if (lower.includes('luxury')) return 'luxury';
  if (lower.includes('fmcg') || lower.includes('consumer goods')) return 'FMCG';
  if (lower.includes('pharma') || lower.includes('pharmaceutical')) return 'pharmaceutical';
  if (lower.includes('power generation') || lower.includes('energy')) return 'power generation';
  if (lower.includes('technology') || lower.includes('tech')) return 'technology';
  if (lower.includes('automotive') || lower.includes('car')) return 'automotive';
  if (lower.includes('real estate') || lower.includes('property')) return 'real estate';
  if (lower.includes('food') || lower.includes('beverage')) return 'food and beverage';
  if (lower.includes('healthcare') || lower.includes('medical')) return 'healthcare';
  return '';
}

function buildHeuristicQueries(originalQuery: string, intent: QueryIntent): string[] {
  const lower = originalQuery.toLowerCase();
  const countries = intent.countries.length > 0 ? intent.countries : extractCountriesFromQuery(originalQuery);
  const countryStr = countries.join(' and ');
  const sector = (intent.sector && intent.sector !== 'general') ? intent.sector : extractSectorFromQuery(originalQuery);

  let entityType = '';

  if ((lower.includes('fashion') || lower.includes('luxury')) &&
      (lower.includes('retail') || lower.includes('distributor') || lower.includes('franchise'))) {
    entityType = 'luxury retail group';
  }
  if (lower.includes('fmcg') && !entityType) entityType = 'FMCG distributor';
  if (lower.includes('power generation') && !entityType) entityType = 'power generation company';
  if (lower.includes('pharma') && !entityType) entityType = 'pharmaceutical distributor';

  if (!entityType) {
    for (const [keyword, synonyms] of Object.entries(BUSINESS_TYPE_KEYWORDS)) {
      if (lower.includes(keyword)) {
        entityType = sector ? `${sector} ${synonyms[0]}` : synonyms[0];
        break;
      }
    }
  }

  if (!entityType && sector) {
    entityType = `${sector} company`;
  }

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
      queries.push(`top companies ${countryStr}`);
    }
  }

  console.log(`[SerperAdapter] Heuristic fallback queries: ${queries.map(q => `"${q}"`).join(' | ')}`);
  return queries;
}

const NOISE_DOMAINS = new Set([
  'linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com',
  'x.com', 'youtube.com', 'glassdoor.com', 'indeed.com',
  'tiktok.com', 'pinterest.com', 'reddit.com',
]);

const TRADE_PRESS_DOMAINS = new Set([
  'arabianbusiness.com', 'zawya.com', 'reuters.com', 'bloomberg.com',
  'ft.com', 'wsj.com', 'cnbc.com', 'fortune.com', 'economictimes.com',
  'gulfnews.com', 'khaleejtimes.com', 'thenationalnews.com',
  'argaam.com', 'mubasher.info',
]);

const DIRECTORY_DOMAINS = new Set([
  'kompass.com', 'crunchbase.com', 'dnb.com', 'zoominfo.com',
  'owler.com', 'craft.co', 'pitchbook.com', 'cbinsights.com',
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

function isOfficialCompanyDomain(url: string): boolean {
  const domain = extractDomain(url);
  if (TRADE_PRESS_DOMAINS.has(domain) || DIRECTORY_DOMAINS.has(domain)) return false;
  const path = new URL(url).pathname.toLowerCase();
  if (path.includes('/about') || path.includes('/company') || 
      path.includes('/investor') || path.includes('/annual-report') ||
      path.includes('/ir/') || path === '/') {
    const tld = domain.split('.').pop() || '';
    const countryTlds = ['sa', 'ae', 'qa', 'kw', 'bh', 'om', 'eg', 'jo', 'lb'];
    if (countryTlds.some(ct => domain.endsWith('.' + ct) || domain.endsWith('.com.' + ct))) return true;
    if (/\.(com|org|net|co)$/i.test(domain)) return true;
  }
  return false;
}

export interface ScoredResult {
  url: string;
  title: string;
  snippet: string;
  score: number;
  sourceType: 'official' | 'industry_list' | 'news' | 'directory' | 'other';
  domain: string;
  rawContent?: string;
}

function scoreUrl(url: string, title: string): { score: number; sourceType: ScoredResult['sourceType'] } {
  if (isNoiseDomain(url)) return { score: 0, sourceType: 'other' };

  const domain = extractDomain(url);
  const isListArticle = LIST_KEYWORDS.test(title) || NUMBER_IN_TITLE.test(title);
  
  if (isListArticle) return { score: 2, sourceType: 'industry_list' };
  if (isOfficialCompanyDomain(url)) return { score: 2, sourceType: 'official' };
  if (TRADE_PRESS_DOMAINS.has(domain)) return { score: 1, sourceType: 'news' };
  if (DIRECTORY_DOMAINS.has(domain)) return { score: 1, sourceType: 'directory' };

  return { score: 1, sourceType: 'other' };
}

function detectGl(query: string): string {
  const lower = query.toLowerCase();
  const sorted = Object.entries(COUNTRY_TO_GL).sort((a, b) => b[0].length - a[0].length);
  for (const [keyword, code] of sorted) {
    if (lower.includes(keyword)) return code;
  }
  return 'us';
}

const REGION_GL_MAP: Record<string, string> = {
  'middle east': 'ae',
  'gcc': 'ae',
  'mena': 'ae',
  'gulf': 'ae',
  'europe': 'gb',
  'asia': 'sg',
  'asia pacific': 'sg',
  'southeast asia': 'sg',
  'north america': 'us',
  'latin america': 'br',
  'africa': 'za',
};

function detectGlFromIntent(intent: QueryIntent): string {
  if (intent.countries.length === 1) {
    const lower = intent.countries[0].toLowerCase();
    if (REGION_GL_MAP[lower]) return REGION_GL_MAP[lower];
    return detectGl(lower);
  }
  if (intent.countries.length === 2 || intent.countries.length === 3) {
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

function getNewsOutletsForRegion(countries: string[]): string {
  const lower = countries.map(c => c.toLowerCase());
  const isMiddleEast = lower.some(c =>
    ['saudi arabia', 'uae', 'united arab emirates', 'qatar', 'kuwait', 'bahrain', 'oman', 'egypt', 'jordan', 'middle east', 'gcc', 'mena', 'gulf'].includes(c)
  );
  const isAsia = lower.some(c =>
    ['china', 'japan', 'singapore', 'hong kong', 'india', 'south korea', 'malaysia', 'thailand', 'indonesia', 'asia', 'asia pacific', 'southeast asia'].includes(c)
  );
  const isEurope = lower.some(c =>
    ['united kingdom', 'uk', 'germany', 'france', 'switzerland', 'italy', 'spain', 'netherlands', 'europe'].includes(c)
  );

  if (isMiddleEast) return 'Arabian Business Zawya Reuters Gulf Business';
  if (isAsia) return 'Nikkei Asia Business Times South China Morning Post';
  if (isEurope) return 'Financial Times Reuters Bloomberg European CEO';
  return 'Reuters Bloomberg Financial Times';
}

function build3PassQueries(originalQuery: string, intent: QueryIntent): { pass1: string; pass2: string; pass3: string } {
  const countries = intent.countries.length > 0 ? intent.countries : extractCountriesFromQuery(originalQuery);
  const countryStr = countries.join(' ');
  const sector = (intent.sector && intent.sector !== 'general') ? intent.sector : extractSectorFromQuery(originalQuery);
  const core = sector ? `${sector} ${originalQuery.replace(new RegExp(sector, 'i'), '').trim()}` : originalQuery;

  const pass1 = `top largest ${core} ${countryStr} list 2024 2025`.replace(/\s+/g, ' ').trim();
  const pass2 = `${core} ${countryStr} annual report official site revenue`.replace(/\s+/g, ' ').trim();

  const newsOutlets = getNewsOutletsForRegion(countries);
  const pass3 = `${core} ${countryStr} ${newsOutlets}`.replace(/\s+/g, ' ').trim();

  return { pass1, pass2, pass3 };
}

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
      ...scoreUrl(r.link, r.title),
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

  async searchWithAnswer(
    query: string,
    numResults = 10,
    intent?: QueryIntent
  ): Promise<{
    results: ScoredResult[];
    answer?: string;
  }> {

    let gl: string;

    if (intent) {
      gl = detectGlFromIntent(intent);
    } else {
      gl = detectGl(query);
    }

    const allRawResults: Array<{ title: string; link: string; snippet: string }> = [];

    if (intent) {
      const { pass1, pass2 } = build3PassQueries(query, intent);
      
      console.log(`[SerperAdapter] Query 1 (Curated lists): "${pass1}"`);
      console.log(`[SerperAdapter] Query 2 (Official sources): "${pass2}"`);

      const queryPromises = [pass1, pass2].map(async (q) => {
        try {
          return await this.callSerper(q, gl, numResults);
        } catch (err: any) {
          console.warn(`[SerperAdapter] Query failed: "${q}" — ${err.message}`);
          return [];
        }
      });
      const queryResults = await Promise.all(queryPromises);
      for (const results of queryResults) {
        allRawResults.push(...results);
      }
    } else {
      try {
        const results = await this.callSerper(query, gl, numResults);
        allRawResults.push(...results);
      } catch (err: any) {
        console.warn(`[SerperAdapter] Query failed: "${query}" — ${err.message}`);
      }
    }

    if (allRawResults.length === 0) {
      console.error('[SerperAdapter] All queries returned no results');
      return { results: [] };
    }

    console.log(`[SerperAdapter] Total raw results: ${allRawResults.length}`);

    const deduped = deduplicateResults(
      allRawResults
        .filter(r => !isNoiseDomain(r.link))
        .map(r => ({ url: r.link, title: r.title, snippet: r.snippet || '' }))
    );

    const scored: ScoredResult[] = deduped.map(item => {
      const { score, sourceType } = scoreUrl(item.url, item.title);
      return {
        url: item.url,
        title: item.title,
        snippet: item.snippet,
        score,
        sourceType,
        domain: extractDomain(item.url),
      };
    }).filter(r => r.score > 0);

    scored.sort((a, b) => b.score - a.score);

    let answer: string | undefined;
    const snippets = scored.slice(0, 5).map(r => r.snippet).filter(Boolean).join(' ');
    if (snippets.length > 50) answer = snippets;

    console.log(`[SerperAdapter] searchWithAnswer returning ${scored.length} scored results (Score 2: ${scored.filter(r => r.score === 2).length}, Score 1: ${scored.filter(r => r.score === 1).length})`);
    return { results: scored, answer };
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

  async fetchPageContent(url: string): Promise<string> {
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
