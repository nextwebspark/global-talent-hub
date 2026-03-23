import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

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

const PEGGED_RATES: Record<string, number> = {
  SAR: 3.75,
  AED: 3.67,
  QAR: 3.64,
  BHD: 0.377,
  OMR: 0.385,
  KWD: 0.308,
};

const PEGGED_TO_USD: Record<string, (v: number) => number> = {
  SAR: (v) => v / 3.75,
  AED: (v) => v / 3.67,
  QAR: (v) => v / 3.64,
  BHD: (v) => v * 2.65,
  OMR: (v) => v * 2.60,
  KWD: (v) => v * 3.25,
};

const FLOATING_CURRENCIES = [
  'GBP', 'EUR', 'EGP', 'INR', 'TRY', 'ZAR', 'SGD', 'HKD',
  'JPY', 'CNY', 'CHF', 'AUD', 'CAD', 'NZD', 'BRL', 'MXN',
  'KRW', 'THB', 'MYR', 'IDR', 'PHP', 'TWD', 'SEK', 'NOK',
  'DKK', 'PLN', 'CZK', 'HUF', 'PKR', 'NGN', 'KES', 'BDT',
  'LKR', 'VND', 'RUB', 'JOD',
];

async function fetchLiveRates(): Promise<Record<string, number>> {
  const liveRates: Record<string, number> = {};
  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data?.rates) {
        for (const code of FLOATING_CURRENCIES) {
          if (data.rates[code]) {
            liveRates[code] = data.rates[code];
          }
        }
      }
    }
  } catch (err) {
    console.warn('[RemunerationParser] Could not fetch live FX rates, LLM will use prompt-embedded pegged rates only:', err);
  }
  return liveRates;
}

function buildSystemPrompt(liveRates: Record<string, number>): string {
  const today = new Date().toISOString().split('T')[0];

  let liveRatesBlock = '';
  if (Object.keys(liveRates).length > 0) {
    const lines = Object.entries(liveRates)
      .map(([code, rate]) => `- ${code}: 1 USD = ${rate} ${code} (divide by ${rate})`)
      .join('\n');
    liveRatesBlock = `
For currencies that FLOAT against USD, use these live rates 
(fetched ${today}):
${lines}

If a floating currency is not listed above, return null for 
all USD fields and explain in calculation_notes.`;
  } else {
    liveRatesBlock = `
For currencies that FLOAT against USD (GBP, EUR, EGP, INR, 
TRY, ZAR, SGD, HKD, and any currency not in the pegged list 
above), you do not have a live rate available. Return null for 
all USD fields and explain in calculation_notes that a live 
rate was unavailable.`;
  }

  return `You are a specialist executive compensation data extraction engine. 
Your job is to read free-form remuneration text and return a clean, 
structured JSON object with all values converted to USD on an annual basis.

════════════════════════════════════
STEP 1 — READ THE ENTIRE TEXT FIRST
════════════════════════════════════
Do not extract figures line by line. Read the full input before 
extracting anything. Understand what is included in what, what is 
additional, what is a range, and what currency and time period is 
being used.

════════════════════════════════════
STEP 2 — DETECT CURRENCY
════════════════════════════════════
Identify the currency from symbols or codes in the text 
(AED, SAR, GBP, EUR, KWD, QAR, BHD, OMR, EGP, INR, USD, etc.).

For currencies that are PEGGED to USD, use these fixed rates 
(they do not fluctuate):
- SAR → USD: divide by 3.75
- AED → USD: divide by 3.67
- QAR → USD: divide by 3.64
- BHD → USD: multiply by 2.65
- OMR → USD: multiply by 2.60
- KWD → USD: multiply by 3.25
${liveRatesBlock}

If USD is already the stated currency, no conversion is needed.

Record the rate used and whether it was pegged or live in the 
output JSON.

════════════════════════════════════
STEP 3 — NORMALISE TO ANNUAL
════════════════════════════════════
Convert all figures to annual (yearly) amounts:
- Monthly figure → multiply by 12
- Quarterly figure → multiply by 4
- Weekly figure → multiply by 52
- Annual figure → use as-is

If the period is not stated, assume:
- Salary and allowances → monthly
- Bonus and LTIP → annual

════════════════════════════════════
STEP 4 — INCLUDED VS ADDITIONAL
════════════════════════════════════
This is the most common source of errors. Before extracting 
allowances, determine whether they are INCLUDED within the 
salary figure or ADDITIONAL on top of it.

Rules:
- If the text says "housing and transport included in salary" 
  or similar → do NOT add them as separate allowances
- If the text says "plus housing allowance" or "in addition to 
  salary" → include them as allowances
- If a salary is broken down by percentage 
  (e.g. "70% basic, 20% housing, 10% transport") → the total 
  is the package, extract basic as the 70% portion only; the 
  20% and 10% are allowances only if they are part of a larger 
  total, not additions on top
- When in doubt, exclude and flag in calculation_notes

════════════════════════════════════
STEP 5 — EXTRACT EACH COMPONENT
════════════════════════════════════

YEARLY BASIC SALARY
The core fixed cash salary only. Exclude all allowances, 
bonuses, and benefits.
- If given as a percentage of total 
  (e.g. "70% is basic") → basic = total × 0.70
- If given as a monthly figure → multiply by 12
- Never use the total package figure as the basic

YEARLY ALLOWANCES
Sum of all named recurring cash allowances paid regardless 
of performance. Includes: housing, transport, mobile, 
utilities, education, relocation (if recurring).
- Only include allowances explicitly stated as additional 
  to basic salary
- If an allowance is included within the salary, do not 
  count it again
- Convert and annualise each allowance individually, 
  then sum

TOTAL YEARLY FIXED
= Yearly Basic Salary + Yearly Allowances
Always calculate this yourself. Never take it from the text.

YEARLY BONUS
Performance-based variable pay. Includes: annual bonus, 
performance bonus, incentive pay, commission.

How to calculate:
- Percentage of basic: "20% bonus" → 20% × yearly basic
- Months of salary: "5 months basic" → 5 × monthly basic
- Stated annual figure: use directly
- Range (e.g. "10–20%"): use the midpoint (15%)
- If no bonus mentioned: return null

LTIP (Long-Term Incentive Plan)
Only return a figure if a reliable annual value can be 
calculated. Acceptable inputs:
- Shares/stock with total value + vesting period 
  → annual = total ÷ years
- Annual profit share with a stated recurring figure
- Any scheme described as recurring annually with a value

Do NOT estimate or assume LTIP. If the data is insufficient 
to calculate a defensible annual figure, return null.

════════════════════════════════════
STEP 6 — OUTPUT FORMAT
════════════════════════════════════
Return ONLY a valid JSON object. No explanation, no markdown 
fences, no preamble. Any reasoning must go inside 
calculation_notes only.

{
  "currency_detected": "SAR",
  "fx_rate_type": "pegged",
  "fx_rate_used": 3.75,
  "fx_rate_date": "${today}",
  "yearly_basic_usd": 0,
  "yearly_allowances_usd": 0,
  "total_yearly_fixed_usd": 0,
  "yearly_bonus_usd": null,
  "ltip_annual_usd": null,
  "calculation_notes": "Step by step explanation of how each 
  figure was derived, including any assumptions, ambiguities, 
  or data gaps"
}

════════════════════════════════════
EDGE CASE RULES
════════════════════════════════════
- Ambiguous allowance (included or additional?) → exclude 
  and flag in calculation_notes
- Bonus range given → always use the midpoint
- Total CTC given with no breakdown → return null for all 
  fields, explain in calculation_notes
- Two figures refer to the same component → use the more 
  specific or detailed one
- Never invent figures. If something cannot be determined, 
  return null
- Always show arithmetic in calculation_notes so errors 
  can be spotted`;
}

