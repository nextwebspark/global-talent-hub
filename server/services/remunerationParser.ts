import OpenAI from "openai";
import { normalizeCurrencyCode, convertToUSD, convertBetweenCurrencies } from "./currencyConversion";

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

Extract each compensation component EXACTLY as stated in the text, preserving the original currency for each component. Different components may be in different currencies.

Return a JSON object with these fields:

- baseSalary: object with { "value": number, "currency": "XXX", "period": "monthly"|"annual" } or null
- totalAllowances: object with { "value": number, "currency": "XXX", "period": "monthly"|"annual" } or null
- bonus: object with { "value": number, "type": "percentage"|"amount", "currency": "XXX" } or null
  - If bonus is a percentage (e.g., "Bonus 25%", "20% bonus"), set type="percentage" and value=25 (the percentage number)
  - If bonus is a flat amount (e.g., "Bonus 50,000"), set type="amount" and value=50000
- longTermIncentives: object with { "value": number, "currency": "XXX", "period": "monthly"|"annual" } or null
- year: string or null — the fiscal year (e.g., "2024", "FY2024")
- notes: string or null — any useful context

RULES:
1. Parse numbers correctly: "1.2M" = 1200000, "500K" = 500000, "1,200,000" = 1200000
2. Detect currency from symbols ($, £, €, ¥, ₹) or text (AED, SAR, USD, etc.) for EACH component independently
3. $ symbol means USD unless specified otherwise (e.g., S$ = SGD, HK$ = HKD, A$ = AUD)
4. If a component has no explicit currency, inherit from the base salary's currency
5. If no currency at all is mentioned anywhere, use USD
6. Keep period as stated: if "monthly" or "/month", set period="monthly"; if "/year" or annual, set period="annual"; default to "annual"
7. If a total package is given without breakdown, put it all in baseSalary
8. Do not guess - if a component is not mentioned at all, set to null
9. For bonus percentage, just return the percentage number (e.g., 25 for "25%"), NOT the calculated amount

Return ONLY the JSON object.`;

interface RawComponent {
  value: number;
  currency: string;
  period?: string;
  type?: string;
}

interface RawParsedResult {
  baseSalary: RawComponent | null;
  totalAllowances: RawComponent | null;
  bonus: (RawComponent & { type: string }) | null;
  longTermIncentives: RawComponent | null;
  year: string | null;
  notes: string | null;
}

function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
  return convertBetweenCurrencies(amount, fromCurrency, toCurrency);
}

function annualize(value: number, period: string | undefined): number {
  if (period === 'monthly') return value * 12;
  return value;
}

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

    const raw: RawParsedResult = JSON.parse(content);

    const primaryCurrency = normalizeCurrencyCode(
      raw.baseSalary?.currency || raw.totalAllowances?.currency || raw.bonus?.currency || raw.longTermIncentives?.currency || 'USD'
    );

    const baseSalaryAnnual = raw.baseSalary
      ? annualize(raw.baseSalary.value, raw.baseSalary.period)
      : null;

    const baseSalaryConverted = baseSalaryAnnual != null && raw.baseSalary
      ? convertCurrency(baseSalaryAnnual, normalizeCurrencyCode(raw.baseSalary.currency), primaryCurrency)
      : null;

    let totalAllowancesConverted: number | null = null;
    if (raw.totalAllowances) {
      const annualVal = annualize(raw.totalAllowances.value, raw.totalAllowances.period);
      totalAllowancesConverted = convertCurrency(annualVal, normalizeCurrencyCode(raw.totalAllowances.currency), primaryCurrency);
    }

    let bonusConverted: number | null = null;
    if (raw.bonus) {
      if (raw.bonus.type === 'percentage' && baseSalaryConverted != null) {
        bonusConverted = Math.round((raw.bonus.value / 100) * baseSalaryConverted * 100) / 100;
      } else if (raw.bonus.type === 'amount' || raw.bonus.type !== 'percentage') {
        const bonusVal = raw.bonus.value;
        bonusConverted = convertCurrency(bonusVal, normalizeCurrencyCode(raw.bonus.currency), primaryCurrency);
      }
    }

    let ltipConverted: number | null = null;
    if (raw.longTermIncentives) {
      const annualVal = annualize(raw.longTermIncentives.value, raw.longTermIncentives.period);
      ltipConverted = convertCurrency(annualVal, normalizeCurrencyCode(raw.longTermIncentives.currency), primaryCurrency);
    }

    const notesParts: string[] = [];
    if (raw.notes) notesParts.push(raw.notes);

    if (raw.baseSalary?.period === 'monthly') {
      notesParts.push(`Base salary converted from monthly ${raw.baseSalary.currency} ${raw.baseSalary.value.toLocaleString()} to annual ${primaryCurrency} ${baseSalaryConverted?.toLocaleString()}`);
    }
    if (raw.bonus?.type === 'percentage' && baseSalaryConverted != null) {
      notesParts.push(`Bonus calculated as ${raw.bonus.value}% of base salary = ${primaryCurrency} ${bonusConverted?.toLocaleString()}`);
    }
    if (raw.longTermIncentives && normalizeCurrencyCode(raw.longTermIncentives.currency) !== primaryCurrency) {
      notesParts.push(`LTIP converted from ${raw.longTermIncentives.currency} ${raw.longTermIncentives.value.toLocaleString()} to ${primaryCurrency} ${ltipConverted?.toLocaleString()}`);
    }
    if (raw.totalAllowances && normalizeCurrencyCode(raw.totalAllowances.currency) !== primaryCurrency) {
      notesParts.push(`Allowances converted from ${raw.totalAllowances.currency} ${raw.totalAllowances.value.toLocaleString()} to ${primaryCurrency} ${totalAllowancesConverted?.toLocaleString()}`);
    }

    return {
      baseSalary: parseNumeric(baseSalaryConverted),
      totalAllowances: parseNumeric(totalAllowancesConverted),
      bonus: parseNumeric(bonusConverted),
      longTermIncentives: parseNumeric(ltipConverted),
      currency: primaryCurrency,
      year: raw.year ? String(raw.year) : null,
      notes: notesParts.length > 0 ? notesParts.join('. ') : null,
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
