export interface DiscoveredCompany {
  companyNameRaw: string;
  sourceUrl: string;
  sourceTitle?: string;
  searchProvider: string;
  discoveryTimestamp: Date;
}

export interface CanonicalCompany {
  canonicalName: string;
  aliases: string[];
  sourceUrls: string[];
  searchProvider: string;
  confidence: number;
}

export interface FieldValue<T> {
  value: T | null;
  sourceUrl: string | null;
  confidence: number;
  lastUpdated: Date;
}

export interface EnrichedCompany {
  canonicalName: string;
  aliases: string[];
  sector: FieldValue<string>;
  businessType: FieldValue<string>;
  country: FieldValue<string>;
  city: FieldValue<string>;
  streetAddress: FieldValue<string>;
  latitude: FieldValue<number>;
  longitude: FieldValue<number>;
  revenue: FieldValue<number> & {
    currency?: string | null;
    fiscalYear?: number | null;
  };
  employees: FieldValue<number>;
  website: FieldValue<string>;
  summary: FieldValue<string>;
  sourceUrls: string[];
  searchProvider: string;
  overallConfidence: number;
}

export interface ExtractedExecutive {
  name: string;
  title: string;
  role: 'CEO' | 'CFO' | 'CHRO' | 'CIO' | 'CTO' | 'OTHER';
  sourceUrl: string | null;
  confidence: number;
}

export interface SearchIntent {
  sector?: string;
  region?: string;
  country?: string;
  rankingCriteria: string[];
  entityType: 'company';
  limit: number;
  originalQuery: string;
}

export interface ISearchProvider {
  name: string;
  discoverCompanies(intent: SearchIntent): Promise<DiscoveredCompany[]>;
  searchWithAnswer?(query: string, numResults?: number): Promise<{
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
  }>;
}

export interface CompanyPersistResult {
  id: number;
  isNew: boolean;
  company: {
    name: string;
    country: string | null;
    sector: string | null;
  };
}

export interface PipelineResult {
  status: 'complete' | 'partial' | 'degraded';
  companiesFound: number;
  companiesPersisted: number;
  degradationReasons: string[];
  companies: CompanyPersistResult[];
}
