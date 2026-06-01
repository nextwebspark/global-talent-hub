import { getLLMClient } from "../llmClient";
import { storage } from "../../storage";
import { validateLlmResponse } from "../postLlmValidation";
import { validateQuery, validateResults } from "../queryValidation";
import { normalizeOrInferSector } from "../sectorInference";
import { DEFAULT_MODEL, FALLBACK_MODELS, getApprovedModel } from "./models";
import { parseOpenRouterError } from "./modelTesting";
import { getUniqueCoordinates, resetCoordinateTracking } from "./geo";
import { validateCompanyData } from "./normalize";
import { validateExecutiveData, extractJSON } from "./validate";
import { SearchCriteria } from "./queryParser";
import { WORLD_CLASS_SEARCH_PROMPT } from "./prompts";

export async function* discoverCompaniesStreaming(
  criteria: SearchCriteria,
  searchQueryId: number,
  selectedModel: string = DEFAULT_MODEL,
  originalQuery: string
): AsyncGenerator<{ type: 'company' | 'status' | 'error' | 'complete', data: any }> {
  if (!originalQuery || originalQuery.trim().length === 0) {
    yield { type: 'error', data: { message: 'Original query is required for accurate search results' } };
    return;
  }

  const limit = criteria.limit || 10;
  const query = originalQuery.trim();

  // ========== QUERY VALIDATION ==========
  // Validate query against edge cases before processing
  const queryValidation = validateQuery(query);

  console.log(`[Discovery] Query validation result: type=${queryValidation.classification.type}, risk=${queryValidation.overallRisk}`);

  if (queryValidation.warnings.length > 0) {
    console.log(`[Discovery] Query warnings: ${queryValidation.warnings.join('; ')}`);
  }

  // Yield warnings to frontend for user awareness
  if (queryValidation.overallRisk === 'high') {
    yield {
      type: 'status',
      data: {
        message: `High-risk query detected: ${queryValidation.warnings[0] || 'Results may have reduced confidence'}`,
        progress: 2,
        warning: true
      }
    };
  }
  // ========== END QUERY VALIDATION ==========

  const client = await getLLMClient();

  // ========== ENFORCE APPROVED MODELS ==========
  // CRITICAL: Only approved models can be used for discovery
  const modelValidation = getApprovedModel(selectedModel || DEFAULT_MODEL);
  const baseModel = modelValidation.model;

  // ========== DISCOVERY STATUS TRACKING ==========
  // Track degradation conditions throughout the discovery process
  const degradationReasons: string[] = [];
  let discoveryStatus: 'complete' | 'partial' | 'degraded' = 'complete';

  if (modelValidation.wasOverridden) {
    console.warn(`[Discovery Streaming] ${modelValidation.reason}`);
    yield { type: 'status', data: { message: `Using approved model: ${baseModel}`, progress: 2 } };
    degradationReasons.push('Non-approved model overridden');
    discoveryStatus = 'degraded';
  }
  // ========== END MODEL ENFORCEMENT ==========

  const modelName = baseModel;

  console.log(`[Discovery Streaming] Starting for ${limit} companies with model: ${modelName}`);
  console.log(`[Discovery Streaming] Original query: "${query}"`);

  yield { type: 'status', data: { message: 'Searching the web for companies...', progress: 5 } };

  const messages = [
    {
      role: "system" as const,
      content: WORLD_CLASS_SEARCH_PROMPT
    },
    {
      role: "user" as const,
      content: `USER SEARCH QUERY: "${query}"

Find exactly ${limit} companies that match this query.

IMPORTANT:
- Search the web for REAL, currently operating companies
- Read the query carefully for any business type specifications or exclusions
- Each company MUST have a "relevanceReason" explaining WHY it matches the query
- Only include companies that PRECISELY match what was asked for
- Verify company information from their official websites or trusted business directories`
    }
  ];

  // Define structured output schema for consistent company data
  const companySchema = {
    type: "object" as const,
    properties: {
      companies: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            name: { type: "string" as const, description: "Exact legal company name" },
            businessType: {
              type: "string" as const,
              enum: ["distributor", "retailer", "manufacturer", "wholesaler", "service_provider"],
              description: "Primary business type classification"
            },
            relevanceReason: { type: "string" as const, description: "Why this company matches the query" },
            sector: { type: "string" as const, description: "Industry sector" },
            region: { type: "string" as const, description: "Geographic region" },
            country: { type: "string" as const, description: "Country name" },
            city: { type: "string" as const, description: "Headquarters city" },
            streetAddress: { type: "string" as const, description: "Exact street address of headquarters" },
            latitude: { type: "number" as const, description: "GPS latitude of headquarters" },
            longitude: { type: "number" as const, description: "GPS longitude of headquarters" },
            revenue: { type: ["number", "null"] as any, description: "Annual revenue in ORIGINAL CURRENCY. For public companies use official filings; for well-known companies provide industry estimates. ALWAYS provide a number for major banks, utilities, and large corporations. Only set null for truly unknown small/private companies." },
            revenueCurrency: { type: "string" as const, description: "REQUIRED: 3-letter currency code (e.g., 'USD', 'AED', 'SAR', 'EUR'). Use 'USD' if unsure. Must be provided when revenue is provided." },
            revenueFiscalYear: { type: "integer" as const, description: "REQUIRED: Fiscal year of the revenue figure (e.g., 2023, 2024). Use most recent available year." },
            revenueSource: { type: "string" as const, description: "REQUIRED: Source of revenue (e.g., 'Annual Report 2023', 'Industry estimate based on market position'). Explain your reasoning." },
            employees: { type: "integer" as const, description: "Number of employees" },
            employeesSource: { type: "string" as const, description: "Source of employee count" },
            confidence: { type: "integer" as const, minimum: 1, maximum: 10, description: "Data confidence score 1-10" },
            executives: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  name: { type: "string" as const, description: "Executive full name (real person, not a title)" },
                  title: { type: "string" as const, description: "Current job title" },
                  source: { type: "string" as const, description: "Where this info was found" },
                  linkedin: { type: "string" as const, description: "LinkedIn profile URL" },
                  confidence: { type: "integer" as const, minimum: 1, maximum: 10 }
                },
                required: ["name", "title", "source", "confidence"]
              }
            },
            executiveSearchMode: {
              type: "string" as const,
              enum: ["full_leadership", "specific_position", "function_based"],
              description: "Which executive search mode was applied based on query analysis"
            },
            executiveSearchReason: {
              type: "string" as const,
              description: "Why this mode was chosen based on the query"
            }
          },
          required: ["name", "businessType", "relevanceReason", "sector", "country", "latitude", "longitude", "revenue", "revenueCurrency", "revenueFiscalYear", "employees", "confidence", "executiveSearchMode", "executiveSearchReason"]
        }
      }
    },
    required: ["companies"]
  };

  const requestOptions: any = {
    model: modelName,
    messages,
    max_tokens: 8000,
    temperature: 0.1,
    // Structured outputs for consistent JSON
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "company_search_results",
        strict: true,
        schema: companySchema
      }
    },
  };

  yield { type: 'status', data: { message: 'Researching companies...', progress: 15 } };

  let response;
  const usedOnline = false;

  // Helper function to make the API call
  const makeRequest = async () => {
    return client.chat.completions.create(requestOptions);
  };

  // Helper to try a fallback model
  // Note: typed via wrapper object so TypeScript CFA tracks mutations through closures
  const lastFallbackErrorRef: { value: { code: string; message: string; suggestion: string } | null } = { value: null };

  const tryModelWithFallback = async (model: string): Promise<{ response: any; usedOnline: boolean } | null> => {
    try {
      const resp = await client.chat.completions.create({ ...requestOptions, model });
      return { response: resp, usedOnline: false };
    } catch (e1: any) {
      lastFallbackErrorRef.value = parseOpenRouterError(e1);
      console.log(`[Discovery Streaming] ${model} failed: ${lastFallbackErrorRef.value.code}`);
      return null;
    }
  };

  try {
    response = await makeRequest();
  } catch (apiError: any) {
    const parsedError = parseOpenRouterError(apiError);
    console.log(`[Discovery Streaming] First attempt failed: ${parsedError.code} - ${parsedError.message}`);

    let fallbackSuccess = false;
    for (const fallbackModel of FALLBACK_MODELS) {
      if (fallbackModel === baseModel) continue;
      console.log(`[Discovery Streaming] Trying fallback model: ${fallbackModel}`);
      yield { type: 'status', data: { message: `Trying alternative AI model...`, progress: 20 } };
      const fallbackResult = await tryModelWithFallback(fallbackModel);
      if (fallbackResult) {
        response = fallbackResult.response;
        fallbackSuccess = true;
        degradationReasons.push(`Fallback model used: ${fallbackModel}`);
        if (discoveryStatus === 'complete') discoveryStatus = 'degraded';
        break;
      }
    }

    if (!fallbackSuccess) {
      const lastErrMsg = lastFallbackErrorRef.value?.message;
      const lastErrSuggestion = lastFallbackErrorRef.value?.suggestion;
      yield { type: 'error', data: {
        message: lastErrMsg ? `All AI models unavailable. Last error: ${lastErrMsg}` : parsedError.message,
        suggestion: lastErrSuggestion || parsedError.suggestion,
        code: 'ALL_MODELS_FAILED'
      } };
      return;
    }
  }

  console.log(`[Discovery Streaming] API call successful, used online=${usedOnline}`);

  const content = response.choices[0]?.message?.content || "{}";
  console.log("[Discovery Streaming] LLM response received, length:", content.length);

  yield { type: 'status', data: { message: 'Processing results...', progress: 40 } };

  const data = extractJSON(content);
  if (!data) {
    console.error("[Discovery Streaming] Failed to parse LLM response as JSON");
    console.error("[Discovery Streaming] Raw content:", content.substring(0, 500));
    yield { type: 'error', data: { message: 'Failed to parse AI response' } };
    return;
  }

  let companiesData: any[] = [];
  if (Array.isArray(data)) {
    companiesData = data;
  } else if (data.companies && Array.isArray(data.companies)) {
    companiesData = data.companies;
  } else if (data.results && Array.isArray(data.results)) {
    companiesData = data.results;
  } else if (data.data && Array.isArray(data.data)) {
    companiesData = data.data;
  } else {
    const arrayProp = Object.values(data).find(v => Array.isArray(v));
    if (arrayProp) {
      companiesData = arrayProp as any[];
    }
  }

  if (companiesData.length === 0) {
    console.warn("[Discovery Streaming] No companies found in LLM response");
    yield { type: 'complete', data: { total: 0 } };
    return;
  }

  // ========== POST-LLM VALIDATION LAYER ==========
  // Runs AFTER LLM response, BEFORE storage/ranking/display
  // Does NOT generate data - only validates, strips, blocks, or degrades
  yield { type: 'status', data: { message: 'Validating results...', progress: 45 } };

  const postLlmValidation = validateLlmResponse(companiesData, {
    originalQuery: query,
    requestedLimit: limit
  });

  console.log(`[Discovery Streaming] Post-LLM validation summary:`, postLlmValidation.summary);

  // Use validated companies instead of raw data
  let validatedCompaniesData = postLlmValidation.companies;

  if (validatedCompaniesData.length === 0) {
    console.warn("[Discovery Streaming] All companies blocked by post-LLM validation");
    yield { type: 'complete', data: { total: 0, validationSummary: postLlmValidation.summary } };
    return;
  }
  // ========== END POST-LLM VALIDATION LAYER ==========

  // ========== CONFIDENTLY WRONG DETECTION ==========
  // Validate results against query context to detect and block confidently wrong results
  yield { type: 'status', data: { message: 'Checking for data quality issues...', progress: 50 } };

  const resultValidation = validateResults(validatedCompaniesData, queryValidation);
  validatedCompaniesData = resultValidation.companies;

  console.log(`[Discovery Streaming] Result validation: ${resultValidation.totalPassed} passed, ${resultValidation.totalBlocked} blocked, ${resultValidation.totalFlagged} flagged`);

  if (resultValidation.confidenceAdjustments > 0) {
    console.log(`[Discovery Streaming] Applied ${resultValidation.confidenceAdjustments} confidence adjustments based on query risk profile`);
  }

  if (resultValidation.totalBlocked > 0) {
    yield {
      type: 'status',
      data: {
        message: `Removed ${resultValidation.totalBlocked} suspicious results to ensure data quality`,
        progress: 52,
        warning: true
      }
    };
  }
  // ========== END CONFIDENTLY WRONG DETECTION ==========

  console.log(`[Discovery Streaming] Processing ${validatedCompaniesData.length} validated companies`);
  let processed = 0;

  // Reset coordinate tracking for each new search
  resetCoordinateTracking();

  for (const rawCompanyData of validatedCompaniesData) {
    try {
      const validatedData = validateCompanyData(rawCompanyData);

      // Skip null/invalid companies (including Unknown companies)
      if (!validatedData || !validatedData.name || validatedData.name === 'Unknown Company') {
        console.warn("[Discovery Streaming] Skipping company with invalid or Unknown name");
        continue;
      }

      // Get unique coordinates to prevent map marker overlapping
      const uniqueCoords = getUniqueCoordinates(validatedData.latitude, validatedData.longitude);

      // Properly handle null values for numeric fields
      // SQL NULL must be passed as actual null, not the string "null"
      const safeRevenue = validatedData.revenue !== null && validatedData.revenue !== undefined
        ? String(validatedData.revenue)
        : null;
      const safeEmployees = validatedData.employees !== null && validatedData.employees !== undefined
        ? validatedData.employees
        : null;

      // Properly handle null values for FX rate
      const safeFxRate = validatedData.revenueFxRate !== null && validatedData.revenueFxRate !== undefined
        ? String(validatedData.revenueFxRate)
        : null;

      const { sector: normalizedSector, category: normalizedCategory } = await normalizeOrInferSector(validatedData.name, validatedData.sector);
      const company = await storage.createCompanyFromDiscovery({
        name: validatedData.name,
        sector: normalizedSector || validatedData.sector,
        sectorCategory: normalizedCategory || null,
        businessType: validatedData.businessType || null,
        entityType: validatedData.entityType || null,
        isOperatingCompany: validatedData.isOperatingCompany ?? true,
        region: validatedData.region,
        country: validatedData.country,
        streetAddress: validatedData.streetAddress || null,
        latitude: String(uniqueCoords.lat),
        longitude: String(uniqueCoords.lng),
        revenue: safeRevenue,
        revenueSource: validatedData.revenueSource,
        revenueCurrency: validatedData.revenueCurrency || null,
        revenueFiscalYear: validatedData.revenueFiscalYear || null,
        revenueConvertedFromCurrency: validatedData.revenueConvertedFromCurrency || null,
        revenueFxRate: safeFxRate,
        revenueFxPolicy: validatedData.revenueFxPolicy || null,
        employees: safeEmployees,
        employeesSource: validatedData.employeesSource,
        confidence: validatedData.confidence,
        relevanceReason: validatedData.relevanceReason || null,
        color: "#1e3a8a",
        searchQueryId
      });

      const executives = [];
      for (const rawExec of validatedData.executives) {
        try {
          const validatedExec = validateExecutiveData(rawExec);
          if (!validatedExec) continue;

          const executive = await storage.createExecutiveFromDiscovery({
            companyId: company.id,
            name: validatedExec.name,
            title: validatedExec.title,
            email: validatedExec.email,
            linkedin: validatedExec.linkedin,
            profileUrl: validatedExec.profileUrl,
            imageUrl: validatedExec.imageUrl,
            source: validatedExec.source || 'discovery',
            confidence: validatedExec.confidence
          });
          executives.push(executive);
        } catch (execError: any) {
          console.warn("[Discovery Streaming] Failed to create executive:", execError.message);
        }
      }

      processed++;
      const progress = 40 + Math.round((processed / companiesData.length) * 55);

      yield {
        type: 'company',
        data: {
          company: { ...company, executives },
          progress,
          current: processed,
          total: companiesData.length
        }
      };

    } catch (companyError: any) {
      console.warn("[Discovery Streaming] Failed to create company:", companyError.message);
    }
  }

  // Determine final discovery status based on results
  if (processed < limit && processed > 0 && discoveryStatus === 'complete') {
    discoveryStatus = 'partial';
    degradationReasons.push(`Found ${processed} of ${limit} requested companies`);
  }

  console.log(`[Discovery Streaming] Complete: ${processed} companies created, status: ${discoveryStatus}`);
  yield {
    type: 'complete',
    data: {
      total: processed,
      discoveryStatus,
      degradationReasons: degradationReasons.length > 0 ? degradationReasons : undefined
    }
  };
}
