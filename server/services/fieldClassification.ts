/**
 * FIELD CLASSIFICATION REGISTRY
 * 
 * Explicit classification of all company and executive fields into:
 * A. FACTUAL FIELDS - Objective, verifiable data points
 * B. NARRATIVE FIELDS - AI-generated descriptions, explanations, subjective content
 * 
 * This classification is used by Step 5 (narrative separation) to enforce
 * different validation, display, and editing rules for each category.
 * 
 * RULES:
 * - Factual fields: Must have verifiable sources, can be validated against external data
 * - Narrative fields: AI-generated, subjective, cannot be fact-checked in the same way
 * - This classification does NOT yet change behavior - it documents intent
 */

export type FieldCategory = 'factual' | 'narrative' | 'metadata' | 'identifier';

export interface FieldClassification {
  field: string;
  category: FieldCategory;
  description: string;
  sourceRequired: boolean;      // Does this field need a source citation?
  editable: boolean;            // Can users manually edit this field?
  aiGenerated: boolean;         // Is this field typically AI-generated?
  displayPriority: 'high' | 'medium' | 'low' | 'hidden';
}

// ========== COMPANY FIELD CLASSIFICATIONS ==========

export const COMPANY_FIELD_CLASSIFICATIONS: FieldClassification[] = [
  // === IDENTIFIERS ===
  {
    field: 'id',
    category: 'identifier',
    description: 'Unique database identifier',
    sourceRequired: false,
    editable: false,
    aiGenerated: false,
    displayPriority: 'hidden'
  },
  {
    field: 'searchQueryId',
    category: 'identifier',
    description: 'Reference to the search query that created this company',
    sourceRequired: false,
    editable: false,
    aiGenerated: false,
    displayPriority: 'hidden'
  },

  // === FACTUAL FIELDS (Category A) ===
  {
    field: 'name',
    category: 'factual',
    description: 'Legal company name',
    sourceRequired: false, // Name is self-evident
    editable: true,
    aiGenerated: false,
    displayPriority: 'high'
  },
  {
    field: 'sector',
    category: 'factual',
    description: 'Industry sector classification',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'high'
  },
  {
    field: 'businessType',
    category: 'factual',
    description: 'Primary business type: distributor, retailer, manufacturer, wholesaler, service_provider',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'high'
  },
  {
    field: 'ownershipType',
    category: 'factual',
    description: 'Ownership structure: public, private, family-owned, PE-backed, state-owned',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'medium'
  },
  {
    field: 'region',
    category: 'factual',
    description: 'Geographic region of headquarters',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'high'
  },
  {
    field: 'country',
    category: 'factual',
    description: 'Country of headquarters',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'high'
  },
  {
    field: 'streetAddress',
    category: 'factual',
    description: 'Physical street address of headquarters',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'medium'
  },
  {
    field: 'latitude',
    category: 'factual',
    description: 'GPS latitude of headquarters',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'low'
  },
  {
    field: 'longitude',
    category: 'factual',
    description: 'GPS longitude of headquarters',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'low'
  },
  {
    field: 'revenue',
    category: 'factual',
    description: 'Annual revenue in USD - REQUIRES authoritative source',
    sourceRequired: true, // STRICT: Revenue requires source
    editable: true,
    aiGenerated: true,
    displayPriority: 'high'
  },
  {
    field: 'revenueSource',
    category: 'factual',
    description: 'Citation for revenue figure',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'low'
  },
  {
    field: 'employees',
    category: 'factual',
    description: 'Employee count',
    sourceRequired: true, // Should have source
    editable: true,
    aiGenerated: true,
    displayPriority: 'high'
  },
  {
    field: 'employeesSource',
    category: 'factual',
    description: 'Citation for employee count',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'low'
  },
  {
    field: 'geographicFootprint',
    category: 'factual',
    description: 'Number of countries/regions of operation',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'medium'
  },
  {
    field: 'customerModel',
    category: 'factual',
    description: 'Customer segment: B2C, B2B, Mixed',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'medium'
  },
  {
    field: 'coreActivity',
    category: 'factual',
    description: 'Primary business activity',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'medium'
  },
  {
    field: 'operatingModel',
    category: 'factual',
    description: 'Business operating model',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'medium'
  },
  {
    field: 'revenueDrivers',
    category: 'factual',
    description: 'Primary revenue drivers/sources',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'medium'
  },
  {
    field: 'lastVerifiedYear',
    category: 'factual',
    description: 'Year when data was last verified',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'low'
  },
  {
    field: 'confidence',
    category: 'factual',
    description: 'Overall data confidence score (1-10)',
    sourceRequired: false,
    editable: false, // System-calculated
    aiGenerated: true,
    displayPriority: 'medium'
  },

  // === NARRATIVE FIELDS (Category B) ===
  {
    field: 'summary',
    category: 'narrative',
    description: 'AI-generated 2-4 sentence company description',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'high'
  },
  {
    field: 'relevanceReason',
    category: 'narrative',
    description: 'AI-generated explanation of why this company matches the search query',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'high'
  },

  // === METADATA ===
  {
    field: 'color',
    category: 'metadata',
    description: 'Display color for map visualization',
    sourceRequired: false,
    editable: true,
    aiGenerated: false,
    displayPriority: 'hidden'
  },
  {
    field: 'createdAt',
    category: 'metadata',
    description: 'Record creation timestamp',
    sourceRequired: false,
    editable: false,
    aiGenerated: false,
    displayPriority: 'hidden'
  },
  {
    field: 'updatedAt',
    category: 'metadata',
    description: 'Record last update timestamp',
    sourceRequired: false,
    editable: false,
    aiGenerated: false,
    displayPriority: 'hidden'
  }
];

