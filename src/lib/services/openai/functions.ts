/**
 * CRE-Specific OpenAI Function Definitions
 * 
 * Structured function calling schemas for commercial real estate analysis
 * with comprehensive JSON schemas and validation.
 */

import { z } from 'zod';
import type { CREFunction, PropertyAnalysis, LeaseAnalysis, MarketAnalysis, InvestmentSummary } from './types';

// Zod schemas for validation
export const PropertyAnalysisSchema = z.object({
  propertyType: z.enum(['office', 'retail', 'industrial', 'multifamily', 'mixed-use', 'other']),
  location: z.object({
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    market: z.string().optional()
  }),
  financials: z.object({
    capRate: z.number().min(0).max(50).optional(),
    noi: z.number().optional(),
    grossIncome: z.number().optional(),
    operatingExpenses: z.number().optional(),
    cashFlow: z.number().optional(),
    pricePerSqFt: z.number().min(0).optional()
  }),
  physical: z.object({
    totalSqFt: z.number().min(0).optional(),
    buildingClass: z.enum(['A', 'B', 'C']).optional(),
    yearBuilt: z.number().min(1800).max(new Date().getFullYear()).optional(),
    parking: z.object({
      spaces: z.number().min(0),
      ratio: z.number().min(0)
    }).optional()
  }),
  investment: z.object({
    askingPrice: z.number().min(0).optional(),
    downPayment: z.number().min(0).optional(),
    loanAmount: z.number().min(0).optional(),
    loanTerm: z.number().min(1).max(50).optional(),
    interestRate: z.number().min(0).max(20).optional(),
    dscr: z.number().min(0).optional()
  }),
  risks: z.array(z.string()),
  opportunities: z.array(z.string()),
  marketComparables: z.array(z.object({
    address: z.string(),
    salePrice: z.number().min(0),
    capRate: z.number().min(0).max(50),
    pricePerSqFt: z.number().min(0)
  })).optional()
});

export const LeaseAnalysisSchema = z.object({
  totalLeases: z.number().min(0),
  occupancyRate: z.number().min(0).max(100),
  averageLeaseRate: z.number().min(0),
  weightedAverageLeaseExpiry: z.string(),
  leaseRollover: z.array(z.object({
    year: z.number(),
    sqFtExpiring: z.number().min(0),
    percentOfTotal: z.number().min(0).max(100),
    averageRate: z.number().min(0)
  })),
  tenants: z.array(z.object({
    name: z.string(),
    sqFt: z.number().min(0),
    rate: z.number().min(0),
    expiration: z.string(),
    creditRating: z.string().optional(),
    percentOfIncome: z.number().min(0).max(100)
  })),
  rentBumps: z.array(z.object({
    tenant: z.string(),
    date: z.string(),
    increase: z.number(),
    newRate: z.number().min(0)
  })),
  vacancies: z.array(z.object({
    suite: z.string(),
    sqFt: z.number().min(0),
    askingRate: z.number().min(0),
    marketRate: z.number().min(0)
  }))
});

export const MarketAnalysisSchema = z.object({
  marketOverview: z.object({
    marketName: z.string(),
    submarket: z.string().optional(),
    population: z.number().min(0).optional(),
    medianIncome: z.number().min(0).optional(),
    unemploymentRate: z.number().min(0).max(100).optional()
  }),
  propertyMetrics: z.object({
    vacancyRate: z.number().min(0).max(100),
    averageRent: z.number().min(0),
    averageCapRate: z.number().min(0).max(50),
    priceAppreciation: z.number(),
    inventory: z.number().min(0)
  }),
  trends: z.array(z.object({
    metric: z.string(),
    direction: z.enum(['increasing', 'decreasing', 'stable']),
    percentage: z.number(),
    timeframe: z.string()
  })),
  comparables: z.array(z.object({
    address: z.string(),
    propertyType: z.string(),
    salePrice: z.number().min(0),
    saleDate: z.string(),
    capRate: z.number().min(0).max(50),
    pricePerSqFt: z.number().min(0),
    distance: z.number().min(0)
  })),
  forecast: z.object({
    vacancyRate: z.number().min(0).max(100),
    rentGrowth: z.number(),
    capRateDirection: z.enum(['compression', 'expansion', 'stable']),
    outlook: z.enum(['positive', 'negative', 'neutral'])
  })
});

