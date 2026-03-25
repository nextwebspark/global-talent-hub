import OpenAI from "openai";

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

export const GICS_SECTORS = [
  "Energy",
  "Materials",
  "Industrials",
  "Consumer Discretionary",
  "Consumer Staples",
  "Health Care",
  "Financials",
  "Information Technology",
  "Communication Services",
  "Utilities",
  "Real Estate",
] as const;

export type GicsSector = typeof GICS_SECTORS[number];

const SECTOR_LIST = GICS_SECTORS.join(", ");

const SYSTEM_PROMPT = `You are a sector classification expert. Classify companies into exactly one of these 11 GICS top-level sectors: ${SECTOR_LIST}.

Rules:
- Respond ONLY with valid JSON, no explanation.
- Use EXACTLY one of the 11 sector names above (exact spelling and capitalisation).
- Set confidence to "high" only if you are certain based on the company name alone.
- Set confidence to "low" if the name is ambiguous, generic, or unknown.`;

interface InferResult {
  sector: GicsSector | null;
  confidence: "high" | "medium" | "low";
}

export async function inferSector(companyName: string): Promise<string | null> {
  if (!companyName || companyName.toLowerCase() === "imported contacts" || companyName.toLowerCase() === "unknown") {
    return null;
  }
  try {
    const response = await openrouter.chat.completions.create({
      model: "anthropic/claude-sonnet-4",
      max_tokens: 60,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Company name: "${companyName}"\n\nRespond with JSON: {"sector": "<sector>", "confidence": "high"|"medium"|"low"}`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed: InferResult = JSON.parse(jsonMatch[0]);
    if (parsed.confidence !== "high") return null;
    if (!GICS_SECTORS.includes(parsed.sector as GicsSector)) return null;

    return parsed.sector;
  } catch (err) {
    console.warn(`[sectorInference] Failed to infer sector for "${companyName}":`, err);
    return null;
  }
}

export async function inferSectorsBatch(
  companies: { id: number; name: string }[]
): Promise<{ id: number; sector: string }[]> {
  if (companies.length === 0) return [];

  const sectorList = GICS_SECTORS.join(", ");
  const companiesJson = companies.map(c => `{"id":${c.id},"name":"${c.name.replace(/"/g, '\\"')}"}`).join(",\n");

  const batchPrompt = `You are a sector classification expert. Classify each company into exactly one of these 11 GICS sectors: ${sectorList}.

Respond ONLY with a JSON array. For each entry set "confidence" to "high" only when you are certain from the company name alone. Use "low" when ambiguous.

Companies to classify:
[${companiesJson}]

Respond with: [{"id": <id>, "sector": "<sector>", "confidence": "high"|"low"}, ...]`;

  try {
    const response = await openrouter.chat.completions.create({
      model: "anthropic/claude-sonnet-4",
      max_tokens: 1000,
      temperature: 0,
      messages: [{ role: "user", content: batchPrompt }],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed: Array<{ id: number; sector: string; confidence: string }> = JSON.parse(jsonMatch[0]);
    return parsed
      .filter(r => r.confidence === "high" && GICS_SECTORS.includes(r.sector as GicsSector))
      .map(r => ({ id: r.id, sector: r.sector }));
  } catch (err) {
    console.warn("[sectorInference] Batch inference failed:", err);
    return [];
  }
}
