import { sql } from "drizzle-orm";
import { pgTable, serial, integer, text, varchar, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sector: text("sector"),
  region: text("region"),
  country: text("country"),
  streetAddress: text("street_address"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
  revenue: numeric("revenue", { precision: 15, scale: 2 }),
  revenueSource: text("revenue_source"),
  employees: integer("employees"),
  employeesSource: text("employees_source"),
  confidence: integer("confidence").default(5),
  color: text("color").default("#1e3a8a"),
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
  source: text("source"),
  confidence: integer("confidence").default(5),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const searchQueries = pgTable("search_queries", {
  id: serial("id").primaryKey(),
  uniqueKey: text("unique_key").notNull().unique(),
  query: text("query").notNull(),
  parsedCriteria: text("parsed_criteria"),
  resultCount: integer("result_count").default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
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

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

// Executive Details Tables
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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Executive = typeof executives.$inferSelect;
export type InsertExecutive = z.infer<typeof insertExecutiveSchema>;
export type SearchQuery = typeof searchQueries.$inferSelect;
export type InsertSearchQuery = z.infer<typeof insertSearchQuerySchema>;
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
export type InsertExecutiveNotes = z.infer<typeof insertExecutiveNotesSchema>;
