import OpenAI from "openai";
import { normalizeCurrencyCode, convertToUSD } from "./currencyConversion";

function createOpenAIClient(): OpenAI {
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

const openai = createOpenAIClient();

export interface ParsedRemuneration {
  baseSalary: number | null;
  totalAllowances: number | null;
  bonus: number | null;
  longTermIncentives: number | null;
  currency: string;
  year: string | null;
  notes: string | null;
}

export interface ParsedRemunerationUSD extends ParsedRemuneration {
  baseSalaryUSD: number | null;
  totalAllowancesUSD: number | null;
  bonusUSD: number | null;
  longTermIncentivesUSD: number | null;
}

const SYSTEM_PROMPT = `You are an expert at extracting structured executive compensation/remuneration data from free-form text. The text may contain salary information in various formats, currencies, and languages.

Extract the following compensation components:
- baseSalary: Fixed base salary / fixed fees / basic pay (annual amount)
- totalAllowances: Total allowances, housing allowance, car allowance, education allowance, any perks and benefits expressed as monetary value (annual total)
- bonus: Variable bonus, performance bonus, annual incentive, short-term incentive (annual amount)
- longTermIncentives: LTIP, long-term incentive plan, stock options, RSUs, equity grants, deferred compensation (annual or vesting amount)
- currency: The currency code (e.g., USD, AED, GBP, EUR, SAR, INR, SGD, CHF). If multiple currencies are mentioned, use the one that applies to the base salary.
- year: The fiscal year or date the compensation relates to (e.g., "2024", "2023/24", "FY2024")

IMPORTANT RULES:
1. Convert monthly figures to annual by multiplying by 12
2. If a total package is given without breakdown, put it all in baseSalary
3. If allowances are described but no specific amount, estimate from context or set to null
4. Do not guess - if a component is not mentioned at all, set to null
5. Parse numbers correctly: "1.2M" = 1200000, "500K" = 500000, "1,200,000" = 1200000
6. Detect the currency from symbols ($, £, €, ¥, ₹, AED, SAR, etc.) or text context
7. If no currency is mentioned, use USD as default
8. Include any useful context or notes about the compensation in the notes field

Return ONLY a valid JSON object with these fields: baseSalary, totalAllowances, bonus, longTermIncentives, currency, year, notes`;

export async function parseRemunerationText(text: string): Promise<ParsedRemuneration | null> {
  if (!text || text.trim().length < 5) return null;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Extract compensation data from this text:\n\n${text}` },
      ],
      max_completion_tokens: 1000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);

    return {
      baseSalary: parseNumeric(parsed.baseSalary),
      totalAllowances: parseNumeric(parsed.totalAllowances),
      bonus: parseNumeric(parsed.bonus),
      longTermIncentives: parseNumeric(parsed.longTermIncentives),
      currency: normalizeCurrencyCode(parsed.currency),
      year: parsed.year ? String(parsed.year) : null,
      notes: parsed.notes || null,
    };
  } catch (error) {
    console.error("[RemunerationParser] Failed to parse:", error);
    return null;
  }
}

export function convertRemunerationToUSD(rem: ParsedRemuneration): ParsedRemunerationUSD {
  return {
    ...rem,
    baseSalaryUSD: rem.baseSalary != null ? convertToUSD(rem.baseSalary, rem.currency) : null,
    totalAllowancesUSD: rem.totalAllowances != null ? convertToUSD(rem.totalAllowances, rem.currency) : null,
    bonusUSD: rem.bonus != null ? convertToUSD(rem.bonus, rem.currency) : null,
    longTermIncentivesUSD: rem.longTermIncentives != null ? convertToUSD(rem.longTermIncentives, rem.currency) : null,
  };
}

function parseNumeric(val: any): number | null {
  if (val === null || val === undefined || val === '' || val === 'null') return null;
  const num = Number(val);
  if (isNaN(num) || num <= 0) return null;
  return Math.round(num * 100) / 100;
}
