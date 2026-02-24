const USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  CHF: 1.13,
  JPY: 0.0067,
  CNY: 0.14,
  AED: 0.2723,
  SAR: 0.2667,
  QAR: 0.2747,
  KWD: 3.26,
  BHD: 2.6526,
  OMR: 2.5974,
  EGP: 0.02,
  JOD: 1.41,
  INR: 0.012,
  SGD: 0.75,
  HKD: 0.128,
  AUD: 0.65,
  CAD: 0.74,
  NZD: 0.61,
  ZAR: 0.055,
  BRL: 0.20,
  MXN: 0.058,
  KRW: 0.00075,
  THB: 0.029,
  MYR: 0.22,
  IDR: 0.000064,
  PHP: 0.018,
  TWD: 0.031,
  TRY: 0.031,
  SEK: 0.095,
  NOK: 0.093,
  DKK: 0.145,
  PLN: 0.25,
  CZK: 0.043,
  HUF: 0.0027,
  RUB: 0.011,
  NGN: 0.00065,
  KES: 0.0078,
  PKR: 0.0036,
  BDT: 0.0091,
  LKR: 0.0034,
  VND: 0.000041,
};

const CURRENCY_ALIASES: Record<string, string> = {
  '$': 'USD',
  'us$': 'USD',
  'usd': 'USD',
  'dollar': 'USD',
  'dollars': 'USD',
  'us dollar': 'USD',
  'us dollars': 'USD',
  '€': 'EUR',
  'euro': 'EUR',
  'euros': 'EUR',
  'eur': 'EUR',
  '£': 'GBP',
  'gbp': 'GBP',
  'pound': 'GBP',
  'pounds': 'GBP',
  'sterling': 'GBP',
  '¥': 'JPY',
  'yen': 'JPY',
  'jpy': 'JPY',
  'rmb': 'CNY',
  'yuan': 'CNY',
  'cny': 'CNY',
  '元': 'CNY',
  'chf': 'CHF',
  'swiss franc': 'CHF',
  'aed': 'AED',
  'dirham': 'AED',
  'dirhams': 'AED',
  'sar': 'SAR',
  'riyal': 'SAR',
  'riyals': 'SAR',
  'saudi riyal': 'SAR',
  'qar': 'QAR',
  'qatari riyal': 'QAR',
  'kwd': 'KWD',
  'kuwaiti dinar': 'KWD',
  'bhd': 'BHD',
  'bahraini dinar': 'BHD',
  'omr': 'OMR',
  'omani rial': 'OMR',
  'egp': 'EGP',
  'egyptian pound': 'EGP',
  'inr': 'INR',
  'rupee': 'INR',
  'rupees': 'INR',
  'indian rupee': 'INR',
  '₹': 'INR',
  'sgd': 'SGD',
  'singapore dollar': 'SGD',
  's$': 'SGD',
  'hkd': 'HKD',
  'hong kong dollar': 'HKD',
  'hk$': 'HKD',
  'aud': 'AUD',
  'australian dollar': 'AUD',
  'a$': 'AUD',
  'cad': 'CAD',
  'canadian dollar': 'CAD',
  'c$': 'CAD',
  'zar': 'ZAR',
  'rand': 'ZAR',
  'south african rand': 'ZAR',
  'brl': 'BRL',
  'real': 'BRL',
  'r$': 'BRL',
  'krw': 'KRW',
  'won': 'KRW',
  '₩': 'KRW',
  'thb': 'THB',
  'baht': 'THB',
  '฿': 'THB',
  'myr': 'MYR',
  'ringgit': 'MYR',
  'rm': 'MYR',
  'try': 'TRY',
  'lira': 'TRY',
  'turkish lira': 'TRY',
  '₺': 'TRY',
  'sek': 'SEK',
  'swedish krona': 'SEK',
  'nok': 'NOK',
  'norwegian krone': 'NOK',
  'dkk': 'DKK',
  'danish krone': 'DKK',
  'pkr': 'PKR',
  'pakistani rupee': 'PKR',
};

export function normalizeCurrencyCode(input: string | null | undefined): string {
  if (!input) return 'USD';
  const cleaned = input.trim().toLowerCase();
  if (CURRENCY_ALIASES[cleaned]) return CURRENCY_ALIASES[cleaned];
  const upper = cleaned.toUpperCase();
  if (USD_RATES[upper]) return upper;
  return 'USD';
}

export function convertToUSD(amount: number, currency: string): number {
  const code = normalizeCurrencyCode(currency);
  const rate = USD_RATES[code];
  if (!rate) return amount;
  return Math.round(amount * rate);
}

export function getUSDRate(currency: string): number {
  const code = normalizeCurrencyCode(currency);
  return USD_RATES[code] || 1;
}

export function convertBetweenCurrencies(amount: number, fromCurrency: string, toCurrency: string): number {
  const fromCode = normalizeCurrencyCode(fromCurrency);
  const toCode = normalizeCurrencyCode(toCurrency);
  if (fromCode === toCode) return amount;
  const fromRate = USD_RATES[fromCode] || 1;
  const toRate = USD_RATES[toCode] || 1;
  if (toRate === 0) return amount;
  return Math.round((amount * fromRate / toRate) * 100) / 100;
}

export function getSupportedCurrencies(): string[] {
  return Object.keys(USD_RATES);
}
