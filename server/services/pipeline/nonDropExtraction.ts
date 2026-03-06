import OpenAI from "openai";
import type { EnrichedCompany, ExtractedExecutive, FieldValue } from './types';
import type { QueryIntent } from './queryIntent';
import { buildInclusionPromptBlock } from './queryIntent';
import type { ScoredResult } from './serperAdapter';

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const FREE_MODELS = [
  "anthropic/claude-opus-4.5",
  "google/gemini-2.5-flash",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tryAllModels(
  messages: Array<{ role: string; content: string }>,
  options: { temperature?: number; max_tokens?: number }
): Promise<string | null> {
  for (const model of FREE_MODELS) {
    try {
      const response = await openrouter.chat.completions.create({
        model,
        messages: messages as any,
        temperature: options.temperature ?? 0.1,
        max_tokens: options.max_tokens ?? 8000,
      });
      const content = response.choices[0]?.message?.content || '';
      if (content) {
        console.log(`[NonDropExtraction] Succeeded with ${model}`);
        return content;
      }
    } catch (error: any) {
      console.warn(`[NonDropExtraction] ${model} failed: ${error.message}`);
    }
  }
  return null;
}

async function callLLM(
  messages: Array<{ role: string; content: string }>,
  options: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
  const result = await tryAllModels(messages, options);
  if (result) return result;

  console.log(`[NonDropExtraction] All models failed. Waiting 2s before retry...`);
  await sleep(2000);

  const retryResult = await tryAllModels(messages, options);
  if (retryResult) return retryResult;

  throw new Error('All free LLM models are currently unavailable. Please try again in a minute.');
}

function createEmptyFieldValue<T>(): FieldValue<T> {
  return { value: null, sourceUrl: null, confidence: 0, lastUpdated: new Date() };
}

async function fetchArticleContent(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TalentMapper/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const html = await response.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s{2,}/g, ' ').trim();
    return text.substring(0, 8000);
  } catch (e) {
    console.warn(`[NonDropExtraction] Failed to fetch article: ${url}`);
    return null;
  }
}

function parseJsonResponse(content: string): any {
  let cleaned = content.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) cleaned = jsonMatch[1].trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1) cleaned = cleaned.substring(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('[NonDropExtraction] JSON parse failed:', e);
    return null;
  }
}

function confidenceToScale10(confidence: number): number {
  return Math.round(confidence * 10);
}

function transformToEnrichedCompany(raw: any): EnrichedCompany | null {
  const getName = (field: any): string | null => {
    if (typeof field === 'string') return field;
    if (field && typeof field === 'object' && field.value) return String(field.value);
    return null;
  };
  const getFieldData = (field: any): { value: any; confidence: number; sourceUrl: string | null } => {
    if (field && typeof field === 'object' && 'value' in field) {
      return {
        value: field.value,
        confidence: typeof field.confidence === 'number' ? field.confidence : 0.5,
        sourceUrl: field.source_url || field.sourceUrl || null,
      };
    }
    return { value: field, confidence: 0.5, sourceUrl: null };
  };

  const name = getName(raw.company_name) || getName(raw.name);
  if (!name || typeof name !== 'string') return null;

  const now = new Date();

  const makeField = <T>(fieldData: any, parser?: (v: any) => T | null): FieldValue<T> => {
    const fd = getFieldData(fieldData);
    let value: T | null = null;
    if (fd.value !== null && fd.value !== undefined) {
      value = parser ? parser(fd.value) : fd.value as T;
    }
    return {
      value,
      sourceUrl: fd.sourceUrl,
      confidence: confidenceToScale10(fd.confidence),
      lastUpdated: now,
    };
  };

  const countryField = raw.country || null;
  const sectorField = raw.sector || null;
  const descField = raw.description || raw.summary || null;
  const revenueField = raw.revenue || null;
  const employeeField = raw.employee_count || raw.employees || null;

  const revenueData = getFieldData(revenueField);
  let revenueValue: number | null = null;
  if (revenueData.value !== null && revenueData.value !== undefined) {
    if (typeof revenueData.value === 'number') revenueValue = revenueData.value;
    else {
      const n = parseFloat(String(revenueData.value).replace(/[^0-9.-]/g, ''));
      if (!isNaN(n)) revenueValue = n;
    }
  }

  const revenueCurrencyData = getFieldData(revenueField);
  const revenueCurrency = (raw.revenue && typeof raw.revenue === 'object' && raw.revenue.currency) || null;

  const sourceUrls: string[] = [];
  const collectSource = (field: any) => {
    if (field && typeof field === 'object' && field.source_url) sourceUrls.push(field.source_url);
  };
  collectSource(raw.company_name); collectSource(raw.country); collectSource(raw.sector);
  collectSource(raw.revenue); collectSource(raw.employee_count);

  const sourceType = raw.source_type || 'other';
  let overallConfidence = 5;
  if (sourceType === 'official') overallConfidence = 10;
  else if (sourceType === 'industry_list') overallConfidence = 9;
  else if (sourceType === 'news') overallConfidence = 7;
  else if (sourceType === 'directory') overallConfidence = 6;

  return {
    canonicalName: name.trim(),
    aliases: [],
    sector: makeField(sectorField, (v) => String(v)),
    businessType: makeField(raw.businessType || raw.business_type, (v) => String(v)),
    country: makeField(countryField, (v) => String(v)),
    city: makeField(raw.city, (v) => String(v)),
    streetAddress: makeField(raw.streetAddress, (v) => String(v)),
    latitude: makeField(raw.latitude, (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; }),
    longitude: makeField(raw.longitude, (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; }),
    revenue: {
      value: revenueValue,
      sourceUrl: revenueData.sourceUrl,
      confidence: confidenceToScale10(revenueData.confidence),
      lastUpdated: now,
      currency: revenueCurrency,
      fiscalYear: raw.founded_year ? parseInt(raw.founded_year) : null,
    },
    employees: makeField(employeeField, (v) => {
      const n = parseInt(String(v).replace(/[^0-9]/g, ''));
      return isNaN(n) ? null : n;
    }),
    website: makeField(raw.website, (v) => String(v)),
    summary: makeField(descField, (v) => String(v)),
    sourceUrls: [...new Set(sourceUrls)],
    searchProvider: 'serper',
    overallConfidence,
  };
}

