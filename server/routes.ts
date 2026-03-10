import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertCompanySchema, insertExecutiveSchema, insertSearchQuerySchema, insertCareerHistorySchema, insertEducationSchema, insertRemunerationSchema } from "@shared/schema";
import { applyCoordinateFallback } from "./services/coordinateFallback";

const COUNTRY_ALIASES: Record<string, string> = {
  'uae': 'United Arab Emirates', 'u.a.e.': 'United Arab Emirates', 'emirates': 'United Arab Emirates',
  'ksa': 'Saudi Arabia', 'kingdom of saudi arabia': 'Saudi Arabia',
  'uk': 'United Kingdom', 'u.k.': 'United Kingdom', 'great britain': 'United Kingdom', 'britain': 'United Kingdom', 'england': 'United Kingdom',
  'usa': 'United States', 'u.s.a.': 'United States', 'u.s.': 'United States', 'us': 'United States', 'america': 'United States', 'united states of america': 'United States',
  'prc': 'China', "people's republic of china": 'China',
  'rok': 'South Korea', 'republic of korea': 'South Korea', 'korea': 'South Korea',
  'rsa': 'South Africa', 'republic of south africa': 'South Africa',
  'ussr': 'Russia', 'russian federation': 'Russia',
  'holland': 'Netherlands', 'the netherlands': 'Netherlands',
  'czech': 'Czech Republic', 'czechia': 'Czech Republic',
  'hk': 'Hong Kong', 'singapore city': 'Singapore',
  'drc': 'DR Congo', 'democratic republic of congo': 'DR Congo', 'democratic republic of the congo': 'DR Congo',
  "cote d'ivoire": 'Ivory Coast', "côte d'ivoire": 'Ivory Coast',
};

const KNOWN_COUNTRIES = [
  'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman', 'Jordan', 'Lebanon',
  'Iraq', 'Iran', 'Israel', 'Palestine', 'Syria', 'Yemen', 'Egypt', 'Turkey', 'United States',
  'United Kingdom', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Switzerland', 'Canada',
  'Australia', 'Japan', 'China', 'India', 'Singapore', 'Hong Kong', 'South Korea', 'Brazil', 'Mexico',
  'Russia', 'South Africa', 'Nigeria', 'Kenya', 'Morocco', 'Pakistan', 'Indonesia', 'Malaysia',
  'Thailand', 'Vietnam', 'Philippines', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 'Austria',
  'Belgium', 'Ireland', 'Portugal', 'Greece', 'Czech Republic', 'New Zealand', 'Argentina', 'Chile',
  'Colombia', 'Peru', 'Luxembourg', 'Taiwan', 'Hungary', 'Romania', 'Ukraine', 'Slovakia', 'Croatia',
  'Slovenia', 'Bulgaria', 'Serbia', 'Tunisia', 'Algeria', 'Libya', 'Ghana', 'Ethiopia', 'Tanzania',
  'Uganda', 'Zimbabwe', 'Zambia', 'Mozambique', 'Angola', 'Ivory Coast', 'Senegal', 'Cameroon',
  'DR Congo', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Myanmar', 'Cambodia', 'Laos', 'Mongolia',
  'Kazakhstan', 'Uzbekistan', 'Azerbaijan', 'Georgia', 'Armenia', 'Afghanistan', 'Costa Rica',
  'Panama', 'Puerto Rico', 'Dominican Republic', 'Guatemala', 'Ecuador', 'Bolivia', 'Paraguay',
  'Uruguay', 'Venezuela', 'Cuba', 'Jamaica', 'Trinidad and Tobago', 'Bahamas', 'Bermuda', 'Iceland',
  'Malta', 'Cyprus', 'Monaco', 'Liechtenstein', 'Andorra', 'San Marino', 'Vatican City',
];

function normalizeCountryName(country: string): string {
  if (!country) return 'Unknown';
  const trimmed = country.trim();
  const key = trimmed.toLowerCase();
  if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key];
  const exactMatch = KNOWN_COUNTRIES.find(c => c.toLowerCase() === key);
  if (exactMatch) return exactMatch;
  const partialMatch = KNOWN_COUNTRIES.find(c => c.toLowerCase().includes(key) || key.includes(c.toLowerCase()));
  if (partialMatch) return partialMatch;
  return trimmed;
}

