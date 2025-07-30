/**
 * OM-AI OpenAI Functions Implementation
 * 
 * Comprehensive OpenAI function calling schemas for Offering Memorandum analysis.
 * Integrates with the OM analyst system to provide 8 specialized real estate
 * analysis capabilities with proper validation, error handling, and TypeScript support.
 * 
 * @version 1.0.0
 * @author OM-AI Platform
 */

import { z } from 'zod';
import { ERROR_CODES } from '@/lib/constants/errors';
import { OMResponse, OMResponseSchema } from '@/lib/validation/om-response';

// ===================================================================
// Core OM Analysis Types and Schemas
// ===================================================================

/**
 * Base interface for all OM function parameters
 */
export interface BaseOMFunctionParams {
  requestId?: string;
  userId?: string;
  timestamp?: string;
}

/**
 * Standard OM function response wrapper
 */
export interface OMFunctionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: ERROR_CODES;
    message: string;
    details?: string;
  };
  metadata?: {
    processingTime?: number;
    tokensUsed?: number;
    confidence?: number;
  };
}

// ===================================================================
// 1. ANALYZE_OM Function - Core OM Document Analysis
// ===================================================================

export const AnalyzeOMParamsSchema = z.object({
  documentText: z.string()
    .min(100, "Document text must be at least 100 characters")
    .max(50000, "Document text exceeds maximum length"),
  analysisDepth: z.enum(['basic', 'comprehensive', 'detailed']).default('comprehensive'),
  extractImages: z.boolean().default(false),
  includeMetadata: z.boolean().default(true),
  validationLevel: z.enum(['strict', 'standard', 'permissive']).default('standard')
}).passthrough(); // Allow additional base params

export type AnalyzeOMParams = z.infer<typeof AnalyzeOMParamsSchema>;

export interface AnalyzeOMResponse extends OMResponse {
  analysisMetadata: {
    documentLength: number;
    processingTime: number;
    confidenceScore: number;
    missingDataFields: string[];
    validationWarnings: string[];
  };
}

// ===================================================================
// 2. SEARCH_MARKET_DATA Function - Market Research
// ===================================================================

export const SearchMarketDataParamsSchema = z.object({
  submarket: z.string()
    .min(2, "Submarket must be at least 2 characters")
    .max(100, "Submarket name too long"),
  propertyType: z.enum(['office', 'retail', 'industrial', 'multifamily', 'mixed-use', 'land', 'other']),
  radiusMiles: z.number().min(0.5).max(50).default(5),
  timeframeDays: z.number().min(30).max(730).default(365),
  includeForecasts: z.boolean().default(true),
  dataPoints: z.array(z.enum([
    'vacancy_rates', 'avg_rents', 'cap_rates', 'sales_volume', 
    'price_per_sqft', 'absorption', 'new_supply', 'demographics'
  ])).default(['vacancy_rates', 'avg_rents', 'cap_rates'])
});

export type SearchMarketDataParams = z.infer<typeof SearchMarketDataParamsSchema>;

export interface MarketDataPoint {
  metric: string;
  value: number;
  unit: string;
  date: string;
  source: string;
  confidence: number;
}

export interface MarketDataResponse {
  submarket: string;
  propertyType: string;
  dataPoints: MarketDataPoint[];
  comparableProperties: Array<{
    address: string;
    salePrice: number;
    saleDate: string;
    capRate: number;
    pricePerSqFt: number;
    distance: number;
  }>;
  marketTrends: Array<{
    metric: string;
    direction: 'increasing' | 'decreasing' | 'stable';
    percentage: number;
    timeframe: string;
  }>;
  forecast: {
    vacancyRate: number;
    rentGrowth: number;
    capRateDirection: 'compression' | 'expansion' | 'stable';
    outlook: 'positive' | 'negative' | 'neutral';
  };
}

// ===================================================================
// 3. MAP_PROPERTY_VS_COMPS Function - Geographic Comparison
// ===================================================================