function transformPartialCompany(raw: any): EnrichedCompany | null {
  const name = raw.name || (raw.company_name && typeof raw.company_name === 'object' ? raw.company_name.value : raw.company_name);
  if (!name) return null;
  const now = new Date();
  const emptyField = <T>(): FieldValue<T> => ({ value: null, sourceUrl: null, confidence: 0, lastUpdated: now });
  return {
    canonicalName: String(name).trim(), aliases: [],
    sector: emptyField(), businessType: emptyField(), country: emptyField(),
    city: emptyField(), streetAddress: emptyField(), latitude: emptyField(), longitude: emptyField(),
    revenue: { ...emptyField(), currency: null, fiscalYear: null },
    employees: emptyField(), website: emptyField(), summary: emptyField(),
    sourceUrls: [], searchProvider: 'serper', overallConfidence: 3,
  };
}

const COUNTRY_KEYWORDS: Record<string, string> = {
  'united arab emirates': 'United Arab Emirates', 'uae': 'United Arab Emirates',
  'emirates': 'United Arab Emirates', 'dubai': 'United Arab Emirates',
  'abu dhabi': 'United Arab Emirates', 'sharjah': 'United Arab Emirates',
  'saudi arabia': 'Saudi Arabia', 'saudi': 'Saudi Arabia', 'ksa': 'Saudi Arabia',
  'riyadh': 'Saudi Arabia', 'jeddah': 'Saudi Arabia', 'dammam': 'Saudi Arabia',
  'qatar': 'Qatar', 'doha': 'Qatar',
  'kuwait': 'Kuwait', 'bahrain': 'Bahrain', 'manama': 'Bahrain',
  'oman': 'Oman', 'muscat': 'Oman', 'jordan': 'Jordan', 'amman': 'Jordan',
  'egypt': 'Egypt', 'cairo': 'Egypt', 'iraq': 'Iraq', 'lebanon': 'Lebanon',
  'united kingdom': 'United Kingdom', 'uk': 'United Kingdom', 'london': 'United Kingdom',
  'united states': 'United States', 'usa': 'United States',
  'germany': 'Germany', 'france': 'France', 'india': 'India', 'china': 'China',
  'japan': 'Japan', 'singapore': 'Singapore', 'australia': 'Australia',
  'canada': 'Canada', 'switzerland': 'Switzerland', 'hong kong': 'Hong Kong',
  'italy': 'Italy', 'spain': 'Spain', 'brazil': 'Brazil', 'turkey': 'Turkey',
  'indonesia': 'Indonesia', 'malaysia': 'Malaysia', 'south africa': 'South Africa',
  'nigeria': 'Nigeria', 'kenya': 'Kenya', 'morocco': 'Morocco',
};