export const InvestmentSummarySchema = z.object({
  executiveSummary: z.string(),
  keyMetrics: z.object({
    capRate: z.number().min(0).max(50),
    cashOnCash: z.number(),
    irr: z.number(),
    paybackPeriod: z.number().min(0),
    dscr: z.number().min(0)
  }),
  cashFlow: z.array(z.object({
    year: z.number(),
    grossIncome: z.number(),
    operatingExpenses: z.number(),
    noi: z.number(),
    debtService: z.number(),
    cashFlow: z.number()
  })),
  sensitivity: z.object({
    capRateImpact: z.array(z.object({
      scenario: z.string(),
      capRate: z.number().min(0).max(50),
      value: z.number(),
      irr: z.number()
    })),
    rentImpact: z.array(z.object({
      scenario: z.string(),
      rentChange: z.number(),
      noi: z.number(),
      value: z.number()
    }))
  }),
  swotAnalysis: z.object({
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    opportunities: z.array(z.string()),
    threats: z.array(z.string())
  }),
  recommendation: z.object({
    rating: z.enum(['strong-buy', 'buy', 'hold', 'sell', 'strong-sell']),
    reasoning: z.string(),
    targetPrice: z.number().min(0),
    keyRisks: z.array(z.string())
  })
});

// OpenAI function definitions for CRE analysis
export const CRE_FUNCTIONS: Record<string, CREFunction> = {
  analyze_property_financials: {
    name: 'analyze_property_financials',
    description: 'Extract and analyze financial metrics from commercial real estate documents including NOI, cap rates, cash flow, and investment returns.',
    parameters: {
      type: 'object',
      properties: {
        propertyType: {
          type: 'string',
          description: 'Type of commercial property',
          enum: ['office', 'retail', 'industrial', 'multifamily', 'mixed-use', 'other']
        },
        location: {
          type: 'object',
          description: 'Property location information',
          properties: {
            address: { type: 'string', description: 'Street address' },
            city: { type: 'string', description: 'City name' },
            state: { type: 'string', description: 'State abbreviation' },
            zip: { type: 'string', description: 'ZIP code' },
            market: { type: 'string', description: 'Market or submarket name' }
          }
        },
        financials: {
          type: 'object',
          description: 'Financial metrics and performance data',
          properties: {
            capRate: { type: 'number', description: 'Capitalization rate as percentage' },
            noi: { type: 'number', description: 'Net Operating Income in dollars' },
            grossIncome: { type: 'number', description: 'Gross rental income in dollars' },
            operatingExpenses: { type: 'number', description: 'Total operating expenses in dollars' },
            cashFlow: { type: 'number', description: 'Net cash flow in dollars' },
            pricePerSqFt: { type: 'number', description: 'Price per square foot' }
          }
        },
        physical: {
          type: 'object',
          description: 'Physical property characteristics',
          properties: {
            totalSqFt: { type: 'number', description: 'Total square footage' },
            buildingClass: { type: 'string', enum: ['A', 'B', 'C'], description: 'Building class rating' },
            yearBuilt: { type: 'number', description: 'Year property was built' },
            parking: {
              type: 'object',
              properties: {
                spaces: { type: 'number', description: 'Number of parking spaces' },
                ratio: { type: 'number', description: 'Parking ratio per 1000 sq ft' }
              }
            }
          }
        },
        investment: {
          type: 'object',
          description: 'Investment and financing details',
          properties: {
            askingPrice: { type: 'number', description: 'Asking price in dollars' },
            downPayment: { type: 'number', description: 'Required down payment' },
            loanAmount: { type: 'number', description: 'Loan amount in dollars' },
            loanTerm: { type: 'number', description: 'Loan term in years' },
            interestRate: { type: 'number', description: 'Interest rate as percentage' },
            dscr: { type: 'number', description: 'Debt Service Coverage Ratio' }
          }
        },
        risks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Identified investment risks'
        },
        opportunities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Investment opportunities and value-add potential'
        },
        marketComparables: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              address: { type: 'string', description: 'Comparable property address' },
              salePrice: { type: 'number', description: 'Sale price of comparable' },
              capRate: { type: 'number', description: 'Cap rate of comparable' },
              pricePerSqFt: { type: 'number', description: 'Price per sq ft of comparable' }
            }
          },
          description: 'Market comparable sales'
        }
      },
      required: ['propertyType', 'risks', 'opportunities']
    }
  },

  extract_lease_terms: {
    name: 'extract_lease_terms',
    description: 'Parse and analyze lease agreements, rent rolls, and tenant information from CRE documents.',
    parameters: {
      type: 'object',
      properties: {
        totalLeases: { type: 'number', description: 'Total number of leases' },
        occupancyRate: { type: 'number', description: 'Current occupancy rate as percentage' },
        averageLeaseRate: { type: 'number', description: 'Average lease rate per sq ft' },
        weightedAverageLeaseExpiry: { type: 'string', description: 'WALE in YYYY-MM format' },
        leaseRollover: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              year: { type: 'number', description: 'Year of lease expiration' },
              sqFtExpiring: { type: 'number', description: 'Square feet expiring' },
              percentOfTotal: { type: 'number', description: 'Percentage of total space' },
              averageRate: { type: 'number', description: 'Average rate for expiring leases' }
            }
          },
          description: 'Lease rollover schedule by year'
        },
        tenants: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Tenant name' },
              sqFt: { type: 'number', description: 'Leased square footage' },
              rate: { type: 'number', description: 'Lease rate per sq ft' },
              expiration: { type: 'string', description: 'Lease expiration date' },
              creditRating: { type: 'string', description: 'Tenant credit rating' },
              percentOfIncome: { type: 'number', description: 'Percentage of total income' }
            }
          },
          description: 'Individual tenant details'
        },
        rentBumps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tenant: { type: 'string', description: 'Tenant name' },
              date: { type: 'string', description: 'Date of rent increase' },
              increase: { type: 'number', description: 'Percentage increase' },
              newRate: { type: 'number', description: 'New rate per sq ft' }
            }
          },
          description: 'Scheduled rent increases'
        },
        vacancies: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              suite: { type: 'string', description: 'Suite number or identifier' },
              sqFt: { type: 'number', description: 'Vacant square footage' },
              askingRate: { type: 'number', description: 'Asking lease rate' },
              marketRate: { type: 'number', description: 'Market lease rate' }
            }
          },
          description: 'Current vacancies'
        }
      },
      required: ['totalLeases', 'occupancyRate', 'averageLeaseRate', 'weightedAverageLeaseExpiry']
    }
  },

  assess_market_conditions: {
    name: 'assess_market_conditions',
    description: 'Analyze market conditions, comparable sales, and economic factors affecting commercial real estate.',
    parameters: {
      type: 'object',
      properties: {
        marketOverview: {
          type: 'object',
          properties: {
            marketName: { type: 'string', description: 'Primary market name' },
            submarket: { type: 'string', description: 'Submarket or neighborhood' },
            population: { type: 'number', description: 'Market population' },
            medianIncome: { type: 'number', description: 'Median household income' },
            unemploymentRate: { type: 'number', description: 'Unemployment rate percentage' }
          },
          required: ['marketName']
        },
        propertyMetrics: {
          type: 'object',
          properties: {
            vacancyRate: { type: 'number', description: 'Market vacancy rate percentage' },
            averageRent: { type: 'number', description: 'Average rent per sq ft' },
            averageCapRate: { type: 'number', description: 'Average market cap rate' },
            priceAppreciation: { type: 'number', description: 'Price appreciation percentage' },
            inventory: { type: 'number', description: 'Total inventory in sq ft' }
          },
          required: ['vacancyRate', 'averageRent', 'averageCapRate']
        },
        trends: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              metric: { type: 'string', description: 'Metric name' },
              direction: { type: 'string', enum: ['increasing', 'decreasing', 'stable'] },
              percentage: { type: 'number', description: 'Change percentage' },
              timeframe: { type: 'string', description: 'Time period for trend' }
            }
          }
        },
        comparables: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              address: { type: 'string', description: 'Property address' },
              propertyType: { type: 'string', description: 'Type of property' },
              salePrice: { type: 'number', description: 'Sale price' },
              saleDate: { type: 'string', description: 'Date of sale' },
              capRate: { type: 'number', description: 'Cap rate at sale' },
              pricePerSqFt: { type: 'number', description: 'Price per square foot' },
              distance: { type: 'number', description: 'Distance from subject property in miles' }
            }
          }
        },
        forecast: {
          type: 'object',
          properties: {
            vacancyRate: { type: 'number', description: 'Forecasted vacancy rate' },
            rentGrowth: { type: 'number', description: 'Forecasted rent growth percentage' },
            capRateDirection: { type: 'string', enum: ['compression', 'expansion', 'stable'] },
            outlook: { type: 'string', enum: ['positive', 'negative', 'neutral'] }
          },
          required: ['outlook']
        }
      },
      required: ['marketOverview', 'propertyMetrics', 'forecast']
    }
  },

  generate_investment_summary: {
    name: 'generate_investment_summary',
    description: 'Create comprehensive investment analysis with financial projections, sensitivity analysis, and recommendations.',
    parameters: {
      type: 'object',
      properties: {
        executiveSummary: { type: 'string', description: 'Executive summary of investment opportunity' },
        keyMetrics: {
          type: 'object',
          properties: {
            capRate: { type: 'number', description: 'Going-in cap rate' },
            cashOnCash: { type: 'number', description: 'Cash-on-cash return' },
            irr: { type: 'number', description: 'Internal rate of return' },
            paybackPeriod: { type: 'number', description: 'Payback period in years' },
            dscr: { type: 'number', description: 'Debt service coverage ratio' }
          },
          required: ['capRate', 'cashOnCash', 'irr']
        },
        cashFlow: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              year: { type: 'number', description: 'Projection year' },
              grossIncome: { type: 'number', description: 'Gross rental income' },
              operatingExpenses: { type: 'number', description: 'Operating expenses' },
              noi: { type: 'number', description: 'Net operating income' },
              debtService: { type: 'number', description: 'Annual debt service' },
              cashFlow: { type: 'number', description: 'Before-tax cash flow' }
            }
          },
          description: '10-year cash flow projection'
        },
        sensitivity: {
          type: 'object',
          properties: {
            capRateImpact: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  scenario: { type: 'string', description: 'Scenario name' },
                  capRate: { type: 'number', description: 'Exit cap rate' },
                  value: { type: 'number', description: 'Property value' },
                  irr: { type: 'number', description: 'IRR for scenario' }
                }
              }
            },
            rentImpact: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  scenario: { type: 'string', description: 'Scenario name' },
                  rentChange: { type: 'number', description: 'Rent change percentage' },
                  noi: { type: 'number', description: 'NOI impact' },
                  value: { type: 'number', description: 'Value impact' }
                }
              }
            }
          }
        },
        swotAnalysis: {
          type: 'object',
          properties: {
            strengths: { type: 'array', items: { type: 'string' } },
            weaknesses: { type: 'array', items: { type: 'string' } },
            opportunities: { type: 'array', items: { type: 'string' } },
            threats: { type: 'array', items: { type: 'string' } }
          },
          required: ['strengths', 'weaknesses', 'opportunities', 'threats']
        },
        recommendation: {
          type: 'object',
          properties: {
            rating: { type: 'string', enum: ['strong-buy', 'buy', 'hold', 'sell', 'strong-sell'] },
            reasoning: { type: 'string', description: 'Detailed reasoning for recommendation' },
            targetPrice: { type: 'number', description: 'Target acquisition price' },
            keyRisks: { type: 'array', items: { type: 'string' }, description: 'Key risk factors' }
          },
          required: ['rating', 'reasoning', 'keyRisks']
        }
      },
      required: ['executiveSummary', 'keyMetrics', 'swotAnalysis', 'recommendation']
    }
  }
};

