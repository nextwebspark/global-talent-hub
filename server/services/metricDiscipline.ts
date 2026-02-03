/**
 * UNIVERSAL METRIC DISCIPLINE FRAMEWORK
 * 
 * A metric-agnostic validation framework that applies uniformly to all company metrics
 * (numeric and categorical), including but not limited to revenue, employee count,
 * geographic footprint, customer model, and any future metrics.
 * 
 * CORE PRINCIPLES:
 * 1. Revenue is just one metric - no special treatment
 * 2. Prevent inference or substitution by default
 * 3. Require explicit definition, source, time reference, and confidence for every metric
 * 4. Missing or invalid metrics must remain explicitly "Unknown"
 * 
 * This framework introduces the structure - existing metric logic is NOT migrated yet.
 */

// ========== METRIC TYPE DEFINITIONS ==========

export type MetricType = 'numeric' | 'categorical' | 'boolean' | 'date' | 'text';

export type MetricStatus = 
  | 'verified'      // Confirmed from authoritative source
  | 'unverified'    // Has value but source not confirmed
  | 'inferred'      // BLOCKED - value was inferred/calculated (not allowed)
  | 'substituted'   // BLOCKED - value was substituted from another metric (not allowed)
  | 'unknown'       // Explicitly unknown - no value available
  | 'invalid';      // Value failed validation

export interface MetricDefinition {
  id: string;                    // Unique metric identifier (e.g., 'revenue', 'employees')
  name: string;                  // Human-readable name
  type: MetricType;              // Data type
  unit?: string;                 // Unit of measurement (e.g., 'USD', 'count', 'years')
  description: string;           // Clear definition of what this metric represents
  requiresTimeReference: boolean; // Whether this metric needs a time reference (e.g., financial year)
  allowedSources: SourceTier[];  // Which source tiers are acceptable
  validationRules?: MetricValidationRule[]; // Additional validation rules
}

export interface SourceTier {
  tier: 1 | 2 | 3;
  name: string;
  description: string;
  patterns: RegExp[];            // Patterns to match source strings
  confidenceAdjustment: number;  // Adjustment to apply to confidence (-2, -1, 0, etc.)
}

export interface MetricValidationRule {
  id: string;
  description: string;
  validate: (value: any, context?: any) => boolean;
  failureAction: 'block' | 'degrade' | 'warn';
  degradeAmount?: number;        // How much to reduce confidence if action is 'degrade'
}

export interface MetricValue {
  metricId: string;              // Reference to MetricDefinition.id
  value: any;                    // The actual value (type depends on MetricDefinition.type)
  status: MetricStatus;          // Current status of this metric
  source: string | null;         // Where this value came from
  sourceTier: 1 | 2 | 3 | null;  // Which tier the source belongs to
  timeReference?: string;        // Time reference (e.g., 'FY2024', '2024-Q3')
  confidence: number;            // Confidence score 1-10
  rawValue?: any;                // Original value before any processing
  validationLog: MetricValidationEntry[];
}

export interface MetricValidationEntry {
  timestamp: Date;
  rule: string;
  passed: boolean;
  message: string;
  action?: 'blocked' | 'degraded' | 'warned';
}

