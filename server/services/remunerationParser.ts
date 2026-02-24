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

    const notesParts: string[] = [];
    if (raw.notes) notesParts.push(raw.notes);

    let baseSalaryUSD: number | null = null;
    if (raw.baseSalary) {
      const annualVal = annualize(raw.baseSalary.value, raw.baseSalary.period);
      const fromCurrency = normalizeCurrencyCode(raw.baseSalary.currency);
      baseSalaryUSD = convertCurrency(annualVal, fromCurrency, 'USD');
      if (fromCurrency !== 'USD') {
        notesParts.push(`Fixed fees: ${fromCurrency} ${annualVal.toLocaleString()} → USD ${baseSalaryUSD.toLocaleString()}`);
      }
      if (raw.baseSalary.period === 'monthly') {
        notesParts.push(`Base salary annualized from monthly ${fromCurrency} ${raw.baseSalary.value.toLocaleString()}`);
      }
    }

    let totalAllowancesUSD: number | null = null;
    if (raw.totalAllowances) {
      const annualVal = annualize(raw.totalAllowances.value, raw.totalAllowances.period);
      const fromCurrency = normalizeCurrencyCode(raw.totalAllowances.currency);
      totalAllowancesUSD = convertCurrency(annualVal, fromCurrency, 'USD');
      if (fromCurrency !== 'USD') {
        notesParts.push(`Allowances: ${fromCurrency} ${annualVal.toLocaleString()} → USD ${totalAllowancesUSD.toLocaleString()}`);
      }
    }

    let bonusUSD: number | null = null;
    if (raw.bonus) {
      if (raw.bonus.type === 'percentage' && baseSalaryUSD != null) {
        bonusUSD = Math.round((raw.bonus.value / 100) * baseSalaryUSD * 100) / 100;
        notesParts.push(`Bonus: ${raw.bonus.value}% of base = USD ${bonusUSD.toLocaleString()}`);
      } else if (raw.bonus.type === 'amount' || raw.bonus.type !== 'percentage') {
        const fromCurrency = normalizeCurrencyCode(raw.bonus.currency);
        bonusUSD = convertCurrency(raw.bonus.value, fromCurrency, 'USD');
        if (fromCurrency !== 'USD') {
          notesParts.push(`Bonus: ${fromCurrency} ${raw.bonus.value.toLocaleString()} → USD ${bonusUSD.toLocaleString()}`);
        }
      }
    }

    let ltipUSD: number | null = null;
    if (raw.longTermIncentives) {
      const annualVal = annualize(raw.longTermIncentives.value, raw.longTermIncentives.period);
      const fromCurrency = normalizeCurrencyCode(raw.longTermIncentives.currency);
      ltipUSD = convertCurrency(annualVal, fromCurrency, 'USD');
      if (fromCurrency !== 'USD') {
        notesParts.push(`LTIP: ${fromCurrency} ${annualVal.toLocaleString()} → USD ${ltipUSD.toLocaleString()}`);
      }
    }

    return {
      baseSalary: parseNumeric(baseSalaryUSD),
      totalAllowances: parseNumeric(totalAllowancesUSD),
      bonus: parseNumeric(bonusUSD),
      longTermIncentives: parseNumeric(ltipUSD),
      currency: 'USD',
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
