import type { Express } from "express";
import type { Multer } from "multer";
import { storage } from "../../storage";
import { applyCoordinateFallback } from "../../services/coordinateFallback";
import { extractBriefText, BriefExtractError } from "../../services/briefExtract";

export function registerSearch(app: Express, deps: { pdUpload: Multer }): void {
  const { pdUpload } = deps;

  // ─── Brief Upload Endpoint ───────────────────────────────────────────────────
  // Accepts a job description / company brief (PDF, DOCX, TXT), extracts the text,
  // and persists it on the search session (pd_content). Used by the "From brief" flow.
  app.post("/api/search/upload-brief", (req, res, next) => {
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

      let extractedText: string;
      try {
        extractedText = await extractBriefText(req.file.buffer, req.file.originalname);
      } catch (err) {
        if (err instanceof BriefExtractError) {
          return res.status(err.kind === "unsupported" ? 400 : 422).json({ error: err.message });
        }
        throw err;
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
      const session = await storage.getSearchSession(sessionId);
      const rawPdContent = session?.pdContent || undefined;

      // Build the brief context fed to the classifier. Confidential uploads are summarised
      // to neutral criteria first so raw text never reaches the prompt; otherwise the raw
      // text is passed through, capped to the configured limit.
      let briefContext: string | undefined;
      if (rawPdContent) {
        if (session?.pdConfidential) {
          const { summarizeConfidentialBrief } = await import("../../services/pipeline/briefSummary");
          briefContext = (await summarizeConfidentialBrief(rawPdContent)) || undefined;
        } else {
          const { briefConfig } = await import("../../services/pipeline/briefConfig");
          briefContext = rawPdContent.slice(0, briefConfig.classifierCharLimit);
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

      await storage.createSearchSession({ id: sessionId, rawQuery: query, pdContent: rawPdContent });
      await storage.updateSearchSession(sessionId, { searchQueryId: searchQuery.id });

      sendSSE("search_created", { searchQueryId: searchQuery.id, query, sessionId });

      const { runSeedListEnhancedStream } = await import("../../services/pipeline/seedListSearch");

      let enrichedCompanyCount = 0;
      for await (const event of runSeedListEnhancedStream(
        query,
        searchQuery.id,
        criteria.limit || 10,
        controller.signal,
        sessionId,
        briefContext,
      )) {
        if (controller.signal.aborted) break;
        sendSSE(event.type, { ...event.data, message: event.message, timestamp: event.timestamp });
        // Persist the extracted intent so later refinements merge against the
        // real universe (existing sectors/geos) instead of an empty base.
        if (event.type === 'intent_extracted' && event.data?.intent) {
          await storage.updateSearchSession(sessionId, { inferredIntent: event.data.intent });
        }
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
