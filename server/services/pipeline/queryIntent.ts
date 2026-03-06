import OpenAI from "openai";

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const FREE_MODELS = [
  "anthropic/claude-opus-4.5",
  "google/gemini-2.5-flash",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
];

// ─────────────────────────────────────────────────────────────────────────────
// QueryIntent — derived entirely from what the user typed.
// This is the single source of truth for what the search is trying to find
// and what it should exclude. Every downstream filter reads from this object.
// ─────────────────────────────────────────────────────────────────────────────
export interface QueryIntent {
  // What kind of entity the user is looking for
  entityType: 'company' | 'executive' | 'person';

  // The commercial role of the target company in the value chain
  // e.g. "distributor", "retailer", "manufacturer", "operator", "franchisor", "any"
  commercialRole: string;

  // Sector/industry context derived from the query
  // e.g. "luxury fashion retail", "FMCG food distribution", "telecommunications"
  sector: string;

  // Countries explicitly mentioned in the query
  countries: string[];

  // What types of companies TO include — stated in plain English
  // These are derived from what the user said, not hardcoded
  // e.g. ["independent distributors with brand rights", "multi-brand retail operators"]
  includeTypes: string[];

  // What types of companies TO EXCLUDE — derived from the user's stated intent
  // The key principle: exclude entities that ARE the brand/product itself,
  // not entities that DISTRIBUTE or SELL the brand/product
  // e.g. ["brand owners operating their own stores", "manufacturers selling direct"]
  excludeTypes: string[];

  // Concrete examples of companies that WOULD be a good result (for LLM guidance)
  exampleInclusions: string[];

  // Concrete examples of companies that would be WRONG results (for LLM guidance)
  exampleExclusions: string[];

  // If the user asked for an executive, what role/function they want
  // e.g. "CFO", "Head of Supply Chain", "CEO"
  executiveRole: string | null;

  // Plain English summary of what a valid result looks like
  // Used verbatim in LLM prompts
  validResultDescription: string;

  // Plain English summary of what an invalid result looks like
  // Used verbatim in LLM prompts
  invalidResultDescription: string;
}