export const MapPropertyVsCompsParamsSchema = z.object({
  subjectAddress: z.string().min(10, "Address must be complete"),
  comparables: z.array(z.object({
    address: z.string(),
    salePrice: z.number().positive(),
    saleDate: z.string(),
    sqFt: z.number().positive(),
    propertyType: z.string(),
    capRate: z.number().min(0).max(50).optional()
  })).min(1).max(20),
  mapRadius: z.number().min(1).max(25).default(5),
  includeDemographics: z.boolean().default(true),
  includeTransit: z.boolean().default(true)
});

export type MapPropertyVsCompsParams = z.infer<typeof MapPropertyVsCompsParamsSchema>;

export interface PropertyMappingResponse {
  subjectProperty: {
    address: string;
    coordinates: { lat: number; lng: number };
    walkScore: number;
    transitScore: number;
  };
  comparables: Array<{
    address: string;
    coordinates: { lat: number; lng: number };
    distance: number;
    salePrice: number;
    pricePerSqFt: number;
    capRate?: number;
    adjustedValue: number;
    adjustmentFactors: string[];
  }>;
  demographics: {
    population: number;
    medianIncome: number;
    employmentRate: number;
    majorEmployers: string[];
  };
  transportationAccess: Array<{
    type: 'highway' | 'airport' | 'transit' | 'port';
    name: string;
    distance: number;
  }>;
}

// ===================================================================
// 4. EXPORT_TO_CSV Function - Data Export
// ===================================================================

export const ExportToCSVParamsSchema = z.object({
  data: z.record(z.any()), // Flexible data structure
  filename: z.string().min(1).max(100).default('om_analysis_export'),
  includeHeaders: z.boolean().default(true),
  dateFormat: z.enum(['ISO', 'US', 'EU']).default('ISO'),
  numberFormat: z.enum(['US', 'EU', 'INT']).default('US'),
  columns: z.array(z.string()).optional(), // Specific columns to include
  filters: z.record(z.any()).optional() // Data filtering criteria
});

export type ExportToCSVParams = z.infer<typeof ExportToCSVParamsSchema>;

export interface CSVExportResponse {
  filename: string;
  csvContent: string;
  rowCount: number;
  columnCount: number;
  fileSize: number; // in bytes
  downloadUrl?: string; // If stored temporarily
  generatedAt: string;
}

// ===================================================================
// 5. GENERATE_COMPARISON_CHART Function - Visual Data
// ===================================================================

export const GenerateComparisonChartParamsSchema = z.object({
  properties: z.array(z.object({
    name: z.string(),
    metrics: z.record(z.number()) // Flexible metrics object
  })).min(2).max(10),
  chartType: z.enum(['bar', 'line', 'scatter', 'bubble', 'radar']).default('bar'),
  metrics: z.array(z.string()).min(1), // Which metrics to compare
  title: z.string().max(100).default('Property Comparison'),
  dimensions: z.object({
    width: z.number().min(300).max(2000).default(800),
    height: z.number().min(200).max(1500).default(600)
  }).default({ width: 800, height: 600 }),
  colorScheme: z.enum(['default', 'professional', 'colorblind']).default('professional'),
  includeDataLabels: z.boolean().default(true)
});

export type GenerateComparisonChartParams = z.infer<typeof GenerateComparisonChartParamsSchema>;

export interface ChartGenerationResponse {
  chartType: string;
  chartData: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor?: string[];
      borderColor?: string[];
    }>;
  };
  chartConfig: {
    options: Record<string, any>;
    plugins: string[];
  };
  imageUrl?: string; // If chart is rendered server-side
  chartJs: string; // Chart.js configuration
}

// ===================================================================
// 6. CALCULATE_INVESTMENT_METRICS Function - Financial Analysis
// ===================================================================