// ========== EXECUTIVE FIELD CLASSIFICATIONS ==========

export const EXECUTIVE_FIELD_CLASSIFICATIONS: FieldClassification[] = [
  // === IDENTIFIERS ===
  {
    field: 'id',
    category: 'identifier',
    description: 'Unique database identifier',
    sourceRequired: false,
    editable: false,
    aiGenerated: false,
    displayPriority: 'hidden'
  },
  {
    field: 'companyId',
    category: 'identifier',
    description: 'Reference to parent company',
    sourceRequired: false,
    editable: false,
    aiGenerated: false,
    displayPriority: 'hidden'
  },
  {
    field: 'clockworkId',
    category: 'identifier',
    description: 'Clockwork CRM identifier',
    sourceRequired: false,
    editable: false,
    aiGenerated: false,
    displayPriority: 'hidden'
  },
  {
    field: 'clockworkProjectId',
    category: 'identifier',
    description: 'Clockwork project identifier',
    sourceRequired: false,
    editable: false,
    aiGenerated: false,
    displayPriority: 'hidden'
  },

  // === FACTUAL FIELDS (Category A) ===
  {
    field: 'name',
    category: 'factual',
    description: 'Executive full name',
    sourceRequired: true, // Executives need source verification
    editable: true,
    aiGenerated: true,
    displayPriority: 'high'
  },
  {
    field: 'title',
    category: 'factual',
    description: 'Current job title',
    sourceRequired: true,
    editable: true,
    aiGenerated: true,
    displayPriority: 'high'
  },
  {
    field: 'email',
    category: 'factual',
    description: 'Business email address',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'medium'
  },
  {
    field: 'phone',
    category: 'factual',
    description: 'Business phone number',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'medium'
  },
  {
    field: 'linkedin',
    category: 'factual',
    description: 'LinkedIn profile URL',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'medium'
  },
  {
    field: 'profileUrl',
    category: 'factual',
    description: 'Company website profile URL',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'low'
  },
  {
    field: 'imageUrl',
    category: 'factual',
    description: 'Profile photo URL',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'low'
  },
  {
    field: 'source',
    category: 'factual',
    description: 'Where this executive information was found',
    sourceRequired: false,
    editable: true,
    aiGenerated: true,
    displayPriority: 'low'
  },
  {
    field: 'confidence',
    category: 'factual',
    description: 'Data confidence score (1-10)',
    sourceRequired: false,
    editable: false,
    aiGenerated: true,
    displayPriority: 'medium'
  },

  // === METADATA ===
  {
    field: 'enrichmentSource',
    category: 'metadata',
    description: 'Source of enrichment data (e.g., Clockwork)',
    sourceRequired: false,
    editable: false,
    aiGenerated: false,
    displayPriority: 'hidden'
  },
  {
    field: 'enrichmentConfidence',
    category: 'metadata',
    description: 'Confidence of enrichment match',
    sourceRequired: false,
    editable: false,
    aiGenerated: false,
    displayPriority: 'hidden'
  },
  {
    field: 'enrichmentTimestamp',
    category: 'metadata',
    description: 'When enrichment was performed',
    sourceRequired: false,
    editable: false,
    aiGenerated: false,
    displayPriority: 'hidden'
  },
  {
    field: 'createdAt',
    category: 'metadata',
    description: 'Record creation timestamp',
    sourceRequired: false,
    editable: false,
    aiGenerated: false,
    displayPriority: 'hidden'
  },
  {
    field: 'updatedAt',
    category: 'metadata',
    description: 'Record last update timestamp',
    sourceRequired: false,
    editable: false,
    aiGenerated: false,
    displayPriority: 'hidden'
  }
];

