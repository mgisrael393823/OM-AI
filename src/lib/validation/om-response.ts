/**
 * OM Response Validation and Filtering
 * 
 * Comprehensive validation system for Offering Memorandum analysis responses
 * with PII redaction, range checking, and fallback handling.
 */

import { z } from 'zod';

// Zod schema matching the JSON schema structure
const DealSnapshotSchema = z.object({
  PropertyName: z.string().transform(val => val || ""),
  Address: z.string().transform(val => val || ""),
  PropertyType: z.string().transform(val => val || ""),
  TotalUnits: z.string().transform(val => val || ""),
  TotalSqFt: z.string().transform(val => val || ""),
  YearBuilt: z.string().transform(val => val || ""),
  AskingPrice: z.string().transform(val => val || ""),
  PricePerUnit: z.string().transform(val => val || ""),
  PricePerSqFt: z.string().transform(val => val || "")
});

const FinancialSummarySchema = z.object({
  GrossScheduledIncome: z.string().transform(val => val || ""),
  EffectiveGrossIncome: z.string().transform(val => val || ""), 
  NetOperatingIncome: z.string().transform(val => val || ""),
  CapRate: z.string()
    .transform(val => val || "")
    .refine(val => {
      if (!val) return true;
      const numVal = parseFloat(val.replace(/[^\d.-]/g, ''));
      return isNaN(numVal) || (numVal >= 0 && numVal <= 25); // Reasonable cap rate range
    }, "Cap rate must be between 0-25%"),
  GrossRentMultiplier: z.string().transform(val => val || ""),
  OperatingExpenseRatio: z.string().transform(val => val || ""),
  DebtServiceCoverage: z.string().transform(val => val || "")
});

const UnitMixItemSchema = z.object({
  UnitType: z.string().transform(val => val || ""),
  Count: z.string().transform(val => val || ""),
  AvgSqFt: z.string().transform(val => val || ""),
  CurrentRent: z.string().transform(val => val || ""),
  MarketRent: z.string().transform(val => val || "")
});

const OperatingMetricsSchema = z.object({
  Current: z.object({
    GPR: z.string().transform(val => val || ""),
    OtherIncome: z.string().transform(val => val || ""),
    VacancyLoss: z.string().transform(val => val || ""),
    EGI: z.string().transform(val => val || ""),
    OpEx: z.string().transform(val => val || ""),
    NOI: z.string().transform(val => val || "")
  }),
  ProForma: z.object({
    GPR: z.string().transform(val => val || ""),
    OtherIncome: z.string().transform(val => val || ""),
    VacancyLoss: z.string().transform(val => val || ""),
    EGI: z.string().transform(val => val || ""),
    OpEx: z.string().transform(val => val || ""),
    NOI: z.string().transform(val => val || "")
  })
});

const DevelopmentInfoSchema = z.object({
  MaxFAR: z.string().transform(val => val || ""),
  ZoningAllowance: z.string().transform(val => val || ""),
  ApprovedUnitCount: z.string().transform(val => val || ""),
  DevelopmentScenarios: z.string().transform(val => val || ""),
  LandCost: z.string().transform(val => val || ""),
  ParkingRatioOrGarage: z.string().transform(val => val || "")
});

const LocationHighlightsSchema = z.object({
  Submarket: z.string().transform(val => val || ""),
  TransitAccess: z.string().transform(val => val || ""),
  WalkScoreOrFeatures: z.string().transform(val => val || ""),
  NearbyAnchors: z.string().transform(val => val || ""),
  Demographics: z.string()
    .transform(val => val || "")
    .transform(val => redactPII(val)) // Remove potential PII from demographics
});

// Complete OM Response Schema
export const OMResponseSchema = z.object({
  DealSnapshot: DealSnapshotSchema,
  FinancialSummary: FinancialSummarySchema,
  UnitMix: z.array(UnitMixItemSchema),
  OperatingMetrics: OperatingMetricsSchema,
  DevelopmentInfo: DevelopmentInfoSchema,
  LocationHighlights: LocationHighlightsSchema,
  RecommendedActions: z.array(z.string())
    .transform(actions => actions.filter(action => 
      action && action.length > 0 && isAppropriateAction(action)
    ))
});

// Type inference from schema
export type OMResponse = z.infer<typeof OMResponseSchema>;

/**
 * Validates and filters OM response in a single pass
 * @param data - Raw response data to validate
 * @returns Validated and filtered OM response with fallbacks
 */