export const CalculateInvestmentMetricsParamsSchema = z.object({
  financials: z.object({
    purchasePrice: z.number().positive(),
    downPayment: z.number().min(0),
    loanAmount: z.number().min(0),
    interestRate: z.number().min(0).max(20),
    loanTerm: z.number().min(1).max(50),
    grossIncome: z.number().positive(),
    operatingExpenses: z.number().min(0),
    vacancyRate: z.number().min(0).max(100).default(5),
    managementFee: z.number().min(0).max(20).default(5)
  }),
  projections: z.object({
    rentGrowthRate: z.number().min(-10).max(20).default(3),
    expenseGrowthRate: z.number().min(-5).max(15).default(2.5),
    exitCapRate: z.number().min(1).max(20).optional(),
    holdPeriod: z.number().min(1).max(30).default(10)
  }),
  scenarios: z.array(z.object({
    name: z.string(),
    assumptions: z.record(z.number())
  })).optional()
});

export type CalculateInvestmentMetricsParams = z.infer<typeof CalculateInvestmentMetricsParamsSchema>;

export interface InvestmentMetricsResponse {
  keyMetrics: {
    capRate: number;
    cashOnCashReturn: number;
    internalRateOfReturn: number;
    netPresentValue: number;
    paybackPeriod: number;
    debtServiceCoverageRatio: number;
    returnOnInvestment: number;
    grossRentMultiplier: number;
  };
  cashFlowProjection: Array<{
    year: number;
    grossIncome: number;
    operatingExpenses: number;
    netOperatingIncome: number;
    debtService: number;
    beforeTaxCashFlow: number;
    cumulativeCashFlow: number;
  }>;
  scenarioAnalysis?: Array<{
    scenario: string;
    irr: number;
    npv: number;
    cashOnCash: number;
  }>;
  sensitivityAnalysis: {
    rentSensitivity: Array<{ rentChange: number; irrImpact: number; npvImpact: number }>;
    capRateSensitivity: Array<{ exitCapRate: number; irrImpact: number; valueImpact: number }>;
  };
}

// ===================================================================
// 7. SUMMARIZE_ENTITLEMENT_DETAILS Function - Zoning Analysis
// ===================================================================

export const SummarizeEntitlementDetailsParamsSchema = z.object({
  address: z.string().min(10),
  currentZoning: z.string().optional(),
  proposedUse: z.string().optional(),
  includePermitHistory: z.boolean().default(true),
  includeDensityAnalysis: z.boolean().default(true),
  includeSetbackRequirements: z.boolean().default(true),
  jurisdictionLevel: z.enum(['city', 'county', 'state', 'federal']).default('city')
});

export type SummarizeEntitlementDetailsParams = z.infer<typeof SummarizeEntitlementDetailsParamsSchema>;

export interface EntitlementDetailsResponse {
  property: {
    address: string;
    parcelId: string;
    legalDescription: string;
    acreage: number;
  };
  zoning: {
    currentZoning: string;
    zoningDescription: string;
    allowedUses: string[];
    prohibitedUses: string[];
    conditionalUses: string[];
  };
  developmentStandards: {
    maxFAR: number;
    maxHeight: number;
    minSetbacks: {
      front: number;
      rear: number;
      side: number;
    };
    maxCoverage: number;
    parkingRequirements: {
      ratioPerUnit: number;
      ratioPerSqFt: number;
      minimumSpaces: number;
    };
  };
  entitlementRisks: Array<{
    risk: string;
    severity: 'low' | 'medium' | 'high';
    mitigationStrategies: string[];
  }>;
  permitHistory: Array<{
    permitType: string;
    applicationDate: string;
    approvalDate?: string;
    status: 'approved' | 'pending' | 'denied';
    description: string;
  }>;
  developmentScenarios: Array<{
    scenario: string;
    maxUnits: number;
    maxSqFt: number;
    estimatedValue: number;
    developmentCost: number;
    timeline: string;
  }>;
}

// ===================================================================
// 8. RANK_INVESTMENTS Function - Multi-Property Analysis
// ===================================================================

