import type { Express } from "express";
import { storage } from "../../storage";
import { type InsertExecutive } from "@shared/schema";
import { applyCoordinateFallback } from "../../services/coordinateFallback";
import { inferSectorsBatch, isStandardSector } from "../../services/sectorInference";
import { enrichSearchResults } from "../../services/pipeline/enrichment";
import { normalizeCountryName } from "../shared/countryNormalization";
import type { AuthedRequest } from "../../auth/middleware";

export function registerImportProject(app: Express): void {
  app.post("/api/import-project", async (req: AuthedRequest, res) => {
    try {
      const orgId = req.orgId!;
      const userId = req.userId!;
      const { projectName, records, mappings } = req.body;

      if (!records || !Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: "No records provided" });
      }
      if (!mappings || typeof mappings !== 'object') {
        return res.status(400).json({ error: "No column mappings provided" });
      }

      const name = projectName || `Import ${new Date().toLocaleDateString()}`;
      const uniqueKey = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const searchQuery = await storage.createSearchQuery({
        query: name,
        uniqueKey,
        parsedCriteria: JSON.stringify({ source: 'excel-import', recordCount: records.length }),
        resultCount: 0,
        orgId,
        createdBy: userId,
      });
      const searchQueryId = searchQuery.id;

      const companyMap = new Map<string, number>();
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      const newCompaniesForSectorInference2: { id: number; name: string }[] = [];

      const safeStr = (raw: any): string | null => {
        if (raw === null || raw === undefined) return null;
        const s = String(raw).trim();
        return s.length > 0 ? s : null;
      };

      const mappedFieldHeaders = new Set(Object.values(mappings).filter(Boolean));

      const parseNumeric = (raw: any): number | null => {
        if (raw === null || raw === undefined) return null;
        const s = String(raw).replace(/[^0-9.\-]/g, '');
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
      };

      for (const record of records) {
        try {
          const execName = safeStr(mappings.name ? record[mappings.name] : null);
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
          const remunerationNotes = safeStr(mappings.remunerationNotes ? record[mappings.remunerationNotes] : null);
          const availability = safeStr(mappings.availability ? record[mappings.availability] : null);
          const level = safeStr(mappings.level ? record[mappings.level] : null);

          if (!execName && !companyName && !title) continue;

          const customFields: Record<string, string> = {};
          for (const [header, value] of Object.entries(record)) {
            if (!mappedFieldHeaders.has(header)) {
              const v = safeStr(value);
              if (v) customFields[header] = v;
            }
          }

          let companyId: number | null = null;
          const resolvedCompanyName = companyName || 'Imported Contacts';
          const lowerName = resolvedCompanyName.toLowerCase();

          if (companyMap.has(lowerName)) {
            companyId = companyMap.get(lowerName)!;
            const companyUpdates: Record<string, any> = {};
            if (revenueRaw !== null) companyUpdates.revenue = String(revenueRaw);
            if (employeesRaw !== null) companyUpdates.employees = Math.round(employeesRaw);
            if (city) companyUpdates.region = city;
            if (sector) companyUpdates.sector = sector;
            if (Object.keys(companyUpdates).length > 0) {
              await storage.enrichCompanyEmptyFields(companyId, companyUpdates, orgId);
            }
          } else {
            const countryForCoords = normalizedCountry || 'Unknown';
            const coords = applyCoordinateFallback({ country: countryForCoords, city: city || undefined });
            const newCompany = await storage.createCompanyFromDiscovery({
              name: resolvedCompanyName,
              country: countryForCoords,
              sector: sector,
              businessType: null,
              region: city,
              revenue: revenueRaw !== null ? String(revenueRaw) : null,
              employees: employeesRaw !== null ? Math.round(employeesRaw) : null,
              searchQueryId,
              latitude: coords.latitude ? String(coords.latitude) : null,
              longitude: coords.longitude ? String(coords.longitude) : null,
            }, orgId);
            companyId = newCompany.id;
            companyMap.set(lowerName, companyId);
            if (!isStandardSector(sector) && resolvedCompanyName !== 'Imported Contacts') {
              newCompaniesForSectorInference2.push({ id: newCompany.id, name: resolvedCompanyName });
            }
          }

          if (companyId && (execName || title !== 'Executive')) {
            const resolvedExecName = execName || 'Unknown';
            const existingExec = resolvedExecName !== 'Unknown' ? await storage.findExecutiveByNameAndCompany(resolvedExecName, companyId, orgId) : undefined;

            let exec;
            if (existingExec) {
              skipped++;
              console.log(`[ImportProject] Duplicate executive "${resolvedExecName}" at company ${companyId} — merging empty fields`);
              const mergeData: Partial<InsertExecutive> = {};
              if (title && title !== 'Executive') mergeData.title = title;
              if (email) mergeData.email = email;
              if (phone) mergeData.phone = phone;
              if (linkedin) mergeData.linkedin = linkedin;
              if (notes) mergeData.notes = notes;
              if (remunerationNotes) mergeData.remunerationNotes = remunerationNotes;
              if (availability) mergeData.availability = availability;
              if (level) mergeData.level = level;
              if (Object.keys(mergeData).length > 0) {
                await storage.enrichExecutiveEmptyFields(existingExec.id, mergeData, orgId, { source: 'import', confidence: 5 });
              }
              exec = existingExec;
            } else {
              exec = await storage.createExecutiveManual({
                companyId,
                name: resolvedExecName,
                title,
                email,
                phone,
                linkedin,
                notes,
                remunerationNotes,
                availability,
                level,
                customFields: Object.keys(customFields).length > 0 ? customFields : null,
                confidence: 5
              }, orgId);
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
                console.error('[ImportProject] Error auto-parsing remuneration:', parseErr);
              }
            }
          }
        } catch (recordError) {
          console.error('[ImportProject] Error importing record:', recordError);
          errors.push(`Failed to import record`);
        }
      }

      await storage.updateSearchQueryResultCount(searchQueryId, companyMap.size, orgId);

      const fullResults = await storage.getFullSearchResults(searchQueryId, orgId);

      console.log(`[ImportProject] Created project "${name}" with ${companyMap.size} companies, ${imported} imported, ${skipped} duplicates skipped`);

      if (newCompaniesForSectorInference2.length > 0) {
        const sectorResults2 = await inferSectorsBatch(newCompaniesForSectorInference2);
        for (const r of sectorResults2) {
          await storage.updateCompanyManual(r.id, { sector: r.sector, sectorCategory: r.category }, orgId);
        }
        console.log(`[ImportProject] Sector inference: filled ${sectorResults2.length}/${newCompaniesForSectorInference2.length} sectors`);
      }

      res.json({
        success: true,
        searchQueryId,
        projectName: name,
        companiesCreated: companyMap.size,
        recordsImported: imported,
        skipped,
        results: fullResults?.companies || [],
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
      });

      // Fire-and-forget enrichment in background
      enrichSearchResults(searchQueryId, orgId).then(async enrichResult => {
        console.log(`[ImportProject] Background enrichment complete for "${name}":`, enrichResult);
        const { inferDiversityForSearch } = await import("../../services/pipeline/diversityInference");
        const diversityResult = await inferDiversityForSearch(searchQueryId, orgId);
        console.log(`[ImportProject] Diversity inference complete for "${name}": ${diversityResult.updated}/${diversityResult.total}`);
      }).catch(err => {
        console.error(`[ImportProject] Background enrichment failed for "${name}":`, err);
      });

    } catch (error: any) {
      console.error("[ImportProject] Error:", error);
      res.status(500).json({ error: error.message || "Failed to import project" });
    }
  });
}