// ========== STANDARD METRIC DEFINITIONS ==========
// These define what each metric means and how it should be validated

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
  revenue: {
    id: 'revenue',
    name: 'Annual Revenue',
    type: 'numeric',
    unit: 'USD',
    description: 'Top-line operating revenue from normal business activities for a specific financial year. Does NOT include: project value, contract value, AUM, GMV, valuation, funding, capex, pipeline.',
    requiresTimeReference: true,
    allowedSources: [
      {
        tier: 1,
        name: 'Official Audited Sources',
        description: 'Audited annual reports, SEC filings, regulatory filings',
        patterns: [
          /annual report/i,
          /10-k/i,
          /sec filing/i,
          /quarterly report/i,
          /regulatory filing/i,
          /audited/i,
          /official disclosure/i,
          /company financials/i,
          /investor relations/i
        ],
        confidenceAdjustment: 0
      },
      {
        tier: 2,
        name: 'Trusted Aggregators',
        description: 'Forbes, Fortune, Bloomberg with explicit revenue label',
        patterns: [
          /forbes.*revenue/i,
          /fortune.*revenue/i,
          /bloomberg.*revenue/i,
          /reuters.*revenue/i,
          /financial times.*revenue/i
        ],
        confidenceAdjustment: -1
      }
    ],
    validationRules: [
      {
        id: 'positive_value',
        description: 'Revenue must be positive',
        validate: (value) => typeof value === 'number' && value > 0,
        failureAction: 'block'
      },
      {
        id: 'reasonable_range',
        description: 'Revenue should be within reasonable range',
        validate: (value) => typeof value === 'number' && value < 1000000000000, // < $1T
        failureAction: 'warn'
      }
    ]
  },

  employees: {
    id: 'employees',
    name: 'Employee Count',
    type: 'numeric',
    unit: 'count',
    description: 'Total number of employees (full-time equivalent where possible)',
    requiresTimeReference: false,
    allowedSources: [
      {
        tier: 1,
        name: 'Official Sources',
        description: 'Company website, annual report, official disclosure',
        patterns: [
          /company website/i,
          /annual report/i,
          /official/i,
          /company disclosure/i
        ],
        confidenceAdjustment: 0
      },
      {
        tier: 2,
        name: 'Professional Networks',
        description: 'LinkedIn company page size indicator',
        patterns: [
          /linkedin/i,
          /glassdoor/i
        ],
        confidenceAdjustment: -1
      },
      {
        tier: 3,
        name: 'Estimates',
        description: 'Industry estimates, news articles',
        patterns: [
          /estimate/i,
          /approximately/i,
          /news/i,
          /article/i
        ],
        confidenceAdjustment: -2
      }
    ],
    validationRules: [
      {
        id: 'positive_integer',
        description: 'Employee count must be a positive integer',
        validate: (value) => Number.isInteger(value) && value > 0,
        failureAction: 'block'
      }
    ]
  },

  geographicFootprint: {
    id: 'geographicFootprint',
    name: 'Geographic Footprint',
    type: 'numeric',
    unit: 'countries',
    description: 'Number of countries or regions where the company has operations',
    requiresTimeReference: false,
    allowedSources: [
      {
        tier: 1,
        name: 'Official Sources',
        description: 'Company website, annual report',
        patterns: [/company website/i, /annual report/i, /official/i],
        confidenceAdjustment: 0
      },
      {
        tier: 2,
        name: 'Business Directories',
        description: 'Trusted business directories',
        patterns: [/directory/i, /database/i],
        confidenceAdjustment: -1
      }
    ]
  },

  customerModel: {
    id: 'customerModel',
    name: 'Customer Model',
    type: 'categorical',
    description: 'Primary customer segment: B2C (consumers), B2B (businesses), or Mixed',
    requiresTimeReference: false,
    allowedSources: [
      {
        tier: 1,
        name: 'Official Sources',
        description: 'Company website, annual report, about page',
        patterns: [/company website/i, /annual report/i, /official/i, /about/i],
        confidenceAdjustment: 0
      }
    ],
    validationRules: [
      {
        id: 'valid_category',
        description: 'Customer model must be B2C, B2B, or Mixed',
        validate: (value) => ['B2C', 'B2B', 'Mixed', 'b2c', 'b2b', 'mixed'].includes(value),
        failureAction: 'block'
      }
    ]
  },

  businessType: {
    id: 'businessType',
    name: 'Business Type',
    type: 'categorical',
    description: 'Primary business classification: distributor, retailer, manufacturer, wholesaler, service_provider',
    requiresTimeReference: false,
    allowedSources: [
      {
        tier: 1,
        name: 'Official Sources',
        description: 'Company website, annual report, about page',
        patterns: [/company website/i, /annual report/i, /official/i, /about/i],
        confidenceAdjustment: 0
      }
    ],
    validationRules: [
      {
        id: 'valid_category',
        description: 'Business type must be a valid classification',
        validate: (value) => ['distributor', 'retailer', 'manufacturer', 'wholesaler', 'service_provider'].includes(String(value).toLowerCase()),
        failureAction: 'degrade',
        degradeAmount: 2
      }
    ]
  },

  ownershipType: {
    id: 'ownershipType',
    name: 'Ownership Type',
    type: 'categorical',
    description: 'Company ownership structure: public, private, family-owned, PE-backed, state-owned',
    requiresTimeReference: false,
    allowedSources: [
      {
        tier: 1,
        name: 'Official Sources',
        description: 'Company website, SEC filings, stock exchange listings',
        patterns: [/company website/i, /sec/i, /stock exchange/i, /official/i],
        confidenceAdjustment: 0
      }
    ]
  }
};

