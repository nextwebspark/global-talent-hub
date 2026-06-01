import type {
  User,
  InsertUser,
  Company,
  InsertCompany,
  Executive,
  InsertExecutive,
  SearchQuery,
  InsertSearchQuery,
  SearchResult,
  InsertSearchResult,
  CareerHistory,
  InsertCareerHistory,
  Education,
  InsertEducation,
  Remuneration,
  InsertRemuneration,
  ExecutiveNotes,
  InsertExecutiveNotes,
  CompanyNotes,
  InsertCompanyNotes,
  InsertPipelineLog,
} from "@shared/schema";

// ─── Interface ────────────────────────────────────────────────────────────────

export type DataOrigin = "discovery" | "enrichment" | "manual";

export interface CompanySeedRow {
  id: number;
  name: string;
  slug: string;
  country: string;
  sector: string;
  website: string | null;
  description: string | null;
  sourceUrl: string;
  sourceTitle: string | null;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getAllCompanies(): Promise<Company[]>;
  getCompany(id: number): Promise<Company | undefined>;
  getCompaniesBySearchQuery(searchQueryId: number): Promise<Company[]>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company>;
  deleteCompany(id: number): Promise<void>;

  getExecutivesByCompany(companyId: number): Promise<Executive[]>;
  getExecutive(id: number): Promise<Executive | undefined>;
  createExecutive(executive: InsertExecutive): Promise<Executive>;
  updateExecutive(id: number, data: Partial<InsertExecutive>): Promise<Executive>;
  deleteExecutive(id: number): Promise<void>;

  createExecutiveFromDiscovery(executive: InsertExecutive): Promise<Executive>;
  createExecutiveManual(executive: InsertExecutive): Promise<Executive>;
  findExecutiveByNameAndCompany(name: string, companyId: number): Promise<Executive | undefined>;
  enrichExecutiveEmptyFields(
    id: number,
    data: Partial<InsertExecutive>,
    metadata?: { source: string; confidence: number; clockworkId?: string; clockworkProjectId?: string }
  ): Promise<{ updated: Executive; enrichedFields: string[]; alreadyEnriched: boolean }>;
  createExecutiveFromClockwork(
    executive: InsertExecutive,
    metadata: { confidence: number; clockworkId: string; clockworkProjectId?: string }
  ): Promise<{ executive: Executive; alreadyExists: boolean }>;
  checkExecutiveClockworkEnrichment(executiveId: number, clockworkId: string): Promise<boolean>;
  updateExecutiveManual(id: number, data: Partial<InsertExecutive>): Promise<Executive>;

  createCompanyFromDiscovery(company: InsertCompany): Promise<Company>;
  createCompanyManual(company: InsertCompany): Promise<Company>;
  enrichCompanyEmptyFields(id: number, data: Partial<InsertCompany>): Promise<{ updated: Company; enrichedFields: string[] }>;
  updateCompanyManual(id: number, data: Partial<InsertCompany>): Promise<Company>;

  logPipelineDecision(log: InsertPipelineLog): Promise<void>;
  upsertCompanyNonDestructive(
    company: InsertCompany,
    searchQueryId: number,
    fieldConfidences?: Record<string, number>
  ): Promise<{ company: Company; isNew: boolean }>;
  findCompanyByNameAndQuery(name: string, searchQueryId: number): Promise<Company | undefined>;

  getCompanySeedSample(limit: number): Promise<CompanySeedRow[]>;

