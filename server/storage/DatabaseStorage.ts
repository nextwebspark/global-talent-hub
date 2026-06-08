import { supabase } from "../supabase";
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
import { keysToCamel, keysToSnake, toSnakeKey } from "./internal/case";
import { nowIso, sb, sbOpt } from "./internal/sb";
import { scoreCompany } from "../services/pipeline/companyScore";
import type {
  EnrichedCompanyRow,
  EnrichedCompanyQuery,
  EnrichedCompanyMatch,
  IStorage,
} from "./types";

// ─── Implementation ───────────────────────────────────────────────────────────

export class DatabaseStorage implements IStorage {
  // ── Users ──────────────────────────────────────────────────────────────────

  async getUser(id: string): Promise<User | undefined> {
    return sbOpt<User>(
      await supabase.from("hak_users").select("*").eq("id", id).maybeSingle(),
      "getUser"
    );
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return sbOpt<User>(
      await supabase.from("hak_users").select("*").eq("username", username).maybeSingle(),
      "getUserByUsername"
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return sb<User>(
      await supabase.from("hak_users").insert(keysToSnake(insertUser)).select().single(),
      "createUser"
    );
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async getAllCompanies(orgId: string): Promise<Company[]> {
    const { data, error } = await supabase
      .from("hak_companies")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`[Storage:getAllCompanies] ${error.message}`);
    return keysToCamel<Company[]>(data ?? []);
  }

  async getCompany(id: number, orgId: string): Promise<Company | undefined> {
    return sbOpt<Company>(
      await supabase.from("hak_companies").select("*").eq("id", id).eq("org_id", orgId).maybeSingle(),
      "getCompany"
    );
  }

  async getCompaniesBySearchQuery(searchQueryId: number, orgId: string): Promise<Company[]> {
    const { data, error } = await supabase
      .from("hak_companies")
      .select("*")
      .eq("search_query_id", searchQueryId)
      .eq("org_id", orgId);
    if (error) throw new Error(`[Storage:getCompaniesBySearchQuery] ${error.message}`);
    return keysToCamel<Company[]>(data ?? []);
  }

  async searchCompaniesByName(name: string, orgId: string): Promise<Company[]> {
    const { data, error } = await supabase
      .from("hak_companies")
      .select("*")
      .eq("org_id", orgId)
      .ilike("name", `%${name}%`)
      .limit(20);
    if (error) throw new Error(`[Storage:searchCompaniesByName] ${error.message}`);
    return keysToCamel<Company[]>(data ?? []);
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    console.warn("[Storage] DEPRECATED: createCompany() — use createCompanyFromDiscovery()");
    return sb<Company>(
      await supabase.from("hak_companies").insert(keysToSnake(company)).select().single(),
      "createCompany"
    );
  }

  async updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company> {
    console.warn("[Storage] DEPRECATED: updateCompany() — use updateCompanyManual()");
    return sb<Company>(
      await supabase
        .from("hak_companies")
        .update({ ...keysToSnake(data), updated_at: nowIso() })
        .eq("id", id)
        .select()
        .single(),
      "updateCompany"
    );
  }

  async deleteCompany(id: number, orgId: string): Promise<void> {
    const { error } = await supabase.from("hak_companies").delete().eq("id", id).eq("org_id", orgId);
    if (error) throw new Error(`[Storage:deleteCompany] ${error.message}`);
  }

  // ── Executives ─────────────────────────────────────────────────────────────

  async getExecutivesByCompany(companyId: number, orgId: string): Promise<Executive[]> {
    const { data, error } = await supabase
      .from("hak_executives")
      .select("*")
      .eq("company_id", companyId)
      .eq("org_id", orgId);
    if (error) throw new Error(`[Storage:getExecutivesByCompany] ${error.message}`);
    return keysToCamel<Executive[]>(data ?? []);
  }

  async getCompanyWithExecutives(id: number, orgId: string): Promise<(Company & { executives: Executive[] }) | undefined> {
    const company = await this.getCompany(id, orgId);
    if (!company) return undefined;
    const execs = await this.getExecutivesByCompany(id, orgId);
    return { ...company, executives: execs };
  }

  async getExecutive(id: number, orgId: string): Promise<Executive | undefined> {
    return sbOpt<Executive>(
      await supabase.from("hak_executives").select("*").eq("id", id).eq("org_id", orgId).maybeSingle(),
      "getExecutive"
    );
  }

  async createExecutive(executive: InsertExecutive): Promise<Executive> {
    console.warn("[Storage] DEPRECATED: createExecutive() — use createExecutiveFromDiscovery()");
    return sb<Executive>(
      await supabase.from("hak_executives").insert(keysToSnake(executive)).select().single(),
      "createExecutive"
    );
  }

  async updateExecutive(id: number, data: Partial<InsertExecutive>): Promise<Executive> {
    console.warn("[Storage] DEPRECATED: updateExecutive() — use updateExecutiveManual()");
    return sb<Executive>(
      await supabase
        .from("hak_executives")
        .update({ ...keysToSnake(data), updated_at: nowIso() })
        .eq("id", id)
        .select()
        .single(),
      "updateExecutive"
    );
  }

  async deleteExecutive(id: number, orgId: string): Promise<void> {
    const { error } = await supabase.from("hak_executives").delete().eq("id", id).eq("org_id", orgId);
    if (error) throw new Error(`[Storage:deleteExecutive] ${error.message}`);
  }

  async createExecutiveFromDiscovery(executive: InsertExecutive, orgId: string): Promise<Executive> {
    const { data: existingRows, error: findErr } = await supabase
      .from("hak_executives")
      .select("*")
      .eq("company_id", executive.companyId)
      .eq("org_id", orgId)
      .ilike("name", executive.name)
      .limit(1);
    if (findErr) throw new Error(`[Storage:createExecutiveFromDiscovery] ${findErr.message}`);

    const existingExec = existingRows?.[0] ? keysToCamel<Executive>(existingRows[0]) : null;

    if (existingExec) {
      console.log(`[Storage:Discovery] Executive "${executive.name}" already exists — checking for non-destructive updates`);
      const manualFields = (existingExec.manuallyEditedFields as string[]) || [];
      const updateData: Record<string, any> = {};
      let updated = false;

      const updatableFields: (keyof InsertExecutive)[] = ["title", "linkedin", "gender", "ethnicity"];
      for (const field of updatableFields) {
        if (manualFields.includes(field as string)) continue;
        const existingValue = (existingExec as any)[field];
        const newValue = executive[field];
        if ((existingValue === null || existingValue === undefined || existingValue === "") &&
            newValue !== null && newValue !== undefined && newValue !== "") {
          updateData[toSnakeKey(field)] = newValue;
          if (field === "gender" && executive.genderConfidence) updateData.gender_confidence = executive.genderConfidence;
          if (field === "ethnicity" && executive.ethnicityConfidence) updateData.ethnicity_confidence = executive.ethnicityConfidence;
          updated = true;
        }
      }

      if (updated) {
        return sb<Executive>(
          await supabase
            .from("hak_executives")
            .update({ ...updateData, updated_at: nowIso() })
            .eq("id", existingExec.id)
            .select()
            .single(),
          "createExecutiveFromDiscovery:update"
        );
      }
      return existingExec;
    }

    console.log(`[Storage:Discovery] Creating executive: ${executive.name}`);
    return sb<Executive>(
      await supabase
        .from("hak_executives")
        .insert(keysToSnake({ ...executive, source: executive.source || "discovery", orgId }))
        .select()
        .single(),
      "createExecutiveFromDiscovery:insert"
    );
  }

  async enrichExecutiveEmptyFields(
    id: number,
    data: Partial<InsertExecutive>,
    orgId: string,
    metadata?: { source: string; confidence: number; clockworkId?: string; clockworkProjectId?: string }
  ): Promise<{ updated: Executive; enrichedFields: string[]; alreadyEnriched: boolean }> {
    const existing = await this.getExecutive(id, orgId);
    if (!existing) throw new Error(`Executive ${id} not found for enrichment`);

    if (metadata?.clockworkId && existing.clockworkId === metadata.clockworkId) {
      console.log(`[Storage:Enrichment] Executive ${id} already enriched with clockworkId ${metadata.clockworkId} — skipping`);
      return { updated: existing, enrichedFields: [], alreadyEnriched: true };
    }
    if (metadata?.clockworkId && existing.clockworkId && existing.clockworkId !== metadata.clockworkId) {
      console.log(`[Storage:Enrichment] Executive ${id} already enriched with different clockworkId — preventing overwrite`);
      return { updated: existing, enrichedFields: [], alreadyEnriched: true };
    }

    const enrichedFields: string[] = [];
    const updateData: Record<string, any> = {};

    const fieldsToCheck: (keyof InsertExecutive)[] = [
      "title", "email", "phone", "linkedin", "profileUrl", "imageUrl",
      "gender", "ethnicity", "notes", "remunerationNotes", "availability", "level",
    ];

    for (const field of fieldsToCheck) {
      const existingValue = (existing as any)[field];
      const newValue = (data as any)[field];
      const existingConfidence = (field === "gender" ? existing.genderConfidence : field === "ethnicity" ? existing.ethnicityConfidence : 0) || 0;
      const newConfidence = metadata?.confidence || 0;

      if (field === "gender" || field === "ethnicity") {
        if ((existingValue === null || existingValue === undefined || existingValue === "") &&
            newValue !== null && newValue !== undefined && newValue !== "") {
          updateData[toSnakeKey(field)] = newValue;
          updateData[toSnakeKey(`${field}Confidence`)] = newConfidence;
          enrichedFields.push(field);
        } else if (newValue !== null && newValue !== undefined && newValue !== "" && newConfidence > existingConfidence) {
          updateData[toSnakeKey(field)] = newValue;
          updateData[toSnakeKey(`${field}Confidence`)] = newConfidence;
          enrichedFields.push(field);
        }
        continue;
      }

      if ((existingValue === null || existingValue === undefined || existingValue === "") &&
          newValue !== null && newValue !== undefined && newValue !== "") {
        updateData[toSnakeKey(field)] = newValue;
        enrichedFields.push(field);
      }
    }

    if (enrichedFields.length === 0 && !metadata) {
      return { updated: existing, enrichedFields: [], alreadyEnriched: false };
    }

    if (metadata) {
      updateData.enrichment_source = metadata.source;
      updateData.enrichment_confidence = metadata.confidence;
      updateData.enrichment_timestamp = nowIso();
      if (metadata.clockworkId) updateData.clockwork_id = metadata.clockworkId;
      if (metadata.clockworkProjectId) updateData.clockwork_project_id = metadata.clockworkProjectId;
    }

    const updated = sb<Executive>(
      await supabase
        .from("hak_executives")
        .update({ ...updateData, updated_at: nowIso() })
        .eq("id", id)
        .eq("org_id", orgId)
        .select()
        .single(),
      "enrichExecutiveEmptyFields"
    );

    console.log(`[Storage:Enrichment] Enriched ${enrichedFields.length} fields for executive ${id}: ${enrichedFields.join(", ")}`);
    return { updated, enrichedFields, alreadyEnriched: false };
  }

  async createExecutiveFromClockwork(
    executive: InsertExecutive,
    metadata: { confidence: number; clockworkId: string; clockworkProjectId?: string },
    orgId: string
  ): Promise<{ executive: Executive; alreadyExists: boolean }> {
    const { data: existing } = await supabase
      .from("hak_executives")
      .select("*")
      .eq("clockwork_id", metadata.clockworkId)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[Storage:Enrichment] Executive with clockworkId ${metadata.clockworkId} already exists — returning existing`);
      return { executive: keysToCamel<Executive>(existing[0]), alreadyExists: true };
    }

    console.log(`[Storage:Enrichment] Creating executive from Clockwork: ${executive.name}`);
    const inserted = sb<Executive>(
      await supabase
        .from("hak_executives")
        .insert(
          keysToSnake({
            ...executive,
            source: "clockwork",
            enrichmentSource: "clockwork",
            enrichmentConfidence: metadata.confidence,
            enrichmentTimestamp: nowIso(),
            clockworkId: metadata.clockworkId,
            clockworkProjectId: metadata.clockworkProjectId || null,
            orgId,
          })
        )
        .select()
        .single(),
      "createExecutiveFromClockwork"
    );
    return { executive: inserted, alreadyExists: false };
  }

  async checkExecutiveClockworkEnrichment(executiveId: number, clockworkId: string, orgId: string): Promise<boolean> {
    const exec = await this.getExecutive(executiveId, orgId);
    return exec?.clockworkId === clockworkId;
  }

  async createExecutiveManual(executive: InsertExecutive, orgId: string): Promise<Executive> {
    console.log(`[Storage:Manual] User creating executive: ${executive.name}`);
    return sb<Executive>(
      await supabase
        .from("hak_executives")
        .insert(keysToSnake({ ...executive, source: "manual", orgId }))
        .select()
        .single(),
      "createExecutiveManual"
    );
  }

  async findExecutiveByNameAndCompany(name: string, companyId: number, orgId: string): Promise<Executive | undefined> {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    const { data } = await supabase
      .from("hak_executives")
      .select("*")
      .eq("company_id", companyId)
      .eq("org_id", orgId)
      .ilike("name", trimmed)
      .limit(1);
    return data?.[0] ? keysToCamel<Executive>(data[0]) : undefined;
  }

  async updateExecutiveManual(id: number, data: Partial<InsertExecutive>, orgId: string): Promise<Executive> {
    console.log(`[Storage:Manual] User editing executive ${id}`);
    const existing = await this.getExecutive(id, orgId);
    const currentManualFields = (existing?.manuallyEditedFields as string[]) || [];
    const editedFieldNames = Object.keys(data).filter(
      (k) => k !== "manuallyEditedFields" && k !== "updatedAt" && k !== "genderConfidence" && k !== "ethnicityConfidence"
    );
    const newManualFields = [...new Set([...currentManualFields, ...editedFieldNames])];
    return sb<Executive>(
      await supabase
        .from("hak_executives")
        .update({ ...keysToSnake(data), manually_edited_fields: newManualFields, updated_at: nowIso() })
        .eq("id", id)
        .eq("org_id", orgId)
        .select()
        .single(),
      "updateExecutiveManual"
    );
  }

  // ── Company layer-aware ────────────────────────────────────────────────────

  async createCompanyFromDiscovery(company: InsertCompany, orgId: string): Promise<Company> {
    console.log(`[Storage:Discovery] Creating company: ${company.name}`);
    return sb<Company>(
      await supabase.from("hak_companies").insert(keysToSnake({ ...company, orgId })).select().single(),
      "createCompanyFromDiscovery"
    );
  }

  async enrichCompanyEmptyFields(
    id: number,
    data: Partial<InsertCompany>,
    orgId: string
  ): Promise<{ updated: Company; enrichedFields: string[] }> {
    const existing = await this.getCompany(id, orgId);
    if (!existing) throw new Error(`Company ${id} not found for enrichment`);

    const enrichedFields: string[] = [];
    const updateData: Record<string, any> = {};
    const fieldsToCheck: (keyof InsertCompany)[] = ["streetAddress", "revenueSource", "employeesSource"];

    for (const field of fieldsToCheck) {
      const existingValue = (existing as any)[field];
      const newValue = (data as any)[field];
      if ((existingValue === null || existingValue === undefined || existingValue === "") &&
          newValue !== null && newValue !== undefined && newValue !== "") {
        updateData[toSnakeKey(field)] = newValue;
        enrichedFields.push(field);
      }
    }

    if (enrichedFields.length === 0) return { updated: existing, enrichedFields: [] };

    const updated = sb<Company>(
      await supabase
        .from("hak_companies")
        .update({ ...updateData, updated_at: nowIso() })
        .eq("id", id)
        .eq("org_id", orgId)
        .select()
        .single(),
      "enrichCompanyEmptyFields"
    );
    return { updated, enrichedFields };
  }

  async createCompanyManual(company: InsertCompany, orgId: string): Promise<Company> {
    console.log(`[Storage:Manual] User creating company: ${company.name}`);
    return sb<Company>(
      await supabase.from("hak_companies").insert(keysToSnake({ ...company, orgId })).select().single(),
      "createCompanyManual"
    );
  }

  async updateCompanyManual(id: number, data: Partial<InsertCompany>, orgId: string): Promise<Company> {
    console.log(`[Storage:Manual] User editing company ${id}`);
    const existing = await this.getCompany(id, orgId);
    const currentManualFields = (existing?.manuallyEditedFields as string[]) || [];
    const editedFieldNames = Object.keys(data).filter(
      (k) => k !== "manuallyEditedFields" && k !== "dataProvenance" && k !== "updatedAt"
    );
    const newManualFields = [...new Set([...currentManualFields, ...editedFieldNames])];
    return sb<Company>(
      await supabase
        .from("hak_companies")
        .update({ ...keysToSnake(data), manually_edited_fields: newManualFields, updated_at: nowIso() })
        .eq("id", id)
        .eq("org_id", orgId)
        .select()
        .single(),
      "updateCompanyManual"
    );
  }

  async findCompanyByNameAndQuery(name: string, searchQueryId: number, orgId: string): Promise<Company | undefined> {
    const { data } = await supabase
      .from("hak_companies")
      .select("*")
      .eq("search_query_id", searchQueryId)
      .eq("org_id", orgId)
      .ilike("name", name)
      .limit(1);
    return data?.[0] ? keysToCamel<Company>(data[0]) : undefined;
  }

  async logPipelineDecision(log: InsertPipelineLog): Promise<void> {
    try {
      const { error } = await supabase.from("hak_pipeline_log").insert(keysToSnake(log));
      if (error) console.warn("[Storage] Failed to log pipeline decision:", error.message);
    } catch (e) {
      console.warn("[Storage] Failed to log pipeline decision:", e);
    }
  }

  async upsertCompanyNonDestructive(
    company: InsertCompany,
    searchQueryId: number,
    orgId: string,
    fieldConfidences?: Record<string, number>
  ): Promise<{ company: Company; isNew: boolean }> {
    const existing = await this.findCompanyByNameAndQuery(company.name, searchQueryId, orgId);

    if (existing) {
      const manualFields = (existing.manuallyEditedFields as string[]) || [];
      const existingProvenance = (existing.dataProvenance as Record<string, any>) || {};
      const patchData: Record<string, any> = {};
      const newProvenance = { ...existingProvenance };

      const dbConfidenceFields: Record<string, string> = {
        revenue: "revenueConfidence",
        employees: "employeesConfidence",
      };

      for (const [key, value] of Object.entries(company)) {
        if (key === "manuallyEditedFields" || key === "dataProvenance") continue;
        if (value === null || value === undefined || value === "") continue;
        if (manualFields.includes(key)) {
          await this.logPipelineDecision({
            companyName: company.name,
            fieldName: key,
            oldValue: String((existing as any)[key] ?? ""),
            newValue: String(value),
            decision: "skipped",
            reason: "field is manually edited — sacred",
            searchQueryId,
          });
          continue;
        }

        const existingValue = (existing as any)[key];
        const newConfidence = fieldConfidences?.[key] ?? 5;
        let existingConfidence = 0;
        if (dbConfidenceFields[key]) {
          existingConfidence = (existing as any)[dbConfidenceFields[key]] ?? 0;
        } else {
          const provenanceEntry = existingProvenance[key];
          if (provenanceEntry && typeof provenanceEntry.confidence === "number") {
            existingConfidence = provenanceEntry.confidence;
          }
        }

        if (existingValue === null || existingValue === undefined || existingValue === "") {
          patchData[toSnakeKey(key)] = value;
          newProvenance[key] = { value: String(value), confidence: newConfidence, updatedAt: nowIso(), source: "pipeline" };
          await this.logPipelineDecision({ companyName: company.name, fieldName: key, oldValue: null, newValue: String(value), decision: "updated", reason: "existing field was null — filled", searchQueryId });
        } else if (newConfidence > existingConfidence) {
          patchData[toSnakeKey(key)] = value;
          const history = existingProvenance[key]?.history || [];
          history.push({ value: String(existingValue), confidence: existingConfidence, replacedAt: nowIso() });
          newProvenance[key] = { value: String(value), confidence: newConfidence, updatedAt: nowIso(), source: "pipeline", history };
          await this.logPipelineDecision({ companyName: company.name, fieldName: key, oldValue: String(existingValue), newValue: String(value), decision: "updated", reason: `new confidence ${newConfidence} > existing confidence ${existingConfidence}`, searchQueryId });
        } else if (existingValue !== null && existingValue !== undefined && existingValue !== "") {
          await this.logPipelineDecision({ companyName: company.name, fieldName: key, oldValue: String(existingValue), newValue: String(value), decision: "kept", reason: `existing confidence ${existingConfidence} >= new confidence ${newConfidence}`, searchQueryId });
        }
      }

      if (Object.keys(patchData).length > 0) {
        patchData.data_provenance = newProvenance;
        const updated = sb<Company>(
          await supabase
            .from("hak_companies")
            .update({ ...patchData, updated_at: nowIso() })
            .eq("id", existing.id)
            .eq("org_id", orgId)
            .select()
            .single(),
          "upsertCompanyNonDestructive:update"
        );
        return { company: updated, isNew: false };
      }
      return { company: existing, isNew: false };
    }

    console.log(`[Storage:NonDestructive] Creating new company: "${company.name}"`);
    const provenance: Record<string, any> = {};
    for (const [key, value] of Object.entries(company)) {
      if (value !== null && value !== undefined && value !== "" && key !== "manuallyEditedFields" && key !== "dataProvenance") {
        provenance[key] = { value: String(value), confidence: fieldConfidences?.[key] ?? 5, updatedAt: nowIso(), source: "pipeline" };
      }
    }
    const newCompany = sb<Company>(
      await supabase
        .from("hak_companies")
        .insert(keysToSnake({ ...company, searchQueryId, orgId, dataProvenance: provenance }))
        .select()
        .single(),
      "upsertCompanyNonDestructive:insert"
    );
    return { company: newCompany, isNew: true };
  }

  // ── Search Queries ─────────────────────────────────────────────────────────

  async getAllSearchQueries(orgId: string): Promise<SearchQuery[]> {
    const { data, error } = await supabase
      .from("hak_search_queries")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`[Storage:getAllSearchQueries] ${error.message}`);
    return keysToCamel<SearchQuery[]>(data ?? []);
  }

  async getSearchQuery(id: number, orgId: string): Promise<SearchQuery | undefined> {
    return sbOpt<SearchQuery>(
      await supabase.from("hak_search_queries").select("*").eq("id", id).eq("org_id", orgId).maybeSingle(),
      "getSearchQuery"
    );
  }

  async getSearchQueryByUniqueKey(uniqueKey: string, orgId: string): Promise<SearchQuery | undefined> {
    const { data, error } = await supabase
      .from("hak_search_queries")
      .select("*")
      .eq("unique_key", uniqueKey)
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(`[Storage:getSearchQueryByUniqueKey] ${error.message}`);
    if (!data || data.length === 0) return undefined;
    return keysToCamel<SearchQuery>(data[0]);
  }

  async createSearchQuery(query: InsertSearchQuery): Promise<SearchQuery> {
    return sb<SearchQuery>(
      await supabase.from("hak_search_queries").insert(keysToSnake(query)).select().single(),
      "createSearchQuery"
    );
  }

  async upsertSearchQuery(query: InsertSearchQuery): Promise<SearchQuery> {
    const existing = query.orgId
      ? await this.getSearchQueryByUniqueKey(query.uniqueKey, query.orgId)
      : undefined;
    if (existing) {
      return sb<SearchQuery>(
        await supabase
          .from("hak_search_queries")
          .update({
            query: query.query,
            parsed_criteria: keysToSnake(query.parsedCriteria),
            result_count: query.resultCount || 0,
            ...(query.status !== undefined ? { status: query.status } : {}),
            ...(query.selectedCount !== undefined ? { selected_count: query.selectedCount } : {}),
            updated_at: nowIso(),
          })
          .eq("id", existing.id)
          .select()
          .single(),
        "upsertSearchQuery:update"
      );
    }
    return this.createSearchQuery(query);
  }

  async updateSearchQueryResultCount(id: number, count: number, orgId: string): Promise<void> {
    const { error } = await supabase
      .from("hak_search_queries")
      .update({ result_count: count, updated_at: nowIso() })
      .eq("id", id)
      .eq("org_id", orgId);
    if (error) throw new Error(`[Storage:updateSearchQueryResultCount] ${error.message}`);
  }

  async updateSearchQueryName(id: number, name: string, orgId: string): Promise<SearchQuery> {
    return sb<SearchQuery>(
      await supabase
        .from("hak_search_queries")
        .update({ query: name, updated_at: nowIso() })
        .eq("id", id)
        .eq("org_id", orgId)
        .select()
        .single(),
      "updateSearchQueryName"
    );
  }

  async updateSearchQueryDraft(id: number, fields: { selectedCount?: number; query?: string }, orgId: string): Promise<SearchQuery> {
    return sb<SearchQuery>(
      await supabase
        .from("hak_search_queries")
        .update({
          ...(fields.selectedCount !== undefined ? { selected_count: fields.selectedCount } : {}),
          ...(fields.query !== undefined ? { query: fields.query } : {}),
          updated_at: nowIso(),
        })
        .eq("id", id)
        .eq("org_id", orgId)
        .select()
        .single(),
      "updateSearchQueryDraft"
    );
  }

  async updateSearchQueryStatus(id: number, status: string, selectedCount: number | undefined, orgId: string): Promise<SearchQuery> {
    return sb<SearchQuery>(
      await supabase
        .from("hak_search_queries")
        .update({
          status,
          ...(selectedCount !== undefined ? { selected_count: selectedCount } : {}),
          updated_at: nowIso(),
        })
        .eq("id", id)
        .eq("org_id", orgId)
        .select()
        .single(),
      "updateSearchQueryStatus"
    );
  }

  async updateSearchQueryClockworkProject(id: number, clockworkProjectId: string, orgId: string): Promise<SearchQuery> {
    return sb<SearchQuery>(
      await supabase
        .from("hak_search_queries")
        .update({ clockwork_project_id: clockworkProjectId, updated_at: nowIso() })
        .eq("id", id)
        .eq("org_id", orgId)
        .select()
        .single(),
      "updateSearchQueryClockworkProject"
    );
  }

  async deleteCompaniesBySearchQuery(searchQueryId: number): Promise<void> {
    const { error } = await supabase.from("hak_companies").delete().eq("search_query_id", searchQueryId);
    if (error) throw new Error(`[Storage:deleteCompaniesBySearchQuery] ${error.message}`);
  }

  async deleteNonEnrichedCompaniesBySearchQuery(searchQueryId: number): Promise<number> {
    const { data: allCompanies, error } = await supabase
      .from("hak_companies")
      .select("*")
      .eq("search_query_id", searchQueryId);
    if (error) throw new Error(`[Storage:deleteNonEnrichedCompaniesBySearchQuery] ${error.message}`);

    const companyIds = (allCompanies ?? []).map((c: any) => c.id);
    let companiesWithExecs = new Set<number>();

    if (companyIds.length > 0) {
      const { data: execRows } = await supabase
        .from("hak_executives")
        .select("company_id")
        .in("company_id", companyIds);
      companiesWithExecs = new Set((execRows ?? []).map((r: any) => r.company_id));
    }

    const toDelete: number[] = [];
    for (const c of (allCompanies ?? [])) {
      const hasEnrichmentMarkers = c.revenue_source_url || c.employees_source_url || c.revenue_last_updated || c.employees_last_updated;
      const hasExecutives = companiesWithExecs.has(c.id);
      if (!hasEnrichmentMarkers && !hasExecutives) toDelete.push(c.id);
    }

    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from("hak_companies")
        .delete()
        .eq("search_query_id", searchQueryId)
        .in("id", toDelete);
      if (delErr) throw new Error(`[Storage:deleteNonEnrichedCompaniesBySearchQuery:delete] ${delErr.message}`);
    }

    return (allCompanies?.length ?? 0) - toDelete.length;
  }

  async deleteSearchQuery(id: number, orgId: string): Promise<void> {
    const { error } = await supabase.from("hak_search_queries").delete().eq("id", id).eq("org_id", orgId);
    if (error) throw new Error(`[Storage:deleteSearchQuery] ${error.message}`);
  }

  // Query the enriched company universe with a vocabulary-validated filter.
  // Flexible scored retrieval. A row is a candidate if it matches any *crucial*
  // signal (primary sector, adjacent sector, or sub-tag overlap) — these are
  // OR-combined in the WHERE clause. Soft signals (country, revenue/employee band,
  // listing status) are NOT filtered on; they only feed scoreCompany, which scores
  // each candidate 0..100 on how many query dimensions it satisfied. Results are
  // ordered by that match score (data-quality confidence breaks ties) and sliced
  // to `limit`. This is what lets an over-narrow band stop zeroing out results.
  //
  // Injection: every value placed into the .or() string is vocabulary-validated
  // upstream (primary/adjacent sectors ∈ SECTORS; sub_tags ∈ SUB_TAGS) — all
  // kebab-case tokens with no commas or special chars — so nothing user-derived
  // reaches the query string.
  async queryEnrichedCompanies(
    filter: EnrichedCompanyQuery,
    limit: number,
  ): Promise<EnrichedCompanyMatch[]> {
    const columns =
      "id,company_id,company_name,slug,country,primary_sector,sector_tags,sub_tags,keywords,tagline,business_description,employee_band,employee_count_estimate,revenue_band,revenue_estimate_usd,is_listed,hq_city,confidence,website,phone,email,address";

    const sectorAll = [...filter.primarySectors, ...filter.adjacentSectors];
    const orTerms: string[] = [];
    if (sectorAll.length > 0) orTerms.push(`primary_sector.in.(${sectorAll.join(",")})`);
    if (filter.subTags.length > 0) orTerms.push(`sub_tags.ov.{${filter.subTags.join(",")}}`);
    // No crucial signal at all → nothing meaningful to match. Return empty rather
    // than dumping a full-table confidence sample at score 0. (The isUnmappedFilter
    // gate upstream only fires when the rationale is ALSO the fallback string, so a
    // custom-rationale-but-zero-vocab filter can still reach here.) The caller's
    // rows.length === 0 path then emits search_complete with no results.
    if (orTerms.length === 0) return [];

    // Bounded, quality-biased candidate pool — never scans the whole table.
    const candidatePool = Math.min(500, Math.max(limit * 5, 100));

    const query: any = supabase
      .from("company_enrichment")
      .select(columns)
      .or(orTerms.join(","))
      .order("confidence", { ascending: false })
      .limit(candidatePool);
    const { data, error } = await query;
    if (error) throw new Error(`[Storage:queryEnrichedCompanies] ${error.message}`);

    const rows = keysToCamel<EnrichedCompanyRow[]>(data ?? []);
    return rows
      .map((row): EnrichedCompanyMatch => {
        const scored = scoreCompany(row, filter);
        return { ...row, ...scored };
      })
      .sort((a, b) => b.matchScore - a.matchScore || b.confidence - a.confidence)
      .slice(0, limit);
  }

  async getSearchHistoryWithResults(orgId: string): Promise<Array<SearchQuery & { companyCount: number }>> {
    const all = await this.getAllSearchQueries(orgId);
    const result: Array<SearchQuery & { companyCount: number }> = [];

    for (const q of all) {
      const { count } = await supabase
        .from("hak_companies")
        .select("*", { count: "exact", head: true })
        .eq("search_query_id", q.id);
      result.push({ ...q, companyCount: count ?? 0 });
    }
    return result;
  }

  async getFullSearchResults(searchQueryId: number, orgId: string): Promise<{ searchQuery: SearchQuery; companies: Array<Company & { executives: Executive[] }> } | null> {
    const searchQuery = await this.getSearchQuery(searchQueryId, orgId);
    if (!searchQuery) return null;

    const { data: companiesData } = await supabase
      .from("hak_companies")
      .select("*")
      .eq("search_query_id", searchQueryId);

    const companiesWithExecs: Array<Company & { executives: Executive[] }> = [];
    for (const c of (companiesData ?? [])) {
      const company = keysToCamel<Company>(c);
      const execs = await this.getExecutivesByCompany(company.id, orgId);
      companiesWithExecs.push({ ...company, executives: execs });
    }
    return { searchQuery, companies: companiesWithExecs };
  }

  async saveSatelliteHierarchies(searchQueryId: number, hierarchies: Record<string, Record<string, string>>, orgId: string): Promise<void> {
    const { error } = await supabase
      .from("hak_search_queries")
      .update({ satellite_hierarchies: hierarchies, updated_at: nowIso() })
      .eq("id", searchQueryId)
      .eq("org_id", orgId);
    if (error) throw new Error(`[Storage:saveSatelliteHierarchies] ${error.message}`);
  }

  async saveSatelliteOrders(searchQueryId: number, orders: Record<string, string[]>, orgId: string): Promise<void> {
    const { error } = await supabase
      .from("hak_search_queries")
      .update({ satellite_orders: orders, updated_at: nowIso() })
      .eq("id", searchQueryId)
      .eq("org_id", orgId);
    if (error) throw new Error(`[Storage:saveSatelliteOrders] ${error.message}`);
  }

  async saveTableConfig(searchQueryId: number, config: Record<string, any>, orgId: string): Promise<void> {
    const { error } = await supabase
      .from("hak_search_queries")
      .update({ table_config: config, updated_at: nowIso() })
      .eq("id", searchQueryId)
      .eq("org_id", orgId);
    if (error) throw new Error(`[Storage:saveTableConfig] ${error.message}`);
  }

  async saveMapPositions(searchQueryId: number, positions: Record<string, any>, orgId: string): Promise<void> {
    const { error } = await supabase
      .from("hak_search_queries")
      .update({ map_positions: positions, updated_at: nowIso() })
      .eq("id", searchQueryId)
      .eq("org_id", orgId);
    if (error) throw new Error(`[Storage:saveMapPositions] ${error.message}`);
  }

  // ── Career History ─────────────────────────────────────────────────────────

  async getCareerHistory(executiveId: number): Promise<CareerHistory[]> {
    const { data, error } = await supabase
      .from("hak_career_history")
      .select("*")
      .eq("executive_id", executiveId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(`[Storage:getCareerHistory] ${error.message}`);
    return keysToCamel<CareerHistory[]>(data ?? []);
  }

  async createCareerHistory(entry: InsertCareerHistory): Promise<CareerHistory> {
    return sb<CareerHistory>(
      await supabase.from("hak_career_history").insert(keysToSnake(entry)).select().single(),
      "createCareerHistory"
    );
  }

  async updateCareerHistory(id: number, data: Partial<InsertCareerHistory>): Promise<CareerHistory> {
    return sb<CareerHistory>(
      await supabase
        .from("hak_career_history")
        .update({ ...keysToSnake(data), updated_at: nowIso() })
        .eq("id", id)
        .select()
        .single(),
      "updateCareerHistory"
    );
  }

  async deleteCareerHistory(id: number): Promise<void> {
    const { error } = await supabase.from("hak_career_history").delete().eq("id", id);
    if (error) throw new Error(`[Storage:deleteCareerHistory] ${error.message}`);
  }

  // Resolve the owning executive id for a child row, so standalone child routes
  // (which only carry the child id) can org-guard via the parent executive.
  async getCareerHistoryExecutiveId(id: number): Promise<number | undefined> {
    const { data } = await supabase.from("hak_career_history").select("executive_id").eq("id", id).maybeSingle();
    return (data as any)?.executive_id ?? undefined;
  }

  // ── Education ──────────────────────────────────────────────────────────────

  async getEducation(executiveId: number): Promise<Education[]> {
    const { data, error } = await supabase
      .from("hak_education")
      .select("*")
      .eq("executive_id", executiveId)
      .order("graduation_year", { ascending: false });
    if (error) throw new Error(`[Storage:getEducation] ${error.message}`);
    return keysToCamel<Education[]>(data ?? []);
  }

  async createEducation(entry: InsertEducation): Promise<Education> {
    return sb<Education>(
      await supabase.from("hak_education").insert(keysToSnake(entry)).select().single(),
      "createEducation"
    );
  }

  async updateEducation(id: number, data: Partial<InsertEducation>): Promise<Education> {
    return sb<Education>(
      await supabase
        .from("hak_education")
        .update({ ...keysToSnake(data), updated_at: nowIso() })
        .eq("id", id)
        .select()
        .single(),
      "updateEducation"
    );
  }

  async deleteEducation(id: number): Promise<void> {
    const { error } = await supabase.from("hak_education").delete().eq("id", id);
    if (error) throw new Error(`[Storage:deleteEducation] ${error.message}`);
  }

  async getEducationExecutiveId(id: number): Promise<number | undefined> {
    const { data } = await supabase.from("hak_education").select("executive_id").eq("id", id).maybeSingle();
    return (data as any)?.executive_id ?? undefined;
  }

  // ── Remuneration ───────────────────────────────────────────────────────────

  async getRemuneration(executiveId: number): Promise<Remuneration[]> {
    const { data, error } = await supabase
      .from("hak_remuneration")
      .select("*")
      .eq("executive_id", executiveId)
      .order("year", { ascending: false });
    if (error) throw new Error(`[Storage:getRemuneration] ${error.message}`);
    return keysToCamel<Remuneration[]>(data ?? []);
  }

  async createRemuneration(entry: InsertRemuneration): Promise<Remuneration> {
    return sb<Remuneration>(
      await supabase.from("hak_remuneration").insert(keysToSnake(entry)).select().single(),
      "createRemuneration"
    );
  }

  async updateRemuneration(id: number, data: Partial<InsertRemuneration>): Promise<Remuneration> {
    return sb<Remuneration>(
      await supabase
        .from("hak_remuneration")
        .update({ ...keysToSnake(data), updated_at: nowIso() })
        .eq("id", id)
        .select()
        .single(),
      "updateRemuneration"
    );
  }

  async deleteRemuneration(id: number): Promise<void> {
    const { error } = await supabase.from("hak_remuneration").delete().eq("id", id);
    if (error) throw new Error(`[Storage:deleteRemuneration] ${error.message}`);
  }

  async getRemunerationExecutiveId(id: number): Promise<number | undefined> {
    const { data } = await supabase.from("hak_remuneration").select("executive_id").eq("id", id).maybeSingle();
    return (data as any)?.executive_id ?? undefined;
  }

  async deleteRemunerationByExecutive(executiveId: number): Promise<void> {
    const { error } = await supabase.from("hak_remuneration").delete().eq("executive_id", executiveId);
    if (error) throw new Error(`[Storage:deleteRemunerationByExecutive] ${error.message}`);
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async getExecutiveNotes(executiveId: number): Promise<ExecutiveNotes | undefined> {
    return sbOpt<ExecutiveNotes>(
      await supabase.from("hak_executive_notes").select("*").eq("executive_id", executiveId).maybeSingle(),
      "getExecutiveNotes"
    );
  }

  async upsertExecutiveNotes(executiveId: number, content: string): Promise<ExecutiveNotes> {
    const existing = await this.getExecutiveNotes(executiveId);
    if (existing) {
      return sb<ExecutiveNotes>(
        await supabase
          .from("hak_executive_notes")
          .update({ content, updated_at: nowIso() })
          .eq("id", existing.id)
          .select()
          .single(),
        "upsertExecutiveNotes:update"
      );
    }
    return sb<ExecutiveNotes>(
      await supabase.from("hak_executive_notes").insert({ executive_id: executiveId, content }).select().single(),
      "upsertExecutiveNotes:insert"
    );
  }

  async getCompanyNotes(companyId: number): Promise<CompanyNotes | undefined> {
    return sbOpt<CompanyNotes>(
      await supabase.from("hak_company_notes").select("*").eq("company_id", companyId).maybeSingle(),
      "getCompanyNotes"
    );
  }

  async upsertCompanyNotes(companyId: number, content: string): Promise<CompanyNotes> {
    const existing = await this.getCompanyNotes(companyId);
    if (existing) {
      return sb<CompanyNotes>(
        await supabase
          .from("hak_company_notes")
          .update({ content, updated_at: nowIso() })
          .eq("id", existing.id)
          .select()
          .single(),
        "upsertCompanyNotes:update"
      );
    }
    return sb<CompanyNotes>(
      await supabase.from("hak_company_notes").insert({ company_id: companyId, content }).select().single(),
      "upsertCompanyNotes:insert"
    );
  }

  // ── Executive Details ──────────────────────────────────────────────────────

  async getExecutiveDetails(executiveId: number, orgId: string): Promise<{
    executive: Executive;
    company: Company | undefined;
    careerHistory: CareerHistory[];
    education: Education[];
    remuneration: Remuneration[];
    notes: ExecutiveNotes | undefined;
  } | null> {
    const executive = await this.getExecutive(executiveId, orgId);
    if (!executive) return null;

    const [company, careerHistoryData, educationData, remunerationData, notesData] = await Promise.all([
      this.getCompany(executive.companyId, orgId),
      this.getCareerHistory(executiveId),
      this.getEducation(executiveId),
      this.getRemuneration(executiveId),
      this.getExecutiveNotes(executiveId),
    ]);

    return { executive, company, careerHistory: careerHistoryData, education: educationData, remuneration: remunerationData, notes: notesData };
  }

  // ── Search Results ─────────────────────────────────────────────────────────

  async getSearchResultsByQuery(searchQueryId: number): Promise<SearchResult[]> {
    const { data, error } = await supabase
      .from("hak_search_results")
      .select("*")
      .eq("search_query_id", searchQueryId);
    if (error) throw new Error(`[Storage:getSearchResultsByQuery] ${error.message}`);
    return keysToCamel<SearchResult[]>(data ?? []);
  }

  async getSearchResultsByCompany(companyId: number): Promise<SearchResult[]> {
    const { data, error } = await supabase
      .from("hak_search_results")
      .select("*")
      .eq("company_id", companyId);
    if (error) throw new Error(`[Storage:getSearchResultsByCompany] ${error.message}`);
    return keysToCamel<SearchResult[]>(data ?? []);
  }

  async createSearchResult(result: InsertSearchResult): Promise<SearchResult> {
    return sb<SearchResult>(
      await supabase.from("hak_search_results").insert(keysToSnake(result)).select().single(),
      "createSearchResult"
    );
  }

  async createSearchResults(results: InsertSearchResult[]): Promise<SearchResult[]> {
    if (results.length === 0) return [];
    const { data, error } = await supabase
      .from("hak_search_results")
      .insert(results.map(keysToSnake))
      .select();
    if (error) throw new Error(`[Storage:createSearchResults] ${error.message}`);
    return keysToCamel<SearchResult[]>(data ?? []);
  }

  async updateSearchResultCompanyLink(id: number, companyId: number): Promise<SearchResult> {
    return sb<SearchResult>(
      await supabase
        .from("hak_search_results")
        .update({ company_id: companyId })
        .eq("id", id)
        .select()
        .single(),
      "updateSearchResultCompanyLink"
    );
  }

  // ── Search Sessions ────────────────────────────────────────────────────────

  async createSearchSession(session: {
    id: string;
    rawQuery: string;
    pdContent?: string;
    pdConfidential?: boolean;
    userId?: string;
  }): Promise<void> {
    const existing = await this.getSearchSession(session.id);

    if (existing) {
      // Non-destructive update: preserve existing pdContent and pdConfidential
      const updates: Record<string, any> = { updated_at: nowIso() };
      if (session.rawQuery) updates.raw_query = session.rawQuery;
      if (session.pdContent != null) updates.pd_content = session.pdContent;
      if (session.pdConfidential != null && !existing.pdConfidential) {
        updates.pd_confidential = session.pdConfidential;
      }
      const { error } = await supabase.from("hak_search_sessions").update(updates).eq("id", session.id);
      if (error) throw new Error(`[Storage:createSearchSession:update] ${error.message}`);
    } else {
      const { error } = await supabase.from("hak_search_sessions").insert({
        id: session.id,
        raw_query: session.rawQuery,
        pd_content: session.pdContent || null,
        pd_confidential: session.pdConfidential ?? false,
        status: "pending",
        refinement_history: [],
        user_id: session.userId || null,
      });
      if (error) throw new Error(`[Storage:createSearchSession:insert] ${error.message}`);
    }
  }

  async updateSearchSession(
    id: string,
    data: {
      status?: string;
      inferredIntent?: any;
      searchQueryId?: number;
      refinementHistory?: any[];
      pdContent?: string;
      pdConfidential?: boolean;
    }
  ): Promise<void> {
    const updates: Record<string, any> = { updated_at: nowIso() };
    if (data.status !== undefined) updates.status = data.status;
    if (data.inferredIntent !== undefined) updates.inferred_intent = data.inferredIntent;
    if (data.searchQueryId !== undefined) updates.search_query_id = data.searchQueryId;
    if (data.refinementHistory !== undefined) updates.refinement_history = data.refinementHistory;
    if (data.pdContent !== undefined) updates.pd_content = data.pdContent;
    if (data.pdConfidential !== undefined) updates.pd_confidential = data.pdConfidential;
    const { error } = await supabase.from("hak_search_sessions").update(updates).eq("id", id);
    if (error) throw new Error(`[Storage:updateSearchSession] ${error.message}`);
  }

  async getSearchSession(id: string): Promise<{
    id: string;
    rawQuery: string;
    pdContent: string | null;
    pdConfidential: boolean;
    inferredIntent: any;
    status: string;
    searchQueryId: number | null;
    refinementHistory: any[];
  } | undefined> {
    const { data, error } = await supabase
      .from("hak_search_sessions")
      .select("*")
      .eq("id", id)
      .single();
    if (error && error.code !== "PGRST116") throw new Error(`[Storage:getSearchSession] ${error.message}`);
    if (!data) return undefined;
    return {
      id: data.id,
      rawQuery: data.raw_query,
      pdContent: data.pd_content ?? null,
      pdConfidential: data.pd_confidential ?? false,
      inferredIntent: data.inferred_intent,
      status: data.status,
      searchQueryId: data.search_query_id || null,
      refinementHistory: (data.refinement_history as any[]) || [],
    };
  }

  // ── Organizations & membership ───────────────────────────────────────────────

  async getOrgBySlug(slug: string): Promise<Organization | undefined> {
    return sbOpt<Organization>(
      await supabase.from("hak_organizations").select("*").eq("slug", slug).maybeSingle(),
      "getOrgBySlug"
    );
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    return sbOpt<Organization>(
      await supabase.from("hak_organizations").select("*").eq("id", id).maybeSingle(),
      "getOrganization"
    );
  }

  async createOrganization(org: InsertOrganization): Promise<Organization> {
    return sb<Organization>(
      await supabase.from("hak_organizations").insert(keysToSnake(org)).select().single(),
      "createOrganization"
    );
  }

  async createOrgMember(member: InsertOrgMember): Promise<OrgMember> {
    return sb<OrgMember>(
      await supabase.from("hak_org_members").insert(keysToSnake(member)).select().single(),
      "createOrgMember"
    );
  }

  // First membership for a user (one org per user this session).
  async getOrgMembershipByUser(userId: string): Promise<OrgMember | undefined> {
    return sbOpt<OrgMember>(
      await supabase
        .from("hak_org_members")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      "getOrgMembershipByUser"
    );
  }

  async updateOrganization(orgId: string, fields: Partial<InsertOrganization>): Promise<Organization> {
    return sb<Organization>(
      await supabase
        .from("hak_organizations")
        .update({ ...keysToSnake(fields), updated_at: nowIso() })
        .eq("id", orgId)
        .select()
        .single(),
      "updateOrganization"
    );
  }

  // ── User profiles ────────────────────────────────────────────────────────────

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    return sbOpt<UserProfile>(
      await supabase.from("hak_user_profiles").select("*").eq("user_id", userId).maybeSingle(),
      "getUserProfile"
    );
  }

  // Insert-or-update the caller's own profile row.
  async upsertUserProfile(userId: string, fields: Partial<InsertUserProfile>): Promise<UserProfile> {
    const existing = await this.getUserProfile(userId);
    if (existing) {
      return sb<UserProfile>(
        await supabase
          .from("hak_user_profiles")
          .update({ ...keysToSnake(fields), updated_at: nowIso() })
          .eq("user_id", userId)
          .select()
          .single(),
        "upsertUserProfile:update"
      );
    }
    return sb<UserProfile>(
      await supabase
        .from("hak_user_profiles")
        .insert(keysToSnake({ ...fields, userId }))
        .select()
        .single(),
      "upsertUserProfile:insert"
    );
  }

  // ── Members (admin views) ────────────────────────────────────────────────────

  // Members of an org joined with each user's profile (name/title/avatar).
  async getOrgMembers(orgId: string): Promise<Array<OrgMember & { profile: UserProfile | null }>> {
    const members = keysToCamel<OrgMember[]>(
      sb<any[]>(
        await supabase.from("hak_org_members").select("*").eq("org_id", orgId).order("created_at", { ascending: true }),
        "getOrgMembers"
      )
    );
    const userIds = members.map((m) => m.userId);
    let profilesByUser = new Map<string, UserProfile>();
    if (userIds.length > 0) {
      const { data } = await supabase.from("hak_user_profiles").select("*").in("user_id", userIds);
      for (const p of keysToCamel<UserProfile[]>(data ?? [])) profilesByUser.set(p.userId, p);
    }
    return members.map((m) => ({ ...m, profile: profilesByUser.get(m.userId) ?? null }));
  }

  async getOrgMemberById(memberId: string, orgId: string): Promise<OrgMember | undefined> {
    return sbOpt<OrgMember>(
      await supabase.from("hak_org_members").select("*").eq("id", memberId).eq("org_id", orgId).maybeSingle(),
      "getOrgMemberById"
    );
  }

  async updateOrgMemberRole(memberId: string, orgId: string, role: string): Promise<OrgMember> {
    return sb<OrgMember>(
      await supabase
        .from("hak_org_members")
        .update({ role })
        .eq("id", memberId)
        .eq("org_id", orgId)
        .select()
        .single(),
      "updateOrgMemberRole"
    );
  }

  async deleteOrgMember(memberId: string, orgId: string): Promise<void> {
    const { error } = await supabase.from("hak_org_members").delete().eq("id", memberId).eq("org_id", orgId);
    if (error) throw new Error(`[Storage:deleteOrgMember] ${error.message}`);
  }

  async countOrgOwners(orgId: string): Promise<number> {
    const { count, error } = await supabase
      .from("hak_org_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("role", "owner");
    if (error) throw new Error(`[Storage:countOrgOwners] ${error.message}`);
    return count ?? 0;
  }

  // ── Login activity ───────────────────────────────────────────────────────────

  // Record a sign-in event and bump the member's last_login_at.
  async recordLoginEvent(event: InsertLoginEvent): Promise<void> {
    const { error } = await supabase.from("hak_login_events").insert(keysToSnake(event));
    if (error) throw new Error(`[Storage:recordLoginEvent] ${error.message}`);
    if (event.orgId) {
      await supabase
        .from("hak_org_members")
        .update({ last_login_at: nowIso() })
        .eq("user_id", event.userId)
        .eq("org_id", event.orgId);
    }
  }

  async getLoginEvents(userId: string, limit = 10): Promise<LoginEvent[]> {
    const { data, error } = await supabase
      .from("hak_login_events")
      .select("*")
      .eq("user_id", userId)
      .order("at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`[Storage:getLoginEvents] ${error.message}`);
    return keysToCamel<LoginEvent[]>(data ?? []);
  }
}

export const storage = new DatabaseStorage();
