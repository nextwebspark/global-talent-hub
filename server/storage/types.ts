import type { MatchBreakdown } from "../services/pipeline/companyScore";
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
  Organization,
  InsertOrganization,
  OrgMember,
  InsertOrgMember,
  UserProfile,
  InsertUserProfile,
  InsertLoginEvent,
  LoginEvent,
} from "@shared/schema";

// ─── Interface ────────────────────────────────────────────────────────────────

export type DataOrigin = "discovery" | "enrichment" | "manual";

// A row from the Supabase `company_enrichment` table (camelCased).
// Mirrors docs/supabase-schema/company_enrichment.sql (self-contained — carries
// company_name/country directly, no join needed).
export interface EnrichedCompanyRow {
  id: number;
  companyId: string;
  companyName: string;
  slug: string;
  country: string;
  primarySector: string;
  sectorTags: string[];
  subTags: string[];
  keywords: string[];
  tagline: string | null;
  businessDescription: string | null;
  employeeBand: string | null;
  employeeCountEstimate: number | null;
  revenueBand: string | null;
  revenueEstimateUsd: number | null;
  isListed: boolean | null;
  hqCity: string | null;
  // 0-1 data-QUALITY of the enrichment record (used only as a sort tie-breaker).
  // Distinct from companies.confidence (1-10), which is derived from the query
  // matchScore — do not conflate the two despite the shared field name.
  confidence: number;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

// Vocabulary-validated filter passed to queryEnrichedCompanies. All array values
// are pre-validated against the controlled taxonomy by the caller.
export interface EnrichedCompanyQuery {
  primarySectors: string[];
  adjacentSectors: string[];
  subTags: string[];
  countries: string[];
  employeeBands: string[];
  revenueBands: string[];
  isListed: boolean | null;
}

// A row tagged with how it matched the query and scored 0..100 on how many of
// the query's dimensions it satisfied. relevanceType: Direct = primary-sector
// match, Adjacent = matched via an adjacent sector, AI Inferred = surfaced by a
// sub-tag match with no sector hit. breakdown records which dimensions matched.
export type EnrichedCompanyMatch = EnrichedCompanyRow & {
  relevanceType: "Direct" | "Adjacent" | "AI Inferred";
  matchScore: number; // 0..100
  breakdown: MatchBreakdown;
};

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Company/executive access is org-scoped: orgId filters visibility and guards
  // mutations to the caller's organization. org_id is stamped on insert.
  getAllCompanies(orgId: string): Promise<Company[]>;
  getCompany(id: number, orgId: string): Promise<Company | undefined>;
  getCompaniesBySearchQuery(searchQueryId: number, orgId: string): Promise<Company[]>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company>;
  deleteCompany(id: number, orgId: string): Promise<void>;

  getExecutivesByCompany(companyId: number, orgId: string): Promise<Executive[]>;
  getExecutive(id: number, orgId: string): Promise<Executive | undefined>;
  createExecutive(executive: InsertExecutive): Promise<Executive>;
  updateExecutive(id: number, data: Partial<InsertExecutive>): Promise<Executive>;
  deleteExecutive(id: number, orgId: string): Promise<void>;

  createExecutiveFromDiscovery(executive: InsertExecutive, orgId: string): Promise<Executive>;
  createExecutiveManual(executive: InsertExecutive, orgId: string): Promise<Executive>;
  findExecutiveByNameAndCompany(name: string, companyId: number, orgId: string): Promise<Executive | undefined>;
  enrichExecutiveEmptyFields(
    id: number,
    data: Partial<InsertExecutive>,
    orgId: string,
    metadata?: { source: string; confidence: number; clockworkId?: string; clockworkProjectId?: string }
  ): Promise<{ updated: Executive; enrichedFields: string[]; alreadyEnriched: boolean }>;
  createExecutiveFromClockwork(
    executive: InsertExecutive,
    metadata: { confidence: number; clockworkId: string; clockworkProjectId?: string },
    orgId: string
  ): Promise<{ executive: Executive; alreadyExists: boolean }>;
  checkExecutiveClockworkEnrichment(executiveId: number, clockworkId: string, orgId: string): Promise<boolean>;
  updateExecutiveManual(id: number, data: Partial<InsertExecutive>, orgId: string): Promise<Executive>;

  createCompanyFromDiscovery(company: InsertCompany, orgId: string): Promise<Company>;
  createCompanyManual(company: InsertCompany, orgId: string): Promise<Company>;
  enrichCompanyEmptyFields(id: number, data: Partial<InsertCompany>, orgId: string): Promise<{ updated: Company; enrichedFields: string[] }>;
  updateCompanyManual(id: number, data: Partial<InsertCompany>, orgId: string): Promise<Company>;

  logPipelineDecision(log: InsertPipelineLog): Promise<void>;
  upsertCompanyNonDestructive(
    company: InsertCompany,
    searchQueryId: number,
    orgId: string,
    fieldConfidences?: Record<string, number>
  ): Promise<{ company: Company; isNew: boolean }>;
  findCompanyByNameAndQuery(name: string, searchQueryId: number, orgId: string): Promise<Company | undefined>;

