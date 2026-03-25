import OpenAI from "openai";

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

export const SECTOR_TAXONOMY: Record<string, string[]> = {
  "Energy": ["Oil, Gas & Pipelines", "Renewable Energy"],
  "Materials": ["Metals & Mining", "Chemicals", "Construction Materials"],
  "Industrials": [
    "Aerospace & Defense",
    "Transportation & Logistics",
    "Construction & Engineering",
    "Industrial Machinery",
  ],
  "Consumer Discretionary": [
    "Retail & E-Commerce",
    "Automotive",
    "Travel, Leisure & Hospitality",
    "Media & Entertainment",
  ],
  "Consumer Staples": [
    "Food & Beverage",
    "Household & Personal Products",
    "Grocery & Drug Retail",
  ],
  "Health Care": [
    "Pharmaceuticals & Biotech",
    "Medical Devices & Equipment",
    "Health Care Services",
  ],
  "Financial Services": [
    "Banking",
    "Insurance",
    "Asset Management",
    "Fintech & Payments",
  ],
  "Information Technology": [
    "Software & SaaS",
    "Hardware & Semiconductors",
    "IT Services & Consulting",
    "Cybersecurity",
  ],
  "Communication Services": [
    "Telecom",
    "Internet & Digital Platforms",
    "Gaming",
  ],
  "Utilities": [
    "Electric Utilities",
    "Water & Waste Management",
    "Gas Distribution",
  ],
  "Real Estate": [
    "Commercial Real Estate",
    "Residential Real Estate",
    "REITs & Property Management",
  ],
  "Conglomerates & Holding Companies": [
    "Family Conglomerates",
    "Sovereign & State-Owned Holding Companies",
    "Private Equity & Investment Holding",
  ],
  "Sovereign Wealth & Government": [
    "Sovereign Wealth Funds",
    "Government & Public Sector",
    "Quasi-Government Entities",
  ],
};

export const SECTOR_CATEGORIES = Object.keys(SECTOR_TAXONOMY);
export const ALL_SECTORS = Object.values(SECTOR_TAXONOMY).flat();

const SECTOR_TO_CATEGORY: Record<string, string> = {};
for (const [category, sectors] of Object.entries(SECTOR_TAXONOMY)) {
  for (const sector of sectors) {
    SECTOR_TO_CATEGORY[sector] = category;
  }
}

export function getCategoryForSector(sector: string | null | undefined): string | null {
  if (!sector) return null;
  return SECTOR_TO_CATEGORY[sector] || null;
}

/** Returns true only if `sector` is a recognized specific sub-sector. */
export function isStandardSector(sector: string | null | undefined): boolean {
  return !!sector && sector in SECTOR_TO_CATEGORY;
}

export interface SectorResult {
  sector: string | null;
  category: string | null;
}

const SECTOR_LIST_FOR_PROMPT = Object.entries(SECTOR_TAXONOMY)
  .map(([cat, subs]) => `${cat}: ${subs.join(", ")}`)
  .join("\n");

const SYSTEM_PROMPT = `You are a sector classification expert. Classify companies into the most specific sector from this taxonomy:

${SECTOR_LIST_FOR_PROMPT}

Rules:
- Respond ONLY with valid JSON, no explanation.
- "sector" must be EXACTLY one of the specific sub-sectors listed above (exact spelling and capitalisation).
- "category" must be the corresponding category name (exact spelling and capitalisation).
- Set confidence to "high" only if you are certain based on the company name alone.
- Set confidence to "low" if the name is ambiguous, generic, or unknown.`;

/**
 * Returns the sector unchanged (+ its category) if already a valid sub-sector,
 * or infers both from the company name if not.
 */
export async function normalizeOrInferSector(
  companyName: string,
  rawSector: string | null | undefined,
): Promise<SectorResult> {
  if (isStandardSector(rawSector)) {
    return { sector: rawSector!, category: SECTOR_TO_CATEGORY[rawSector!] };
  }
  return inferSector(companyName);
}

export async function inferSector(companyName: string): Promise<SectorResult> {
  const empty: SectorResult = { sector: null, category: null };
  if (
    !companyName ||
    companyName.toLowerCase() === "imported contacts" ||
    companyName.toLowerCase() === "unknown"
  ) {
    return empty;
  }
  try {
    const response = await openrouter.chat.completions.create({
      model: "anthropic/claude-sonnet-4",
      max_tokens: 80,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Company name: "${companyName}"\n\nRespond with JSON: {"sector": "<specific sub-sector>", "category": "<category>", "confidence": "high"|"medium"|"low"}`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return empty;

    const parsed: { sector: string; category: string; confidence: string } = JSON.parse(jsonMatch[0]);
    if (parsed.confidence !== "high") return empty;
    if (!isStandardSector(parsed.sector)) return empty;

    return { sector: parsed.sector, category: SECTOR_TO_CATEGORY[parsed.sector] };
  } catch (err) {
    console.warn(`[sectorInference] Failed to infer sector for "${companyName}":`, err);
    return empty;
  }
}

export async function inferSectorsBatch(
  companies: { id: number; name: string }[],
): Promise<{ id: number; sector: string; category: string }[]> {
  if (companies.length === 0) return [];

  const companiesJson = companies
    .map((c) => `{"id":${c.id},"name":"${c.name.replace(/"/g, '\\"')}"}`)
    .join(",\n");

  const batchPrompt = `You are a sector classification expert. Classify each company using this taxonomy:

${SECTOR_LIST_FOR_PROMPT}

For each company, output the most specific matching sub-sector and its parent category.
Set "confidence" to "high" only when certain from the company name alone. Use "low" when ambiguous.

Companies to classify:
[${companiesJson}]

Respond with ONLY a JSON array:
[{"id": <id>, "sector": "<specific sub-sector>", "category": "<category>", "confidence": "high"|"low"}, ...]`;

  try {
    const response = await openrouter.chat.completions.create({
      model: "anthropic/claude-sonnet-4",
      max_tokens: 2000,
      temperature: 0,
      messages: [{ role: "user", content: batchPrompt }],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed: Array<{ id: number; sector: string; category: string; confidence: string }> =
      JSON.parse(jsonMatch[0]);
    return parsed
      .filter(
        (r) =>
          r.confidence === "high" &&
          isStandardSector(r.sector),
      )
      .map((r) => ({ id: r.id, sector: r.sector, category: SECTOR_TO_CATEGORY[r.sector] }));
  } catch (err) {
    console.warn("[sectorInference] Batch inference failed:", err);
    return [];
  }
}