function detectCountryFromText(text: string, query: string): string | null {
  const lower = text.toLowerCase();
  const sorted = Object.entries(COUNTRY_KEYWORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [kw, country] of sorted) {
    if (lower.includes(kw)) return country;
  }
  const qLower = query.toLowerCase();
  for (const [kw, country] of sorted) {
    if (qLower.includes(kw)) return country;
  }
  return null;
}

function extractQueryCountries(query: string): string[] {
  const qLower = query.toLowerCase();
  const sorted = Object.entries(COUNTRY_KEYWORDS).sort((a, b) => b[0].length - a[0].length);
  const found = new Set<string>();
  for (const [kw, country] of sorted) {
    if (qLower.includes(kw)) found.add(country);
  }
  return Array.from(found);
}

function extractRevenueFromSnippet(snippet: string): { value: number; currency: string } | null {
  const patterns = [
    /(?:revenue|sales|turnover)[^\d]*?(?:of\s+)?(?:(?:USD|US\$|\$)\s*)(\d[\d,.]*)\s*(billion|million|bn|mn|m|b)/i,
    /(?:USD|US\$|\$)\s*(\d[\d,.]*)\s*(billion|million|bn|mn|m|b)(?:\s+(?:in\s+)?revenue)?/i,
    /(\d[\d,.]*)\s*(billion|million|bn|mn|m|b)\s*(?:USD|US\$|\$|dollars)/i,
    /(?:AED|SAR|QAR|KWD|BHD|OMR|EGP|GBP|EUR|€|£)\s*(\d[\d,.]*)\s*(billion|million|bn|mn|m|b)/i,
    /revenue[^\d]*?(\d[\d,.]*)\s*(billion|million|bn|mn|m|b)/i,
  ];
  for (const pattern of patterns) {
    const match = snippet.match(pattern);
    if (match) {
      const num = parseFloat(match[1].replace(/,/g, ''));
      if (isNaN(num)) continue;
      const unit = match[2].toLowerCase();
      let multiplier = unit === 'billion' || unit === 'bn' || unit === 'b' ? 1e9 :
        unit === 'million' || unit === 'mn' || unit === 'm' ? 1e6 : 1;
      const currencyMatch = snippet.match(/(USD|AED|SAR|QAR|KWD|BHD|OMR|EGP|GBP|EUR|US\$|\$|€|£)/i);
      let currency = 'USD';
      if (currencyMatch) {
        const c = currencyMatch[1].toUpperCase();
        currency = c === '$' || c === 'US$' ? 'USD' : c === '€' ? 'EUR' : c === '£' ? 'GBP' : c;
      }
      return { value: num * multiplier, currency };
    }
  }
  return null;
}

function extractEmployeesFromSnippet(snippet: string): number | null {
  const patterns = [
    /(\d[\d,]*)\s*(?:\+\s*)?employees/i,
    /(?:employs?|workforce|staff|headcount)[^\d]*?(\d[\d,]*)/i,
    /(\d[\d,]*)\s*(?:\+\s*)?(?:workers|people|team\s*members)/i,
  ];
  for (const pattern of patterns) {
    const match = snippet.match(pattern);
    if (match) {
      const num = parseInt(match[1].replace(/,/g, ''));
      if (!isNaN(num) && num > 10 && num < 10000000) return num;
    }
  }
  return null;
}

function extractSectorFromSnippet(snippet: string, query: string): string | null {
  const sectorPatterns: [RegExp, string][] = [
    [/\b(?:power\s*generation|electricity|energy|utilities?)\b/i, 'Energy & Utilities'],
    [/\b(?:oil\s*(?:and|&)\s*gas|petroleum|hydrocarbon)\b/i, 'Oil & Gas'],
    [/\b(?:fashion|apparel|clothing|retail(?:er|ing)?)\b/i, 'Retail & Fashion'],
    [/\b(?:fmcg|consumer\s*goods|fast\s*moving)\b/i, 'FMCG'],
    [/\b(?:bank(?:ing)?|financ(?:e|ial)|insurance)\b/i, 'Financial Services'],
    [/\b(?:technolog|software|digital|IT\b|SaaS)\b/i, 'Technology'],
    [/\b(?:telecom|communications)\b/i, 'Telecommunications'],
    [/\b(?:real\s*estate|property|construction)\b/i, 'Real Estate & Construction'],
    [/\b(?:healthcare|pharma|medical|hospital)\b/i, 'Healthcare'],
    [/\b(?:luxury|watch|jewel)/i, 'Luxury Goods'],
    [/\b(?:distribut(?:or|ion)|logistics|supply\s*chain)\b/i, 'Distribution & Logistics'],
    [/\b(?:manufacturing|industrial)\b/i, 'Manufacturing'],
    [/\b(?:food|beverage|restaurant|hospitality)\b/i, 'Food & Beverage'],
    [/\b(?:mining|metals|steel)\b/i, 'Mining & Metals'],
    [/\b(?:transport|aviation|airline|shipping)\b/i, 'Transportation'],
    [/\b(?:education|university|school)\b/i, 'Education'],
    [/\b(?:media|entertainment|broadcasting)\b/i, 'Media & Entertainment'],
  ];
  const combined = (snippet + ' ' + query).toLowerCase();
  for (const [pattern, sector] of sectorPatterns) {
    if (pattern.test(combined)) return sector;
  }
  return null;
}