// ========== REJECTION PATTERNS ==========
// These patterns indicate a value was inferred or substituted (NOT allowed)

export const INFERENCE_PATTERNS: RegExp[] = [
  /estimate/i,
  /projected/i,
  /approximate/i,
  /inferred/i,
  /calculated/i,
  /derived/i,
  /research firm/i,
  /market analysis/i,
  /industry average/i,
  /based on/i,
  /extrapolated/i
];

export const SUBSTITUTION_PATTERNS: Record<string, RegExp[]> = {
  revenue: [
    /aum/i,              // Assets under management
    /assets under/i,
    /project value/i,
    /contract value/i,
    /gmv/i,              // Gross merchandise value
    /valuation/i,
    /funding/i,
    /investment/i,
    /market cap/i,
    /enterprise value/i,
    /pipeline/i,
    /backlog/i
  ]
};

// ========== VALIDATION FUNCTIONS ==========

/**
 * Validate a single metric value against its definition.
 * Returns a MetricValue with status indicating whether the value is acceptable.
 */
export function validateMetric(
  metricId: string,
  rawValue: any,
  source: string | null,
  timeReference?: string
): MetricValue {
  const definition = METRIC_DEFINITIONS[metricId];
  const validationLog: MetricValidationEntry[] = [];
  
  // If no definition exists, we can't validate - treat as unknown
  if (!definition) {
    console.warn(`[MetricDiscipline] No definition found for metric: ${metricId}`);
    return createUnknownMetric(metricId, `No metric definition for: ${metricId}`);
  }

  // CHECK 1: Missing value
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    validationLog.push({
      timestamp: new Date(),
      rule: 'value_required',
      passed: false,
      message: 'Metric value is missing or empty',
      action: 'blocked'
    });
    return {
      metricId,
      value: null,
      status: 'unknown',
      source: null,
      sourceTier: null,
      timeReference,
      confidence: 0,
      rawValue,
      validationLog
    };
  }

  // CHECK 2: Missing source (required for all metrics)
  if (!source || source.trim() === '') {
    validationLog.push({
      timestamp: new Date(),
      rule: 'source_required',
      passed: false,
      message: 'Metric source is required but missing',
      action: 'blocked'
    });
    return {
      metricId,
      value: null,
      status: 'unknown',
      source: null,
      sourceTier: null,
      timeReference,
      confidence: 0,
      rawValue,
      validationLog
    };
  }

  // CHECK 3: Time reference required
  if (definition.requiresTimeReference && (!timeReference || timeReference.trim() === '')) {
    validationLog.push({
      timestamp: new Date(),
      rule: 'time_reference_required',
      passed: false,
      message: `Metric ${metricId} requires a time reference (e.g., FY2024)`,
      action: 'blocked'
    });
    return {
      metricId,
      value: null,
      status: 'unknown',
      source,
      sourceTier: null,
      timeReference: undefined,
      confidence: 0,
      rawValue,
      validationLog
    };
  }

  // CHECK 4: Inference detection (BLOCKED)
  const isInferred = INFERENCE_PATTERNS.some(pattern => pattern.test(source));
  if (isInferred) {
    validationLog.push({
      timestamp: new Date(),
      rule: 'no_inference',
      passed: false,
      message: `Metric source indicates inference: "${source}"`,
      action: 'blocked'
    });
    return {
      metricId,
      value: null,
      status: 'inferred',
      source,
      sourceTier: null,
      timeReference,
      confidence: 0,
      rawValue,
      validationLog
    };
  }

  // CHECK 5: Substitution detection (BLOCKED)
  const substitutionPatterns = SUBSTITUTION_PATTERNS[metricId] || [];
  const isSubstituted = substitutionPatterns.some(pattern => pattern.test(source));
  if (isSubstituted) {
    validationLog.push({
      timestamp: new Date(),
      rule: 'no_substitution',
      passed: false,
      message: `Metric source indicates substitution with different metric type: "${source}"`,
      action: 'blocked'
    });
    return {
      metricId,
      value: null,
      status: 'substituted',
      source,
      sourceTier: null,
      timeReference,
      confidence: 0,
      rawValue,
      validationLog
    };
  }

  // CHECK 6: Source tier matching
  let matchedTier: SourceTier | null = null;
  for (const tier of definition.allowedSources) {
    if (tier.patterns.some(pattern => pattern.test(source))) {
      matchedTier = tier;
      break;
    }
  }

  // If no tier matched, source is unverified
  let status: MetricStatus = matchedTier ? 'verified' : 'unverified';
  let confidence = matchedTier ? 8 + matchedTier.confidenceAdjustment : 5; // Base confidence

  validationLog.push({
    timestamp: new Date(),
    rule: 'source_tier_check',
    passed: !!matchedTier,
    message: matchedTier 
      ? `Source matched Tier ${matchedTier.tier}: ${matchedTier.name}`
      : `Source did not match any defined tier: "${source}"`
  });

  // CHECK 7: Run custom validation rules
  if (definition.validationRules) {
    for (const rule of definition.validationRules) {
      const passed = rule.validate(rawValue);
      validationLog.push({
        timestamp: new Date(),
        rule: rule.id,
        passed,
        message: passed ? `Rule passed: ${rule.description}` : `Rule failed: ${rule.description}`,
        action: passed ? undefined : (rule.failureAction === 'block' ? 'blocked' : rule.failureAction === 'degrade' ? 'degraded' : 'warned')
      });

      if (!passed) {
        if (rule.failureAction === 'block') {
          return {
            metricId,
            value: null,
            status: 'invalid',
            source,
            sourceTier: matchedTier?.tier || null,
            timeReference,
            confidence: 0,
            rawValue,
            validationLog
          };
        } else if (rule.failureAction === 'degrade') {
          confidence = Math.max(1, confidence - (rule.degradeAmount || 1));
          status = 'unverified';
        }
      }
    }
  }

  // All checks passed
  return {
    metricId,
    value: rawValue,
    status,
    source,
    sourceTier: matchedTier?.tier || null,
    timeReference,
    confidence: Math.max(1, Math.min(10, confidence)),
    rawValue,
    validationLog
  };
}

