import type { Express } from "express";
import type { Multer } from "multer";
import path from "path";
import { storage } from "../../storage";
import { applyCoordinateFallback } from "../../services/coordinateFallback";
import { parseSearchQuery, generateSearchUniqueKey } from "../../services/discovery";

export function registerSearch(app: Express, deps: { pdUpload: Multer }): void {
  const { pdUpload } = deps;

  // Discovery Layer: Search endpoint using discovery pipeline
  app.post("/api/search", async (req, res) => {
    try {
      const { query, mode: rawMode } = req.body;
      const mode = (rawMode === 'deep' ? 'deep' : 'quick') as 'quick' | 'deep';

      if (!query) {
        return res.status(400).json({ error: "Search query is required" });
      }

      console.log(`[Routes] Processing search (${mode}): "${query}"`);

      // Step 1: Parse query to get limit and criteria (simple heuristic, no LLM)
      const { criteria, interpretation } = await parseSearchQuery(query);

      // Step 2: Generate unique key to prevent duplicate searches
      const uniqueKey = generateSearchUniqueKey(query);
      console.log("[Routes] Generated unique search key:", uniqueKey);

      // Step 3: Persist search query
      const searchQuery = await storage.upsertSearchQuery({
        uniqueKey,
        query,
        parsedCriteria: JSON.stringify(criteria),
        resultCount: 0
      });

      // Step 4: Clear non-enriched companies but preserve enriched ones
      const preserved = await storage.deleteNonEnrichedCompaniesBySearchQuery(searchQuery.id);
      if (preserved > 0) {
        console.log(`[Routes] Preserved ${preserved} enriched companies for search ID:`, searchQuery.id);
      }

      // Step 5: Run discovery pipeline (mock mode: seed_list-backed, Gemini-only for intent)
      const { runDiscoveryPipeline } = await import("../../services/pipeline/discoveryPipeline");

      console.log(`[Routes] Running ${mode} discovery for:`, query);
      let companyCount = 0;
      let discoveryError: string | null = null;
      let discoveryErrorCode: string | null = null;

      for await (const event of runDiscoveryPipeline(query, criteria.limit || 10, searchQuery.id, mode)) {
        if (event.type === 'company') {
          companyCount++;
        } else if (event.type === 'error' && event.data?.message) {
          discoveryError = event.data.message;
          discoveryErrorCode = event.data.code || null;
          console.error(`[Routes] Discovery error (${discoveryErrorCode}): ${discoveryError}`);
        }
      }

      // If we got an error and no companies, return the error
      if (discoveryError && companyCount === 0) {
        const isRateLimit = discoveryErrorCode === 'RATE_LIMIT';
        const statusCode = isRateLimit ? 429 : 500;
        return res.status(statusCode).json({ error: discoveryError });
      }

      console.log(`[Routes] Discovery complete: ${companyCount} companies found`);

      // Step 6: Load full company data with executives from DB (pipeline already persisted)
      const fullResults = await storage.getFullSearchResults(searchQuery.id);
      const results = fullResults?.companies.map(company => {
        const coords = applyCoordinateFallback({
          latitude: company.latitude,
          longitude: company.longitude,
          city: company.region || undefined,
          country: company.country || undefined,
        });
        return {
          ...company,
          latitude: coords.latitude ? String(coords.latitude) : company.latitude,
          longitude: coords.longitude ? String(coords.longitude) : company.longitude,
          executives: company.executives.map(exec => ({ ...exec }))
        };
      }) || [];

      res.json({
        searchQueryId: searchQuery.id,
        query,
        interpretation,
        criteria,
        results
      });
    } catch (error: any) {
      console.error("[Routes] Error processing search:", error);
      res.status(500).json({ error: error.message || "Failed to process search. Please try again." });
    }
  });

  // Streaming search endpoint using Server-Sent Events
  app.get("/api/search/stream", async (req, res) => {
    const query = req.query.query as string;
    const mode = ((req.query.mode as string) === 'deep' ? 'deep' : 'quick') as 'quick' | 'deep';

    if (!query) {
      res.status(400).json({ error: "Search query is required" });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      console.log(`[Routes SSE] Starting streaming search: "${query}"`);

      sendEvent('status', { message: 'Starting search...', progress: 0 });

      // Step 1: Parse the search query (simple heuristic, no LLM)
      const { criteria, interpretation } = await parseSearchQuery(query);
      sendEvent('status', { message: 'Criteria parsed', progress: 10, interpretation });

      // Step 2: Generate unique key
      const uniqueKey = generateSearchUniqueKey(query);

      // Step 3: Persist search query
      const searchQuery = await storage.upsertSearchQuery({
        uniqueKey,
        query,
        parsedCriteria: JSON.stringify(criteria),
        resultCount: 0
      });

      sendEvent('search_created', {
        searchQueryId: searchQuery.id,
        query,
        interpretation,
        criteria
      });

      // Step 4: Clear non-enriched companies but preserve enriched ones
      const preserved = await storage.deleteNonEnrichedCompaniesBySearchQuery(searchQuery.id);
      if (preserved > 0) {
        console.log(`[Routes SSE] Preserved ${preserved} enriched companies for search ID:`, searchQuery.id);
      }

      // ---------------------------------------------------------------
      // Step 5: Run discovery pipeline (streaming progress via SSE)
      // ---------------------------------------------------------------
      let companyCount = 0;

      console.log(`[Routes SSE] Using ${mode} discovery pipeline for: "${query}"`);

      const { runDiscoveryPipeline } = await import("../../services/pipeline/discoveryPipeline");

      sendEvent('status', { message: mode === 'quick' ? 'Generating results...' : 'Searching...', progress: 20 });

      for await (const event of runDiscoveryPipeline(query, criteria.limit || 10, searchQuery.id, mode)) {
        if (event.type === 'company') {
          companyCount++;
          sendEvent('company', { company: event.data });
          sendEvent('status', {
            message: `Found ${companyCount} companies...`,
            progress: Math.min(20 + companyCount * 5, 90)
          });
        } else if (event.type === 'status') {
          sendEvent('status', event.data);
        } else if (event.type === 'executives') {
          sendEvent('executives', event.data);
        } else if (event.type === 'source') {
          sendEvent('source', event.data);
        } else if (event.type === 'error' && event.data?.message) {
          sendEvent('error', event.data);
        }
      }

      await storage.updateSearchQueryResultCount(searchQuery.id, companyCount);
      sendEvent('complete', {
        total: companyCount,
        searchQueryId: searchQuery.id
      });
      // ---------------------------------------------------------------

      console.log(`[Routes SSE] Streaming complete: ${companyCount} companies`);
      res.end();

    } catch (error: any) {
      console.error("[Routes SSE] Error:", error);
      sendEvent('error', { message: error.message || 'Search failed' });
      res.end();
    }
  });

  // ─── PD Upload Endpoint ──────────────────────────────────────────────────────
  app.post("/api/search/upload-pd", (req, res, next) => {
    pdUpload.single("file")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error: "File too large. Maximum allowed size is 10 MB." });
        }
        return res.status(400).json({ error: err.message || "File upload rejected." });
      }
      next();
    });
  }, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      let extractedText = "";

      if (ext === ".pdf") {
        try {
          // pdf-parse ships CommonJS with no @types; use createRequire to get the callable directly
          const { createRequire } = await import("module");
          const require = createRequire(import.meta.url);
          const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
          const data = await pdfParse(req.file.buffer);
          extractedText = data.text.substring(0, 20000);
        } catch (err: any) {
          return res.status(422).json({ error: `Failed to parse PDF: ${err.message}` });
        }
      } else if (ext === ".docx") {
        try {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ buffer: req.file.buffer });
          extractedText = result.value.substring(0, 20000);
        } catch (err: any) {
          return res.status(422).json({ error: `Failed to parse DOCX: ${err.message}` });
        }
      } else if (ext === ".txt") {
        extractedText = req.file.buffer.toString("utf-8").substring(0, 20000);
      } else {
        return res.status(400).json({ error: "Unsupported file type. Use PDF, DOCX, or TXT." });
      }

      if (!extractedText.trim()) {
        return res.status(422).json({ error: "Could not extract text from the file. It may be empty or image-based." });
      }

      // Persist pdContent (and confidentiality flag) to the search session if sessionId provided
      const sessionId = (req.body?.sessionId || req.query?.sessionId) as string | undefined;
      const pdConfidential = req.body?.pdConfidential === 'true';
      if (sessionId) {
        // createSearchSession now uses onConflictDoUpdate for pdContent/pdConfidential
        // so a single call handles both create and re-upload update paths
        try {
          await storage.createSearchSession({ id: sessionId, rawQuery: "", pdContent: extractedText, pdConfidential });
        } catch (sessionErr) {
          console.warn("[Routes] Could not persist PD content to session:", sessionErr);
        }
      }

      res.json({
        filename: req.file.originalname,
        extractedText,
        charCount: extractedText.length,
      });
    } catch (err: any) {
      console.error("[Routes] PD upload error:", err);
      res.status(500).json({ error: err.message || "Upload failed" });
    }
  });

  // ─── Update session confidentiality flag (called when user toggles post-upload) ─
  app.patch("/api/search/session/:sessionId/confidential", async (req, res) => {
    const { sessionId } = req.params;
    const { pdConfidential } = req.body as { pdConfidential: boolean };
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });
    if (typeof pdConfidential !== "boolean") return res.status(400).json({ error: "pdConfidential must be a boolean" });
    try {
      const session = await storage.getSearchSession(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });
      await storage.updateSearchSession(sessionId, { pdConfidential });
      return res.json({ ok: true, pdConfidential });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to update confidentiality" });
    }
  });

  // ─── Enhanced Streaming Search ────────────────────────────────────────────────
  app.get("/api/search/enhanced-stream", async (req, res) => {
    const { query, sessionId } = req.query as Record<string, string>;

    if (!query || !sessionId) {
      res.status(400).json({ error: "query and sessionId are required" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const controller = new AbortController();
    req.on("close", () => controller.abort());

    const sendSSE = (event: string, data: any) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      // Load session to retrieve pdContent and confidentiality flag
      const session = await storage.getSearchSession(sessionId);
      const rawPdContent = session?.pdContent || undefined;
      const pdIsConfidential = session?.pdConfidential === true;

      // Confidentiality enforcement: For confidential PDs, extract only structured search criteria
      // via Claude (Anthropic — private model) and pass ONLY those criteria to the pipeline.
      // Raw PD text is NEVER forwarded to external models (OpenRouter/GPT-4o).
      let pdContent: string | undefined = rawPdContent;
      if (rawPdContent && pdIsConfidential) {
        try {
          const AnthropicSdk = (await import("@anthropic-ai/sdk")).default;
          const anthropicLocal = new AnthropicSdk({ apiKey: process.env.ANTHROPIC_API_KEY });
          const extractMsg = await anthropicLocal.messages.create({
            model: "claude-opus-4-5",
            max_tokens: 400,
            messages: [{
              role: "user",
              content: `Extract only the following from this confidential document — do NOT quote or reproduce any original text:\n- Target industry sectors\n- Target geographies/countries\n- Commercial role type (e.g. distributor, retailer, manufacturer)\n- Company size or revenue range\n- Key inclusion/exclusion criteria\n\nDocument:\n${rawPdContent.slice(0, 2000)}\n\nReturn a 2-3 sentence structured summary of search criteria ONLY.`,
            }],
          });
          const extractedCriteria = extractMsg.content[0]?.type === "text" ? extractMsg.content[0].text : "";
          pdContent = extractedCriteria ? `[Extracted search criteria from confidential document]\n${extractedCriteria}` : undefined;
        } catch {
          // If extraction fails, use no PD context rather than risk leaking raw content
          pdContent = undefined;
        }
      }

      const { parseSearchQuery, generateSearchUniqueKey } = await import("../../services/discovery");
      const { criteria } = await parseSearchQuery(query);
      const uniqueKey = generateSearchUniqueKey(`enhanced:${sessionId}`);
      const searchQuery = await storage.upsertSearchQuery({
        uniqueKey,
        query,
        parsedCriteria: JSON.stringify(criteria),
        resultCount: 0,
      });

      // Ensure session exists in DB — do NOT pass pdContent here (already stored via upload-pd endpoint)
      // Pass rawPdContent (unredacted) if we need to create a new session without a prior PD upload
      await storage.createSearchSession({ id: sessionId, rawQuery: query, pdContent: rawPdContent });
      await storage.updateSearchSession(sessionId, { searchQueryId: searchQuery.id });

      sendSSE("search_created", { searchQueryId: searchQuery.id, query, sessionId });

      // TODO(mock-mode): both first-run + refine currently hit company_seed_list to
      // skip grounded search. Restore runEnhancedSearchPipeline when intent->SQL ships.
      void pdContent;
      const { runSeedListEnhancedStream } = await import("../../services/pipeline/seedListSearch");

      let enrichedCompanyCount = 0;
      for await (const event of runSeedListEnhancedStream(
        query,
        searchQuery.id,
        criteria.limit || 10,
        controller.signal,
        sessionId,
      )) {
        if (controller.signal.aborted) break;
        sendSSE(event.type, { ...event.data, message: event.message, timestamp: event.timestamp });
        if (event.type === 'company_enriched') enrichedCompanyCount++;
        if (event.type === 'search_complete' && event.data?.totalCompanies) {
          enrichedCompanyCount = event.data.totalCompanies;
        }
      }

      if (!controller.signal.aborted) {
        await storage.updateSearchQueryResultCount(searchQuery.id, enrichedCompanyCount);
        sendSSE("done", { searchQueryId: searchQuery.id });
      }
    } catch (err: any) {
      console.error("[Routes] Enhanced stream error:", err);
      if (!res.writableEnded) {
        sendSSE("error", { message: err.message || "Search failed" });
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  });

  // ─── Refinement Endpoint ─────────────────────────────────────────────────────
  app.post("/api/search/refine", async (req, res) => {
    const { sessionId, refinementMessage } = req.body;

    if (!sessionId || !refinementMessage) {
      return res.status(400).json({ error: "sessionId and refinementMessage are required" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const controller = new AbortController();
    req.on("close", () => controller.abort());

    const sendSSE = (event: string, data: any) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      // Load existing intent, PD content, and confidentiality flag from session
      const session = await storage.getSearchSession(sessionId);
      const existingIntent = session?.inferredIntent || null;
      const rawPdContent = session?.pdContent ?? undefined;
      const pdIsConfidential = session?.pdConfidential === true;

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      // Confidentiality enforcement: same logic as enhanced-stream
      // For confidential PDs, extract structured criteria via Anthropic only — never pass raw text to OpenRouter
      let refinementPdContent: string | undefined = rawPdContent;
      if (rawPdContent && pdIsConfidential) {
        try {
          const extractMsg = await anthropic.messages.create({
            model: "claude-opus-4-5",
            max_tokens: 400,
            messages: [{
              role: "user",
              content: `Extract only the following from this confidential document — do NOT quote or reproduce any original text:\n- Target industry sectors\n- Target geographies/countries\n- Commercial role type\n- Company size or revenue range\n- Key inclusion/exclusion criteria\n\nDocument:\n${rawPdContent.slice(0, 2000)}\n\nReturn a 2-3 sentence structured summary of search criteria ONLY.`,
            }],
          });
          const extractedCriteria = extractMsg.content[0]?.type === "text" ? extractMsg.content[0].text : "";
          refinementPdContent = extractedCriteria ? `[Extracted search criteria from confidential document]\n${extractedCriteria}` : undefined;
        } catch {
          refinementPdContent = undefined;
        }
      }

      sendSSE("refinement_started", { message: "Processing refinement..." });

      const existingIntentStr = existingIntent ? JSON.stringify(existingIntent) : "{}";
      const message = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `You are refining a business search query based on user feedback.

ORIGINAL INTENT (from DB):
${existingIntentStr}

USER REFINEMENT: "${refinementMessage}"

Update the search intent based on this refinement — only change what the user specified.
Return JSON:
{
  "primarySectors": [...],
  "adjacentSectors": [...],
  "targetGeographies": [...],
  "commercialRole": "...",
  "searchRationale": "updated rationale",
  "confidenceScore": 0.85,
  "keyInclusions": [...],
  "keyExclusions": [...],
  "refinementSummary": "one sentence describing what changed"
}

Return ONLY JSON.`
        }]
      });

      const content = message.content[0];
      if (content.type !== "text") throw new Error("Unexpected response");

      const parseJsonSafeLocal = (str: string) => {
        let c = str.trim();
        const m = c.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (m) c = m[1].trim();
        const s = c.indexOf("{"); const e = c.lastIndexOf("}");
        if (s !== -1 && e !== -1) c = c.substring(s, e + 1);
        try { return JSON.parse(c); } catch { return null; }
      };

      const parsedUpdate = parseJsonSafeLocal(content.text);
      if (!parsedUpdate) throw new Error("Failed to parse updated intent");

      // Merge updated fields with existing intent to preserve any fields not included in the update
      const updatedIntent = {
        ...existingIntent,
        ...parsedUpdate,
        inferredSectors: parsedUpdate.inferredSectors || existingIntent?.inferredSectors || [],
      };

      // Persist updated intent and refinement history to session
      const history = session?.refinementHistory || [];
      history.push({ message: refinementMessage, timestamp: new Date().toISOString() });
      await storage.updateSearchSession(sessionId, {
        inferredIntent: updatedIntent,
        refinementHistory: history,
        status: "searching",
      });

      // Compute criteria delta — which fields changed between old and new intent
      const changedCriteria: string[] = [];
      const arrDiff = (a: string[] = [], b: string[] = []) =>
        JSON.stringify([...a].sort()) !== JSON.stringify([...b].sort());
      if (arrDiff(existingIntent?.primarySectors, updatedIntent.primarySectors) ||
          arrDiff(existingIntent?.adjacentSectors, updatedIntent.adjacentSectors)) {
        changedCriteria.push("sectors");
      }
      if (arrDiff(existingIntent?.targetGeographies, updatedIntent.targetGeographies)) {
        changedCriteria.push("geographies");
      }
      if (existingIntent?.commercialRole !== updatedIntent.commercialRole) {
        changedCriteria.push("commercialRole");
      }
      if (arrDiff(existingIntent?.keyInclusions, updatedIntent.keyInclusions) ||
          arrDiff(existingIntent?.keyExclusions, updatedIntent.keyExclusions)) {
        changedCriteria.push("filters");
      }
      // If nothing detectably changed, run everything
      if (changedCriteria.length === 0) changedCriteria.push("sectors", "geographies");

      sendSSE("intent_extracted", {
        intent: updatedIntent,
        changedCriteria,
        message: `Refined: ${updatedIntent.refinementSummary || refinementMessage} (targeting: ${changedCriteria.join(", ")})`,
      });

      // TODO(mock-mode): refinement hits company_seed_list — re-enable runEnhancedSearchPipeline
      // when grounded-search path is restored.
      void refinementPdContent;
      void updatedIntent;
      const { runSeedListEnhancedStream } = await import("../../services/pipeline/seedListSearch");
      const { parseSearchQuery, generateSearchUniqueKey } = await import("../../services/discovery");
      const { criteria } = await parseSearchQuery(refinementMessage);
      const uniqueKey = generateSearchUniqueKey(`refined:${sessionId}:${Date.now()}`);
      const searchQuery = await storage.upsertSearchQuery({
        uniqueKey,
        query: refinementMessage,
        parsedCriteria: JSON.stringify(criteria),
        resultCount: 0,
      });

      const targetedQuery = changedCriteria.length < 4
        ? `[Targeted refinement — changed: ${changedCriteria.join(", ")}] ${refinementMessage}`
        : refinementMessage;

      for await (const event of runSeedListEnhancedStream(
        targetedQuery,
        searchQuery.id,
        criteria.limit || 10,
        controller.signal,
        sessionId,
      )) {
        if (controller.signal.aborted) break;
        sendSSE(event.type, { ...event.data, message: event.message, timestamp: event.timestamp });
      }

      sendSSE("done", { message: "Refinement complete" });
    } catch (err: any) {
      console.error("[Routes] Refinement error:", err);
      sendSSE("error", { message: err.message || "Refinement failed" });
    } finally {
      if (!res.writableEnded) res.end();
    }
  });

  // ─── Add selected companies to project from session ───────────────────────
  app.post("/api/search/add-to-project", async (req, res) => {
    try {
      const { companyIds, sessionId, query } = req.body;
      if (!companyIds || !Array.isArray(companyIds)) {
        return res.status(400).json({ error: "companyIds array is required" });
      }
      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required for ownership validation" });
      }

      const { parseSearchQuery, generateSearchUniqueKey } = await import("../../services/discovery");
      const { supabase } = await import("../../supabase");

      // Ownership validation: only allow company IDs that belong to the supplied session (unconditional)
      const { data: sessionCompanies, error: scErr } = await supabase
        .from("hak_companies")
        .select("id")
        .eq("search_session_id", sessionId)
        .in("id", companyIds);
      if (scErr) throw new Error(`Ownership validation failed: ${scErr.message}`);
      const authorisedIds = (sessionCompanies ?? []).map((r: { id: number }) => r.id);
      if (authorisedIds.length !== companyIds.length) {
        console.warn(`[Routes] add-to-project: ${companyIds.length - authorisedIds.length} company IDs rejected (not owned by session ${sessionId})`);
      }

      if (authorisedIds.length === 0) {
        return res.status(400).json({ error: "No valid companies found for the provided session" });
      }

      const { criteria } = await parseSearchQuery(query || "Enhanced Search");
      const uniqueKey = generateSearchUniqueKey(`accepted:${sessionId || Date.now()}`);
      const searchQuery = await storage.upsertSearchQuery({
        uniqueKey,
        query: query || "Enhanced AI Search",
        parsedCriteria: JSON.stringify(criteria),
        resultCount: authorisedIds.length,
      });

      // Re-associate selected companies to this search query
      if (authorisedIds.length > 0) {
        const { error: updateErr } = await supabase
          .from("hak_companies")
          .update({ search_query_id: searchQuery.id })
          .in("id", authorisedIds);
        if (updateErr) throw new Error(`Company reassociation failed: ${updateErr.message}`);
      }

      const savedCompanies = await Promise.all(
        authorisedIds.map(async (id: number) => storage.getCompany(id))
      );
      const validCompanies = savedCompanies.filter(Boolean);

      const executives = await Promise.all(
        validCompanies.map((c) => storage.getExecutivesByCompany(c!.id))
      );
      const totalExecutives = executives.reduce((sum, arr) => sum + arr.length, 0);

      res.json({
        searchQueryId: searchQuery.id,
        companiesAdded: validCompanies.length,
        executivesAdded: totalExecutives,
        companies: validCompanies,
      });
    } catch (err: any) {
      console.error("[Routes] Add to project error:", err);
      res.status(500).json({ error: err.message || "Failed to add to project" });
    }
  });

  app.get("/api/search-history", async (req, res) => {
    try {
      const history = await storage.getSearchHistoryWithResults();
      res.json(history.slice(0, 50));
    } catch (error) {
      console.error("Error fetching search history:", error);
      res.status(500).json({ error: "Failed to fetch search history" });
    }
  });

  app.get("/api/search-history/:id/load", async (req, res) => {
    try {
      const searchId = parseInt(req.params.id);
      if (isNaN(searchId)) {
        return res.status(400).json({ error: "Invalid search ID" });
      }

      const data = await storage.getFullSearchResults(searchId);
      if (!data) {
        return res.status(404).json({ error: "Search results not found" });
      }

      const formattedCompanies = data.companies.map(company => {
        const coords = applyCoordinateFallback({
          latitude: company.latitude,
          longitude: company.longitude,
          city: company.region || undefined,
          country: company.country || undefined,
        });
        return {
          ...company,
          latitude: coords.latitude ? String(coords.latitude) : company.latitude,
          longitude: coords.longitude ? String(coords.longitude) : company.longitude,
          executives: company.executives.map(exec => ({ ...exec }))
        };
      });

      res.json({
        results: formattedCompanies,
        searchQueryId: searchId,
        satelliteHierarchies: data.searchQuery.satelliteHierarchies || {},
        satelliteOrders: data.searchQuery.satelliteOrders || {},
        tableConfig: data.searchQuery.tableConfig || null,
        mapPositions: data.searchQuery.mapPositions || {}
      });
    } catch (error) {
      console.error("Error loading search history:", error);
      res.status(500).json({ error: "Failed to load search history" });
    }
  });

  app.put("/api/search/:id/satellite-hierarchies", async (req, res) => {
    try {
      const searchId = parseInt(req.params.id);
      if (isNaN(searchId)) {
        return res.status(400).json({ error: "Invalid search ID" });
      }
      const hierarchies = req.body.hierarchies;
      if (typeof hierarchies !== 'object' || hierarchies === null) {
        return res.status(400).json({ error: "Invalid hierarchies data" });
      }
      await storage.saveSatelliteHierarchies(searchId, hierarchies);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving satellite hierarchies:", error);
      res.status(500).json({ error: "Failed to save satellite hierarchies" });
    }
  });

  app.put("/api/search/:id/satellite-orders", async (req, res) => {
    try {
      const searchId = parseInt(req.params.id);
      if (isNaN(searchId)) {
        return res.status(400).json({ error: "Invalid search ID" });
      }
      const orders = req.body.orders;
      if (typeof orders !== 'object' || orders === null) {
        return res.status(400).json({ error: "Invalid orders data" });
      }
      await storage.saveSatelliteOrders(searchId, orders);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving satellite orders:", error);
      res.status(500).json({ error: "Failed to save satellite orders" });
    }
  });

  app.put("/api/search/:id/map-positions", async (req, res) => {
    try {
      const searchId = parseInt(req.params.id);
      if (isNaN(searchId)) {
        return res.status(400).json({ error: "Invalid search ID" });
      }
      const positions = req.body.positions;
      if (typeof positions !== 'object' || positions === null) {
        return res.status(400).json({ error: "Invalid positions data" });
      }
      await storage.saveMapPositions(searchId, positions);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving map positions:", error);
      res.status(500).json({ error: "Failed to save map positions" });
    }
  });

  app.put("/api/search/:id/table-config", async (req, res) => {
    try {
      const searchId = parseInt(req.params.id);
      if (isNaN(searchId)) {
        return res.status(400).json({ error: "Invalid search ID" });
      }
      const config = req.body.config;
      if (typeof config !== 'object' || config === null) {
        return res.status(400).json({ error: "Invalid config data" });
      }
      await storage.saveTableConfig(searchId, config);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving table config:", error);
      res.status(500).json({ error: "Failed to save table config" });
    }
  });

  app.get("/api/search-results/:id", async (req, res) => {
    try {
      const searchQueryId = parseInt(req.params.id);
      if (isNaN(searchQueryId)) {
        return res.status(400).json({ error: "Invalid search query ID" });
      }

      const results = await storage.getFullSearchResults(searchQueryId);
      if (!results) {
        return res.status(404).json({ error: "Search results not found" });
      }

      const formattedCompanies = results.companies.map(company => {
        const coords = applyCoordinateFallback({
          latitude: company.latitude,
          longitude: company.longitude,
          city: company.region || undefined,
          country: company.country || undefined,
        });
        return {
          ...company,
          latitude: coords.latitude ? String(coords.latitude) : company.latitude,
          longitude: coords.longitude ? String(coords.longitude) : company.longitude,
          executives: company.executives.map(exec => ({ ...exec }))
        };
      });

      res.json({
        searchQuery: results.searchQuery,
        companies: formattedCompanies,
        satelliteHierarchies: results.searchQuery.satelliteHierarchies || {},
        satelliteOrders: results.searchQuery.satelliteOrders || {}
      });
    } catch (error) {
      console.error("Error loading search results:", error);
      res.status(500).json({ error: "Failed to load search results" });
    }
  });
}
