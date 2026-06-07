import type { Express } from "express";
import { storage } from "../../storage";
import type { AuthedRequest } from "../../auth/middleware";

const REGION_DEFINITIONS: Record<string, string[]> = {
  'GCC': ['UAE', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Bahrain', 'Kuwait', 'Oman'],
  'Europe': ['United Kingdom', 'UK', 'France', 'Germany', 'Italy', 'Spain', 'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Ireland', 'Portugal', 'Poland', 'Czech Republic', 'Romania', 'Hungary', 'Greece', 'Luxembourg', 'Croatia', 'Slovakia', 'Slovenia', 'Bulgaria', 'Lithuania', 'Latvia', 'Estonia', 'Malta', 'Cyprus', 'Iceland', 'Serbia', 'Bosnia and Herzegovina', 'North Macedonia', 'Albania', 'Montenegro', 'Moldova', 'Ukraine', 'Belarus'],
  'Asia Pacific': ['China', 'Japan', 'South Korea', 'India', 'Australia', 'New Zealand', 'Singapore', 'Hong Kong', 'Taiwan', 'Malaysia', 'Thailand', 'Indonesia', 'Philippines', 'Vietnam', 'Myanmar', 'Cambodia', 'Laos', 'Bangladesh', 'Pakistan', 'Sri Lanka', 'Nepal', 'Mongolia'],
  'Middle East & North Africa': ['UAE', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Bahrain', 'Kuwait', 'Oman', 'Egypt', 'Morocco', 'Tunisia', 'Algeria', 'Libya', 'Jordan', 'Lebanon', 'Iraq', 'Iran', 'Syria', 'Palestine', 'Yemen', 'Israel', 'Turkey'],
  'Sub-Saharan Africa': ['Nigeria', 'South Africa', 'Kenya', 'Ghana', 'Ethiopia', 'Tanzania', 'Uganda', 'Rwanda', 'Senegal', 'Ivory Coast', 'Cameroon', 'Angola', 'Mozambique', 'Zimbabwe', 'Zambia', 'Botswana', 'Namibia', 'Mauritius', 'Madagascar'],
  'Americas': ['United States', 'USA', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Venezuela', 'Ecuador', 'Uruguay', 'Paraguay', 'Bolivia', 'Costa Rica', 'Panama', 'Guatemala', 'Honduras', 'El Salvador', 'Nicaragua', 'Dominican Republic', 'Cuba', 'Jamaica', 'Trinidad and Tobago'],
};

export function registerDashboard(app: Express): void {
  app.get("/api/dashboard/:searchId", async (req: AuthedRequest, res) => {
    try {
      const searchId = parseInt(String(req.params.searchId));
      if (isNaN(searchId)) {
        return res.status(400).json({ error: "Invalid search ID" });
      }

      const results = await storage.getFullSearchResults(searchId, req.orgId!);
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
        const { supabase: sb } = await import("../../supabase");
        const { convertToUSD, normalizeCurrencyCode } = await import("../../services/currencyConversion");
        const { data: allRem, error: remErr } = await sb
          .from("hak_remuneration")
          .select("*")
          .in("executive_id", execIds);
        if (remErr) throw new Error(`Remuneration query failed: ${remErr.message}`);

        const execMap = new Map(allExecutives.map(e => [e.id, e]));
        for (const r of (allRem ?? [])) {
          const currency = normalizeCurrencyCode(r.currency);
          const base = r.base_salary ? convertToUSD(Number(r.base_salary), currency) : 0;
          const allow = r.total_allowances ? convertToUSD(Number(r.total_allowances), currency) : 0;
          const bon = r.bonus ? convertToUSD(Number(r.bonus), currency) : 0;
          const ltip = r.long_term_incentives ? convertToUSD(Number(r.long_term_incentives), currency) : 0;
          const total = base + allow + bon + ltip;
          if (total <= 0) continue;

          const exec = execMap.get(r.executive_id);
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
      let outOfScopeCount = 0;
      let offLimitsCount = 0;
      let companyOutOfScopeCount = 0;
      let companyOffLimitsCount = 0;
      for (const c of allCompanies) {
        const cs = (c.status || '').trim().toLowerCase();
        if (cs === 'out of scope') companyOutOfScopeCount++;
        else if (cs === 'off-limits') companyOffLimitsCount++;
      }
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
        } else if (avail === 'out of scope') {
          outOfScopeCount++;
        } else if (avail === 'off-limits') {
          offLimitsCount++;
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
          outOfScopeCount,
          outOfScopePct: totalExecutives > 0 ? Math.round((outOfScopeCount / totalExecutives) * 100) : 0,
          offLimitsCount,
          offLimitsPct: totalExecutives > 0 ? Math.round((offLimitsCount / totalExecutives) * 100) : 0,
          companyOutOfScopeCount,
          companyOutOfScopePct: totalCompanies > 0 ? Math.round((companyOutOfScopeCount / totalCompanies) * 100) : 0,
          companyOffLimitsCount,
          companyOffLimitsPct: totalCompanies > 0 ? Math.round((companyOffLimitsCount / totalCompanies) * 100) : 0,
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
}