function extractCompanyNameFromTitle(title: string): string {
  let name = title
    .replace(/\s*[-–—|:]\s*(?:Wikipedia|Forbes|Bloomberg|Reuters|Company Profile|Overview|About|Review|Careers|Jobs|News|Home|Official).*$/i, '')
    .replace(/\s*\|\s*.*$/, '')
    .replace(/^(?:About|Profile|Company)\s*[-–—:]\s*/i, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 100) return title.split(/[-–—|]/)[0].trim();
  return name;
}

function isGenericTitle(name: string): boolean {
  const n = name.trim();
  if (n.split(/\s+/).length > 8) return true;
  if (/\.{2,}$/.test(n)) return true;
  if (/^(?:top\s+\d+|best\s+\d+|list\s+of|here\s+are|the\s+best|guide\s+to|overview\s+of)/i.test(n)) return true;
  if (/^(?:who\s+is|what\s+is|how\s+to|why\s+is|when\s+did|where\s+is)/i.test(n)) return true;
  if (/\?\s*$/.test(n)) return true;
  if (/\b(?:everything\s+you|need\s+to\s+know|complete\s+guide|ultimate\s+guide)\b/i.test(n)) return true;
  if (/\b(?:you\s+need\s+to|you\s+should\s+know|to\s+watch|to\s+follow|you\s+must)\b/i.test(n)) return true;
  if (/^\d+\s+\w+/i.test(n) && n.split(/\s+/).length > 3) return true;
  if (/\blist\s+\d{4}\b/i.test(n)) return true;
  if (/\b(?:brands?\s*&\s*designers?|designers?\s*&\s*brands?)\b/i.test(n)) return true;
  if (/\b(?:creator\s+of|powered\s+by|brought\s+to\s+you)\b/i.test(n)) return true;
  if (/^the\s+best\s+/i.test(n)) return true;
  if (/\b(?:online\s+shopping|shop\s+now|buy\s+online|free\s+shipping)\b/i.test(n)) return true;
  return false;
}

const COMPANY_SUFFIXES = /\b(?:group|corp|inc|ltd|co|holdings|company|llc|sa|saog|international|trading|distribution|retail|enterprises|plc|ag|gmbh|spa|nv|bv|industries|partners|capital|investments|bank|logistics|solutions|services|ventures|associates|consulting)\b/i;

function looksLikePersonName(name: string): boolean {
  const words = name.trim().split(/\s+/);
  if (words.length < 2 || words.length > 3) return false;
  if (COMPANY_SUFFIXES.test(name)) return false;
  if (KNOWN_LOCATIONS.has(words[0].toLowerCase())) return false;
  if (/^(?:Al|El|Abu|Bin|Ibn)\s/i.test(name)) return false;
  const allCapitalized = words.every(w => /^[A-Z][a-z]+$/.test(w));
  if (!allCapitalized) return false;
  if (/\b(?:couture|atelier|studio|maison|boutique)\b/i.test(name)) return true;
  if (words.length === 2) return true;
  return false;
}

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  rawContent?: string;
  domain: string;
  rank?: number;
  provider?: string;
  score?: number;
  sourceType?: string;
}

function isListArticle(result: SearchResult): boolean {
  return (
    /top\s+\d+|best\s+\d+|\d+\s+(?:best|top|leading)|list\s+of|rankings?/i.test(result.title) ||
    /(?:retailers?|distributors?|brands?|companies?|operators?)\s+in\s+/i.test(result.title)
  );
}