interface LLMParsedResult {
  currency_detected: string;
  fx_rate_type: string;
  fx_rate_used: number;
  fx_rate_date: string;
  yearly_basic_usd: number | null;
  yearly_allowances_usd: number | null;
  total_yearly_fixed_usd: number | null;
  yearly_bonus_usd: number | null;
  ltip_annual_usd: number | null;
  calculation_notes: string;
}

export async function parseRemunerationText(text: string): Promise<ParsedRemuneration | null> {
  if (!text || text.trim().length < 5) return null;

  try {
    const liveRates = await fetchLiveRates();
    const systemPrompt = buildSystemPrompt(liveRates);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        { role: "user", content: text },
      ],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;
    const content = textBlock.text.replace(/```json|```/g, '').trim();

    const raw: LLMParsedResult = JSON.parse(content);

    const notesParts: string[] = [];

    if (raw.currency_detected && raw.currency_detected !== 'USD') {
      notesParts.push(
        `Currency: ${raw.currency_detected} → USD (${raw.fx_rate_type} rate: ${raw.fx_rate_used}, date: ${raw.fx_rate_date})`
      );
    }

    if (raw.calculation_notes) {
      notesParts.push(raw.calculation_notes);
    }

    return {
      baseSalary: parseNumeric(raw.yearly_basic_usd),
      totalAllowances: parseNumeric(raw.yearly_allowances_usd),
      bonus: parseNumeric(raw.yearly_bonus_usd),
      longTermIncentives: parseNumeric(raw.ltip_annual_usd),
      currency: 'USD',
      year: null,
      notes: notesParts.length > 0 ? notesParts.join('\n\n') : null,
    };
  } catch (error) {
    console.error("[RemunerationParser] Failed to parse:", error);
    return null;
  }
}

export function convertRemunerationToUSD(rem: ParsedRemuneration): ParsedRemunerationUSD {
  return {
    ...rem,
    baseSalaryUSD: rem.baseSalary,
    totalAllowancesUSD: rem.totalAllowances,
    bonusUSD: rem.bonus,
    longTermIncentivesUSD: rem.longTermIncentives,
  };
}

function parseNumeric(val: any): number | null {
  if (val === null || val === undefined || val === '' || val === 'null') return null;
  const num = Number(val);
  if (isNaN(num) || num <= 0) return null;
  return Math.round(num * 100) / 100;
}