/**
 * Create an explicitly unknown metric value.
 */
export function createUnknownMetric(metricId: string, reason: string): MetricValue {
  return {
    metricId,
    value: null,
    status: 'unknown',
    source: null,
    sourceTier: null,
    confidence: 0,
    validationLog: [{
      timestamp: new Date(),
      rule: 'explicit_unknown',
      passed: true,
      message: reason
    }]
  };
}

/**
 * Check if a metric value is displayable (has valid, non-unknown status).
 */
export function isMetricDisplayable(metric: MetricValue): boolean {
  return metric.status === 'verified' || metric.status === 'unverified';
}

/**
 * Get display value for a metric, returning "Unknown" if not displayable.
 */
export function getMetricDisplayValue(metric: MetricValue, formatter?: (value: any) => string): string {
  if (!isMetricDisplayable(metric)) {
    return 'Unknown';
  }
  return formatter ? formatter(metric.value) : String(metric.value);
}

/**
 * Validate all metrics for a company at once.
 */
export interface CompanyMetrics {
  [metricId: string]: MetricValue;
}

export function validateCompanyMetrics(
  rawData: Record<string, { value: any; source: string | null; timeReference?: string }>
): CompanyMetrics {
  const result: CompanyMetrics = {};
  
  for (const [metricId, data] of Object.entries(rawData)) {
    result[metricId] = validateMetric(metricId, data.value, data.source, data.timeReference);
  }
  
  return result;
}

/**
 * Log a summary of metric validation results.
 */
export function logMetricValidationSummary(metrics: CompanyMetrics, companyName: string): void {
  const statuses = Object.entries(metrics).map(([id, m]) => `${id}:${m.status}`);
  console.log(`[MetricDiscipline] ${companyName}: ${statuses.join(', ')}`);
}