export function validateAndFilterOmResponse(data: unknown): {
  success: boolean;
  data?: OMResponse;
  errors?: string[];
} {
  try {
    const validated = OMResponseSchema.parse(data);
    return {
      success: true,
      data: validated
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      );
      
      // Log validation failure with sanitized details to avoid exposing PII
      const summary = typeof data === 'object' && data !== null
        ? {
            type: Array.isArray(data) ? 'array' : 'object',
            keys: Object.keys(data).slice(0, 5)
          }
        : { type: typeof data };

      console.warn('OM Response validation failed:', {
        errors,
        originalDataSummary: summary,
        expectedShape: createEmptyOMResponse()
      });
      
      return {
        success: false,
        errors
      };
    }
    
    return {
      success: false,
      errors: ['Unknown validation error']
    };
  }
}

/**
 * Creates a default empty OM response for fallback scenarios
 * @returns Complete OM response with empty strings
 */
export function createEmptyOMResponse(): OMResponse {
  return {
    DealSnapshot: {
      PropertyName: "",
      Address: "",
      PropertyType: "",
      TotalUnits: "",
      TotalSqFt: "",
      YearBuilt: "",
      AskingPrice: "",
      PricePerUnit: "",
      PricePerSqFt: ""
    },
    FinancialSummary: {
      GrossScheduledIncome: "",
      EffectiveGrossIncome: "",
      NetOperatingIncome: "",
      CapRate: "",
      GrossRentMultiplier: "",
      OperatingExpenseRatio: "",
      DebtServiceCoverage: ""
    },
    UnitMix: [],
    OperatingMetrics: {
      Current: {
        GPR: "",
        OtherIncome: "",
        VacancyLoss: "",
        EGI: "",
        OpEx: "",
        NOI: ""
      },
      ProForma: {
        GPR: "",
        OtherIncome: "",
        VacancyLoss: "",
        EGI: "",
        OpEx: "",
        NOI: ""
      }
    },
    DevelopmentInfo: {
      MaxFAR: "",
      ZoningAllowance: "",
      ApprovedUnitCount: "",
      DevelopmentScenarios: "",
      LandCost: "",
      ParkingRatioOrGarage: ""
    },
    LocationHighlights: {
      Submarket: "",
      TransitAccess: "",
      WalkScoreOrFeatures: "",
      NearbyAnchors: "",
      Demographics: ""
    },
    RecommendedActions: []
  };
}

/**
 * Redacts potential PII from text content
 * @param text - Text that may contain PII
 * @returns Text with PII patterns removed
 */
function redactPII(text: string): string {
  if (!text) return text;
  
  // Patterns to redact
  const piiPatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
    /\b\d{3}-?\d{3}-?\d{4}\b/g, // Phone numbers
  ];
  
  let redacted = text;
  piiPatterns.forEach(pattern => {
    redacted = redacted.replace(pattern, '[REDACTED]');
  });
  
  return redacted;
}

/**
 * Validates that a recommended action is appropriate and not harmful
 * @param action - Action string to validate
 * @returns True if action is appropriate
 */
function isAppropriateAction(action: string): boolean {
  if (!action || typeof action !== 'string') return false;
  
  // Filter out inappropriate actions
  const inappropriatePatterns = [
    /ignore/i,
    /bypass/i,
    /override/i,
    /hack/i,
    /exploit/i
  ];
  
  return !inappropriatePatterns.some(pattern => pattern.test(action));
}

/**
 * Validates that financial data is within reasonable real estate ranges
 * @param response - OM response to validate
 * @returns Validation warnings for out-of-range values
 */
export function validateFinancialRanges(response: OMResponse): string[] {
  const warnings: string[] = [];
  
  // Cap rate validation
  const capRate = response.FinancialSummary.CapRate;
  if (capRate) {
    const numCapRate = parseFloat(capRate.replace(/[^\d.-]/g, ''));
    if (!isNaN(numCapRate) && (numCapRate < 1 || numCapRate > 20)) {
      warnings.push(`Cap rate ${capRate} appears outside normal range (1-20%)`);
    }
  }
  
  // Year built validation
  const yearBuilt = response.DealSnapshot.YearBuilt;
  if (yearBuilt) {
    const numYear = parseInt(yearBuilt.replace(/[^\d]/g, ''));
    const currentYear = new Date().getFullYear();
    if (!isNaN(numYear) && (numYear < 1800 || numYear > currentYear + 5)) {
      warnings.push(`Year built ${yearBuilt} appears outside reasonable range`);
    }
  }
  
  return warnings;
}