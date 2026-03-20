import type { InsertSearchResult } from "@shared/schema";

export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
  rawContent?: string;
  domain: string;
  rank: number;
  provider: string;
}

export interface SearchResponse {
  results: WebSearchResult[];
  answer?: string;
  rawContents?: string[];
}

export interface SourceTierClassification {
  tier: number;
  reason: string;
  documentType: string;
}

const TIER_1_DOMAINS = [
  'sec.gov',
  'investor.', 
  'investors.',
  'annualreport',
  'annual-report',
  'ir.',
  'dfm.ae',
  'adx.ae',
  'tadawul.com.sa',
  'qe.com.qa',
  'bsebahrain.com',
  'msm.gov.om',
  'boursakuwait.com.kw',
  'londonstockexchange.com',
  'nyse.com',
  'nasdaq.com',
];

const TIER_1_PATTERNS = [
  /annual.?report/i,
  /10-?k/i,
  /20-?f/i,
  /investor.?relation/i,
  /financial.?statement/i,
  /audited.?financ/i,
  /integrated.?report/i,
];

const TIER_2_DOMAINS = [
  'reuters.com',
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  'forbes.com',
  'zawya.com',
  'gulfbusiness.com',
  'arabianbusiness.com',
  'thenationalnews.com',
  'khaleejtimes.com',
  'arabnews.com',
  'argaam.com',
  'mubasher.info',
  'crunchbase.com',
  'pitchbook.com',
  'spglobal.com',
  'moodys.com',
  'fitchratings.com',
];

const TIER_2_PATTERNS = [
  /press.?release/i,
  /news.?release/i,
  /earnings.?call/i,
  /quarterly.?report/i,
  /q[1-4].?20\d{2}/i,
];

export function classifySourceTier(url: string, title: string, snippet: string): SourceTierClassification {
  const domain = extractDomain(url).toLowerCase();
  const fullText = `${url} ${title} ${snippet}`.toLowerCase();
  
  for (const tier1Domain of TIER_1_DOMAINS) {
    if (domain.includes(tier1Domain)) {
      return {
        tier: 1,
        reason: `Official filings domain: ${tier1Domain}`,
        documentType: 'regulatory_filing',
      };
    }
  }
  
  for (const pattern of TIER_1_PATTERNS) {
    if (pattern.test(fullText)) {
      return {
        tier: 1,
        reason: `Document pattern match: ${pattern.source}`,
        documentType: 'annual_report',
      };
    }
  }
  
  for (const tier2Domain of TIER_2_DOMAINS) {
    if (domain.includes(tier2Domain)) {
      return {
        tier: 2,
        reason: `Reputable business source: ${tier2Domain}`,
        documentType: 'news_article',
      };
    }
  }
  
  for (const pattern of TIER_2_PATTERNS) {
    if (pattern.test(fullText)) {
      return {
        tier: 2,
        reason: `Business document pattern: ${pattern.source}`,
        documentType: 'press_release',
      };
    }
  }
  
  return {
    tier: 3,
    reason: 'General web source - name discovery only',
    documentType: 'web_page',
  };
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url.split('/')[2] || url;
  }
}

export interface SearchProvider {
  name: string;
  search(query: string, numResults?: number): Promise<WebSearchResult[]>;
  searchWithAnswer(query: string, numResults?: number): Promise<SearchResponse>;
}