function parseJsonSafe(content: string): any {
  let cleaned = content.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) cleaned = jsonMatch[1].trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1) cleaned = cleaned.substring(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function callLLMForIntent(prompt: string): Promise<string | null> {
  for (const model of FREE_MODELS) {
    try {
      const response = await openrouter.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }] as any,
        temperature: 0.1,
        max_tokens: 2000,
      });
      const content = response.choices[0]?.message?.content || '';
      if (content) return content;
    } catch (error: any) {
      console.warn(`[QueryIntent] ${model} failed: ${error.message}`);
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// extractQueryIntent — the single most important function in the pipeline.
// Runs once at the very start, before any search or extraction.
// Everything downstream uses the returned intent object to make decisions.
// ─────────────────────────────────────────────────────────────────────────────
export async function extractQueryIntent(query: string): Promise<QueryIntent> {
  const prompt = `You are analyzing a business research query to understand exactly what the user is looking for.

USER QUERY: "${query}"

Your job is to derive a precise intent object that will guide a search pipeline to return accurate, relevant results.

CRITICAL PRINCIPLE for excludeTypes:
The distinction is NOT about whether a company sells one brand or many brands.
The distinction IS about whether a company is COMMERCIALLY INDEPENDENT from the brands it sells.

CORRECT EXCLUSION LOGIC:
- EXCLUDE: Companies that ARE the brand itself (e.g. if searching for luxury fashion distributors in UAE, exclude Gucci because Gucci IS the brand)
- EXCLUDE: Parent conglomerates that OWN brands (e.g. LVMH owns Gucci, so exclude LVMH)  
- INCLUDE: Any commercially independent company that has rights to distribute or retail a brand — even if they only carry one brand. A regional distributor holding exclusive rights to one brand in a country is still a valid distributor.

EXAMPLES TO GUIDE YOUR REASONING:

Query: "luxury fashion distributors in UAE and Saudi"
→ commercialRole: "distributor/retailer"
→ includeTypes: ["commercially independent companies holding distribution or retail rights for fashion brands in the region", "multi-brand retail groups", "single-brand regional franchise operators"]
→ excludeTypes: ["fashion houses operating their own branded stores (the brand itself)", "luxury brand parent conglomerates that own the brands"]
→ exampleInclusions: ["Al Tayer Group", "Chalhoub Group", "Apparel Group", "Alshaya Group"]
→ exampleExclusions: ["Gucci (is the brand)", "LVMH (owns the brands)", "Hermès (is the brand)"]

Query: "top FMCG distributors in Saudi Arabia"
→ commercialRole: "distributor"
→ includeTypes: ["wholesale distributors of consumer goods", "regional FMCG distribution companies", "companies that hold distribution rights for consumer product brands"]
→ excludeTypes: ["FMCG manufacturers selling their own products direct", "supermarket/retail chains", "brand owners"]
→ exampleInclusions: ["Almunajem Foods", "Binzagr Company", "Nada Dairy"]
→ exampleExclusions: ["Nestle (manufacturer)", "Unilever (manufacturer)", "Panda Retail (retailer, not distributor)"]

Query: "telecom operators in Egypt"
→ commercialRole: "operator"
→ includeTypes: ["licensed telecommunications operators", "mobile network operators", "ISPs"]
→ excludeTypes: ["telecom equipment manufacturers", "telecom consultancies"]
→ exampleInclusions: ["Orange Egypt", "Vodafone Egypt", "Etisalat Misr"]
→ exampleExclusions: ["Ericsson (equipment)", "Nokia (equipment)"]

Query: "find the CFO of Al Tayer Group in UAE"
→ entityType: "executive"
→ executiveRole: "CFO"
→ The company and country context must be preserved so the search finds the regional CFO, not a global one

Now analyze the user's query and return a JSON object. Be specific and derive everything from what the user actually said.

Return ONLY valid JSON, no other text:
{
  "entityType": "company" | "executive" | "person",
  "commercialRole": "string describing their role in value chain",
  "sector": "string",
  "countries": ["array of full country names"],
  "includeTypes": ["array of plain English descriptions of what TO include"],
  "excludeTypes": ["array of plain English descriptions of what TO exclude — remember: exclude entities that ARE the brand/product, not those that distribute it"],
  "exampleInclusions": ["array of 3-5 example company names that WOULD be correct results"],
  "exampleExclusions": ["array of 3-5 example company names that would be WRONG results"],
  "executiveRole": "string or null",
  "validResultDescription": "one sentence describing what a valid result looks like",
  "invalidResultDescription": "one sentence describing what an invalid result looks like"
}`;

  try {
    const response = await callLLMForIntent(prompt);
    if (!response) throw new Error('No response from LLM');

    const parsed = parseJsonSafe(response);
    if (!parsed) throw new Error('Failed to parse intent JSON');

    // Validate and fill defaults for any missing fields
    const intent: QueryIntent = {
      entityType: parsed.entityType || 'company',
      commercialRole: parsed.commercialRole || 'any',
      sector: parsed.sector || 'general',
      countries: Array.isArray(parsed.countries) ? parsed.countries : [],
      includeTypes: Array.isArray(parsed.includeTypes) ? parsed.includeTypes : [],
      excludeTypes: Array.isArray(parsed.excludeTypes) ? parsed.excludeTypes : [],
      exampleInclusions: Array.isArray(parsed.exampleInclusions) ? parsed.exampleInclusions : [],
      exampleExclusions: Array.isArray(parsed.exampleExclusions) ? parsed.exampleExclusions : [],
      executiveRole: parsed.executiveRole || null,
      validResultDescription: parsed.validResultDescription || 'A company relevant to the query',
      invalidResultDescription: parsed.invalidResultDescription || 'A company not relevant to the query',
    };

    console.log(`[QueryIntent] Extracted intent:`, JSON.stringify(intent, null, 2));
    return intent;

  } catch (error: any) {
    console.warn(`[QueryIntent] Intent extraction failed, using minimal defaults: ${error.message}`);

    // Fallback: minimal intent that won't over-filter
    return {
      entityType: 'company',
      commercialRole: 'any',
      sector: 'general',
      countries: [],
      includeTypes: ['companies relevant to the query'],
      excludeTypes: [],
      exampleInclusions: [],
      exampleExclusions: [],
      executiveRole: null,
      validResultDescription: 'A company relevant to the query',
      invalidResultDescription: 'A company not relevant to the query',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildInclusionPromptBlock — converts a QueryIntent into a reusable prompt
// block that can be injected into any LLM prompt in the pipeline.
// ─────────────────────────────────────────────────────────────────────────────
export function buildInclusionPromptBlock(intent: QueryIntent): string {
  const lines: string[] = [];

  lines.push(`SEARCH INTENT:`);
  lines.push(`The user is looking for: ${intent.validResultDescription}`);
  lines.push(`Sector: ${intent.sector}`);
  if (intent.countries.length > 0) {
    lines.push(`Countries: ${intent.countries.join(', ')}`);
  }
  lines.push('');

  if (intent.includeTypes.length > 0) {
    lines.push(`INCLUDE — these types of companies are CORRECT results:`);
    intent.includeTypes.forEach(t => lines.push(`  • ${t}`));
    if (intent.exampleInclusions.length > 0) {
      lines.push(`  Examples: ${intent.exampleInclusions.join(', ')}`);
    }
    lines.push('');
  }

  if (intent.excludeTypes.length > 0) {
    lines.push(`EXCLUDE — these types of companies are WRONG results:`);
    intent.excludeTypes.forEach(t => lines.push(`  • ${t}`));
    if (intent.exampleExclusions.length > 0) {
      lines.push(`  Examples of wrong results: ${intent.exampleExclusions.join(', ')}`);
    }
    lines.push('');
  }

  lines.push(`A result is INVALID if: ${intent.invalidResultDescription}`);

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// checkCompanyAgainstIntent — uses the LLM to verify a single company name
// against the derived intent. Used as a final gate for ambiguous cases.
// This is only called when heuristic checks are insufficient.
// ─────────────────────────────────────────────────────────────────────────────
export async function checkCompanyAgainstIntent(
  companyName: string,
  intent: QueryIntent
): Promise<boolean> {
  // Fast-path: if no exclusion rules, everything passes
  if (intent.excludeTypes.length === 0) return true;

  const intentBlock = buildInclusionPromptBlock(intent);

  const prompt = `You are deciding whether a company is a valid result for a search query.

${intentBlock}

CRITICAL: Apply the entity type test. Ask yourself:
- What TYPE of company does the query want? (e.g. distributor, retail group, operator)
- Is this extracted company OF THAT TYPE, or is it a product/brand SOLD BY that type?

A company called "Chanel" or "Gucci" is a BRAND — reject it when the query wants 
retail operators, even if it appears in a list of "luxury retailers".
A company called "Al Tayer Group" or "Alshaya" is a RETAIL OPERATOR — keep it.

This applies to any sector:
- Wants pharma distributors → reject "Pfizer", keep "Al Nahdi Medical"  
- Wants FMCG distributors → reject "Nestlé", keep "Olayan Group"
- Wants fashion retail groups → reject "Gucci", keep "Chalhoub Group"

The test: does this company DISTRIBUTE/OPERATE/RETAIL the sector's products, 
or does it MAKE/OWN the products?

COMPANY TO EVALUATE: "${companyName}"

Question: Is "${companyName}" a valid result based on the intent above?

Answer with ONLY a JSON object:
{ "isValid": true/false, "reason": "one sentence explanation" }`;

  try {
    const response = await callLLMForIntent(prompt);
    if (!response) return true; // Fail open — don't block on LLM failure
    const parsed = parseJsonSafe(response);
    if (!parsed || typeof parsed.isValid !== 'boolean') return true;
    if (!parsed.isValid) {
      console.log(`[QueryIntent] Rejected "${companyName}": ${parsed.reason}`);
    }
    return parsed.isValid;
  } catch {
    return true; // Fail open
  }
}