// Configure multer for image uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `exec-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  }
});
import { 
  parseSearchQuery, 
  generateSearchUniqueKey
} from "./services/discovery";
import { webSearchService } from "./services/webSearch";
import { 
  enrichExecutive, 
  enrichCompany, 
  getAvailableSources,
  orchestrateEnrichmentMatching,
  researchCompanyDetails,
  exploreClockworkProjectEndpoints
} from "./services/enrichment";
import { 
  runMultiPassEnrichment, 
  enrichSearchResults 
} from "./services/pipeline/enrichment";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/companies", async (req, res) => {
    try {
      const companies = await storage.getAllCompanies();
      const companiesWithExecs = await Promise.all(
        companies.map(async (company) => {
          const executives = await storage.getExecutivesByCompany(company.id);
          return { ...company, executives };
        })
      );
      res.json(companiesWithExecs);
    } catch (error) {
      console.error("Error fetching companies:", error);
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.get("/api/companies/search", async (req, res) => {
    try {
      const name = String(req.query.name || '').trim();
      if (name.length < 2) return res.json([]);
      const results = await storage.searchCompaniesByName(name);
      res.json(results);
    } catch (error) {
      console.error("Error searching companies:", error);
      res.status(500).json({ error: "Failed to search companies" });
    }
  });

  app.get("/api/companies/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const company = await storage.getCompany(id);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      const executives = await storage.getExecutivesByCompany(id);
      res.json({ ...company, executives });
    } catch (error) {
      console.error("Error fetching company:", error);
      res.status(500).json({ error: "Failed to fetch company" });
    }
  });

  // UI/MANUAL LAYER: User-initiated company creation
  app.post("/api/companies", async (req, res) => {
    try {
      let data = { ...req.body };
      if ((!data.latitude || data.latitude === '0') && (!data.longitude || data.longitude === '0')) {
        const fallback = applyCoordinateFallback({
          latitude: null,
          longitude: null,
          city: data.region || null,
          country: data.country || null,
        });
        if (fallback.latitude && fallback.longitude) {
          data.latitude = String(fallback.latitude);
          data.longitude = String(fallback.longitude);
        }
      }
      const validated = insertCompanySchema.parse(data);
      const company = await storage.createCompanyManual(validated);
      res.status(201).json(company);
    } catch (error) {
      console.error("Error creating company:", error);
      res.status(400).json({ error: "Invalid company data" });
    }
  });

  // UI/MANUAL LAYER: User-initiated company edits always override imported data
  app.patch("/api/companies/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      let patchData = { ...req.body };
      const existingCompany = await storage.getCompany(id);
      const hasNoCoords = !existingCompany?.latitude && !existingCompany?.longitude;
      const countryChanged = patchData.country && patchData.country !== existingCompany?.country;
      if ((hasNoCoords || countryChanged) && (patchData.country || existingCompany?.country)) {
        const fallback = applyCoordinateFallback({
          latitude: patchData.latitude || existingCompany?.latitude || null,
          longitude: patchData.longitude || existingCompany?.longitude || null,
          city: patchData.region || existingCompany?.region || undefined,
          country: patchData.country || existingCompany?.country || undefined,
        });
        if (fallback.latitude && fallback.longitude) {
          if (hasNoCoords || countryChanged) {
            patchData.latitude = String(fallback.latitude);
            patchData.longitude = String(fallback.longitude);
          }
        }
      }
      const company = await storage.updateCompanyManual(id, patchData);
      res.json(company);
    } catch (error) {
      console.error("Error updating company:", error);
      res.status(500).json({ error: "Failed to update company" });
    }
  });

  app.delete("/api/companies/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await storage.deleteCompany(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting company:", error);
      res.status(500).json({ error: "Failed to delete company" });
    }
  });

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
        import("./services/pipeline/diversityInference").then(({ inferDiversityForExecutive }) => {
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
      const errors: string[] = [];

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
          const careerSummary = safeStr(mappings.careerSummary ? record[mappings.careerSummary] : null);
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
            const exec = await storage.createExecutiveManual({
              companyId,
              name: name || 'Unknown',
              title,
              email,
              phone,
              linkedin,
              notes,
              gender,
              ethnicity,
              careerSummary,
              remunerationNotes,
              availability,
              level,
              customFields: Object.keys(customFields).length > 0 ? customFields : null,
              confidence: 5
            });
            imported++;

            if (remunerationNotes && remunerationNotes.trim().length >= 5 && exec) {
              try {
                const { parseRemunerationText } = await import("./services/remunerationParser");
                const parsed = await parseRemunerationText(remunerationNotes);
                if (parsed) {
                  await storage.deleteRemunerationByExecutive(exec.id);
                  await storage.createRemuneration({
                    executiveId: exec.id,
                    baseSalary: parsed.baseSalary != null ? String(parsed.baseSalary) : null,
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

      res.json({ 
        imported, 
        total: records.length,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined 
      });

      if (imported > 0) {
        import("./services/pipeline/diversityInference").then(({ inferDiversityForSearch }) => {
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
- careerSummary: A summary of their career history, previous roles, companies worked at
- remunerationNotes: Any compensation, salary, bonus, equity, or remuneration information

Return ONLY a valid JSON object with these fields. Use null for any field that cannot be determined from the text. For careerSummary and remunerationNotes, synthesize the information into readable paragraphs.`;

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
      if (extracted.careerSummary) updateData.careerSummary = extracted.careerSummary;
      if (extracted.remunerationNotes) updateData.remunerationNotes = extracted.remunerationNotes;

      const updatedExecutive = await storage.updateExecutiveManual(id, updateData);

      if (extracted.remunerationNotes && extracted.remunerationNotes.trim().length >= 5) {
        try {
          const { parseRemunerationText } = await import("./services/remunerationParser");
          const parsed = await parseRemunerationText(extracted.remunerationNotes);
          if (parsed) {
            await storage.deleteRemunerationByExecutive(id);
            await storage.createRemuneration({
              executiveId: id,
              baseSalary: parsed.baseSalary != null ? String(parsed.baseSalary) : null,
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
          careerSummary: details.executive.careerSummary,
          notes: details.executive.notes,
          remunerationNotes: details.executive.remunerationNotes,
          availability: details.executive.availability,
          level: details.executive.level,
          sourceText: details.executive.sourceText,
          enrichmentSource: details.executive.enrichmentSource,
          enrichmentConfidence: details.executive.enrichmentConfidence,
          enrichmentTimestamp: details.executive.enrichmentTimestamp,
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

  // Career History endpoints
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

  app.patch("/api/career-history/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const entry = await storage.updateCareerHistory(id, req.body);
      res.json(entry);
    } catch (error) {
      console.error("Error updating career history:", error);
      res.status(500).json({ error: "Failed to update career history" });
    }
  });

  app.delete("/api/career-history/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await storage.deleteCareerHistory(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting career history:", error);
      res.status(500).json({ error: "Failed to delete career history" });
    }
  });

  // Education endpoints
  app.get("/api/executives/:id/education", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const educationData = await storage.getEducation(id);
      res.json(educationData);
    } catch (error) {
      console.error("Error fetching education:", error);
      res.status(500).json({ error: "Failed to fetch education" });
    }
  });

  app.post("/api/executives/:id/education", async (req, res) => {
    try {
      const executiveId = parseInt(String(req.params.id));
      const validated = insertEducationSchema.parse({ ...req.body, executiveId });
      const entry = await storage.createEducation(validated);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating education:", error);
      res.status(400).json({ error: "Invalid education data" });
    }
  });

  app.patch("/api/education/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const entry = await storage.updateEducation(id, req.body);
      res.json(entry);
    } catch (error) {
      console.error("Error updating education:", error);
      res.status(500).json({ error: "Failed to update education" });
    }
  });

  app.delete("/api/education/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await storage.deleteEducation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting education:", error);
      res.status(500).json({ error: "Failed to delete education" });
    }
  });

  // Remuneration endpoints
  app.get("/api/executives/:id/remuneration", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const remunerationData = await storage.getRemuneration(id);
      res.json(remunerationData);
    } catch (error) {
      console.error("Error fetching remuneration:", error);
      res.status(500).json({ error: "Failed to fetch remuneration" });
    }
  });

  app.post("/api/executives/:id/remuneration", async (req, res) => {
    try {
      const executiveId = parseInt(String(req.params.id));
      const validated = insertRemunerationSchema.parse({ ...req.body, executiveId });
      const entry = await storage.createRemuneration(validated);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating remuneration:", error);
      res.status(400).json({ error: "Invalid remuneration data" });
    }
  });

  app.patch("/api/remuneration/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const entry = await storage.updateRemuneration(id, req.body);
      res.json(entry);
    } catch (error) {
      console.error("Error updating remuneration:", error);
      res.status(500).json({ error: "Failed to update remuneration" });
    }
  });

  app.delete("/api/remuneration/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      await storage.deleteRemuneration(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting remuneration:", error);
      res.status(500).json({ error: "Failed to delete remuneration" });
    }
  });

  app.post("/api/executives/:id/remuneration/parse", async (req, res) => {
    try {
      const executiveId = parseInt(String(req.params.id));
      const exec = await storage.getExecutive(executiveId);
      if (!exec) return res.status(404).json({ error: "Executive not found" });

      const text = req.body?.text || exec.remunerationNotes;
      if (!text || text.trim().length < 5) {
        return res.status(400).json({ error: "No remuneration text to parse" });
      }

      const { parseRemunerationText } = await import("./services/remunerationParser");
      const parsed = await parseRemunerationText(text);
      if (!parsed) {
        return res.status(422).json({ error: "Could not extract structured remuneration data from the provided text" });
      }

      await storage.deleteRemunerationByExecutive(executiveId);
      const entry = await storage.createRemuneration({
        executiveId,
        baseSalary: parsed.baseSalary != null ? String(parsed.baseSalary) : null,
        totalAllowances: parsed.totalAllowances != null ? String(parsed.totalAllowances) : null,
        bonus: parsed.bonus != null ? String(parsed.bonus) : null,
        longTermIncentives: parsed.longTermIncentives != null ? String(parsed.longTermIncentives) : null,
        currency: parsed.currency,
        year: parsed.year,
        notes: parsed.notes,
      });

      res.status(201).json({ parsed, entry });
    } catch (error) {
      console.error("Error parsing remuneration:", error);
      res.status(500).json({ error: "Failed to parse remuneration data" });
    }
  });

  // Executive Notes endpoint
  app.get("/api/executives/:id/notes", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const notes = await storage.getExecutiveNotes(id);
      res.json(notes || { content: '' });
    } catch (error) {
      console.error("Error fetching executive notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  app.put("/api/executives/:id/notes", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const { content } = req.body;
      if (typeof content !== 'string') {
        return res.status(400).json({ error: "Content is required" });
      }
      const notes = await storage.upsertExecutiveNotes(id, content);
      res.json(notes);
    } catch (error) {
      console.error("Error updating executive notes:", error);
      res.status(500).json({ error: "Failed to update notes" });
    }
  });

  // Company Notes endpoints
  app.get("/api/companies/:id/notes", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const notes = await storage.getCompanyNotes(id);
      res.json(notes || { content: '' });
    } catch (error) {
      console.error("Error fetching company notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  app.put("/api/companies/:id/notes", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const { content } = req.body;
      if (typeof content !== 'string') {
        return res.status(400).json({ error: "Content is required" });
      }
      const notes = await storage.upsertCompanyNotes(id, content);
      res.json(notes);
    } catch (error) {
      console.error("Error updating company notes:", error);
      res.status(500).json({ error: "Failed to update notes" });
    }
  });

  app.post("/api/companies/:id/enrich-deepseek", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const { companyName, country, model } = req.body;

      if (!companyName) {
        return res.status(400).json({ error: "Company name is required" });
      }

      const openrouterApiKey = process.env.OPENROUTER_API_KEY;
      if (!openrouterApiKey) {
        return res.status(400).json({ 
          error: "OpenRouter API key not configured", 
          message: "Please add OPENROUTER_API_KEY to your secrets"
        });
      }

      const selectedModel = model || 'openrouter/free';
      console.log(`[AI Enrich] Researching company: ${companyName} (${country || 'Unknown'}) with model: ${selectedModel}`);

      const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://replit.com',
          'X-Title': 'Global Talent Map'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: 'system',
              content: `You are a business research analyst with deep knowledge of global companies. Research and provide accurate, factual information about companies.

Return ONLY valid JSON (no markdown code blocks, just raw JSON) with these fields:
- summary: A 2-4 sentence description of the company including what they do, their market position, and key facts
- coreActivity: What the company primarily does (1-2 sentences describing their main business)
- operatingModel: How the company operates - B2B, B2C, franchise, direct sales, etc. (1-2 sentences)
- revenueDrivers: Main sources of revenue - products, services, subscriptions, etc. (1-2 sentences)

Be accurate and factual. If you're not confident about specific information, provide what you know and note any uncertainty. Do not make up information.`
            },
            {
              role: 'user',
              content: `Research this company and provide business profile information:

Company Name: ${companyName}
Country/Region: ${country || 'Unknown'}

Please provide a comprehensive business profile as JSON. Remember: return ONLY raw JSON, no markdown formatting.`
            }
          ]
        })
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('[DeepSeek API] Error:', errorText);
        return res.status(500).json({ error: "DeepSeek API request failed", message: errorText });
      }

      const aiData = await aiResponse.json();

      let enrichedInfo;
      try {
        let content = aiData.choices[0].message.content;
        // Remove markdown code blocks if present
        content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        enrichedInfo = JSON.parse(content);
      } catch (parseError) {
        console.error('[AI Enrich] Failed to parse response:', aiData.choices[0].message.content);
        return res.status(500).json({ error: "Failed to parse AI response - model may not support structured output" });
      }

      await storage.updateCompanyManual(id, {
        summary: enrichedInfo.summary || null,
        coreActivity: enrichedInfo.coreActivity || null,
        operatingModel: enrichedInfo.operatingModel || null,
        revenueDrivers: enrichedInfo.revenueDrivers || null
      });

      console.log(`[DeepSeek Enrich] Successfully enriched: ${companyName}`);
      res.json(enrichedInfo);
    } catch (error) {
      console.error("Error enriching with DeepSeek:", error);
      res.status(500).json({ error: "Failed to enrich with DeepSeek", message: String(error) });
    }
  });

  app.delete("/api/search-queries/:id/results", async (req, res) => {
    try {
      const searchQueryId = parseInt(String(req.params.id));
      const companies = await storage.getCompaniesBySearchQuery(searchQueryId);
      for (const company of companies) {
        await storage.deleteCompany(company.id);
      }
      await storage.deleteSearchQuery(searchQueryId);
      res.status(204).send();
    } catch (error) {
      console.error("Error clearing search results:", error);
      res.status(500).json({ error: "Failed to clear results" });
    }
  });

  app.post("/api/search-queries/bulk-delete", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      let deleted = 0;
      for (const id of ids) {
        const searchQueryId = parseInt(String(id));
        if (isNaN(searchQueryId)) continue;
        const companies = await storage.getCompaniesBySearchQuery(searchQueryId);
        for (const company of companies) {
          await storage.deleteCompany(company.id);
        }
        await storage.deleteSearchQuery(searchQueryId);
        deleted++;
      }
      res.json({ deleted });
    } catch (error) {
      console.error("Error bulk deleting projects:", error);
      res.status(500).json({ error: "Failed to delete projects" });
    }
  });

  // Discovery Layer: Search endpoint using Serper discovery pipeline
  app.post("/api/search", async (req, res) => {
    try {
      const { query } = req.body;

      if (!query) {
        return res.status(400).json({ error: "Search query is required" });
      }

      console.log(`[Routes] Processing search: "${query}"`);

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

      // Step 5: Run Serper discovery pipeline
      if (!process.env.SERPER_API_KEY) {
        return res.status(503).json({ error: "Search is not configured. Please add SERPER_API_KEY to your secrets." });
      }

      const { runDiscoveryPipeline } = await import("./services/pipeline/discoveryPipeline");

      console.log("[Routes] Running Serper discovery for:", query);
      let companyCount = 0;
      let discoveryError: string | null = null;
      let discoveryErrorCode: string | null = null;

      for await (const event of runDiscoveryPipeline(query, criteria.limit || 10, searchQuery.id)) {
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

      console.log(`[Routes] Serper discovery complete: ${companyCount} companies found`);

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
      // Step 5: Run Serper discovery pipeline (streaming progress via SSE)
      // ---------------------------------------------------------------
      let companyCount = 0;

      if (!process.env.SERPER_API_KEY) {
        sendEvent('error', { message: 'Search is not configured. Please add SERPER_API_KEY to your secrets.' });
        res.end();
        return;
      }

      console.log(`[Routes SSE] Using Serper discovery pipeline for: "${query}"`);

      const { runDiscoveryPipeline } = await import("./services/pipeline/discoveryPipeline");

      sendEvent('status', { message: 'Searching...', progress: 20 });

      for await (const event of runDiscoveryPipeline(query, criteria.limit || 10, searchQuery.id)) {
        if (event.type === 'company') {
          companyCount++;
          sendEvent('company', event.data);
          sendEvent('status', { 
            message: `Found ${companyCount} companies...`, 
            progress: Math.min(20 + companyCount * 5, 90) 
          });
        } else if (event.type === 'error' && event.data?.message) {
          sendEvent('error', event.data);
        }
      }

      await storage.updateSearchQueryResultCount(searchQuery.id, companyCount);
      sendEvent('complete', {
        totalCompanies: companyCount,
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
        satelliteHierarchies: data.searchQuery.satelliteHierarchies || {}
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
        satelliteHierarchies: results.searchQuery.satelliteHierarchies || {}
      });
    } catch (error) {
      console.error("Error loading search results:", error);
      res.status(500).json({ error: "Failed to load search results" });
    }
  });

  // CLOCKWORK DIAGNOSTICS
  // Test Clockwork connectivity and return detailed diagnostic info
  app.get("/api/clockwork/diagnostics", async (_req, res) => {
    try {
      const { runClockworkDiagnostics } = await import("./services/enrichment");
      const diagnostics = await runClockworkDiagnostics();
      res.json(diagnostics);
    } catch (error) {
      console.error("Error running Clockwork diagnostics:", error);
      res.status(500).json({ 
        ok: false,
        error: "Failed to run Clockwork diagnostics",
        details: String(error)
      });
    }
  });

  // CLOCKWORK PROJECT MANAGEMENT
  // Fetch available Clockwork projects (READ-ONLY)
  app.get("/api/clockwork/projects", async (_req, res) => {
    try {
      const { getClockworkProjects } = await import("./services/enrichment");
      const projects = await getClockworkProjects();
      res.json(projects);
    } catch (error) {
      console.error("Error fetching Clockwork projects:", error);
      res.status(500).json({ error: "Failed to fetch Clockwork projects" });
    }
  });

  // Fetch people from a specific Clockwork project (READ-ONLY)
  // Returns detailed results with endpoint verification and warnings
  app.get("/api/clockwork/projects/:projectId/people", async (req, res) => {
    try {
      const { projectId } = req.params;
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }

      const { fetchClockworkProjectPeople } = await import("./services/enrichment");
      const result = await fetchClockworkProjectPeople(projectId);
      res.json(result);
    } catch (error) {
      console.error("Error fetching Clockwork project people:", error);
      res.status(500).json({ 
        error: "Failed to fetch Clockwork project people",
        details: String(error)
      });
    }
  });

  // Update the Clockwork project selection for a search
  app.patch("/api/search/:searchId/name", async (req, res) => {
    try {
      const searchId = parseInt(req.params.searchId);
      const { name } = req.body;

      if (isNaN(searchId)) {
        return res.status(400).json({ error: "Invalid searchId" });
      }

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: "name is required" });
      }

      const updated = await storage.updateSearchQueryName(searchId, name.trim());
      res.json(updated);
    } catch (error) {
      console.error("Error renaming project:", error);
      res.status(500).json({ error: "Failed to rename project" });
    }
  });

  app.patch("/api/search/:searchId/clockwork-project", async (req, res) => {
    try {
      const searchId = parseInt(req.params.searchId);
      const { clockworkProjectId } = req.body;

      if (isNaN(searchId)) {
        return res.status(400).json({ error: "Invalid searchId" });
      }

      if (!clockworkProjectId) {
        return res.status(400).json({ error: "clockworkProjectId is required" });
      }

      const updated = await storage.updateSearchQueryClockworkProject(searchId, clockworkProjectId);
      console.log(`[Clockwork] Updated search ${searchId} to use project ${clockworkProjectId}`);
      res.json(updated);
    } catch (error) {
      console.error("Error updating Clockwork project:", error);
      res.status(500).json({ error: "Failed to update Clockwork project" });
    }
  });

  // DIAGNOSTIC ENDPOINT: Test Clockwork project candidate fetch
  // Returns detailed info about what would be fetched without persisting anything
  app.get("/api/clockwork/diagnostics/project/:clockworkProjectId", async (req, res) => {
    try {
      const { clockworkProjectId } = req.params;

      if (!clockworkProjectId) {
        return res.status(400).json({ error: "clockworkProjectId is required" });
      }

      // Run orchestration with a dummy search ID to test fetch
      const matchResult = await orchestrateEnrichmentMatching(0, clockworkProjectId);

      // Build diagnostic response
      const diagnostics = {
        ok: matchResult.fetchStatus === 'success',
        status: matchResult.fetchError?.status || null,
        fetchedCount: matchResult.totalClockworkExecutives,
        fetchStatus: matchResult.fetchStatus,
        sampleFieldsPresent: matchResult.clockworkCandidates.length > 0 
          ? Object.keys(matchResult.clockworkCandidates[0]).filter(k => 
              matchResult.clockworkCandidates[0][k as keyof typeof matchResult.clockworkCandidates[0]]
            )
          : [],
        paginationUsed: matchResult.paginationUsed,
        pagesFetched: matchResult.pagesFetched,
        totalRawCandidates: matchResult.totalRawCandidates,
        errorMessage: matchResult.fetchError?.message || null,
        endpoint: matchResult.fetchError?.endpoint || null,
        enrichmentRunId: matchResult.enrichmentRunId,
        firmSlug: matchResult.clockworkFirmSlug,
        sampleCandidates: matchResult.clockworkCandidates.slice(0, 3).map(c => ({
          id: c.id,
          name: c.name,
          title: c.title,
          company: c.company
        }))
      };

      res.json(diagnostics);
    } catch (error) {
      console.error("Error in Clockwork diagnostics:", error);
      res.status(500).json({ 
        ok: false,
        error: "Failed to run diagnostics",
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // EXPLORATION ENDPOINT: Find the correct Clockwork API endpoint for project candidates
  // Tests multiple endpoint patterns and reports which ones work
  app.get("/api/clockwork/explore/:clockworkProjectId", async (req, res) => {
    try {
      const { clockworkProjectId } = req.params;

      if (!clockworkProjectId) {
        return res.status(400).json({ error: "clockworkProjectId is required" });
      }

      console.log(`[API] Exploring Clockwork endpoints for project: ${clockworkProjectId}`);
      const result = await exploreClockworkProjectEndpoints(clockworkProjectId);

      res.json(result);
    } catch (error) {
      console.error("Error exploring Clockwork endpoints:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to explore endpoints",
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // ENRICHMENT LAYER: Orchestrate matching between local executives and Clockwork project
  // This endpoint is deterministic and side-effect free - it only returns match results
  app.post("/api/enrichment/match", async (req, res) => {
    try {
      const { searchId, clockworkProjectId } = req.body;

      if (!searchId || !clockworkProjectId) {
        return res.status(400).json({ 
          error: "Both searchId and clockworkProjectId are required" 
        });
      }

      const searchIdNum = parseInt(String(searchId));
      if (isNaN(searchIdNum)) {
        return res.status(400).json({ error: "Invalid searchId" });
      }

      // Verify the search exists
      const searchQuery = await storage.getSearchQuery(searchIdNum);
      if (!searchQuery) {
        return res.status(404).json({ error: "Search not found" });
      }

      // Run the orchestration (read-only, no side effects)
      const matchResult = await orchestrateEnrichmentMatching(
        searchIdNum,
        String(clockworkProjectId)
      );

      res.json(matchResult);
    } catch (error) {
      console.error("Error in enrichment matching:", error);
      res.status(500).json({ error: "Failed to orchestrate enrichment matching" });
    }
  });

  // ENRICHMENT LAYER: Confirm and persist enrichment for a single executive
  // User-triggered only - enriches empty fields and stores metadata
  app.post("/api/enrichment/confirm", async (req, res) => {
    try {
      const { executiveId, clockworkData, confidence, clockworkId, clockworkProjectId } = req.body;

      if (!executiveId || !clockworkData) {
        return res.status(400).json({ 
          error: "executiveId and clockworkData are required" 
        });
      }

      const execIdNum = parseInt(String(executiveId));
      if (isNaN(execIdNum)) {
        return res.status(400).json({ error: "Invalid executiveId" });
      }

      const executive = await storage.getExecutive(execIdNum);
      if (!executive) {
        return res.status(404).json({ error: "Executive not found" });
      }

      // Enrich empty fields with Clockwork data and store metadata
      // This is IDEMPOTENT: re-confirming same clockworkId returns existing state
      const { updated, enrichedFields, alreadyEnriched } = await storage.enrichExecutiveEmptyFields(
        execIdNum,
        {
          email: clockworkData.email,
          phone: clockworkData.phone,
          linkedin: clockworkData.linkedin,
          profileUrl: clockworkData.profileUrl,
          imageUrl: clockworkData.imageUrl
        },
        {
          source: 'clockwork',
          confidence: confidence || 0,
          clockworkId: clockworkId,
          clockworkProjectId: clockworkProjectId
        }
      );

      res.json({
        success: true,
        executive: updated,
        enrichedFields,
        alreadyEnriched,
        metadata: {
          source: 'clockwork',
          confidence,
          clockworkId,
          clockworkProjectId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("Error confirming enrichment:", error);
      res.status(500).json({ error: "Failed to confirm enrichment" });
    }
  });

  // ENRICHMENT LAYER: Create new executive from Clockwork data
  // User-triggered only - creates a new executive when no local match exists
  // IDEMPOTENT: If executive with same clockworkId already exists, returns existing
  app.post("/api/enrichment/create-from-clockwork", async (req, res) => {
    try {
      const { companyId, clockworkData, confidence, clockworkId, clockworkProjectId } = req.body;

      if (!companyId || !clockworkData || !clockworkId) {
        return res.status(400).json({ 
          error: "companyId, clockworkData, and clockworkId are required" 
        });
      }

      const companyIdNum = parseInt(String(companyId));
      if (isNaN(companyIdNum)) {
        return res.status(400).json({ error: "Invalid companyId" });
      }

      const company = await storage.getCompany(companyIdNum);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      // Create new executive from Clockwork data
      // This is IDEMPOTENT: if clockworkId already exists, returns existing executive
      const { executive: newExecutive, alreadyExists } = await storage.createExecutiveFromClockwork(
        {
          companyId: companyIdNum,
          name: clockworkData.name,
          title: clockworkData.title || 'Executive',
          email: clockworkData.email,
          phone: clockworkData.phone,
          linkedin: clockworkData.linkedin,
          profileUrl: clockworkData.profileUrl,
          imageUrl: clockworkData.imageUrl,
          confidence: confidence || 0
        },
        {
          confidence: confidence || 0,
          clockworkId,
          clockworkProjectId
        }
      );

      res.json({
        success: true,
        executive: newExecutive,
        alreadyExists,
        metadata: {
          source: 'clockwork',
          confidence,
          clockworkId,
          clockworkProjectId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("Error creating executive from Clockwork:", error);
      res.status(500).json({ error: "Failed to create executive from Clockwork" });
    }
  });

  // ENRICHMENT LAYER: Import a Clockwork candidate into search results
  // Creates both company (if needed) and executive from Clockwork project candidate
  app.post("/api/enrichment/import-candidate", async (req, res) => {
    try {
      const { 
        searchId, 
        clockworkId, 
        name, 
        title, 
        company: companyName, 
        email, 
        linkedin, 
        imageUrl,
        clockworkProjectId 
      } = req.body;

      if (!searchId || !clockworkId || !name) {
        return res.status(400).json({ 
          error: "searchId, clockworkId, and name are required" 
        });
      }

      const searchIdNum = parseInt(String(searchId));
      if (isNaN(searchIdNum)) {
        return res.status(400).json({ error: "Invalid searchId" });
      }

      // Check if search exists
      const search = await storage.getSearchQuery(searchIdNum);
      if (!search) {
        return res.status(404).json({ error: "Search not found" });
      }

      // Find or create company for this candidate
      // First, check if we already have a company with this name in this search
      const companiesInSearch = await storage.getCompaniesBySearchQuery(searchIdNum);
      let targetCompany = companiesInSearch.find(
        c => c.name.toLowerCase() === (companyName || '').toLowerCase()
      );

      if (!targetCompany && companyName) {
        // Research company details using AI before creating
        console.log(`[Import] Researching company details for: ${companyName}`);
        const researchedData = await researchCompanyDetails(companyName);

        // Check if research was successful (null means validation failed, e.g., Unknown company)
        if (researchedData) {
          // Create a new company with researched data
          targetCompany = await storage.createCompanyManual({
            name: researchedData.name,
            sector: researchedData.sector,
            region: researchedData.region,
            country: researchedData.country,
            streetAddress: researchedData.streetAddress || null,
            latitude: String(researchedData.latitude),
            longitude: String(researchedData.longitude),
            revenue: String(researchedData.revenue),
            revenueSource: researchedData.revenueSource,
            employees: researchedData.employees,
            employeesSource: researchedData.employeesSource,
            confidence: researchedData.confidence,
            color: '#6366f1',
            searchQueryId: searchIdNum
          });
          console.log(`[Import] Created researched company: ${researchedData.name} (ID: ${targetCompany.id}, Revenue: $${researchedData.revenue}, Location: ${researchedData.country})`);
        } else {
          console.log(`[Import] Company research failed for "${companyName}" - using fallback`);
        }
      }

      // If no company found (research failed or no company name), use fallback
      if (!targetCompany) {
        targetCompany = companiesInSearch[0];
        if (!targetCompany) {
          return res.status(400).json({ 
            error: "No company available to attach executive. Run a search first." 
          });
        }
        console.log(`[Import] Using fallback company: ${targetCompany.name}`);
      }

      // Check if executive with this clockworkId already exists ANYWHERE in the search
      // This ensures idempotency across all companies in the search
      let existingExec = null;
      for (const comp of companiesInSearch) {
        const execs = await storage.getExecutivesByCompany(comp.id);
        const found = execs.find(e => e.clockworkId === clockworkId);
        if (found) {
          existingExec = found;
          break;
        }
      }

      if (existingExec) {
        console.log(`[Import] Executive with clockworkId ${clockworkId} already exists (ID: ${existingExec.id})`);
        return res.json({
          success: true,
          executive: existingExec,
          company: targetCompany,
          alreadyExists: true
        });
      }

      // Create new executive from Clockwork data
      const newExecutive = await storage.createExecutiveManual({
        companyId: targetCompany.id,
        name,
        title: title || 'Executive',
        email: email || null,
        phone: null,
        linkedin: linkedin || null,
        profileUrl: null,
        imageUrl: imageUrl || null,
        source: 'clockwork',
        confidence: 5,
        enrichmentSource: 'clockwork',
        enrichmentConfidence: 100,
        enrichmentTimestamp: new Date(),
        clockworkId,
        clockworkProjectId
      });

      console.log(`[Import] Created executive from Clockwork: ${name} (ID: ${newExecutive.id})`);

      // Fetch and store career history from Clockwork
      try {
        const { fetchClockworkCareerHistory } = await import('./services/enrichment');
        const careerPositions = await fetchClockworkCareerHistory(clockworkId);

        if (careerPositions.length > 0) {
          console.log(`[Import] Adding ${careerPositions.length} career history entries for ${name}`);

          for (let i = 0; i < careerPositions.length; i++) {
            const pos = careerPositions[i];
            await storage.createCareerHistory({
              executiveId: newExecutive.id,
              company: pos.company,
              title: pos.title,
              startDate: pos.startDate,
              endDate: pos.endDate,
              description: pos.isCurrent ? 'Current position' : null,
              sortOrder: i
            });
          }
          console.log(`[Import] Successfully added career history for ${name}`);
        } else {
          console.log(`[Import] No career history found in Clockwork for ${name}`);
        }
      } catch (careerError) {
        console.warn(`[Import] Failed to fetch career history for ${name}:`, careerError);
      }

      res.json({
        success: true,
        executive: newExecutive,
        company: targetCompany,
        alreadyExists: false
      });
    } catch (error) {
      console.error("Error importing Clockwork candidate:", error);
      res.status(500).json({ error: "Failed to import Clockwork candidate" });
    }
  });

  // MULTI-PASS ENRICHMENT: Enrich a single company with revenue, employees, and executives
  app.post("/api/companies/:id/enrich-multipass", async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const { revenue = true, employees = true, executives = true } = req.body;

      console.log(`[Routes] Starting multi-pass enrichment for ${company.name}`);
      const result = await runMultiPassEnrichment(companyId, { revenue, employees, executives });

      const updatedCompany = await storage.getCompanyWithExecutives(companyId);

      res.json({
        success: true,
        company: updatedCompany,
        enrichment: result
      });
    } catch (error: any) {
      console.error("Error in multi-pass enrichment:", error);
      res.status(500).json({ error: error.message || "Failed to enrich company" });
    }
  });

  // BATCH MULTI-PASS ENRICHMENT: Enrich all companies in a search result
  app.post("/api/search/:id/enrich-all", async (req, res) => {
    try {
      const searchQueryId = parseInt(req.params.id);
      if (isNaN(searchQueryId)) {
        return res.status(400).json({ error: "Invalid search ID" });
      }

      const searchQuery = await storage.getSearchQuery(searchQueryId);
      if (!searchQuery) {
        return res.status(404).json({ error: "Search not found" });
      }

      console.log(`[Routes] Starting batch multi-pass enrichment for search ${searchQueryId}`);
      const result = await enrichSearchResults(searchQueryId);

      const { inferDiversityForSearch } = await import("./services/pipeline/diversityInference");
      const diversityResult = await inferDiversityForSearch(searchQueryId);
      console.log(`[Routes] Diversity inference: ${diversityResult.updated}/${diversityResult.total} executives updated`);

      const fullResults = await storage.getFullSearchResults(searchQueryId);

      res.json({
        success: true,
        searchQuery,
        enrichment: result,
        diversity: diversityResult,
        companies: fullResults?.companies || []
      });
    } catch (error: any) {
      console.error("Error in batch enrichment:", error);
      res.status(500).json({ error: error.message || "Failed to enrich search results" });
    }
  });

  app.post("/api/import-project", async (req, res) => {
    try {
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
      });
      const searchQueryId = searchQuery.id;

      const companyMap = new Map<string, number>();
      let imported = 0;
      const errors: string[] = [];

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
          const careerSummary = safeStr(mappings.careerSummary ? record[mappings.careerSummary] : null);
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
              await storage.enrichCompanyEmptyFields(companyId, companyUpdates);
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
            });
            companyId = newCompany.id;
            companyMap.set(lowerName, companyId);
          }

          if (companyId && (execName || title !== 'Executive')) {
            const exec = await storage.createExecutiveManual({
              companyId,
              name: execName || 'Unknown',
              title,
              email,
              phone,
              linkedin,
              notes,
              careerSummary,
              remunerationNotes,
              availability,
              level,
              customFields: Object.keys(customFields).length > 0 ? customFields : null,
              confidence: 5
            });

            if (remunerationNotes && remunerationNotes.trim().length >= 5 && exec) {
              try {
                const { parseRemunerationText } = await import("./services/remunerationParser");
                const parsed = await parseRemunerationText(remunerationNotes);
                if (parsed) {
                  await storage.deleteRemunerationByExecutive(exec.id);
                  await storage.createRemuneration({
                    executiveId: exec.id,
                    baseSalary: parsed.baseSalary != null ? String(parsed.baseSalary) : null,
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
          imported++;
        } catch (recordError) {
          console.error('[ImportProject] Error importing record:', recordError);
          errors.push(`Failed to import record`);
        }
      }

      await storage.updateSearchQueryResultCount(searchQueryId, companyMap.size);

      const fullResults = await storage.getFullSearchResults(searchQueryId);

      console.log(`[ImportProject] Created project "${name}" with ${companyMap.size} companies, ${imported} records`);

      res.json({
        success: true,
        searchQueryId,
        projectName: name,
        companiesCreated: companyMap.size,
        recordsImported: imported,
        results: fullResults?.companies || [],
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
      });

      // Fire-and-forget enrichment in background
      enrichSearchResults(searchQueryId).then(async enrichResult => {
        console.log(`[ImportProject] Background enrichment complete for "${name}":`, enrichResult);
        const { inferDiversityForSearch } = await import("./services/pipeline/diversityInference");
        const diversityResult = await inferDiversityForSearch(searchQueryId);
        console.log(`[ImportProject] Diversity inference complete for "${name}": ${diversityResult.updated}/${diversityResult.total}`);
      }).catch(err => {
        console.error(`[ImportProject] Background enrichment failed for "${name}":`, err);
      });

    } catch (error: any) {
      console.error("[ImportProject] Error:", error);
      res.status(500).json({ error: error.message || "Failed to import project" });
    }
  });

  const REGION_DEFINITIONS: Record<string, string[]> = {
    'GCC': ['UAE', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Bahrain', 'Kuwait', 'Oman'],
    'Europe': ['United Kingdom', 'UK', 'France', 'Germany', 'Italy', 'Spain', 'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Ireland', 'Portugal', 'Poland', 'Czech Republic', 'Romania', 'Hungary', 'Greece', 'Luxembourg', 'Croatia', 'Slovakia', 'Slovenia', 'Bulgaria', 'Lithuania', 'Latvia', 'Estonia', 'Malta', 'Cyprus', 'Iceland', 'Serbia', 'Bosnia and Herzegovina', 'North Macedonia', 'Albania', 'Montenegro', 'Moldova', 'Ukraine', 'Belarus'],
    'Asia Pacific': ['China', 'Japan', 'South Korea', 'India', 'Australia', 'New Zealand', 'Singapore', 'Hong Kong', 'Taiwan', 'Malaysia', 'Thailand', 'Indonesia', 'Philippines', 'Vietnam', 'Myanmar', 'Cambodia', 'Laos', 'Bangladesh', 'Pakistan', 'Sri Lanka', 'Nepal', 'Mongolia'],
    'Middle East & North Africa': ['UAE', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Bahrain', 'Kuwait', 'Oman', 'Egypt', 'Morocco', 'Tunisia', 'Algeria', 'Libya', 'Jordan', 'Lebanon', 'Iraq', 'Iran', 'Syria', 'Palestine', 'Yemen', 'Israel', 'Turkey'],
    'Sub-Saharan Africa': ['Nigeria', 'South Africa', 'Kenya', 'Ghana', 'Ethiopia', 'Tanzania', 'Uganda', 'Rwanda', 'Senegal', 'Ivory Coast', 'Cameroon', 'Angola', 'Mozambique', 'Zimbabwe', 'Zambia', 'Botswana', 'Namibia', 'Mauritius', 'Madagascar'],
    'Americas': ['United States', 'USA', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Venezuela', 'Ecuador', 'Uruguay', 'Paraguay', 'Bolivia', 'Costa Rica', 'Panama', 'Guatemala', 'Honduras', 'El Salvador', 'Nicaragua', 'Dominican Republic', 'Cuba', 'Jamaica', 'Trinidad and Tobago'],
  };

  app.get("/api/dashboard/:searchId", async (req, res) => {
    try {
      const searchId = parseInt(req.params.searchId);
      if (isNaN(searchId)) {
        return res.status(400).json({ error: "Invalid search ID" });
      }

      const results = await storage.getFullSearchResults(searchId);
      if (!results) {
        return res.status(404).json({ error: "Search not found" });
      }

      const rawQuery = results.searchQuery.query || '';

      let reportTitle = rawQuery;
      try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI();
        const titleResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a title generator. Given a search query from an executive search firm, produce a short, clean report title (5-12 words max) that describes what the talent mapping exercise covers. Use title case. Do not include numbers like 'Top 10' or 'Top 20'. Do not include instructional phrases. Just the subject matter. Examples: 'Global Luxury Watch and Jewellery Distributors', 'UAE Banking Sector Leadership', 'Middle East Power Generation Companies', 'GCC Family Conglomerates'. Return ONLY the title, nothing else."
            },
            { role: "user", content: rawQuery }
          ],
          max_tokens: 50,
          temperature: 0.3,
        });
        const generated = titleResponse.choices[0]?.message?.content?.trim();
        if (generated && generated.length > 3 && generated.length < 100) {
          reportTitle = generated;
        }
      } catch (e) {
        console.error("Failed to generate report title, using raw query:", e);
      }

      const allCompanies = results.companies;
      const totalCompanies = allCompanies.length;
      const mappedCompanies = allCompanies.filter(c => c.executives.length > 0);
      const mappedCount = mappedCompanies.length;
      const completionPct = totalCompanies > 0 ? Math.round((mappedCount / totalCompanies) * 100) : 0;

      const countryCompletion: Record<string, { total: number; mapped: number }> = {};
      const companiesByCountry: Record<string, number> = {};
      for (const c of allCompanies) {
        const country = c.country || 'Unknown';
        if (!countryCompletion[country]) countryCompletion[country] = { total: 0, mapped: 0 };
        countryCompletion[country].total++;
        companiesByCountry[country] = (companiesByCountry[country] || 0) + 1;
        if (c.executives.length > 0) countryCompletion[country].mapped++;
      }

      const distinctCountries = Object.keys(companiesByCountry).filter(c => c !== 'Unknown').length;
      const originCountry = Object.entries(companiesByCountry)
        .filter(([c]) => c !== 'Unknown')
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

      const availableCountries = Object.keys(companiesByCountry).filter(c => c !== 'Unknown').sort();
      const availableRegions = Object.keys(REGION_DEFINITIONS).sort();

      const allExecutives = allCompanies.flatMap(c =>
        c.executives.map(e => ({ ...e, companyCountry: c.country || 'Unknown', companyRevenue: c.revenue ? Number(c.revenue) : null }))
      );
      const totalExecutives = allExecutives.length;

      const titleBreakdown: Record<string, number> = {};
      const countryExecBreakdown: Record<string, number> = {};
      for (const e of allExecutives) {
        const execLevel = (e.level || '').trim() || 'Unassigned';
        titleBreakdown[execLevel] = (titleBreakdown[execLevel] || 0) + 1;
        countryExecBreakdown[e.companyCountry] = (countryExecBreakdown[e.companyCountry] || 0) + 1;
      }

      const REVENUE_BANDS = [
        { label: '<$100M', min: 0, max: 100_000_000 },
        { label: '$100M–$500M', min: 100_000_000, max: 500_000_000 },
        { label: '$500M–$1B', min: 500_000_000, max: 1_000_000_000 },
        { label: '$1B–$5B', min: 1_000_000_000, max: 5_000_000_000 },
        { label: '$5B+', min: 5_000_000_000, max: Infinity },
      ];
      const getRevenueBand = (rev: number | null) => {
        if (rev == null || rev <= 0) return 'Unknown';
        for (const band of REVENUE_BANDS) {
          if (rev >= band.min && rev < band.max) return band.label;
        }
        return 'Unknown';
      };

      const revenueBands: Record<string, number> = { 'Unknown': 0 };
      REVENUE_BANDS.forEach(b => { revenueBands[b.label] = 0; });
      for (const c of allCompanies) {
        const band = getRevenueBand(c.revenue ? Number(c.revenue) : null);
        revenueBands[band] = (revenueBands[band] || 0) + 1;
      }

      const sectorBreakdown: Record<string, number> = {};
      const ownershipBreakdown: Record<string, number> = {};
      for (const c of allCompanies) {
        const sector = (c.sector || '').trim() || 'Unknown';
        sectorBreakdown[sector] = (sectorBreakdown[sector] || 0) + 1;
        const ownership = (c.ownershipType || '').trim() || 'Unknown';
        ownershipBreakdown[ownership] = (ownershipBreakdown[ownership] || 0) + 1;
      }

      const sortedExecCountries = Object.entries(countryExecBreakdown).sort((a, b) => b[1] - a[1]);
      const top3Share = sortedExecCountries.slice(0, 3).reduce((s, [, c]) => s + c, 0);
      const top3Pct = totalExecutives > 0 ? Math.round((top3Share / totalExecutives) * 100) : 0;
      const concentrationLabel = top3Pct >= 80 ? 'Concentrated' : top3Pct >= 50 ? 'Moderate' : 'Diversified';
      const concentrationIndex = {
        label: concentrationLabel,
        top3Pct,
        topGeographies: sortedExecCountries.slice(0, 3).map(([country, count]) => ({
          country,
          count,
          pct: totalExecutives > 0 ? Math.round((count / totalExecutives) * 100) : 0,
        })),
      };

      const execIds = allExecutives.map(e => e.id);

      type CategoryBreakdown = {
        fixedFees: number[];
        allowances: number[];
        variableBonus: number[];
        ltip: number[];
        totalPackage: number[];
      };
      const emptyBreakdown = (): CategoryBreakdown => ({ fixedFees: [], allowances: [], variableBonus: [], ltip: [], totalPackage: [] });

      let remunerationByLevel: Record<string, CategoryBreakdown> = {};
      let remunerationByGeo: Record<string, CategoryBreakdown> = {};
      let overallCategories: CategoryBreakdown = emptyBreakdown();

      type CompRevenueEntry = { fixedFees: number; allowances: number; variableBonus: number; ltip: number; totalPackage: number; band: string; country: string };
      const compRevenueEntries: CompRevenueEntry[] = [];

      if (execIds.length > 0) {
        const { remuneration } = await import("@shared/schema");
        const { inArray } = await import("drizzle-orm");
        const { db } = await import("./db");
        const { convertToUSD, normalizeCurrencyCode } = await import("./services/currencyConversion");
        const allRem = await db.select().from(remuneration).where(inArray(remuneration.executiveId, execIds));

        const execMap = new Map(allExecutives.map(e => [e.id, e]));
        for (const r of allRem) {
          const currency = normalizeCurrencyCode(r.currency);
          const base = r.baseSalary ? convertToUSD(Number(r.baseSalary), currency) : 0;
          const allow = r.totalAllowances ? convertToUSD(Number(r.totalAllowances), currency) : 0;
          const bon = r.bonus ? convertToUSD(Number(r.bonus), currency) : 0;
          const ltip = r.longTermIncentives ? convertToUSD(Number(r.longTermIncentives), currency) : 0;
          const total = base + allow + bon + ltip;
          if (total <= 0) continue;

          const exec = execMap.get(r.executiveId);
          if (!exec) continue;
          const remLevel = (exec.level || '').trim() || 'Unassigned';
          const country = exec.companyCountry;

          if (!remunerationByLevel[remLevel]) remunerationByLevel[remLevel] = emptyBreakdown();
          if (!remunerationByGeo[country]) remunerationByGeo[country] = emptyBreakdown();

          const addValues = (target: CategoryBreakdown) => {
            if (base > 0) target.fixedFees.push(base);
            if (allow > 0) target.allowances.push(allow);
            if (bon > 0) target.variableBonus.push(bon);
            if (ltip > 0) target.ltip.push(ltip);
            target.totalPackage.push(total);
          };

          addValues(remunerationByLevel[remLevel]);
          addValues(remunerationByGeo[country]);
          addValues(overallCategories);

          const band = getRevenueBand(exec.companyRevenue);
          compRevenueEntries.push({ fixedFees: base, allowances: allow, variableBonus: bon, ltip, totalPackage: total, band, country });
        }
      }

      const computeStats = (values: number[]) => {
        if (values.length === 0) return { min: 0, median: 0, max: 0, count: 0 };
        values.sort((a, b) => a - b);
        const mid = Math.floor(values.length / 2);
        const median = values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
        return { min: values[0], median: Math.round(median), max: values[values.length - 1], count: values.length };
      };

      const computeCategoryStats = (bd: CategoryBreakdown) => ({
        fixedFees: computeStats(bd.fixedFees),
        allowances: computeStats(bd.allowances),
        variableBonus: computeStats(bd.variableBonus),
        ltip: computeStats(bd.ltip),
        totalPackage: computeStats(bd.totalPackage),
      });

      const remLevelStats: Record<string, any> = {};
      for (const [level, data] of Object.entries(remunerationByLevel)) {
        remLevelStats[level] = computeCategoryStats(data);
      }
      const remGeoStats: Record<string, any> = {};
      for (const [geo, data] of Object.entries(remunerationByGeo)) {
        remGeoStats[geo] = computeCategoryStats(data);
      }

      const LEVEL_ORDER = ['Board', 'C-Suite', 'N-1', 'N-2'];
      const CATEGORY_KEYS = ['fixedFees', 'allowances', 'variableBonus', 'ltip', 'totalPackage'] as const;
      type CatKey = typeof CATEGORY_KEYS[number];

      const buildStepUp = (catKey: string) => {
        const entries: Array<{ level: string; median: number; count: number; stepUpPct?: number; stepUpFrom?: string }> = [];
        for (const level of LEVEL_ORDER) {
          const stats = remLevelStats[level];
          if (stats && stats[catKey] && stats[catKey].count > 0) {
            entries.push({ level, median: stats[catKey].median, count: stats[catKey].count });
          }
        }
        for (let i = 1; i < entries.length; i++) {
          const higher = entries[i - 1];
          const lower = entries[i];
          if (lower.median > 0) {
            lower.stepUpPct = Math.round(((higher.median - lower.median) / lower.median) * 100);
            lower.stepUpFrom = higher.level;
          }
        }
        return entries;
      };

      const stepUpAnalysis: Record<string, Array<{ level: string; median: number; count: number; stepUpPct?: number; stepUpFrom?: string }>> = {};
      for (const cat of CATEGORY_KEYS) {
        stepUpAnalysis[cat] = buildStepUp(cat);
      }

      let availableCount = 0;
      const availByLevel: Record<string, { total: number; available: number }> = {};
      const availByGeo: Record<string, { total: number; available: number }> = {};
      
      const genderBreakdown: Record<string, number> = { Male: 0, Female: 0, "Non-Binary": 0, Unknown: 0 };
      const ethnicityBreakdown: Record<string, number> = {};
      const genderByLevel: Record<string, Record<string, number>> = {};
      const ethnicityByLevel: Record<string, Record<string, number>> = {};

      for (const e of allExecutives) {
        const execLevel = (e.level || '').trim() || 'Unassigned';
        const country = e.companyCountry;
        
        // Diversity Analytics
        const gender = (e.gender || 'Unknown').trim();
        const ethnicity = (e.ethnicity || 'Unknown').trim();
        
        genderBreakdown[gender] = (genderBreakdown[gender] || 0) + 1;
        ethnicityBreakdown[ethnicity] = (ethnicityBreakdown[ethnicity] || 0) + 1;

        if (!genderByLevel[execLevel]) genderByLevel[execLevel] = { Male: 0, Female: 0, "Non-Binary": 0, Unknown: 0 };
        genderByLevel[execLevel][gender] = (genderByLevel[execLevel][gender] || 0) + 1;

        if (!ethnicityByLevel[execLevel]) ethnicityByLevel[execLevel] = {};
        ethnicityByLevel[execLevel][ethnicity] = (ethnicityByLevel[execLevel][ethnicity] || 0) + 1;

        if (!availByLevel[execLevel]) availByLevel[execLevel] = { total: 0, available: 0 };
        if (!availByGeo[country]) availByGeo[country] = { total: 0, available: 0 };
        availByLevel[execLevel].total++;
        availByGeo[country].total++;
        const avail = (e.availability || '').toLowerCase().trim();
        if (avail === 'interested') {
          availableCount++;
          availByLevel[execLevel].available++;
          availByGeo[country].available++;
        }
      }

      const revenueBandLabels = REVENUE_BANDS.map(b => b.label);

      res.json({
        reportTitle,
        originCountry,
        availableCountries,
        availableRegions,
        regionDefinitions: REGION_DEFINITIONS,
        revenueBandLabels,
        distinctCountries,
        mappingCompletion: {
          totalCompanies,
          mappedCount,
          completionPct,
          byCountry: countryCompletion,
        },
        executiveUniverse: {
          totalExecutives,
          byTitle: titleBreakdown,
          byCountry: countryExecBreakdown,
        },
        remuneration: {
          overall: computeCategoryStats(overallCategories),
          byLevel: remLevelStats,
          byGeography: remGeoStats,
          currency: 'USD',
          stepUpAnalysis,
          compRevenueEntries,
        },
        revenueBands,
        sectorBreakdown,
        ownershipBreakdown,
        concentrationIndex,
        availability: {
          totalExecutives,
          availableCount,
          availabilityPct: totalExecutives > 0 ? Math.round((availableCount / totalExecutives) * 100) : 0,
          byLevel: availByLevel,
          byGeography: availByGeo,
        },
        diversity: {
          genderBreakdown,
          ethnicityBreakdown,
          genderByLevel,
          ethnicityByLevel,
        },
      });
    } catch (error) {
      console.error("Error generating dashboard:", error);
      res.status(500).json({ error: "Failed to generate dashboard data" });
    }
  });

  return httpServer;
}

function normalizeExecutiveLevel(title: string): string {
  const t = (title || '').toUpperCase().trim();
  if (t.includes('CEO') || t.includes('CHIEF EXECUTIVE') || t.includes('MANAGING DIRECTOR') || t.includes('PRESIDENT') || t.includes('GENERAL MANAGER')) return 'CEO / MD';
  if (t.includes('CFO') || t.includes('CHIEF FINANCIAL')) return 'CFO';
  if (t.includes('COO') || t.includes('CHIEF OPERATING')) return 'COO';
  if (t.includes('CTO') || t.includes('CHIEF TECHNOLOGY') || t.includes('CHIEF TECHNICAL')) return 'CTO';
  if (t.includes('CIO') || t.includes('CHIEF INFORMATION') || t.includes('CHIEF INVESTMENT')) return 'CIO';
  if (t.includes('CHRO') || t.includes('CHIEF HUMAN') || t.includes('CHIEF PEOPLE')) return 'CHRO';
  if (t.includes('CMO') || t.includes('CHIEF MARKETING') || t.includes('CHIEF COMMERCIAL')) return 'CMO';
  if (t.includes('CHIEF')) return 'Other C-Suite';
  if (t.includes('VP') || t.includes('VICE PRESIDENT') || t.includes('SVP') || t.includes('EVP')) return 'VP / SVP';
  if (t.includes('DIRECTOR') || t.includes('HEAD OF')) return 'Director / Head';
  return 'Other';
}