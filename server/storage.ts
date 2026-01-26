import { db } from "./db";
import { 
  companies, 
  executives, 
  searchQueries, 
  users,
  type InsertUser,
  type User,
  type Company,
  type InsertCompany,
  type Executive,
  type InsertExecutive,
  type SearchQuery,
  type InsertSearchQuery
} from "@shared/schema";
import { eq, desc, and, gte, lte, ilike, or, sql } from "drizzle-orm";

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
  createSearchQuery(query: InsertSearchQuery): Promise<SearchQuery>;
  updateSearchQueryResultCount(id: number, count: number): Promise<void>;
  getSearchHistoryWithResults(): Promise<Array<SearchQuery & { companyCount: number }>>;
  getFullSearchResults(searchQueryId: number): Promise<{ searchQuery: SearchQuery; companies: Array<Company & { executives: Executive[] }> } | null>;
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

  async createSearchQuery(query: InsertSearchQuery): Promise<SearchQuery> {
    const [newQuery] = await db.insert(searchQueries).values(query).returning();
    return newQuery;
  }

  async updateSearchQueryResultCount(id: number, count: number): Promise<void> {
    await db.update(searchQueries).set({ resultCount: count }).where(eq(searchQueries.id, id));
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
}

export const storage = new DatabaseStorage();
