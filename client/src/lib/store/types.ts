import type { InferredIntent, ActivityEvent } from '@shared/schema';

// ─── Search session ───────────────────────────────────────────────────────────

export type SearchStreamPhase = 'input' | 'streaming' | 'complete';

export interface StreamCompany {
  id: number;
  name: string;
  sector: string | null;
  country: string | null;
  geography: string | null;
  revenue: string | null;
  employees: number | null;
  website: string | null;
  summary: string | null;
  latitude: string | null;
  longitude: string | null;
  relevanceType: 'Direct' | 'Adjacent' | 'AI Inferred';
  relevanceRationale: string;
  confidenceScore: number;
  isUserAccepted: boolean;
  isUserRejected: boolean;
  executives?: Array<{ name: string; title: string }>;
  accepted: boolean;
  rejected: boolean;
}

export interface SearchSessionState {
  searchPhase: SearchStreamPhase;
  searchSessionId: string | null;
  searchIntent: InferredIntent | null;
  searchActivities: ActivityEvent[];
  searchCompanies: StreamCompany[];
  pendingCompanyNames: string[];
  searchQueryId: number | null;
  selectedSearchCompanyIds: Set<number>;
  searchRefinementHistory: Array<{ message: string; timestamp: string }>;
  searchPdContent: string | null;
  searchPdConfidential: boolean;
  isSearchStreaming: boolean;
  isSearchRefining: boolean;
}

export interface SearchSessionActions {
  setSearchPhase: (phase: SearchStreamPhase) => void;
  setSearchSessionId: (id: string | null) => void;
  setSearchIntent: (intent: InferredIntent | null) => void;
  addSearchActivity: (item: ActivityEvent) => void;
  addPendingCompanyName: (name: string) => void;
  removePendingCompanyName: (name: string) => void;
  clearPendingCompanyNames: () => void;
  setSearchCompanies: (companies: StreamCompany[]) => void;
  addSearchCompany: (company: StreamCompany) => void;
  addExecutiveToCompany: (companyId: number, executive: { name: string; title: string }) => void;
  acceptSearchCompany: (id: number) => void;
  rejectSearchCompany: (id: number) => void;
  addManualCompany: (data: { name: string; sector: string; revenueBand: string; employeeBand: string }) => void;
  setSearchQueryId: (id: number | null) => void;
  setIsSearchStreaming: (v: boolean) => void;
  setIsSearchRefining: (v: boolean) => void;
  addSearchRefinement: (entry: { message: string; timestamp: string }) => void;
  setSearchPdContent: (content: string | null, confidential?: boolean) => void;
  resetSearchSession: () => void;
}

// ─── Dashboard / workspace models ─────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  industry: string;
  sectorCategory?: string;
  hq_country: string;
  streetAddress?: string;
  lat: number;
  lng: number;
  revenue_usd: number;
  revenueSource?: string;
  revenueSourceUrl?: string;
  revenueConfidence?: number;
  revenueCurrency?: string;
  revenueFiscalYear?: number;
  employees: number;
  employeesSource?: string;
  employeesSourceUrl?: string;
  employeesConfidence?: number;
  geographicFootprint?: number;
  customerModel?: string;
  ownershipType?: string;
  coreActivity?: string;
  operatingModel?: string;
  revenueDrivers?: string;
  summary?: string;
  lastVerifiedYear?: number;
  confidence: number;
  description?: string;
  status?: string;
  color?: string;
  source?: string;
  businessType?: string;
  relevanceReason?: string;
}

export interface Executive {
  id: string;
  company_id: string;
  name: string;
  title: string;
  source: string;
  profileUrl?: string;
  imageUrl?: string;
  linkedin?: string;
  notes?: string;
  email?: string;
  phone?: string;
  remunerationNotes?: string;
  availability?: string;
  level?: string;
  gender?: string;
  ethnicity?: string;
  customFields?: Record<string, string>;
  confidence: number;
  enrichmentSource?: string;
  enrichmentConfidence?: number;
  enrichmentTimestamp?: string;
  executiveConfidence?: string | null;
  executiveConfidenceReason?: string | null;
  isEnriched: boolean;
}

export interface Project {
  id: string;
  name: string;
  search_string: string;
  created_at: Date;
  clockworkProjectId?: string | null;
  status?: 'draft' | 'active';
  selectedCount?: number;
}

export interface ExecutiveDetails {
  executive: {
    id: number;
    name: string;
    title: string;
    companyId: number;
    confidence: number | null;
    linkedin: string | null;
    profileUrl: string | null;
    imageUrl: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
    remunerationNotes: string | null;
    availability: string | null;
    level: string | null;
    gender: string | null;
    ethnicity: string | null;
    sourceText: string | null;
    enrichmentSource: string | null;
    enrichmentConfidence: number | null;
    enrichmentTimestamp: string | null;
    executiveConfidence: string | null;
    executiveConfidenceReason: string | null;
    isEnriched: boolean;
  };
  company: {
    id: number;
    name: string;
    country: string | null;
    revenue: string | null;
    employees: number | null;
  } | null;
  careerHistory: Array<{
    id: number;
    company: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    description: string | null;
    sortOrder: number | null;
  }>;
  education: Array<{
    id: number;
    institution: string;
    degree: string | null;
    fieldOfStudy: string | null;
    graduationYear: string | null;
  }>;
  remuneration: Array<{
    id: number;
    baseSalary: string | null;
    housingAllowance: string | null;
    transportAllowance: string | null;
    schoolingAllowance: string | null;
    totalAllowances: string | null;
    bonus: string | null;
    longTermIncentives: string | null;
    currency: string | null;
    year: string | null;
    notes: string | null;
  }>;
  notes: { id: number; content: string } | null;
}

export type DiscoveryStatus = 'complete' | 'partial' | 'degraded';