  getAllSearchQueries(): Promise<SearchQuery[]>;
  getUniqueSearchQueries(): Promise<SearchQuery[]>;
  getSearchQuery(id: number): Promise<SearchQuery | undefined>;
  getSearchQueryByUniqueKey(uniqueKey: string): Promise<SearchQuery | undefined>;
  createSearchQuery(query: InsertSearchQuery): Promise<SearchQuery>;
  upsertSearchQuery(query: InsertSearchQuery): Promise<SearchQuery>;
  updateSearchQueryResultCount(id: number, count: number): Promise<void>;
  updateSearchQueryName(id: number, name: string): Promise<SearchQuery>;
  updateSearchQueryClockworkProject(id: number, clockworkProjectId: string): Promise<SearchQuery>;
  deleteCompaniesBySearchQuery(searchQueryId: number): Promise<void>;
  deleteNonEnrichedCompaniesBySearchQuery(searchQueryId: number): Promise<number>;
  deleteSearchQuery(id: number): Promise<void>;
  getSearchHistoryWithResults(): Promise<Array<SearchQuery & { companyCount: number }>>;
  getFullSearchResults(searchQueryId: number): Promise<{ searchQuery: SearchQuery; companies: Array<Company & { executives: Executive[] }> } | null>;
  saveSatelliteHierarchies(searchQueryId: number, hierarchies: Record<string, Record<string, string>>): Promise<void>;
  saveSatelliteOrders(searchQueryId: number, orders: Record<string, string[]>): Promise<void>;
  saveTableConfig(searchQueryId: number, config: Record<string, any>): Promise<void>;
  saveMapPositions(searchQueryId: number, positions: Record<string, any>): Promise<void>;

  getCareerHistory(executiveId: number): Promise<CareerHistory[]>;
  createCareerHistory(entry: InsertCareerHistory): Promise<CareerHistory>;
  updateCareerHistory(id: number, data: Partial<InsertCareerHistory>): Promise<CareerHistory>;
  deleteCareerHistory(id: number): Promise<void>;

  getEducation(executiveId: number): Promise<Education[]>;
  createEducation(entry: InsertEducation): Promise<Education>;
  updateEducation(id: number, data: Partial<InsertEducation>): Promise<Education>;
  deleteEducation(id: number): Promise<void>;

  getRemuneration(executiveId: number): Promise<Remuneration[]>;
  createRemuneration(entry: InsertRemuneration): Promise<Remuneration>;
  updateRemuneration(id: number, data: Partial<InsertRemuneration>): Promise<Remuneration>;
  deleteRemuneration(id: number): Promise<void>;
  deleteRemunerationByExecutive(executiveId: number): Promise<void>;

  getExecutiveNotes(executiveId: number): Promise<ExecutiveNotes | undefined>;
  upsertExecutiveNotes(executiveId: number, content: string): Promise<ExecutiveNotes>;

  getCompanyNotes(companyId: number): Promise<CompanyNotes | undefined>;
  upsertCompanyNotes(companyId: number, content: string): Promise<CompanyNotes>;

  getSearchResultsByQuery(searchQueryId: number): Promise<SearchResult[]>;
  getSearchResultsByCompany(companyId: number): Promise<SearchResult[]>;
  createSearchResult(result: InsertSearchResult): Promise<SearchResult>;
  createSearchResults(results: InsertSearchResult[]): Promise<SearchResult[]>;
  updateSearchResultCompanyLink(id: number, companyId: number): Promise<SearchResult>;

  getExecutiveDetails(executiveId: number): Promise<{
    executive: Executive;
    company: Company | undefined;
    careerHistory: CareerHistory[];
    education: Education[];
    remuneration: Remuneration[];
    notes: ExecutiveNotes | undefined;
  } | null>;

  createSearchSession(session: {
    id: string;
    rawQuery: string;
    pdContent?: string;
    pdConfidential?: boolean;
    userId?: string;
  }): Promise<void>;
  updateSearchSession(
    id: string,
    data: {
      status?: string;
      inferredIntent?: any;
      searchQueryId?: number;
      refinementHistory?: any[];
      pdContent?: string;
      pdConfidential?: boolean;
    }
  ): Promise<void>;
  getSearchSession(id: string): Promise<{
    id: string;
    rawQuery: string;
    pdContent: string | null;
    pdConfidential: boolean;
    inferredIntent: any;
    status: string;
    searchQueryId: number | null;
    refinementHistory: any[];
  } | undefined>;
}