export const RankInvestmentsParamsSchema = z.object({
  properties: z.array(z.object({
    id: z.string(),
    name: z.string(),
    address: z.string(),
    financials: z.record(z.number()), // Flexible financial metrics
    physical: z.record(z.union([z.string(), z.number()])), // Mixed property data
    location: z.record(z.union([z.string(), z.number()])) // Location attributes
  })).min(2).max(50),
  criteria: z.object({
    weights: z.record(z.number().min(0).max(1)), // Criteria weights (must sum to 1)
    minimumThresholds: z.record(z.number()).optional(),
    excludeCriteria: z.array(z.string()).optional()
  }),
  rankingMethod: z.enum(['weighted_score', 'pareto_efficient', 'risk_adjusted']).default('weighted_score'),
  includeDetailedScoring: z.boolean().default(true)
});

export type RankInvestmentsParams = z.infer<typeof RankInvestmentsParamsSchema>;

export interface InvestmentRankingResponse {
  rankings: Array<{
    rank: number;
    propertyId: string;
    propertyName: string;
    overallScore: number;
    categoryScores: Record<string, number>;
    strengths: string[];
    weaknesses: string[];
    recommendation: 'strong_buy' | 'buy' | 'consider' | 'pass';
  }>;
  criteriaAnalysis: Record<string, {
    weight: number;
    averageScore: number;
    topPerformer: string;
    bottomPerformer: string;
  }>;
  marketInsights: {
    bestValuePlay: string;
    lowestRisk: string;
    highestReturn: string;
    mostBalanced: string;
  };
  portfolio: {
    diversificationScore: number;
    recommendedAllocation: Array<{
      propertyId: string;
      allocationPercentage: number;
      rationale: string;
    }>;
  };
}

// ===================================================================
// OpenAI Function Definitions for Chat Completions API
// ===================================================================

export interface OMFunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

/**
 * Complete OpenAI function definitions for OM analysis
 * Compatible with OpenAI Chat Completions API function calling
 */