function extractNamesFromDotSeparatedList(text: string): string[] {
  const names: string[] = [];
  const segments = text.split(/\s*[·•]\s*/);
  for (const seg of segments) {
    const cleaned = seg.replace(/^\d+[\.\)]\s*/, '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
    if (cleaned.length > 2 && cleaned.length < 80 && /[A-Z]/.test(cleaned) && !isGenericTitle(cleaned)) {
      const name = cleaned.replace(/\s+/g, ' ').replace(/[,.]$/, '').trim();
      if (name.length > 2) names.push(name);
    }
  }
  return names;
}

function extractNamesFromNumberedList(text: string): string[] {
  const names: string[] = [];
  const patterns = [
    /\d+[\.\)]\s*([A-Z][A-Za-z0-9\s&\-'\.,:()]+?)(?=\s*(?:\d+[\.\)]|$|\n|·|•))/gm,
    /(?:^|\n)\s*\d+[\.\)]\s*\*?\*?([A-Z][A-Za-z0-9\s&\-'\.,:()]+?)(?:\*?\*?)\s*(?:[\-–—:|]|\n|$)/gm,
    /(?:^|\n)\s*[-•*]\s*\*?\*?([A-Z][A-Za-z0-9\s&\-'\.]+?)(?:\*?\*?)\s*(?:[\-–—:|]|\n|$)/gm,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim().replace(/\*+/g, '').replace(/\s+/g, ' ').replace(/[,:]$/, '').trim();
      if (name.length > 2 && name.length < 100 && !isGenericTitle(name)) names.push(name);
    }
  }
  return names;
}

export async function fetchAndClassifyPages(
  scoredResults: ScoredResult[],
  maxPages: number = 8
): Promise<Array<{ url: string; content: string; sourceType: string; score: number }>> {
  const toFetch = scoredResults
    .filter(r => r.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages);

  console.log(`[NonDropExtraction] Fetching ${toFetch.length} pages (Score 2: ${toFetch.filter(r => r.score === 2).length}, Score 1: ${toFetch.filter(r => r.score === 1).length})`);

  const fetched: Array<{ url: string; content: string; sourceType: string; score: number }> = [];

  for (const result of toFetch) {
    try {
      const content = await fetchArticleContent(result.url);
      if (content && content.length > 100) {
        fetched.push({
          url: result.url,
          content,
          sourceType: result.sourceType,
          score: result.score,
        });
        console.log(`[NonDropExtraction] Fetched: ${result.url} (${result.sourceType}, ${content.length} chars)`);
      }
    } catch (e) {
      console.warn(`[NonDropExtraction] Skip (error/paywall): ${result.url}`);
    }
  }

  return fetched;
}

export async function extractCompaniesFromListArticle(
  url: string,
  query: string,
  intent: QueryIntent,
  articleSnippet?: string
): Promise<string[]> {
  let articleContent = await fetchArticleContent(url);
  if (!articleContent && articleSnippet) {
    articleContent = articleSnippet;
    console.log(`[NonDropExtraction] Using snippet fallback for: ${url}`);
  }
  if (!articleContent) return [];

  const intentBlock = buildInclusionPromptBlock(intent);

  const prompt = `You are extracting company names from a web article.

ARTICLE CONTENT:
${articleContent}

${intentBlock}

Extract ONLY company names from this article that match the intent above.
Return between 3 and 15 company names.
Return JSON only: { "companies": ["Name 1", "Name 2", ...] }`;

  try {
    const content = await callLLM([{ role: "user", content: prompt }], { temperature: 0.1, max_tokens: 1000 });
    const parsed = parseJsonResponse(content);
    if (!parsed || !Array.isArray(parsed.companies)) return [];
    return parsed.companies
      .map((c: any) => String(c).trim())
      .filter((c: string) => c.length > 2 && c.length < 100 && !isGenericTitle(c));
  } catch (e) {
    console.warn('[NonDropExtraction] Article extraction failed:', e);
    return [];
  }
}

export async function preProcessListArticles(
  results: SearchResult[],
  query: string,
  intent: QueryIntent
): Promise<string[]> {
  const listArticles = results.filter(isListArticle);
  console.log(`[NonDropExtraction] Found ${listArticles.length} list articles to process`);
  if (listArticles.length === 0) return [];

  const allNames: string[] = [];
  for (const article of listArticles.slice(0, 3)) {
    console.log(`[NonDropExtraction] Processing: ${article.url}`);
    const names = await extractCompaniesFromListArticle(article.url, query, intent, article.snippet);
    console.log(`[NonDropExtraction] Got ${names.length} names from: ${article.url}`);
    allNames.push(...names);
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const name of allNames) {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seen.has(key)) { seen.add(key); deduped.push(name); }
  }

  console.log(`[NonDropExtraction] Pre-processing yielded ${deduped.length} unique names`);
  return deduped;
}

const SOURCE_TRUTH_PROMPT = `You are a precise company data extraction specialist. You extract structured company and executive data from web content.

RULES:
1. Only extract data you can directly see in the provided content. Never guess or infer.
2. For every field you extract, note the source URL it came from.
3. Assign a confidence score to every field:
   - 0.95: Data from official company documents, annual reports, regulatory filings
   - 0.85: Data from industry curated lists or trade publications
   - 0.70: Data from reputable news (Reuters, Bloomberg, Arabian Business)
   - 0.60: Data from business directories or aggregators
   - 0.40: Data from blogs or unverified sources
4. If the same field appears in multiple sources, use the version with the highest confidence score.
5. If a field is not explicitly mentioned in the content, set it to null. Never fabricate.
6. For financial data (revenue, employees), only extract if a specific number is stated. Never estimate.
7. Return ONLY valid JSON. No explanation text.

SCHEMA to return for each company:
{
  "company_name": { "value": string, "confidence": number, "source_url": string },
  "country": { "value": string or null, "confidence": number, "source_url": string },
  "sector": { "value": string or null, "confidence": number, "source_url": string },
  "description": { "value": string or null, "confidence": number, "source_url": string },
  "revenue": { "value": number or null, "currency": string or null, "confidence": number, "source_url": string },
  "employee_count": { "value": number or null, "confidence": number, "source_url": string },
  "founded_year": { "value": number or null, "confidence": number, "source_url": string },
  "source_type": "official" | "industry_list" | "news" | "directory" | "other"
}

SCHEMA to return for each executive (only if explicitly visible on the page):
{
  "executive_name": { "value": string, "confidence": number, "source_url": string },
  "executive_title": { "value": string, "confidence": number, "source_url": string },
  "company_name": string,
  "source_type": "official" | "industry_list" | "news" | "directory" | "other"
}`;

export async function extractCompaniesNonDestructive(
  searchContext: string,
  query: string,
  intent: QueryIntent,
  limit: number,
  fetchedPages?: Array<{ url: string; content: string; sourceType: string; score: number }>
): Promise<EnrichedCompany[]> {
  const intentBlock = buildInclusionPromptBlock(intent);

  let pageContext = '';
  if (fetchedPages && fetchedPages.length > 0) {
    pageContext = '\n\n=== FETCHED PAGE CONTENT ===\n';
    for (const page of fetchedPages) {
      pageContext += `\n--- Source: ${page.url} (${page.sourceType}, score: ${page.score}) ---\n`;
      pageContext += page.content.substring(0, 3000) + '\n';
    }
  }

  const userPrompt = `QUERY: ${query}

${intentBlock}

${searchContext}${pageContext}

Extract up to ${limit} companies matching the intent.
For each company use the field-level confidence schema from your instructions.
Return JSON: { "companies": [ ... ] }`;

  try {
    const content = await callLLM(
      [{ role: "system", content: SOURCE_TRUTH_PROMPT }, { role: "user", content: userPrompt }],
      { temperature: 0.1, max_tokens: 8000 }
    );

    const parsed = parseJsonResponse(content);
    if (!parsed || !Array.isArray(parsed.companies)) return [];

    const companies: EnrichedCompany[] = [];
    for (const raw of parsed.companies) {
      try {
        if (isGenericTitle(raw.company_name?.value || raw.name || '')) continue;
        const company = transformToEnrichedCompany(raw);
        if (company) companies.push(company);
      } catch {
        const partial = transformPartialCompany(raw);
        if (partial) companies.push(partial);
      }
    }

    console.log(`[NonDropExtraction] LLM extracted ${companies.length} companies`);
    return companies;

  } catch (error: any) {
    console.warn('[NonDropExtraction] LLM extraction failed:', error.message);
    throw error;
  }
}

const KNOWN_LOCATIONS = new Set([
  'saudi arabia', 'united arab emirates', 'uae', 'qatar', 'kuwait', 'bahrain',
  'oman', 'jordan', 'egypt', 'iraq', 'iran', 'lebanon', 'syria', 'yemen',
  'israel', 'palestine', 'turkey', 'united kingdom', 'uk', 'united states',
  'usa', 'germany', 'france', 'italy', 'spain', 'netherlands', 'switzerland',
  'canada', 'australia', 'japan', 'china', 'india', 'singapore', 'hong kong',
  'south korea', 'brazil', 'mexico', 'russia', 'south africa', 'nigeria',
  'kenya', 'morocco', 'pakistan', 'indonesia', 'malaysia', 'thailand',
  'vietnam', 'philippines', 'sweden', 'norway', 'denmark', 'finland',
  'poland', 'austria', 'belgium', 'ireland', 'portugal', 'greece',
  'czech republic', 'new zealand', 'argentina', 'chile', 'colombia', 'peru',
  'serbia', 'croatia', 'romania', 'hungary', 'bulgaria', 'ukraine',
  'taiwan', 'taiwan, china', 'luxembourg', 'iceland', 'malta', 'cyprus',
  'dubai', 'abu dhabi', 'sharjah', 'riyadh', 'jeddah', 'doha', 'muscat',
  'amman', 'cairo', 'istanbul', 'london', 'paris', 'berlin', 'tokyo',
  'mumbai', 'beijing', 'shanghai', 'new york', 'los angeles', 'toronto',
  'sydney', 'melbourne', 'the seychelles', 'seychelles', 'st kitts & nevis',
  'st kitts and nevis', 'bahamas', 'bermuda', 'barbados', 'trinidad and tobago',
  'jamaica', 'maldives', 'fiji', 'mauritius', 'monaco', 'liechtenstein',
  'andorra', 'san marino', 'vatican city', 'brunei', 'cambodia', 'laos',
  'mongolia', 'nepal', 'sri lanka', 'bangladesh', 'myanmar', 'afghanistan',
  'costa rica', 'panama', 'guatemala', 'ecuador', 'bolivia', 'paraguay',
  'uruguay', 'venezuela', 'cuba', 'ghana', 'ethiopia', 'tanzania',
  'uganda', 'zimbabwe', 'zambia', 'algeria', 'tunisia', 'libya',
  'middle east', 'gcc', 'mena', 'europe', 'asia', 'africa', 'americas',
]);

function isKnownLocation(name: string): boolean {
  return KNOWN_LOCATIONS.has(name.toLowerCase().trim());
}

export function extractCompaniesFromSearchResults(
  results: SearchResult[],
  query: string,
  intent: QueryIntent,
  limit: number,
  answer?: string,
  preExtractedNames?: string[]
): EnrichedCompany[] {
  const now = new Date();
  const queryCountries = extractQueryCountries(query);
  const primaryQueryCountry = queryCountries.length === 1 ? queryCountries[0] : null;

  const companiesFromLists: Array<{
    name: string; sourceUrl: string; snippet: string; forcedCountry?: string;
  }> = [];

  if (preExtractedNames && preExtractedNames.length > 0) {
    for (const name of preExtractedNames) {
      companiesFromLists.push({
        name, sourceUrl: '', snippet: query,
        forcedCountry: primaryQueryCountry || undefined,
      });
    }
  }

  for (const result of results) {
    const snippet = result.snippet || '';
    if (snippet.includes('·') || snippet.includes('•')) {
      for (const name of extractNamesFromDotSeparatedList(snippet)) {
        companiesFromLists.push({ name, sourceUrl: result.url, snippet });
      }
    }
    for (const name of extractNamesFromNumberedList(result.title + '\n' + snippet)) {
      companiesFromLists.push({ name, sourceUrl: result.url, snippet });
    }
  }

  if (answer) {
    if (answer.includes('·') || answer.includes('•')) {
      for (const name of extractNamesFromDotSeparatedList(answer)) {
        companiesFromLists.push({ name, sourceUrl: '', snippet: answer });
      }
    }
    for (const name of extractNamesFromNumberedList(answer)) {
      companiesFromLists.push({ name, sourceUrl: '', snippet: answer });
    }
  }

  const seen = new Set<string>();
  const companies: EnrichedCompany[] = [];

  const addCompany = (name: string, sourceUrl: string, snippetText: string, forcedCountry?: string) => {
    let cleanName = name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').replace(/\.{2,}$/, '').replace(/[:\s]+$/, '').trim();
    if (isGenericTitle(cleanName)) return;
    if (isKnownLocation(cleanName)) return;
    if (looksLikePersonName(cleanName)) return;

    const key = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key) || key.length < 3) return;
    seen.add(key);

    let country = forcedCountry || null;
    if (!country) {
      country =
        detectCountryFromText(cleanName, '') ||
        (sourceUrl ? detectCountryFromText(sourceUrl.replace(/https?:\/\//g, '').replace(/[.\-\/]/g, ' '), '') : null) ||
        detectCountryFromText(snippetText, '') ||
        detectCountryFromText('', query);
    }

    const revenue = extractRevenueFromSnippet(snippetText);
    const employees = extractEmployeesFromSnippet(snippetText);
    const sector = extractSectorFromSnippet(snippetText, query);

    const makeField = <T>(value: T | null, confidence = value ? 5 : 0): FieldValue<T> => ({
      value, sourceUrl: sourceUrl || null, confidence, lastUpdated: now,
    });

    companies.push({
      canonicalName: cleanName, aliases: [],
      sector: makeField(sector), businessType: makeField<string>(null),
      country: makeField(country), city: makeField<string>(null),
      streetAddress: makeField<string>(null), latitude: makeField<number>(null), longitude: makeField<number>(null),
      revenue: { ...makeField(revenue?.value || null), currency: revenue?.currency || null, fiscalYear: null },
      employees: makeField(employees), website: makeField(sourceUrl || null),
      summary: makeField(snippetText.substring(0, 200)),
      sourceUrls: sourceUrl ? [sourceUrl] : [],
      searchProvider: 'serper', overallConfidence: 4,
    });
  };

  for (const item of companiesFromLists) {
    if (companies.length >= limit) break;
    addCompany(item.name, item.sourceUrl, item.snippet, item.forcedCountry);
  }

  if (companies.length < limit) {
    for (const result of results) {
      if (companies.length >= limit) break;
      const looksLikeCompanyPage = (
        /^https?:\/\/(?:www\.)?[a-z0-9-]+\.[a-z]{2,}\/?$/i.test(result.url) ||
        result.url.includes('/about') || result.url.includes('/company')
      );
      if (!looksLikeCompanyPage) continue;
      const name = extractCompanyNameFromTitle(result.title);
      if (!isGenericTitle(name)) addCompany(name, result.url, result.snippet);
    }
  }

  console.log(`[HeuristicExtraction] Extracted ${companies.length} companies`);
  return companies;
}

export async function extractExecutivesForCompany(
  companyName: string,
  searchContext: string,
  intent: QueryIntent,
  country?: string
): Promise<ExtractedExecutive[]> {
  const countryContext = country ? ` in ${country}` : '';
  const roleContext = intent.executiveRole ? ` (specifically looking for: ${intent.executiveRole})` : '';

  const prompt = `Extract executives for "${companyName}"${countryContext}${roleContext}.

IMPORTANT:
- Only extract executives who work for "${companyName}"${countryContext} specifically
- Do NOT extract global HQ executives if this is a regional entity
${intent.executiveRole ? `- Prioritise finding the ${intent.executiveRole}. The title must match what is being looked for - e.g. if looking for CFO, only return the CFO or Chief Financial Officer.` : ''}
- For each executive, provide their LinkedIn URL if you can find it in the search context

SEARCH CONTEXT:
${searchContext}

Return JSON only:
{
  "executives": [
    {"name": "John Doe", "title": "CEO", "role": "CEO", "linkedinUrl": "https://linkedin.com/in/johndoe", "sourceUrl": "...", "confidence": 8}
  ]
}
Roles: CEO, CFO, CHRO, CIO, CTO, OTHER
If linkedinUrl is not found, set it to null.
If none found: {"executives": []}`;

  try {
    const content = await callLLM([{ role: "user", content: prompt }], { temperature: 0.1, max_tokens: 2000 });
    const parsed = parseJsonResponse(content);
    if (!parsed || !Array.isArray(parsed.executives)) return [];
    return parsed.executives.map((e: any) => ({
      name: String(e.name || ''),
      title: String(e.title || ''),
      role: ['CEO', 'CFO', 'CHRO', 'CIO', 'CTO'].includes(e.role) ? e.role : 'OTHER',
      linkedinUrl: e.linkedinUrl || e.linkedin_url || e.linkedin || null,
      sourceUrl: e.sourceUrl || null,
      confidence: typeof e.confidence === 'number' ? e.confidence : 5,
    })).filter((e: ExtractedExecutive) => e.name.length > 0);
  } catch (error) {
    console.error('[NonDropExtraction] Executive extraction failed:', error);
    return [];
  }
}