// Validation functions for each CRE analysis type
export function validatePropertyAnalysis(data: unknown): { valid: boolean; errors: string[]; data?: PropertyAnalysis } {
  try {
    const validated = PropertyAnalysisSchema.parse(data);
    return { valid: true, errors: [], data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`) };
    }
    return { valid: false, errors: ['Unknown validation error'] };
  }
}

export function validateLeaseAnalysis(data: unknown): { valid: boolean; errors: string[]; data?: LeaseAnalysis } {
  try {
    const validated = LeaseAnalysisSchema.parse(data);
    return { valid: true, errors: [], data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`) };
    }
    return { valid: false, errors: ['Unknown validation error'] };
  }
}

export function validateMarketAnalysis(data: unknown): { valid: boolean; errors: string[]; data?: MarketAnalysis } {
  try {
    const validated = MarketAnalysisSchema.parse(data);
    return { valid: true, errors: [], data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`) };
    }
    return { valid: false, errors: ['Unknown validation error'] };
  }
}

export function validateInvestmentSummary(data: unknown): { valid: boolean; errors: string[]; data?: InvestmentSummary } {
  try {
    const validated = InvestmentSummarySchema.parse(data);
    return { valid: true, errors: [], data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { valid: false, errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`) };
    }
    return { valid: false, errors: ['Unknown validation error'] };
  }
}

// Helper function to get validation function by function name
export function getValidationFunction(functionName: string) {
  const validators: Record<string, (data: unknown) => { valid: boolean; errors: string[]; data?: any }> = {
    'analyze_property_financials': validatePropertyAnalysis,
    'extract_lease_terms': validateLeaseAnalysis,
    'assess_market_conditions': validateMarketAnalysis,
    'generate_investment_summary': validateInvestmentSummary
  };
  
  return validators[functionName] || null;
}