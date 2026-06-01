import { getLLMClient } from "../llmClient";
import type { ResearchedCompany } from "./types";
import { DEFAULT_ENRICHMENT_MODEL } from "./enrichment";

// Region coordinates for fallback when AI doesn't provide precise location
const REGION_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'north america': { lat: 40.7128, lng: -74.0060 },
  'united states': { lat: 40.7128, lng: -74.0060 },
  'usa': { lat: 40.7128, lng: -74.0060 },
  'europe': { lat: 51.5074, lng: -0.1278 },
  'asia': { lat: 35.6762, lng: 139.6503 },
  'middle east': { lat: 25.2048, lng: 55.2708 },
  'uae': { lat: 25.2048, lng: 55.2708 },
  'united arab emirates': { lat: 25.2048, lng: 55.2708 },
  'saudi arabia': { lat: 24.7136, lng: 46.6753 },
  'africa': { lat: -1.2921, lng: 36.8219 },
  'south america': { lat: -23.5505, lng: -46.6333 },
  'australia': { lat: -33.8688, lng: 151.2093 },
  'china': { lat: 31.2304, lng: 121.4737 },
  'india': { lat: 19.0760, lng: 72.8777 },
  'japan': { lat: 35.6762, lng: 139.6503 },
  'germany': { lat: 52.5200, lng: 13.4050 },
  'uk': { lat: 51.5074, lng: -0.1278 },
  'united kingdom': { lat: 51.5074, lng: -0.1278 },
  'france': { lat: 48.8566, lng: 2.3522 },
  'default': { lat: 25.2048, lng: 55.2708 } // Default to Dubai/Middle East
};

function parseNumeric(value: any, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,$\s]/g, '').replace(/[BbMmKk]$/, (m) => {
      const multipliers: Record<string, string> = { 'B': '000000000', 'b': '000000000', 'M': '000000', 'm': '000000', 'K': '000', 'k': '000' };
      return multipliers[m] || '';
    });
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && isFinite(parsed)) {
      return parsed;
    }
  }
  return defaultValue;
}

function validateAndNormalizeCoordinates(lat: any, lng: any, country?: string, region?: string): { lat: number; lng: number } {
  const parsedLat = parseNumeric(lat);
  const parsedLng = parseNumeric(lng);

  // Check if coordinates are valid
  if (parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180 &&
      (parsedLat !== 0 || parsedLng !== 0)) {
    return { lat: parsedLat, lng: parsedLng };
  }

  // Fallback to region/country coordinates
  const lookupKey = (country || region || 'default').toLowerCase().trim();
  const fallback = REGION_COORDINATES[lookupKey] || REGION_COORDINATES['default'];

  // Add small random offset to avoid exact same coordinates
  const offset = () => (Math.random() - 0.5) * 0.1;
  return { lat: fallback.lat + offset(), lng: fallback.lng + offset() };
}