export const OM_FUNCTIONS: Record<string, OMFunctionDefinition> = {
  analyze_om: {
    name: 'analyze_om',
    description: 'Perform comprehensive analysis of Offering Memorandum documents with structured JSON output. Extracts deal snapshots, financial metrics, unit mix, development details, and location highlights.',
    parameters: {
      type: 'object',
      properties: {
        documentText: {
          type: 'string',
          description: 'Complete text content of the Offering Memorandum document',
          minLength: 100,
          maxLength: 50000
        },
        analysisDepth: {
          type: 'string',
          enum: ['basic', 'comprehensive', 'detailed'],
          description: 'Level of analysis detail required',
          default: 'comprehensive'
        },
        extractImages: {
          type: 'boolean',
          description: 'Whether to extract and analyze images/charts from the document',
          default: false
        },
        includeMetadata: {
          type: 'boolean',
          description: 'Include processing metadata in response',
          default: true
        },
        validationLevel: {
          type: 'string',
          enum: ['strict', 'standard', 'permissive'],
          description: 'Validation strictness for extracted data',
          default: 'standard'
        }
      },
      required: ['documentText']
    }
  },

  search_market_data: {
    name: 'search_market_data',
    description: 'Research market comparables, trends, and economic data for a specific submarket and property type. Provides vacancy rates, rental rates, cap rates, and forecasts.',
    parameters: {
      type: 'object',
      properties: {
        submarket: {
          type: 'string',
          description: 'Target submarket or geographic area name',
          minLength: 2,
          maxLength: 100
        },
        propertyType: {
          type: 'string',
          enum: ['office', 'retail', 'industrial', 'multifamily', 'mixed-use', 'land', 'other'],
          description: 'Type of commercial property for market research'
        },
        radiusMiles: {
          type: 'number',
          description: 'Search radius in miles from submarket center',
          minimum: 0.5,
          maximum: 50,
          default: 5
        },
        timeframeDays: {
          type: 'number',
          description: 'Historical data timeframe in days',
          minimum: 30,
          maximum: 730,
          default: 365
        },
        includeForecasts: {
          type: 'boolean',
          description: 'Include market forecasts and projections',
          default: true
        },
        dataPoints: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['vacancy_rates', 'avg_rents', 'cap_rates', 'sales_volume', 'price_per_sqft', 'absorption', 'new_supply', 'demographics']
          },
          description: 'Specific market data points to retrieve',
          default: ['vacancy_rates', 'avg_rents', 'cap_rates']
        }
      },
      required: ['submarket', 'propertyType']
    }
  },

  map_property_vs_comps: {
    name: 'map_property_vs_comps',
    description: 'Create geographic analysis mapping subject property against comparable sales with location adjustments, demographics, and transportation access.',
    parameters: {
      type: 'object',
      properties: {
        subjectAddress: {
          type: 'string',
          description: 'Complete address of the subject property',
          minLength: 10
        },
        comparables: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              address: { type: 'string', minLength: 10 },
              salePrice: { type: 'number', minimum: 0 },
              saleDate: { type: 'string', format: 'date' },
              sqFt: { type: 'number', minimum: 1 },
              propertyType: { type: 'string' },
              capRate: { type: 'number', minimum: 0, maximum: 50 }
            },
            required: ['address', 'salePrice', 'saleDate', 'sqFt', 'propertyType']
          },
          minItems: 1,
          maxItems: 20,
          description: 'Array of comparable properties for mapping analysis'
        },
        mapRadius: {
          type: 'number',
          description: 'Map display radius in miles',
          minimum: 1,
          maximum: 25,
          default: 5
        },
        includeDemographics: {
          type: 'boolean',
          description: 'Include demographic analysis for the area',
          default: true
        },
        includeTransit: {
          type: 'boolean',
          description: 'Include transportation and accessibility analysis',
          default: true
        }
      },
      required: ['subjectAddress', 'comparables']
    }
  },

  export_to_csv: {
    name: 'export_to_csv',
    description: 'Export analysis results and data to CSV format with customizable formatting, column selection, and filtering options.',
    parameters: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: 'Data object to export (flexible structure)'
        },
        filename: {
          type: 'string',
          description: 'Desired filename for the CSV export',
          minLength: 1,
          maxLength: 100,
          default: 'om_analysis_export'
        },
        includeHeaders: {
          type: 'boolean',
          description: 'Include column headers in CSV output',
          default: true
        },
        dateFormat: {
          type: 'string',
          enum: ['ISO', 'US', 'EU'],
          description: 'Date formatting standard',
          default: 'ISO'
        },
        numberFormat: {
          type: 'string',
          enum: ['US', 'EU', 'INT'],
          description: 'Number formatting standard',
          default: 'US'
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific columns to include (optional)'
        },
        filters: {
          type: 'object',
          description: 'Data filtering criteria (optional)'
        }
      },
      required: ['data']
    }
  },

  generate_comparison_chart: {
    name: 'generate_comparison_chart',
    description: 'Generate visual comparison charts for multiple properties showing key metrics with customizable chart types and styling.',
    parameters: {
      type: 'object',
      properties: {
        properties: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 1 },
              metrics: {
                type: 'object',
                additionalProperties: { type: 'number' },
                description: 'Key-value pairs of metrics for this property'
              }
            },
            required: ['name', 'metrics']
          },
          minItems: 2,
          maxItems: 10,
          description: 'Array of properties with their metrics for comparison'
        },
        chartType: {
          type: 'string',
          enum: ['bar', 'line', 'scatter', 'bubble', 'radar'],
          description: 'Type of chart to generate',
          default: 'bar'
        },
        metrics: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Which metrics to include in the comparison'
        },
        title: {
          type: 'string',
          description: 'Chart title',
          maxLength: 100,
          default: 'Property Comparison'
        },
        dimensions: {
          type: 'object',
          properties: {
            width: { type: 'number', minimum: 300, maximum: 2000 },
            height: { type: 'number', minimum: 200, maximum: 1500 }
          },
          default: { width: 800, height: 600 }
        },
        colorScheme: {
          type: 'string',
          enum: ['default', 'professional', 'colorblind'],
          description: 'Color scheme for the chart',
          default: 'professional'
        },
        includeDataLabels: {
          type: 'boolean',
          description: 'Show data labels on chart elements',
          default: true
        }
      },
      required: ['properties', 'metrics']
    }
  },

  calculate_investment_metrics: {
    name: 'calculate_investment_metrics',
    description: 'Calculate comprehensive investment metrics including IRR, NPV, cash-on-cash returns, DSCR with scenario analysis and sensitivity testing.',
    parameters: {
      type: 'object',
      properties: {
        financials: {
          type: 'object',
          properties: {
            purchasePrice: { type: 'number', minimum: 0 },
            downPayment: { type: 'number', minimum: 0 },
            loanAmount: { type: 'number', minimum: 0 },
            interestRate: { type: 'number', minimum: 0, maximum: 20 },
            loanTerm: { type: 'number', minimum: 1, maximum: 50 },
            grossIncome: { type: 'number', minimum: 0 },
            operatingExpenses: { type: 'number', minimum: 0 },
            vacancyRate: { type: 'number', minimum: 0, maximum: 100, default: 5 },
            managementFee: { type: 'number', minimum: 0, maximum: 20, default: 5 }
          },
          required: ['purchasePrice', 'grossIncome', 'operatingExpenses'],
          description: 'Core financial data for the investment'
        },
        projections: {
          type: 'object',
          properties: {
            rentGrowthRate: { type: 'number', minimum: -10, maximum: 20, default: 3 },
            expenseGrowthRate: { type: 'number', minimum: -5, maximum: 15, default: 2.5 },
            exitCapRate: { type: 'number', minimum: 1, maximum: 20 },
            holdPeriod: { type: 'number', minimum: 1, maximum: 30, default: 10 }
          },
          description: 'Projection assumptions for analysis period'
        },
        scenarios: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 1 },
              assumptions: {
                type: 'object',
                additionalProperties: { type: 'number' }
              }
            },
            required: ['name', 'assumptions']
          },
          description: 'Optional scenario analysis with different assumptions'
        }
      },
      required: ['financials']
    }
  },

  summarize_entitlement_details: {
    name: 'summarize_entitlement_details',
    description: 'Analyze zoning, development rights, entitlement risks, and regulatory requirements for a property address.',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Complete property address for entitlement analysis',
          minLength: 10
        },
        currentZoning: {
          type: 'string',
          description: 'Current zoning designation if known'
        },
        proposedUse: {
          type: 'string',
          description: 'Proposed use or development plan'
        },
        includePermitHistory: {
          type: 'boolean',
          description: 'Include historical permit and approval data',
          default: true
        },
        includeDensityAnalysis: {
          type: 'boolean',
          description: 'Include density and FAR analysis',
          default: true
        },
        includeSetbackRequirements: {
          type: 'boolean',
          description: 'Include setback and coverage requirements',
          default: true
        },
        jurisdictionLevel: {
          type: 'string',
          enum: ['city', 'county', 'state', 'federal'],
          description: 'Primary jurisdiction level for analysis',
          default: 'city'
        }
      },
      required: ['address']
    }
  },

  rank_investments: {
    name: 'rank_investments',
    description: 'Rank and compare multiple investment opportunities using weighted scoring criteria with detailed analysis and portfolio recommendations.',
    parameters: {
      type: 'object',
      properties: {
        properties: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', minLength: 1 },
              name: { type: 'string', minLength: 1 },
              address: { type: 'string', minLength: 10 },
              financials: {
                type: 'object',
                additionalProperties: { type: 'number' },
                description: 'Financial metrics for comparison'
              },
              physical: {
                type: 'object',
                additionalProperties: { type: ['string', 'number'] },
                description: 'Physical property characteristics'
              },
              location: {
                type: 'object',
                additionalProperties: { type: ['string', 'number'] },
                description: 'Location and market attributes'
              }
            },
            required: ['id', 'name', 'address', 'financials']
          },
          minItems: 2,
          maxItems: 50,
          description: 'Array of properties to rank and compare'
        },
        criteria: {
          type: 'object',
          properties: {
            weights: {
              type: 'object',
              additionalProperties: { type: 'number', minimum: 0, maximum: 1 },
              description: 'Criteria weights (must sum to 1.0)'
            },
            minimumThresholds: {
              type: 'object',
              additionalProperties: { type: 'number' },
              description: 'Minimum threshold values for criteria'
            },
            excludeCriteria: {
              type: 'array',
              items: { type: 'string' },
              description: 'Criteria to exclude from ranking'
            }
          },
          required: ['weights'],
          description: 'Ranking criteria and weights'
        },
        rankingMethod: {
          type: 'string',
          enum: ['weighted_score', 'pareto_efficient', 'risk_adjusted'],
          description: 'Method for ranking properties',
          default: 'weighted_score'
        },
        includeDetailedScoring: {
          type: 'boolean',
          description: 'Include detailed scoring breakdown for each property',
          default: true
        }
      },
      required: ['properties', 'criteria']
    }
  }
};