  queryEnrichedCompanies(filter: EnrichedCompanyQuery, limit: number): Promise<EnrichedCompanyMatch[]>;

  // Project (search_query) access is org-scoped: orgId filters visibility and
  // guards mutations to the caller's organization. createdBy records the owner.
  getAllSearchQueries(orgId: string): Promise<SearchQuery[]>;
  getSearchQuery(id: number, orgId: string): Promise<SearchQuery | undefined>;
  getSearchQueryByUniqueKey(uniqueKey: string, orgId: string): Promise<SearchQuery | undefined>;
  createSearchQuery(query: InsertSearchQuery): Promise<SearchQuery>;
  upsertSearchQuery(query: InsertSearchQuery): Promise<SearchQuery>;
  updateSearchQueryResultCount(id: number, count: number, orgId: string): Promise<void>;
  updateSearchQueryName(id: number, name: string, orgId: string): Promise<SearchQuery>;
  updateSearchQueryDraft(id: number, fields: { selectedCount?: number; query?: string }, orgId: string): Promise<SearchQuery>;
  updateSearchQueryStatus(id: number, status: string, selectedCount: number | undefined, orgId: string): Promise<SearchQuery>;
  updateSearchQueryClockworkProject(id: number, clockworkProjectId: string, orgId: string): Promise<SearchQuery>;
  deleteCompaniesBySearchQuery(searchQueryId: number): Promise<void>;
  deleteNonEnrichedCompaniesBySearchQuery(searchQueryId: number): Promise<number>;
  deleteSearchQuery(id: number, orgId: string): Promise<void>;
  getSearchHistoryWithResults(orgId: string): Promise<Array<SearchQuery & { companyCount: number }>>;
  getFullSearchResults(searchQueryId: number, orgId: string): Promise<{ searchQuery: SearchQuery; companies: Array<Company & { executives: Executive[] }> } | null>;
  saveSatelliteHierarchies(searchQueryId: number, hierarchies: Record<string, Record<string, string>>, orgId: string): Promise<void>;
  saveSatelliteOrders(searchQueryId: number, orders: Record<string, string[]>, orgId: string): Promise<void>;
  saveTableConfig(searchQueryId: number, config: Record<string, any>, orgId: string): Promise<void>;
  saveMapPositions(searchQueryId: number, positions: Record<string, any>, orgId: string): Promise<void>;

  getOrgBySlug(slug: string): Promise<Organization | undefined>;
  getOrganization(id: string): Promise<Organization | undefined>;
  createOrganization(org: InsertOrganization): Promise<Organization>;
  createOrgMember(member: InsertOrgMember): Promise<OrgMember>;
  getOrgMembershipByUser(userId: string): Promise<OrgMember | undefined>;
  updateOrganization(orgId: string, fields: Partial<InsertOrganization>): Promise<Organization>;
  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  upsertUserProfile(userId: string, fields: Partial<InsertUserProfile>): Promise<UserProfile>;
  getOrgMembers(orgId: string): Promise<Array<OrgMember & { profile: UserProfile | null }>>;
  getOrgMemberById(memberId: string, orgId: string): Promise<OrgMember | undefined>;
  updateOrgMemberRole(memberId: string, orgId: string, role: string): Promise<OrgMember>;
  deleteOrgMember(memberId: string, orgId: string): Promise<void>;
  countOrgOwners(orgId: string): Promise<number>;
  recordLoginEvent(event: InsertLoginEvent): Promise<void>;
  getLoginEvents(userId: string, limit?: number): Promise<LoginEvent[]>;

  // Child tables (career/education/remuneration/notes) carry no org_id; routes
  // org-guard via the parent executive/company. These resolve the parent
  // executive id from a child row id so standalone child routes can guard.
  getCareerHistory(executiveId: number): Promise<CareerHistory[]>;
  createCareerHistory(entry: InsertCareerHistory): Promise<CareerHistory>;
  updateCareerHistory(id: number, data: Partial<InsertCareerHistory>): Promise<CareerHistory>;
  deleteCareerHistory(id: number): Promise<void>;
  getCareerHistoryExecutiveId(id: number): Promise<number | undefined>;

  getEducation(executiveId: number): Promise<Education[]>;
  createEducation(entry: InsertEducation): Promise<Education>;
  updateEducation(id: number, data: Partial<InsertEducation>): Promise<Education>;
  deleteEducation(id: number): Promise<void>;
  getEducationExecutiveId(id: number): Promise<number | undefined>;

  getRemuneration(executiveId: number): Promise<Remuneration[]>;
  createRemuneration(entry: InsertRemuneration): Promise<Remuneration>;
  updateRemuneration(id: number, data: Partial<InsertRemuneration>): Promise<Remuneration>;
  deleteRemuneration(id: number): Promise<void>;
  getRemunerationExecutiveId(id: number): Promise<number | undefined>;
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

  getExecutiveDetails(executiveId: number, orgId: string): Promise<{
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
