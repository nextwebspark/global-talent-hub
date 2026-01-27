import { db } from "./db";
import { 
  companies, 
  executives, 
  searchQueries, 
  users,
  careerHistory,
  education,
  remuneration,
  executiveNotes,
  type InsertUser,
  type User,
  type Company,
  type InsertCompany,
  type Executive,
  type InsertExecutive,
  type SearchQuery,
  type InsertSearchQuery,
  type CareerHistory,
  type InsertCareerHistory,
  type Education,
  type InsertEducation,
  type Remuneration,
  type InsertRemuneration,
  type ExecutiveNotes,
  type InsertExecutiveNotes
} from "@shared/schema";
import { eq, desc, and, gte, lte, ilike, or, sql, asc } from "drizzle-orm";

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
  
  getAllSearchQueries(): Promise<SearchQuery[]>;
  getUniqueSearchQueries(): Promise<SearchQuery[]>;
  getSearchQuery(id: number): Promise<SearchQuery | undefined>;
  getSearchQueryByUniqueKey(uniqueKey: string): Promise<SearchQuery | undefined>;
  createSearchQuery(query: InsertSearchQuery): Promise<SearchQuery>;
  upsertSearchQuery(query: InsertSearchQuery): Promise<SearchQuery>;
  updateSearchQueryResultCount(id: number, count: number): Promise<void>;
  deleteCompaniesBySearchQuery(searchQueryId: number): Promise<void>;
  deleteSearchQuery(id: number): Promise<void>;
  getSearchHistoryWithResults(): Promise<Array<SearchQuery & { companyCount: number }>>;
  getFullSearchResults(searchQueryId: number): Promise<{ searchQuery: SearchQuery; companies: Array<Company & { executives: Executive[] }> } | null>;
  
  // Executive Details
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
  
  getExecutiveNotes(executiveId: number): Promise<ExecutiveNotes | undefined>;
  upsertExecutiveNotes(executiveId: number, content: string): Promise<ExecutiveNotes>;
  
  getExecutiveDetails(executiveId: number): Promise<{
    executive: Executive;
    careerHistory: CareerHistory[];
    education: Education[];
    remuneration: Remuneration[];
    notes: ExecutiveNotes | undefined;
  } | null>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllCompanies(): Promise<Company[]> {
    return db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  async getCompany(id: number): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  async getCompaniesBySearchQuery(searchQueryId: number): Promise<Company[]> {
    return db.select().from(companies).where(eq(companies.searchQueryId, searchQueryId));
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const [newCompany] = await db.insert(companies).values(company).returning();
    return newCompany;
  }

  async updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company> {
    const [updated] = await db
      .update(companies)
      .set({ ...data, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(companies.id, id))
      .returning();
    return updated;
  }

  async deleteCompany(id: number): Promise<void> {
    await db.delete(companies).where(eq(companies.id, id));
  }

  async getExecutivesByCompany(companyId: number): Promise<Executive[]> {
    return db.select().from(executives).where(eq(executives.companyId, companyId));
  }

  async getExecutive(id: number): Promise<Executive | undefined> {
    const [executive] = await db.select().from(executives).where(eq(executives.id, id));
    return executive;
  }

  async createExecutive(executive: InsertExecutive): Promise<Executive> {
    const [newExecutive] = await db.insert(executives).values(executive).returning();
    return newExecutive;
  }

  async updateExecutive(id: number, data: Partial<InsertExecutive>): Promise<Executive> {
    const [updated] = await db
      .update(executives)
      .set({ ...data, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(executives.id, id))
      .returning();
    return updated;
  }

  async deleteExecutive(id: number): Promise<void> {
    await db.delete(executives).where(eq(executives.id, id));
  }

  async getAllSearchQueries(): Promise<SearchQuery[]> {
    return db.select().from(searchQueries).orderBy(desc(searchQueries.createdAt));
  }

  async getUniqueSearchQueries(): Promise<SearchQuery[]> {
    const allQueries = await db.select().from(searchQueries).orderBy(desc(searchQueries.createdAt));
    const seen = new Set<string>();
    const unique: SearchQuery[] = [];
    for (const q of allQueries) {
      const key = q.query.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(q);
      }
    }
    return unique;
  }

  async getSearchQuery(id: number): Promise<SearchQuery | undefined> {
    const [query] = await db.select().from(searchQueries).where(eq(searchQueries.id, id));
    return query;
  }

  async getSearchQueryByUniqueKey(uniqueKey: string): Promise<SearchQuery | undefined> {
    const [query] = await db.select().from(searchQueries).where(eq(searchQueries.uniqueKey, uniqueKey));
    return query;
  }

  async createSearchQuery(query: InsertSearchQuery): Promise<SearchQuery> {
    const [newQuery] = await db.insert(searchQueries).values(query).returning();
    return newQuery;
  }

  async upsertSearchQuery(query: InsertSearchQuery): Promise<SearchQuery> {
    const existing = await this.getSearchQueryByUniqueKey(query.uniqueKey);
    if (existing) {
      const [updated] = await db
        .update(searchQueries)
        .set({ 
          query: query.query,
          parsedCriteria: query.parsedCriteria,
          resultCount: query.resultCount || 0,
          updatedAt: sql`CURRENT_TIMESTAMP`
        })
        .where(eq(searchQueries.id, existing.id))
        .returning();
      return updated;
    }
    return this.createSearchQuery(query);
  }

  async updateSearchQueryResultCount(id: number, count: number): Promise<void> {
    await db.update(searchQueries).set({ resultCount: count, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(searchQueries.id, id));
  }

  async deleteCompaniesBySearchQuery(searchQueryId: number): Promise<void> {
    await db.delete(companies).where(eq(companies.searchQueryId, searchQueryId));
  }

  async deleteSearchQuery(id: number): Promise<void> {
    await db.delete(searchQueries).where(eq(searchQueries.id, id));
  }

  async getSearchHistoryWithResults(): Promise<Array<SearchQuery & { companyCount: number }>> {
    const allQueries = await db.select().from(searchQueries).orderBy(desc(searchQueries.createdAt));
    const seen = new Set<string>();
    const result: Array<SearchQuery & { companyCount: number }> = [];
    
    for (const q of allQueries) {
      const key = q.query.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        const companiesForQuery = await db.select().from(companies).where(eq(companies.searchQueryId, q.id));
        result.push({ ...q, companyCount: companiesForQuery.length });
      }
    }
    return result;
  }

  async getFullSearchResults(searchQueryId: number): Promise<{ searchQuery: SearchQuery; companies: Array<Company & { executives: Executive[] }> } | null> {
    const searchQuery = await this.getSearchQuery(searchQueryId);
    if (!searchQuery) return null;

    const companiesForQuery = await db.select().from(companies).where(eq(companies.searchQueryId, searchQueryId));
    const companiesWithExecs: Array<Company & { executives: Executive[] }> = [];

    for (const company of companiesForQuery) {
      const execsForCompany = await db.select().from(executives).where(eq(executives.companyId, company.id));
      companiesWithExecs.push({ ...company, executives: execsForCompany });
    }

    return { searchQuery, companies: companiesWithExecs };
  }

  // Career History
  async getCareerHistory(executiveId: number): Promise<CareerHistory[]> {
    return db.select().from(careerHistory)
      .where(eq(careerHistory.executiveId, executiveId))
      .orderBy(asc(careerHistory.sortOrder), desc(careerHistory.createdAt));
  }

  async createCareerHistory(entry: InsertCareerHistory): Promise<CareerHistory> {
    const [created] = await db.insert(careerHistory).values(entry).returning();
    return created;
  }

  async updateCareerHistory(id: number, data: Partial<InsertCareerHistory>): Promise<CareerHistory> {
    const [updated] = await db
      .update(careerHistory)
      .set({ ...data, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(careerHistory.id, id))
      .returning();
    return updated;
  }

  async deleteCareerHistory(id: number): Promise<void> {
    await db.delete(careerHistory).where(eq(careerHistory.id, id));
  }

  // Education
  async getEducation(executiveId: number): Promise<Education[]> {
    return db.select().from(education)
      .where(eq(education.executiveId, executiveId))
      .orderBy(desc(education.graduationYear));
  }

  async createEducation(entry: InsertEducation): Promise<Education> {
    const [created] = await db.insert(education).values(entry).returning();
    return created;
  }

  async updateEducation(id: number, data: Partial<InsertEducation>): Promise<Education> {
    const [updated] = await db
      .update(education)
      .set({ ...data, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(education.id, id))
      .returning();
    return updated;
  }

  async deleteEducation(id: number): Promise<void> {
    await db.delete(education).where(eq(education.id, id));
  }

  // Remuneration
  async getRemuneration(executiveId: number): Promise<Remuneration[]> {
    return db.select().from(remuneration)
      .where(eq(remuneration.executiveId, executiveId))
      .orderBy(desc(remuneration.year));
  }

  async createRemuneration(entry: InsertRemuneration): Promise<Remuneration> {
    const [created] = await db.insert(remuneration).values(entry).returning();
    return created;
  }

  async updateRemuneration(id: number, data: Partial<InsertRemuneration>): Promise<Remuneration> {
    const [updated] = await db
      .update(remuneration)
      .set({ ...data, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(remuneration.id, id))
      .returning();
    return updated;
  }

  async deleteRemuneration(id: number): Promise<void> {
    await db.delete(remuneration).where(eq(remuneration.id, id));
  }

  // Executive Notes
  async getExecutiveNotes(executiveId: number): Promise<ExecutiveNotes | undefined> {
    const [notes] = await db.select().from(executiveNotes)
      .where(eq(executiveNotes.executiveId, executiveId));
    return notes;
  }

  async upsertExecutiveNotes(executiveId: number, content: string): Promise<ExecutiveNotes> {
    const existing = await this.getExecutiveNotes(executiveId);
    if (existing) {
      const [updated] = await db
        .update(executiveNotes)
        .set({ content, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(executiveNotes.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(executiveNotes).values({ executiveId, content }).returning();
    return created;
  }

  // Get full executive details
  async getExecutiveDetails(executiveId: number): Promise<{
    executive: Executive;
    careerHistory: CareerHistory[];
    education: Education[];
    remuneration: Remuneration[];
    notes: ExecutiveNotes | undefined;
  } | null> {
    const executive = await this.getExecutive(executiveId);
    if (!executive) return null;

    const [careerHistoryData, educationData, remunerationData, notesData] = await Promise.all([
      this.getCareerHistory(executiveId),
      this.getEducation(executiveId),
      this.getRemuneration(executiveId),
      this.getExecutiveNotes(executiveId)
    ]);

    return {
      executive,
      careerHistory: careerHistoryData,
      education: educationData,
      remuneration: remunerationData,
      notes: notesData
    };
  }
}

export const storage = new DatabaseStorage();