// ===================================================================
// Validation Functions
// ===================================================================

/**
 * Validates parameters for OM functions using Zod schemas
 */
export function validateOMFunctionParams(
  functionName: string, 
  params: unknown
): { valid: boolean; errors: string[]; data?: any } {
  const validators: Record<string, z.ZodSchema> = {
    'analyze_om': AnalyzeOMParamsSchema,
    'search_market_data': SearchMarketDataParamsSchema,
    'map_property_vs_comps': MapPropertyVsCompsParamsSchema,
    'export_to_csv': ExportToCSVParamsSchema,
    'generate_comparison_chart': GenerateComparisonChartParamsSchema,
    'calculate_investment_metrics': CalculateInvestmentMetricsParamsSchema,
    'summarize_entitlement_details': SummarizeEntitlementDetailsParamsSchema,
    'rank_investments': RankInvestmentsParamsSchema
  };

  const validator = validators[functionName];
  if (!validator) {
    return {
      valid: false,
      errors: [`Unknown function: ${functionName}`]
    };
  }

  try {
    const validated = validator.parse(params);
    return {
      valid: true,
      errors: [],
      data: validated
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      };
    }
    return {
      valid: false,
      errors: ['Unknown validation error']
    };
  }
}

/**
 * Creates a standardized error response for OM functions
 */