export function parseRevenueString(revenueStr: string | null | undefined): {
  value: number | null;
  currency: string | null;
  fiscalYear: number | null;
  original: string | null;
} {
  if (!revenueStr || typeof revenueStr !== 'string') {
    return { value: null, currency: null, fiscalYear: null, original: null };
  }
  
  const original = revenueStr.trim();
  
  const currencyPatterns: { pattern: RegExp; code: string }[] = [
    { pattern: /\bUSD\b|\$|US\$/i, code: 'USD' },
    { pattern: /\bSAR\b/i, code: 'SAR' },
    { pattern: /\bAED\b/i, code: 'AED' },
    { pattern: /\bEUR\b|€/i, code: 'EUR' },
    { pattern: /\bGBP\b|£/i, code: 'GBP' },
    { pattern: /\bQAR\b/i, code: 'QAR' },
    { pattern: /\bOMR\b/i, code: 'OMR' },
    { pattern: /\bKWD\b/i, code: 'KWD' },
    { pattern: /\bBHD\b/i, code: 'BHD' },
    { pattern: /\bINR\b|₹/i, code: 'INR' },
    { pattern: /\bCHF\b/i, code: 'CHF' },
    { pattern: /\bJPY\b|¥/i, code: 'JPY' },
    { pattern: /\bCNY\b|RMB/i, code: 'CNY' },
  ];
  
  let currency: string | null = null;
  for (const { pattern, code } of currencyPatterns) {
    if (pattern.test(original)) {
      currency = code;
      break;
    }
  }
  
  const yearMatch = original.match(/\b(20[1-3]\d)\b/);
  const fiscalYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
  
  let value: number | null = null;
  
  const valuePatterns = [
    /(\d+(?:[.,]\d+)?)\s*(?:bn|billion|b)\b/i,
    /(\d+(?:[.,]\d+)?)\s*(?:mn|million|m)\b/i,
    /(\d+(?:[.,]\d+)?)\s*(?:tn|trillion|t)\b/i,
    /(\d+(?:[.,]\d+)?)\s*(?:k|thousand)\b/i,
    /(\d{1,3}(?:,\d{3})+(?:\.\d+)?)/,
    /(\d+(?:\.\d+)?)/,
  ];
  
  const multipliers: { [key: string]: number } = {
    'bn': 1e9, 'billion': 1e9, 'b': 1e9,
    'mn': 1e6, 'million': 1e6, 'm': 1e6,
    'tn': 1e12, 'trillion': 1e12, 't': 1e12,
    'k': 1e3, 'thousand': 1e3,
  };
  
  for (const pattern of valuePatterns) {
    const match = original.match(pattern);
    if (match) {
      let numStr = match[1].replace(/,/g, '');
      const num = parseFloat(numStr);
      
      if (!isNaN(num)) {
        const multiplierMatch = original.toLowerCase().match(/(billion|million|trillion|thousand|bn|mn|tn|b|m|t|k)/);
        if (multiplierMatch) {
          const mult = multipliers[multiplierMatch[1].toLowerCase()] || 1;
          value = num * mult;
        } else {
          value = num;
        }
        break;
      }
    }
  }
  
  return { value, currency, fiscalYear, original };
}

export function isValidCoordinate(lat: number | string | null | undefined, lng: number | string | null | undefined): boolean {
  const latNum = typeof lat === 'string' ? parseFloat(lat) : lat;
  const lngNum = typeof lng === 'string' ? parseFloat(lng) : lng;
  
  if (latNum === null || latNum === undefined || lngNum === null || lngNum === undefined) return false;
  if (isNaN(latNum) || isNaN(lngNum)) return false;
  
  if (Math.abs(latNum) < 1 && Math.abs(lngNum) < 1) return false;
  
  if (latNum < -90 || latNum > 90) return false;
  if (lngNum < -180 || lngNum > 180) return false;
  
  return true;
}

export function parseCoordinate(coord: number | string | null | undefined): number | null {
  if (coord === null || coord === undefined) return null;
  const num = typeof coord === 'string' ? parseFloat(coord) : coord;
  return isNaN(num) ? null : num;
}

export function parseEmployeeCount(employees: number | string | null | undefined): number | null {
  if (employees === null || employees === undefined) return null;
  if (typeof employees === 'number') return Math.round(employees);
  
  const str = String(employees).replace(/[,\s+~]/g, '');
  const num = parseInt(str, 10);
  return isNaN(num) ? null : num;
}