export async function researchCompanyDetails(companyName: string, model: string = DEFAULT_ENRICHMENT_MODEL): Promise<ResearchedCompany> {
  console.log(`[Enrichment:Research] Researching company details for: ${companyName} (model: ${model})`);

  try {
    const llm = await getLLMClient();
    const response = await llm.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: `You are a company research analyst. Given a company name, research and return accurate information about that company.

Return ONLY valid JSON with this exact structure:
{
  "name": "Official Company Name",
  "sector": "Primary Industry Sector",
  "region": "Geographic Region (e.g., Middle East, Europe, North America)",
  "country": "Country where headquarters is located",
  "city": "City where headquarters is located",
  "streetAddress": "Exact street address of headquarters",
  "latitude": 25.2048,
  "longitude": 55.2708,
  "revenue": 500000000,
  "revenueSource": "Annual Report 2024 / Estimate based on industry data",
  "employees": 1500,
  "employeesSource": "Company Website / LinkedIn / Estimate",
  "confidence": 7
}

CRITICAL REQUIREMENTS:
1. Use the OFFICIAL company name (correct capitalization, legal entity)
2. Revenue MUST be in USD (convert if in other currency) - NEVER return 0, provide an estimate if unknown
3. Employees MUST be a realistic number - NEVER return 0, provide an estimate if unknown
4. Latitude/Longitude must be the PRECISE coordinates of the headquarters building
5. If exact data is unavailable, provide best estimate based on company size/industry and set confidence lower (1-10)
6. Return ONLY the JSON object, no additional text or markdown`
        },
        {
          role: "user",
          content: `Research this company and provide details: "${companyName}"`
        }
      ],
      max_tokens: 1000,
      temperature: 0.3
    } as any);

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const data = JSON.parse(content);

    // Validate and normalize all fields
    const name = String(data.name || companyName).trim();
    const sector = String(data.sector || 'Business Services').trim();
    const region = String(data.region || 'Unknown').trim();
    const country = String(data.country || 'Unknown').trim();
    const city = String(data.city || '').trim();
    const streetAddress = String(data.streetAddress || '').trim();

    // Validate coordinates with fallback
    const coords = validateAndNormalizeCoordinates(data.latitude, data.longitude, country, region);

    // Parse revenue - ensure non-zero
    let revenue = parseNumeric(data.revenue, 0);
    if (revenue <= 0) {
      // Estimate based on employee count or default
      const estEmployees = parseNumeric(data.employees, 100);
      revenue = estEmployees * 100000; // Rough estimate: $100k revenue per employee
      console.log(`[Enrichment:Research] Estimated revenue for ${name}: $${revenue}`);
    }

    // EMPLOYEES: Do not auto-set defaults - missing data stays Unknown (no false precision)
    const rawEmployees = parseNumeric(data.employees, 0);
    let employees: number | null = rawEmployees > 0 ? Math.round(rawEmployees) : null;

    if (employees === null) {
      console.log(`[Enrichment:Research] ${name}: No employee data available - keeping as Unknown`);
    }

    // CONFIDENCE: Do not auto-assign default without justification
    // ============================================================================
    // CONFIDENCE SEMANTICS (DO NOT CONFLATE THESE TWO CASES)
    // ============================================================================
    // CASE 1: MISSING → confidence = 3 ("unknown due to missing justification")
    // CASE 2: EXPLICIT 0/1 → preserve value ("explicitly unreliable")
    // CRITICAL: Missing != unreliable, explicit unreliability != auto-upgrade
    // ============================================================================

    const providedConfidence = data.confidence;
    const isConfidenceMissing = providedConfidence === undefined || providedConfidence === null;
    let confidence: number;

    if (isConfidenceMissing) {
      // CASE 1: Missing confidence - unknown, not unreliable
      confidence = 3;
      console.log(`[Enrichment:Research] ${name}: No confidence provided - defaulting to 3 (unknown, not unreliable)`);
    } else {
      const parsedConfidence = parseNumeric(providedConfidence, 3);

      if (parsedConfidence <= 1) {
        // CASE 2: Explicit low confidence - preserve, do not upgrade
        confidence = parsedConfidence;
        console.log(`[Enrichment:Research] ${name}: LLM explicitly signaled low confidence (${confidence}) - preserving as unreliable`);
      } else {
        confidence = Math.max(1, Math.min(10, parsedConfidence));
      }
    }

    console.log(`[Enrichment:Research] Successfully researched company: ${name} (Revenue: $${revenue}, Employees: ${employees}, Location: ${country})`);

    return {
      name,
      sector,
      region,
      country,
      city,
      streetAddress,
      latitude: coords.lat,
      longitude: coords.lng,
      revenue,
      revenueSource: String(data.revenueSource || 'AI Research').trim(),
      employees,
      employeesSource: String(data.employeesSource || 'AI Research').trim(),
      confidence
    };
  } catch (error: any) {
    console.error(`[Enrichment:Research] Failed to research company: ${error.message}`);

    // Return fallback with null values - no false precision when research fails
    const defaultCoords = REGION_COORDINATES['default'];
    return {
      name: companyName,
      sector: 'Unknown',
      region: 'Unknown',
      country: 'Unknown',
      city: '',
      streetAddress: '',
      latitude: defaultCoords.lat + (Math.random() - 0.5) * 0.1,
      longitude: defaultCoords.lng + (Math.random() - 0.5) * 0.1,
      revenue: null, // Unknown - research failed
      revenueSource: 'Unknown (research failed)',
      employees: null, // Unknown - research failed
      employeesSource: 'Unknown (research failed)',
      confidence: 1 // Low confidence due to research failure
    };
  }
}