export function createOMFunctionError(
  code: ERROR_CODES,
  message: string,
  details?: string
): OMFunctionResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details
    }
  };
}

/**
 * Creates a standardized success response for OM functions
 */
export function createOMFunctionSuccess<T>(
  data: T,
  metadata?: any
): OMFunctionResponse<T> {
  return {
    success: true,
    data,
    metadata
  };
}

// ===================================================================
// Helper Functions
// ===================================================================

/**
 * Gets the OpenAI function definition by name
 */
export function getOMFunctionDefinition(functionName: string): OMFunctionDefinition | null {
  return OM_FUNCTIONS[functionName] || null;
}

/**
 * Gets all available OM function names
 */
export function getOMFunctionNames(): string[] {
  return Object.keys(OM_FUNCTIONS);
}

/**
 * Checks if a function name is valid for OM analysis
 */
export function isValidOMFunction(functionName: string): boolean {
  return functionName in OM_FUNCTIONS;
}

/**
 * Gets function metadata for analytics and monitoring
 */
export function getOMFunctionMetadata() {
  return {
    totalFunctions: Object.keys(OM_FUNCTIONS).length,
    functionNames: Object.keys(OM_FUNCTIONS),
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    supportedSchemas: [
      'analyze_om',
      'search_market_data', 
      'map_property_vs_comps',
      'export_to_csv',
      'generate_comparison_chart',
      'calculate_investment_metrics',
      'summarize_entitlement_details',
      'rank_investments'
    ]
  };
}