// ========== HELPER FUNCTIONS ==========

/**
 * Get classification for a company field
 */
export function getCompanyFieldClassification(field: string): FieldClassification | undefined {
  return COMPANY_FIELD_CLASSIFICATIONS.find(f => f.field === field);
}

/**
 * Get classification for an executive field
 */
export function getExecutiveFieldClassification(field: string): FieldClassification | undefined {
  return EXECUTIVE_FIELD_CLASSIFICATIONS.find(f => f.field === field);
}

/**
 * Get all factual company fields
 */
export function getFactualCompanyFields(): string[] {
  return COMPANY_FIELD_CLASSIFICATIONS
    .filter(f => f.category === 'factual')
    .map(f => f.field);
}

/**
 * Get all narrative company fields
 */
export function getNarrativeCompanyFields(): string[] {
  return COMPANY_FIELD_CLASSIFICATIONS
    .filter(f => f.category === 'narrative')
    .map(f => f.field);
}

/**
 * Get all factual executive fields
 */
export function getFactualExecutiveFields(): string[] {
  return EXECUTIVE_FIELD_CLASSIFICATIONS
    .filter(f => f.category === 'factual')
    .map(f => f.field);
}

/**
 * Check if a company field is narrative (AI-generated explanation)
 */
export function isNarrativeField(field: string): boolean {
  const classification = getCompanyFieldClassification(field);
  return classification?.category === 'narrative';
}

/**
 * Check if a field requires a source citation
 */
export function requiresSource(entity: 'company' | 'executive', field: string): boolean {
  const classifications = entity === 'company' 
    ? COMPANY_FIELD_CLASSIFICATIONS 
    : EXECUTIVE_FIELD_CLASSIFICATIONS;
  const classification = classifications.find(f => f.field === field);
  return classification?.sourceRequired ?? false;
}

/**
 * Log field classification summary
 */
export function logFieldClassificationSummary(): void {
  const companyFactual = getFactualCompanyFields();
  const companyNarrative = getNarrativeCompanyFields();
  const execFactual = getFactualExecutiveFields();
  
  console.log('[FieldClassification] === COMPANY FIELDS ===');
  console.log(`[FieldClassification] Factual (${companyFactual.length}): ${companyFactual.join(', ')}`);
  console.log(`[FieldClassification] Narrative (${companyNarrative.length}): ${companyNarrative.join(', ')}`);
  console.log('[FieldClassification] === EXECUTIVE FIELDS ===');
  console.log(`[FieldClassification] Factual (${execFactual.length}): ${execFactual.join(', ')}`);
}

// ========== CLASSIFICATION SUMMARY ==========
/*
COMPANY FIELDS - FACTUAL (Category A):
- name, sector, businessType, ownershipType
- region, country, streetAddress, latitude, longitude
- revenue, revenueSource, employees, employeesSource
- geographicFootprint, customerModel, coreActivity, operatingModel, revenueDrivers
- lastVerifiedYear, confidence

COMPANY FIELDS - NARRATIVE (Category B):
- summary (AI-generated company description)
- relevanceReason (AI-generated search match explanation)

EXECUTIVE FIELDS - FACTUAL (Category A):
- name, title, email, phone, linkedin, profileUrl, imageUrl
- source, confidence

EXECUTIVE FIELDS - NARRATIVE (Category B):
- (none currently - all executive fields are factual or metadata)
*/
