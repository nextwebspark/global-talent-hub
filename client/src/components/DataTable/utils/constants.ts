export const STATUS_OPTIONS = ['Interested', 'Not Interested', 'Out of Scope', 'Off-Limits'] as const;
export const COMPANY_STATUS_OPTIONS = ['Active', 'Off-Limits'] as const;
export const LEVEL_OPTIONS = ['Board', 'C-Suite', 'N-1', 'N-2'] as const;
export const GENDER_OPTIONS = ['Male', 'Female', 'Prefer not to say'] as const;
export const ETHNICITY_OPTIONS = ['African', 'East Asian', 'European', 'Latin American', 'Middle Eastern', 'Native/Indigenous', 'Pacific Islander', 'South Asian', 'Southeast Asian', 'Mixed/Other'] as const;

export const SECTOR_TAXONOMY: Record<string, string[]> = {
  'Energy': ['Oil, Gas & Pipelines', 'Renewable Energy'],
  'Materials': ['Metals & Mining', 'Chemicals', 'Construction Materials'],
  'Industrials': ['Aerospace & Defense', 'Transportation & Logistics', 'Construction & Engineering', 'Industrial Machinery'],
  'Consumer Discretionary': ['Retail & E-Commerce', 'Automotive', 'Travel, Leisure & Hospitality', 'Media & Entertainment'],
  'Consumer Staples': ['Food & Beverage', 'Household & Personal Products', 'Grocery & Drug Retail'],
  'Health Care': ['Pharmaceuticals & Biotech', 'Medical Devices & Equipment', 'Health Care Services'],
  'Financial Services': ['Banking', 'Insurance', 'Asset Management', 'Fintech & Payments'],
  'Information Technology': ['Software & SaaS', 'Hardware & Semiconductors', 'IT Services & Consulting', 'Cybersecurity'],
  'Communication Services': ['Telecom', 'Internet & Digital Platforms', 'Gaming'],
  'Utilities': ['Electric Utilities', 'Water & Waste Management', 'Gas Distribution'],
  'Real Estate': ['Commercial Real Estate', 'Residential Real Estate', 'REITs & Property Management'],
  'Conglomerates & Holding Companies': ['Family Conglomerates', 'Sovereign & State-Owned Holding Companies', 'Private Equity & Investment Holding'],
  'Sovereign Wealth & Government': ['Sovereign Wealth Funds', 'Government & Public Sector', 'Quasi-Government Entities'],
};

export const SECTOR_TO_CATEGORY: Record<string, string> = {};
for (const [cat, subs] of Object.entries(SECTOR_TAXONOMY)) {
  for (const s of subs) SECTOR_TO_CATEGORY[s] = cat;
}

export const ALL_SUB_SECTORS: readonly string[] = Object.values(SECTOR_TAXONOMY).flat();

export function getSectorCategory(sector: string | null | undefined): string | null {
  if (!sector) return null;
  return SECTOR_TO_CATEGORY[sector] || null;
}

export const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria',
  'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan',
  'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon',
  'Canada', 'Cape Verde', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica',
  'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'DR Congo', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'East Timor',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland',
  'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea',
  'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran',
  'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya',
  'Kiribati', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein',
  'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania',
  'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia',
  'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines',
  'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa',
  'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia',
  'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden',
  'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia',
  'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan',
  'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
];
