import { sql } from "drizzle-orm";
import { pgTable, serial, integer, text, varchar, timestamp, numeric, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const pipelineLog = pgTable("pipeline_log", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  fieldName: text("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  decision: text("decision").notNull(),
  reason: text("reason").notNull(),
  searchQueryId: integer("search_query_id").references(() => searchQueries.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sector: text("sector"),
  businessType: text("business_type"),
  ownershipType: text("ownership_type"),
  entityType: text("entity_type"),
  isOperatingCompany: boolean("is_operating_company").default(true),
  region: text("region"),
  country: text("country"),
  streetAddress: text("street_address"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  locationPrecision: text("location_precision").default("unknown"),
  revenue: numeric("revenue", { precision: 15, scale: 2 }),
  revenueSource: text("revenue_source"),
  revenueSourceUrl: text("revenue_source_url"),
  revenueConfidence: integer("revenue_confidence"),
  revenueCurrency: text("revenue_currency"),
  revenueFiscalYear: integer("revenue_fiscal_year"),
  revenueConvertedFromCurrency: text("revenue_converted_from_currency"),
  revenueFxRate: numeric("revenue_fx_rate", { precision: 10, scale: 6 }),
  revenueFxPolicy: text("revenue_fx_policy"),
  revenueLastUpdated: timestamp("revenue_last_updated"),
  employees: integer("employees"),
  employeesSource: text("employees_source"),
  employeesSourceUrl: text("employees_source_url"),
  employeesConfidence: integer("employees_confidence"),
  employeesLastUpdated: timestamp("employees_last_updated"),
  geographicFootprint: integer("geographic_footprint"),
  customerModel: text("customer_model"),
  coreActivity: text("core_activity"),
  operatingModel: text("operating_model"),
  revenueDrivers: text("revenue_drivers"),
  summary: text("summary"),
  website: text("website"),
  lastVerifiedYear: integer("last_verified_year"),
  confidence: integer("confidence").default(5),
  relevanceReason: text("relevance_reason"),
  color: text("color").default("#1e3a8a"),
  manuallyEditedFields: text("manually_edited_fields").array().default(sql`'{}'::text[]`),
  dataProvenance: jsonb("data_provenance").default(sql`'{}'::jsonb`),
  searchQueryId: integer("search_query_id").references(() => searchQueries.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const executives = pgTable("executives", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  title: text("title").notNull(),
  email: text("email"),
  phone: text("phone"),
  linkedin: text("linkedin"),
  profileUrl: text("profile_url"),
  imageUrl: text("image_url"),
  notes: text("notes"),
  remunerationNotes: text("remuneration_notes"),
  availability: text("availability"),
  level: text("level"),
  sourceText: text("source_text"),
  source: text("source"),
  confidence: integer("confidence").default(5),
  enrichmentSource: text("enrichment_source"),
  enrichmentConfidence: integer("enrichment_confidence"),
  enrichmentTimestamp: timestamp("enrichment_timestamp"),
  clockworkId: text("clockwork_id"),
  clockworkProjectId: text("clockwork_project_id"),
  gender: text("gender"),
  genderConfidence: integer("gender_confidence"),
  ethnicity: text("ethnicity"),
  ethnicityConfidence: integer("ethnicity_confidence"),
  executiveConfidence: text("executive_confidence"), // high, medium, low, unknown
  executiveConfidenceReason: text("executive_confidence_reason"),
  customFields: jsonb("custom_fields"),
  manuallyEditedFields: text("manually_edited_fields").array().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const searchQueries = pgTable("search_queries", {
  id: serial("id").primaryKey(),
  uniqueKey: text("unique_key").notNull().unique(),
  query: text("query").notNull(),
  parsedCriteria: text("parsed_criteria"),
  resultCount: integer("result_count").default(0),
  clockworkProjectId: text("clockwork_project_id"),
  satelliteHierarchies: jsonb("satellite_hierarchies").default({}),
  tableConfig: jsonb("table_config"),
  mapPositions: jsonb("map_positions").default({}),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const searchResults = pgTable("search_results", {
  id: serial("id").primaryKey(),
  searchQueryId: integer("search_query_id").references(() => searchQueries.id, { onDelete: "cascade" }),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  url: text("url").notNull(),
  title: text("title"),
  snippet: text("snippet"),
  domain: text("domain"),
  rank: integer("rank"),
  provider: text("provider").notNull(),
  sourceTier: integer("source_tier"),
  tierReason: text("tier_reason"),
  documentType: text("document_type"),
  isVerificationSource: boolean("is_verification_source").default(false),
  extractedData: text("extracted_data"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExecutiveSchema = createInsertSchema(executives).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSearchQuerySchema = createInsertSchema(searchQueries).omit({
  id: true,
  createdAt: true,
});

export const insertSearchResultSchema = createInsertSchema(searchResults).omit({
  id: true,
  createdAt: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const careerHistory = pgTable("career_history", {
  id: serial("id").primaryKey(),
  executiveId: integer("executive_id").notNull().references(() => executives.id, { onDelete: "cascade" }),
  company: text("company").notNull(),
  title: text("title").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const education = pgTable("education", {
  id: serial("id").primaryKey(),
  executiveId: integer("executive_id").notNull().references(() => executives.id, { onDelete: "cascade" }),
  institution: text("institution").notNull(),
  degree: text("degree"),
  fieldOfStudy: text("field_of_study"),
  graduationYear: text("graduation_year"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const remuneration = pgTable("remuneration", {
  id: serial("id").primaryKey(),
  executiveId: integer("executive_id").notNull().references(() => executives.id, { onDelete: "cascade" }),
  baseSalary: numeric("base_salary", { precision: 15, scale: 2 }),
  housingAllowance: numeric("housing_allowance", { precision: 15, scale: 2 }),
  transportAllowance: numeric("transport_allowance", { precision: 15, scale: 2 }),
  schoolingAllowance: numeric("schooling_allowance", { precision: 15, scale: 2 }),
  totalAllowances: numeric("total_allowances", { precision: 15, scale: 2 }),
  bonus: numeric("bonus", { precision: 15, scale: 2 }),
  longTermIncentives: numeric("long_term_incentives", { precision: 15, scale: 2 }),
  currency: text("currency").default("USD"),
  year: text("year"),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const executiveNotes = pgTable("executive_notes", {
  id: serial("id").primaryKey(),
  executiveId: integer("executive_id").notNull().references(() => executives.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const companyNotes = pgTable("company_notes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCareerHistorySchema = createInsertSchema(careerHistory).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEducationSchema = createInsertSchema(education).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRemunerationSchema = createInsertSchema(remuneration).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExecutiveNotesSchema = createInsertSchema(executiveNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCompanyNotesSchema = createInsertSchema(companyNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPipelineLogSchema = createInsertSchema(pipelineLog).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Executive = typeof executives.$inferSelect;
export type InsertExecutive = z.infer<typeof insertExecutiveSchema>;
export type SearchQuery = typeof searchQueries.$inferSelect;
export type InsertSearchQuery = z.infer<typeof insertSearchQuerySchema>;
export type SearchResult = typeof searchResults.$inferSelect;
export type InsertSearchResult = z.infer<typeof insertSearchResultSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type CareerHistory = typeof careerHistory.$inferSelect;
export type InsertCareerHistory = z.infer<typeof insertCareerHistorySchema>;
export type Education = typeof education.$inferSelect;
export type InsertEducation = z.infer<typeof insertEducationSchema>;
export type Remuneration = typeof remuneration.$inferSelect;
export type InsertRemuneration = z.infer<typeof insertRemunerationSchema>;
export type ExecutiveNotes = typeof executiveNotes.$inferSelect;
export type CompanyNotes = typeof companyNotes.$inferSelect;
export type InsertCompanyNotes = z.infer<typeof insertCompanyNotesSchema>;
export type InsertExecutiveNotes = z.infer<typeof insertExecutiveNotesSchema>;
export type PipelineLog = typeof pipelineLog.$inferSelect;
export type InsertPipelineLog = z.infer<typeof insertPipelineLogSchema>;