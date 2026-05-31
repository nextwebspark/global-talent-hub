import { getLLMClient, DEFAULT_MODEL } from "./llmClient";

export interface ParsedRemuneration {
  baseSalary: number | null;
  housingAllowance: number | null;
  transportAllowance: number | null;
  schoolingAllowance: number | null;
  totalAllowances: number | null;
  bonus: number | null;
  longTermIncentives: number | null;
  currency: string;
  year: string | null;
  notes: string | null;
}

export interface ParsedRemunerationUSD extends ParsedRemuneration {
  baseSalaryUSD: number | null;
  housingAllowanceUSD: number | null;
  transportAllowanceUSD: number | null;
  schoolingAllowanceUSD: number | null;
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
STEP 0 — NORMALISE TEXT
════════════════════════════════════
Before extracting any figures, mentally expand ALL abbreviations, 
shorthand, and informal notation in the input text. People write 
compensation data in many informal ways. You MUST recognise all 
variations.

Common abbreviations (expand these mentally before processing):
- sal / slry → salary
- bsc / bas → basic
- mnths / mths / mo → months
- yr / yrs → year / years
- ann / annum → annual
- qtly / qtr → quarterly
- hsg / hous → housing
- trns / trnsprt / transp → transport
- allw / allow → allowance
- util / utils → utilities
- educ / edu → education
- prf / perf → performance
- var → variable
- incl / inc → including / included
- excl / exc → excluding / excluded
- approx / ~  → approximately
- p.a. / pa / /yr → per annum (annual)
- p.m. / pm / /mo / /month → per month (monthly)
- CTC / ctc → cost to company (total package)
- pkg / pack → package
- comp → compensation
- bnft / ben → benefit
- LTI / LTIP → long-term incentive plan
- STI / STIP → short-term incentive plan

Shorthand multipliers and expressions:
- "Xmo salary" or "X mo sal" → X months of salary
- "X months basic" or "X mnths bsc" → X × monthly basic
- "Xx basic" or "X x basic" → X times basic salary
- "X × salary" → X times salary
- Parenthetical clarifications like "bonus (5 mnths basic sal)" 
  mean "bonus equals 5 months of basic salary"
- "20% of basic" / "20% basic" / "20% bsc" → 20% × yearly basic
- "2mo sal" / "2 mo salary" → 2 × monthly basic salary

Number formats:
- "1.2M" / "1.2m" / "1.2 million" → 1,200,000
- "500K" / "500k" / "500 thousand" → 500,000
- "1,200,000" → 1,200,000
- "50k" → 50,000

After mentally normalising, proceed to Step 1.

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

YEARLY HOUSING ALLOWANCE
The annual housing allowance. Extract separately from 
transport and other allowances.
- If housing is a percentage of total package 
  (e.g. "20% housing") → housing = total × 0.20
- If housing is a separate stated amount → use directly
- If housing is INCLUDED within salary (not additional), 
  still extract the housing portion as a separate figure
- Convert and annualise if needed
- If no housing mentioned: return null

YEARLY TRANSPORT ALLOWANCE
The annual transport allowance. Extract separately from 
housing and other allowances.
- If transport is a percentage of total package 
  (e.g. "10% transport") → transport = total × 0.10
- If transport is a separate stated amount → use directly
- If transport is INCLUDED within salary (not additional), 
  still extract the transport portion as a separate figure
- Convert and annualise if needed
- If no transport mentioned: return null

YEARLY SCHOOLING ALLOWANCE
Education/schooling allowance specifically for children's 
school fees. Only include if explicitly mentioned as 
"schooling allowance", "education allowance", or 
"school fees". Do NOT assume or invent this field.

YEARLY OTHER ALLOWANCES
Sum of all other named recurring cash allowances NOT 
covered by housing, transport, or schooling (mobile, 
utilities, relocation, etc.).
- Only include allowances explicitly stated
- Convert and annualise each individually, then sum
- If none mentioned: return null

TOTAL YEARLY FIXED
= Yearly Basic Salary + Housing + Transport + Other Allowances
Always calculate this yourself. Never take it from the text.

YEARLY BONUS
Performance-based variable pay. Includes: annual bonus, 
performance bonus, incentive pay, commission.

How to calculate:
- Percentage of basic: "20% bonus" → 20% × yearly basic
- Months of salary: "N months basic" → N × MONTHLY basic
  CRITICAL: monthly basic = yearly basic ÷ 12.
  Example: if yearly basic = $91,853, monthly basic = $91,853 ÷ 12 = $7,654.
  Then "5 months basic" = 5 × $7,654 = $38,271. NOT 5 × $91,853.
- Stated annual figure: use directly
- Range (e.g. "10–20%"): use the midpoint (15%)
- If no bonus mentioned: return null

Examples of shorthand you MUST handle correctly:
- "bonus (5 mnths basic sal)" → 5 × (yearly_basic ÷ 12)
- "bonus 3x monthly" → 3 × (yearly_basic ÷ 12)
- "variable (15-20% bsc)" → midpoint 17.5% × yearly basic
- "perf bonus: 2mo sal" → 2 × (yearly_basic ÷ 12)
- "bonus 25%" → 25% × yearly basic salary
- "STI: 30% of base" → 30% × yearly basic salary
- "4 months as bonus" → 4 × (yearly_basic ÷ 12)

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
  "yearly_housing_usd": null,
  "yearly_transport_usd": null,
  "yearly_schooling_usd": null,
  "yearly_other_allowances_usd": null,
  "total_yearly_fixed_usd": 0,
  "yearly_bonus_usd": null,
  "ltip_annual_usd": null,
  "calculation_notes": "Step by step explanation of how each figure was derived, including any assumptions, ambiguities, or data gaps. Use periods to separate steps, not newlines."
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
  can be spotted
- CRITICAL: In the JSON output, do NOT use actual newline 
  characters inside string values. Use ". " (period + space) 
  to separate sentences/steps in calculation_notes. The 
  output must be valid single-line JSON strings.`;
}

interface LLMParsedResult {
  currency_detected: string;
  fx_rate_type: string;
  fx_rate_used: number;
  fx_rate_date: string;
  yearly_basic_usd: number | null;
  yearly_housing_usd: number | null;
  yearly_transport_usd: number | null;
  yearly_schooling_usd: number | null;
  yearly_other_allowances_usd: number | null;
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

    const llm = await getLLMClient();
    const response = await llm.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) return null;
    const content = rawContent.replace(/```json|```/g, '').trim();

    function fixNewlinesInStrings(json: string): string {
      let result = '';
      let inString = false;
      let escaped = false;
      for (let i = 0; i < json.length; i++) {
        const ch = json[i];
        if (escaped) { result += ch; escaped = false; continue; }
        if (ch === '\\') { result += ch; escaped = true; continue; }
        if (ch === '"') { inString = !inString; result += ch; continue; }
        if (inString && (ch === '\n' || ch === '\r')) {
          result += ' ';
          continue;
        }
        result += ch;
      }
      return result;
    }

    let raw: LLMParsedResult;
    const variants = [
      content,
      fixNewlinesInStrings(content),
      content.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'),
      fixNewlinesInStrings(content).replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'),
    ];

    let lastError: Error | null = null;
    for (const variant of variants) {
      try {
        raw = JSON.parse(variant);
        lastError = null;
        break;
      } catch (e: any) {
        lastError = e;
      }
    }
    if (lastError) {
      console.error("[RemunerationParser] Raw LLM content:", rawContent.substring(0, 500));
      throw lastError;
    }
    raw = raw!;

    const notesParts: string[] = [];

    if (raw.currency_detected && raw.currency_detected !== 'USD') {
      notesParts.push(
        `Currency: ${raw.currency_detected} → USD (${raw.fx_rate_type} rate: ${raw.fx_rate_used}, date: ${raw.fx_rate_date})`
      );
    }

    if (raw.calculation_notes) {
      notesParts.push(raw.calculation_notes);
    }

    const housing = parseNumeric(raw.yearly_housing_usd);
    const transport = parseNumeric(raw.yearly_transport_usd);
    const schooling = parseNumeric(raw.yearly_schooling_usd);
    const otherAllow = parseNumeric(raw.yearly_other_allowances_usd);
    const totalAllow = (housing || 0) + (transport || 0) + (schooling || 0) + (otherAllow || 0);

    return {
      baseSalary: parseNumeric(raw.yearly_basic_usd),
      housingAllowance: housing,
      transportAllowance: transport,
      schoolingAllowance: schooling,
      totalAllowances: totalAllow > 0 ? Math.round(totalAllow * 100) / 100 : null,
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
    housingAllowanceUSD: rem.housingAllowance,
    transportAllowanceUSD: rem.transportAllowance,
    schoolingAllowanceUSD: rem.schoolingAllowance,
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
