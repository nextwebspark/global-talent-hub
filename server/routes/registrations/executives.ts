import type { Express } from "express";
import type { Multer } from "multer";
import { storage } from "../../storage";
import { insertExecutiveSchema, insertCareerHistorySchema, type InsertExecutive } from "@shared/schema";
import { applyCoordinateFallback } from "../../services/coordinateFallback";
import { inferSectorsBatch, isStandardSector } from "../../services/sectorInference";
import { normalizeCountryName } from "../shared/countryNormalization";

export function registerExecutives(app: Express, deps: { upload: Multer }): void {
  const { upload } = deps;

  app.get("/api/companies/:companyId/executives", async (req, res) => {
    try {
      const companyId = parseInt(String(req.params.companyId));
      const executives = await storage.getExecutivesByCompany(companyId);
      res.json(executives);
    } catch (error) {
      console.error("Error fetching executives:", error);
      res.status(500).json({ error: "Failed to fetch executives" });
    }
  });

  // UI/MANUAL LAYER: User-initiated executive creation
  app.post("/api/executives", async (req, res) => {
    try {
      const validated = insertExecutiveSchema.parse(req.body);
      const executive = await storage.createExecutiveManual(validated);
      res.status(201).json(executive);

      if (!validated.gender || !validated.ethnicity) {
        import("../../services/pipeline/diversityInference").then(({ inferDiversityForExecutive }) => {
          inferDiversityForExecutive(executive.id).catch(err =>
            console.error("[Routes] Background diversity inference failed:", err)
          );
        });
      }
    } catch (error) {
      console.error("Error creating executive:", error);
      res.status(400).json({ error: "Invalid executive data" });
    }
  });

  // UI/MANUAL LAYER: User-initiated executive edits always override imported data
  app.patch("/api/executives/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const executive = await storage.updateExecutiveManual(id, req.body);

      if (req.body.remunerationNotes !== undefined) {
        const text = req.body.remunerationNotes;
        if (!text || text.trim().length < 5) {
          await storage.deleteRemunerationByExecutive(id);
        } else {
          const { parseRemunerationText } = await import("../../services/remunerationParser");
          let parsed = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              parsed = await parseRemunerationText(text);
              if (parsed) break;
            } catch (parseErr) {
              console.error(`[PATCH] Remuneration parse attempt ${attempt + 1} failed:`, parseErr);
              if (attempt === 0) continue;
            }
          }
          if (parsed) {
            await storage.deleteRemunerationByExecutive(id);
            await storage.createRemuneration({
              executiveId: id,
              baseSalary: parsed.baseSalary != null ? String(parsed.baseSalary) : null,
              housingAllowance: parsed.housingAllowance != null ? String(parsed.housingAllowance) : null,
              transportAllowance: parsed.transportAllowance != null ? String(parsed.transportAllowance) : null,
              schoolingAllowance: parsed.schoolingAllowance != null ? String(parsed.schoolingAllowance) : null,
              totalAllowances: parsed.totalAllowances != null ? String(parsed.totalAllowances) : null,
              bonus: parsed.bonus != null ? String(parsed.bonus) : null,
              longTermIncentives: parsed.longTermIncentives != null ? String(parsed.longTermIncentives) : null,
              currency: parsed.currency,
              year: parsed.year,
              notes: parsed.notes,
            });
          }
        }
      }

      res.json(executive);
    } catch (error) {
      console.error("Error updating executive:", error);
      res.status(500).json({ error: "Failed to update executive" });
    }
  });

  // Bulk import executives from Excel/pasted data
  app.post("/api/executives/bulk-import", async (req, res) => {
    try {
      const { searchQueryId, mappings, records } = req.body;

      if (!searchQueryId || !mappings || !records || !Array.isArray(records)) {
        return res.status(400).json({ error: "Missing required fields: searchQueryId, mappings, records" });
      }

      // Prefetch all companies for this search query to avoid N+1 queries
      const existingCompanies = await storage.getCompaniesBySearchQuery(searchQueryId);
      const companyMap = new Map<string, number>();
      existingCompanies.forEach(c => companyMap.set(c.name.toLowerCase(), c.id));

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      const newCompaniesForSectorInference: { id: number; name: string }[] = [];

      const safeStr = (raw: any): string | null => {
        if (raw === null || raw === undefined) return null;
        const s = String(raw).trim();
        return s.length > 0 ? s : null;
      };

      const mappedFieldHeaders = new Set(Object.values(mappings));

      const parseNumeric = (raw: any): number | null => {
        if (raw === null || raw === undefined) return null;
        const s = String(raw).replace(/[^0-9.\-]/g, '');
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
      };

      for (const record of records) {
        try {
          const name = safeStr(mappings.name ? record[mappings.name] : null);
          const title = safeStr(mappings.title ? record[mappings.title] : null) || 'Executive';
          const companyName = safeStr(mappings.company ? record[mappings.company] : null);
          const country = safeStr(mappings.country ? record[mappings.country] : null);
          const normalizedCountry = country ? normalizeCountryName(country) : null;
          const city = safeStr(mappings.city ? record[mappings.city] : null);
          const sector = safeStr(mappings.sector ? record[mappings.sector] : null);
          const revenueRaw = parseNumeric(mappings.revenue ? record[mappings.revenue] : null);
          const employeesRaw = parseNumeric(mappings.employees ? record[mappings.employees] : null);
          const email = safeStr(mappings.email ? record[mappings.email] : null);
          const phone = safeStr(mappings.phone ? record[mappings.phone] : null);
          const linkedin = safeStr(mappings.linkedin ? record[mappings.linkedin] : null);
          const notes = safeStr(mappings.notes ? record[mappings.notes] : null);
          const gender = safeStr(mappings.gender ? record[mappings.gender] : null);
          const ethnicity = safeStr(mappings.ethnicity ? record[mappings.ethnicity] : null);
          const remunerationNotes = safeStr(mappings.remunerationNotes ? record[mappings.remunerationNotes] : null);
          const availability = safeStr(mappings.availability ? record[mappings.availability] : null);
          const level = safeStr(mappings.level ? record[mappings.level] : null);

          if (!name && !companyName && !title) continue;

          const customFields: Record<string, string> = {};
          for (const [header, value] of Object.entries(record)) {
            if (!mappedFieldHeaders.has(header)) {
              const v = safeStr(value);
              if (v) customFields[header] = v;
            }
          }

          let companyId: number | null = null;

          if (companyName) {
            const lowerName = companyName.toLowerCase();
            if (companyMap.has(lowerName)) {
              companyId = companyMap.get(lowerName)!;
              const companyUpdates: Record<string, any> = {};
              if (revenueRaw !== null) companyUpdates.revenue = String(revenueRaw);
              if (employeesRaw !== null) companyUpdates.employees = Math.round(employeesRaw);
              if (city) companyUpdates.region = city;
              if (sector) companyUpdates.sector = sector;
              if (Object.keys(companyUpdates).length > 0) {
                await storage.enrichCompanyEmptyFields(companyId, companyUpdates);
              }
            } else {
              const countryForCoords = normalizedCountry || 'Unknown';
              const coords = applyCoordinateFallback({ country: countryForCoords, city: city || undefined });
              const newCompany = await storage.createCompanyFromDiscovery({
                name: companyName,
                country: countryForCoords,
                sector: sector,
                businessType: null,
                region: city,
                revenue: revenueRaw !== null ? String(revenueRaw) : null,
                employees: employeesRaw !== null ? Math.round(employeesRaw) : null,
                searchQueryId,
                latitude: coords.latitude ? String(coords.latitude) : null,
                longitude: coords.longitude ? String(coords.longitude) : null,
              });
              companyId = newCompany.id;
              companyMap.set(lowerName, companyId);
              if (!isStandardSector(sector)) {
                newCompaniesForSectorInference.push({ id: newCompany.id, name: companyName });
              }
            }
          } else {
            if (existingCompanies.length > 0) {
              companyId = existingCompanies[0].id;
            } else if (!companyMap.has('imported contacts')) {
              const placeholderCountry = normalizedCountry || 'Unknown';
              const placeholderCoords = applyCoordinateFallback({ country: placeholderCountry });
              const newCompany = await storage.createCompanyFromDiscovery({
                name: 'Imported Contacts',
                country: placeholderCountry,
                sector: null,
                businessType: null,
                searchQueryId,
                latitude: placeholderCoords.latitude ? String(placeholderCoords.latitude) : null,
                longitude: placeholderCoords.longitude ? String(placeholderCoords.longitude) : null,
              });
              companyId = newCompany.id;
              companyMap.set('imported contacts', companyId);
            } else {
              companyId = companyMap.get('imported contacts')!;
            }
          }

          if (companyId) {
            const execName = name || 'Unknown';
            const existingExec = execName !== 'Unknown' ? await storage.findExecutiveByNameAndCompany(execName, companyId) : undefined;

            let exec;
            if (existingExec) {
              skipped++;
              console.log(`[BulkImport] Duplicate executive "${execName}" at company ${companyId} — merging empty fields`);
              const mergeData: Partial<InsertExecutive> = {};
              if (title && title !== 'Executive') mergeData.title = title;
              if (email) mergeData.email = email;
              if (phone) mergeData.phone = phone;
              if (linkedin) mergeData.linkedin = linkedin;
              if (notes) mergeData.notes = notes;
              if (gender) mergeData.gender = gender;
              if (ethnicity) mergeData.ethnicity = ethnicity;
              if (remunerationNotes) mergeData.remunerationNotes = remunerationNotes;
              if (availability) mergeData.availability = availability;
              if (level) mergeData.level = level;
              if (Object.keys(mergeData).length > 0) {
                await storage.enrichExecutiveEmptyFields(existingExec.id, mergeData, { source: 'import', confidence: 5 });
              }
              exec = existingExec;
            } else {
              exec = await storage.createExecutiveManual({
                companyId,
                name: execName,
                title,
                email,
                phone,
                linkedin,
                notes,
                gender,
                ethnicity,
                remunerationNotes,
                availability,
                level,
                customFields: Object.keys(customFields).length > 0 ? customFields : null,
                confidence: 5
              });
              imported++;
            }

            if (remunerationNotes && remunerationNotes.trim().length >= 5 && exec) {
              try {
                const { parseRemunerationText } = await import("../../services/remunerationParser");
                const parsed = await parseRemunerationText(remunerationNotes);
                if (parsed) {
                  await storage.deleteRemunerationByExecutive(exec.id);
                  await storage.createRemuneration({
                    executiveId: exec.id,
                    baseSalary: parsed.baseSalary != null ? String(parsed.baseSalary) : null,
                    housingAllowance: parsed.housingAllowance != null ? String(parsed.housingAllowance) : null,
                    transportAllowance: parsed.transportAllowance != null ? String(parsed.transportAllowance) : null,
                    schoolingAllowance: parsed.schoolingAllowance != null ? String(parsed.schoolingAllowance) : null,
                    totalAllowances: parsed.totalAllowances != null ? String(parsed.totalAllowances) : null,
                    bonus: parsed.bonus != null ? String(parsed.bonus) : null,
                    longTermIncentives: parsed.longTermIncentives != null ? String(parsed.longTermIncentives) : null,
                    currency: parsed.currency,
                    year: parsed.year,
                    notes: parsed.notes,
                  });
                }
              } catch (parseErr) {
                console.error('Error auto-parsing remuneration for imported exec:', parseErr);
              }
            }
          }
        } catch (recordError) {
          console.error('Error importing record:', recordError);
          const errorName = mappings.name ? record[mappings.name] : 'unknown';
          errors.push(`Failed to import: ${errorName}`);
        }
      }

      if (newCompaniesForSectorInference.length > 0) {
        const sectorResults = await inferSectorsBatch(newCompaniesForSectorInference);
        for (const r of sectorResults) {
          await storage.updateCompanyManual(r.id, { sector: r.sector, sectorCategory: r.category });
        }
        console.log(`[Routes] Sector inference: filled ${sectorResults.length}/${newCompaniesForSectorInference.length} sectors`);
      }

      res.json({
        imported,
        skipped,
        total: records.length,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined
      });

      if (imported > 0) {
        import("../../services/pipeline/diversityInference").then(({ inferDiversityForSearch }) => {
          inferDiversityForSearch(searchQueryId).catch(err =>
            console.error("[Routes] Background diversity inference after bulk import failed:", err)
          );
        });
      }
    } catch (error) {
      console.error("Error bulk importing executives:", error);
      res.status(500).json({ error: "Bulk import failed" });
    }
  });

  // Executive image upload endpoint
  app.post("/api/executives/:id/image", upload.single('image'), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const imageUrl = `/uploads/${req.file.filename}`;
      await storage.updateExecutiveManual(id, { imageUrl });

      res.json({ imageUrl });
    } catch (error) {
      console.error("Error uploading executive image:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  // Extract profile from raw text using AI (OpenRouter)
  app.post("/api/executives/:id/extract-profile", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const { sourceText, model = 'meta-llama/llama-3.3-70b-instruct:free' } = req.body;

      if (!sourceText || typeof sourceText !== 'string' || sourceText.trim().length === 0) {
        return res.status(400).json({ error: "Source text is required" });
      }

      // Check executive exists
      const existingExec = await storage.getExecutive(id);
      if (!existingExec) {
        return res.status(404).json({ error: "Executive not found" });
      }

      // Use OpenRouter to extract structured data from the raw text
      const OpenAI = (await import('openai')).default;
      const openrouter = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
      });

      const systemPrompt = `You are an expert at extracting executive profile information from raw text. Extract the following fields if present:
- name: Full name of the executive
- title: Current job title/position
- linkedin: LinkedIn profile URL (look for linkedin.com URLs)
- remunerationNotes: Any compensation, salary, bonus, equity, or remuneration information

Return ONLY a valid JSON object with these fields. Use null for any field that cannot be determined from the text. For remunerationNotes, synthesize the information into readable paragraphs.`;

      const response = await openrouter.chat.completions.create({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extract profile information from this text:\n\n${sourceText}` }
        ],
        max_tokens: 2000,
      });

      let content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from AI");
      }

      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        content = jsonMatch[1].trim();
      }

      let extracted;
      try {
        extracted = JSON.parse(content);
      } catch (parseError) {
        console.error("Failed to parse AI response:", content);
        throw new Error("AI returned invalid JSON");
      }

      // Update the executive with extracted data and source text
      const updateData: Record<string, any> = {
        sourceText: sourceText.trim(),
      };

      // Only update fields that were extracted (not null)
      if (extracted.name) updateData.name = extracted.name;
      if (extracted.title) updateData.title = extracted.title;
      if (extracted.linkedin) updateData.linkedin = extracted.linkedin;
      if (extracted.remunerationNotes) updateData.remunerationNotes = extracted.remunerationNotes;

      const updatedExecutive = await storage.updateExecutiveManual(id, updateData);

      if (extracted.remunerationNotes && extracted.remunerationNotes.trim().length >= 5) {
        try {
          const { parseRemunerationText } = await import("../../services/remunerationParser");
          const parsed = await parseRemunerationText(extracted.remunerationNotes);
          if (parsed) {
            await storage.deleteRemunerationByExecutive(id);
            await storage.createRemuneration({
              executiveId: id,
              baseSalary: parsed.baseSalary != null ? String(parsed.baseSalary) : null,
              housingAllowance: parsed.housingAllowance != null ? String(parsed.housingAllowance) : null,
              transportAllowance: parsed.transportAllowance != null ? String(parsed.transportAllowance) : null,
              schoolingAllowance: parsed.schoolingAllowance != null ? String(parsed.schoolingAllowance) : null,
              totalAllowances: parsed.totalAllowances != null ? String(parsed.totalAllowances) : null,
              bonus: parsed.bonus != null ? String(parsed.bonus) : null,
              longTermIncentives: parsed.longTermIncentives != null ? String(parsed.longTermIncentives) : null,
              currency: parsed.currency,
              year: parsed.year,
              notes: parsed.notes,
            });
          }
        } catch (parseErr) {
          console.error('Error auto-parsing remuneration from profile extraction:', parseErr);
        }
      }

      res.json({
        executive: updatedExecutive,
        extracted: extracted
      });
    } catch (error) {
      console.error("Error extracting executive profile:", error);
      res.status(500).json({ error: "Failed to extract profile from text" });
    }
  });

  app.delete("/api/executives/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await storage.deleteExecutive(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting executive:", error);
      res.status(500).json({ error: "Failed to delete executive" });
    }
  });

  // Executive Details API
  app.get("/api/executives/:id/details", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const details = await storage.getExecutiveDetails(id);
      if (!details) {
        return res.status(404).json({ error: "Executive not found" });
      }

      const isEnriched = Boolean(details.executive.enrichmentSource || details.executive.clockworkId);
      res.json({
        executive: {
          id: details.executive.id,
          name: details.executive.name,
          title: details.executive.title,
          companyId: details.executive.companyId,
          confidence: details.executive.confidence,
          linkedin: details.executive.linkedin,
          profileUrl: details.executive.profileUrl,
          imageUrl: details.executive.imageUrl,
          email: details.executive.email,
          phone: details.executive.phone,
          notes: details.executive.notes,
          remunerationNotes: details.executive.remunerationNotes,
          availability: details.executive.availability,
          level: details.executive.level,
          gender: details.executive.gender,
          ethnicity: details.executive.ethnicity,
          sourceText: details.executive.sourceText,
          enrichmentSource: details.executive.enrichmentSource,
          enrichmentConfidence: details.executive.enrichmentConfidence,
          enrichmentTimestamp: details.executive.enrichmentTimestamp,
          executiveConfidence: details.executive.executiveConfidence,
          executiveConfidenceReason: details.executive.executiveConfidenceReason,
          isEnriched
        },
        company: details.company ? {
          id: details.company.id,
          name: details.company.name,
          country: details.company.country,
          revenue: details.company.revenue,
          employees: details.company.employees
        } : null,
        careerHistory: details.careerHistory.map(ch => ({
          id: ch.id,
          company: ch.company,
          title: ch.title,
          startDate: ch.startDate,
          endDate: ch.endDate,
          description: ch.description,
          sortOrder: ch.sortOrder
        })),
        education: details.education.map(ed => ({
          id: ed.id,
          institution: ed.institution,
          degree: ed.degree,
          fieldOfStudy: ed.fieldOfStudy,
          graduationYear: ed.graduationYear
        })),
        remuneration: details.remuneration.map(rem => ({
          id: rem.id,
          baseSalary: rem.baseSalary,
          housingAllowance: rem.housingAllowance,
          transportAllowance: rem.transportAllowance,
          schoolingAllowance: rem.schoolingAllowance,
          totalAllowances: rem.totalAllowances,
          bonus: rem.bonus,
          longTermIncentives: rem.longTermIncentives,
          currency: rem.currency,
          year: rem.year,
          notes: rem.notes
        })),
        notes: details.notes ? { id: details.notes.id, content: details.notes.content } : null
      });
    } catch (error) {
      console.error("Error fetching executive details:", error);
      res.status(500).json({ error: "Failed to fetch executive details" });
    }
  });

  // Career History endpoints (GET, POST) — sit in executives block (origin 899-921)
  app.get("/api/executives/:id/career-history", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const careerHistory = await storage.getCareerHistory(id);
      res.json(careerHistory);
    } catch (error) {
      console.error("Error fetching career history:", error);
      res.status(500).json({ error: "Failed to fetch career history" });
    }
  });

  app.post("/api/executives/:id/career-history", async (req, res) => {
    try {
      const executiveId = parseInt(String(req.params.id));
      const validated = insertCareerHistorySchema.parse({ ...req.body, executiveId });
      const entry = await storage.createCareerHistory(validated);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating career history:", error);
      res.status(400).json({ error: "Invalid career history data" });
    }
  });
}
