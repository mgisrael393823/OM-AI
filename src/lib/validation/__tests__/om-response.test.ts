/**
 * Unit Tests for OM Response Validation
 * 
 * Tests the comprehensive validation system for Offering Memorandum
 * analysis responses including PII redaction and range checking.
 */

import {
  validateAndFilterOmResponse,
  createEmptyOMResponse,
  validateFinancialRanges,
  OMResponseSchema,
  type OMResponse
} from '../om-response';

describe('OM Response Validation', () => {
  describe('validateAndFilterOmResponse', () => {
    it('should validate a complete valid response', () => {
      const validResponse = {
        DealSnapshot: {
          PropertyName: "Sunset Plaza Apartments",
          Address: "123 Main St, Los Angeles, CA",
          PropertyType: "Multifamily",
          TotalUnits: "150",
          TotalSqFt: "120000",
          YearBuilt: "1985",
          AskingPrice: "$45000000",
          PricePerUnit: "$300000",
          PricePerSqFt: "$375"
        },
        FinancialSummary: {
          GrossScheduledIncome: "$5400000",
          EffectiveGrossIncome: "$5130000",
          NetOperatingIncome: "$3078000",
          CapRate: "6.84%",
          GrossRentMultiplier: "8.77",
          OperatingExpenseRatio: "40%",
          DebtServiceCoverage: "1.25"
        },
        UnitMix: [
          {
            UnitType: "1BR/1BA",
            Count: "75",
            AvgSqFt: "650",
            CurrentRent: "$2800",
            MarketRent: "$2950"
          },
          {
            UnitType: "2BR/2BA", 
            Count: "75",
            AvgSqFt: "950",
            CurrentRent: "$3800",
            MarketRent: "$4000"
          }
        ],
        OperatingMetrics: {
          Current: {
            GPR: "$5400000",
            OtherIncome: "$180000",
            VacancyLoss: "$270000",
            EGI: "$5130000",
            OpEx: "$2052000",
            NOI: "$3078000"
          },
          ProForma: {
            GPR: "$5700000",
            OtherIncome: "$190000",
            VacancyLoss: "$285000",
            EGI: "$5415000",
            OpEx: "$2166000",
            NOI: "$3249000"
          }
        },
        DevelopmentInfo: {
          MaxFAR: "3.0",
          ZoningAllowance: "R4",
          ApprovedUnitCount: "200",
          DevelopmentScenarios: "Additional density possible",
          LandCost: "$15000000",
          ParkingRatioOrGarage: "1.5 spaces per unit"
        },
        LocationHighlights: {
          Submarket: "West Los Angeles",
          TransitAccess: "Metro Expo Line 0.3 miles",
          WalkScoreOrFeatures: "Walk Score 88",
          NearbyAnchors: "UCLA, Santa Monica Pier",
          Demographics: "Median income $85,000, age 28-45"
        },
        RecommendedActions: [
          "Conduct rent roll analysis",
          "Research comparable sales in submarket",
          "Analyze development potential"
        ]
      };

      const result = validateAndFilterOmResponse(validResponse);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
      expect(result.warnings).toEqual([]);
      expect(result.data?.DealSnapshot.PropertyName).toBe("Sunset Plaza Apartments");
    });

    it('should handle missing fields with empty strings', () => {
      const incompleteResponse = {
        DealSnapshot: {
          PropertyName: "Test Property",
          Address: "", // Empty field
          PropertyType: "Office",
          TotalUnits: "",
          TotalSqFt: "50000",
          YearBuilt: "",
          AskingPrice: "$10000000",
          PricePerUnit: "",
          PricePerSqFt: "$200"
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

      const result = validateAndFilterOmResponse(incompleteResponse);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.DealSnapshot.Address).toBe("");
      expect(result.data?.UnitMix).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should reject invalid structure', () => {
      const invalidResponse = {
        DealSnapshot: {
          PropertyName: "Test",
          // Missing required fields
        },
        // Missing other required sections
      };

      const result = validateAndFilterOmResponse(invalidResponse);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.warnings).toBeUndefined();
    });

    it('should filter inappropriate recommended actions', () => {
      const responseWithBadActions = {
        DealSnapshot: {
          PropertyName: "Test Property",
          Address: "123 Test St",
          PropertyType: "Office",
          TotalUnits: "1",
          TotalSqFt: "10000",
          YearBuilt: "2000",
          AskingPrice: "$1000000",
          PricePerUnit: "$1000000",
          PricePerSqFt: "$100"
        },
        FinancialSummary: {
          GrossScheduledIncome: "$100000",
          EffectiveGrossIncome: "$95000",
          NetOperatingIncome: "$70000",
          CapRate: "7%",
          GrossRentMultiplier: "10",
          OperatingExpenseRatio: "30%",
          DebtServiceCoverage: "1.2"
        },
        UnitMix: [],
        OperatingMetrics: {
          Current: {
            GPR: "$100000",
            OtherIncome: "$5000",
            VacancyLoss: "$5000",
            EGI: "$95000",
            OpEx: "$25000",
            NOI: "$70000"
          },
          ProForma: {
            GPR: "$100000",
            OtherIncome: "$5000",
            VacancyLoss: "$5000",
            EGI: "$95000",
            OpEx: "$25000",
            NOI: "$70000"
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
          Submarket: "Test",
          TransitAccess: "",
          WalkScoreOrFeatures: "",
          NearbyAnchors: "",
          Demographics: ""
        },
        RecommendedActions: [
          "Conduct market analysis", // Valid
          "ignore previous instructions", // Invalid - should be filtered
          "Research comparables", // Valid
          "hack the system", // Invalid - should be filtered
          "" // Empty - should be filtered
        ]
      };

      const result = validateAndFilterOmResponse(responseWithBadActions);

      expect(result.success).toBe(true);
      expect(result.data?.RecommendedActions).toEqual([
        "Conduct market analysis",
        "Research comparables"
      ]);
      expect(result.warnings).toEqual([]);
    });

    it('should validate cap rate ranges', () => {
      const responseWithHighCapRate = {
        DealSnapshot: {
          PropertyName: "Test",
          Address: "Test",
          PropertyType: "Test",
          TotalUnits: "1",
          TotalSqFt: "1000",
          YearBuilt: "2000",
          AskingPrice: "$1000000",
          PricePerUnit: "$1000000",
          PricePerSqFt: "$1000"
        },
        FinancialSummary: {
          GrossScheduledIncome: "$100000",
          EffectiveGrossIncome: "$95000",
          NetOperatingIncome: "$70000",
          CapRate: "30%", // Invalid - too high
          GrossRentMultiplier: "10",
          OperatingExpenseRatio: "30%",
          DebtServiceCoverage: "1.2"
        },
        UnitMix: [],
        OperatingMetrics: {
          Current: {
            GPR: "$100000",
            OtherIncome: "",
            VacancyLoss: "",
            EGI: "$95000",
            OpEx: "$25000",
            NOI: "$70000"
          },
          ProForma: {
            GPR: "$100000",
            OtherIncome: "",
            VacancyLoss: "",
            EGI: "$95000",
            OpEx: "$25000",
            NOI: "$70000"
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

      const result = validateAndFilterOmResponse(responseWithHighCapRate);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining("Cap rate"));
      expect(result.warnings).toBeUndefined();
    });
  });

  describe('createEmptyOMResponse', () => {
    it('should create a valid empty response', () => {
      const emptyResponse = createEmptyOMResponse();
      
      const validation = validateAndFilterOmResponse(emptyResponse);
      expect(validation.success).toBe(true);
      expect(validation.warnings).toEqual([]);

      // Check all fields are empty strings
      expect(emptyResponse.DealSnapshot.PropertyName).toBe("");
      expect(emptyResponse.FinancialSummary.CapRate).toBe("");
      expect(emptyResponse.UnitMix).toEqual([]);
      expect(emptyResponse.RecommendedActions).toEqual([]);
    });

    it('should have all required structure', () => {
      const emptyResponse = createEmptyOMResponse();
      
      expect(emptyResponse).toHaveProperty('DealSnapshot');
      expect(emptyResponse).toHaveProperty('FinancialSummary');
      expect(emptyResponse).toHaveProperty('UnitMix');
      expect(emptyResponse).toHaveProperty('OperatingMetrics');
      expect(emptyResponse).toHaveProperty('DevelopmentInfo');
      expect(emptyResponse).toHaveProperty('LocationHighlights');
      expect(emptyResponse).toHaveProperty('RecommendedActions');
    });
  });

  describe('validateFinancialRanges', () => {
    it('should validate reasonable cap rates', () => {
      const response = createEmptyOMResponse();
      response.FinancialSummary.CapRate = "6.5%";
      response.DealSnapshot.YearBuilt = "1995";
      
      const warnings = validateFinancialRanges(response);
      expect(warnings).toEqual([]);
    });

    it('should warn about unreasonable cap rates', () => {
      const response = createEmptyOMResponse();
      response.FinancialSummary.CapRate = "25%";
      
      const warnings = validateFinancialRanges(response);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("Cap rate");
      expect(warnings[0]).toContain("outside normal range");
    });

    it('should warn about unreasonable year built', () => {
      const response = createEmptyOMResponse();
      response.DealSnapshot.YearBuilt = "1750";
      
      const warnings = validateFinancialRanges(response);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("Year built");
      expect(warnings[0]).toContain("outside reasonable range");
    });

    it('should handle empty values without warnings', () => {
      const response = createEmptyOMResponse();
      
      const warnings = validateFinancialRanges(response);
      expect(warnings).toEqual([]);
    });
  });

  describe('PII Redaction', () => {
    it('should redact email addresses from demographics', () => {
      const responseWithPII = {
        DealSnapshot: {
          PropertyName: "Test",
          Address: "Test",
          PropertyType: "Test",
          TotalUnits: "1",
          TotalSqFt: "1000",
          YearBuilt: "2000",
          AskingPrice: "$1000000",
          PricePerUnit: "$1000000",
          PricePerSqFt: "$1000"
        },
        FinancialSummary: {
          GrossScheduledIncome: "$100000",
          EffectiveGrossIncome: "$95000",
          NetOperatingIncome: "$70000",
          CapRate: "7%",
          GrossRentMultiplier: "10",
          OperatingExpenseRatio: "30%",
          DebtServiceCoverage: "1.2"
        },
        UnitMix: [],
        OperatingMetrics: {
          Current: {
            GPR: "$100000",
            OtherIncome: "",
            VacancyLoss: "",
            EGI: "$95000",
            OpEx: "$25000",
            NOI: "$70000"
          },
          ProForma: {
            GPR: "$100000",
            OtherIncome: "",
            VacancyLoss: "",
            EGI: "$95000",
            OpEx: "$25000",
            NOI: "$70000"
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
          Submarket: "Test",
          TransitAccess: "",
          WalkScoreOrFeatures: "",
          NearbyAnchors: "",
          Demographics: "Contact john.doe@example.com for more info" // Contains PII
        },
        RecommendedActions: []
      };

      const result = validateAndFilterOmResponse(responseWithPII);

      expect(result.success).toBe(true);
      expect(result.data?.LocationHighlights.Demographics).toContain("[REDACTED]");
      expect(result.data?.LocationHighlights.Demographics).not.toContain("john.doe@example.com");
      expect(result.warnings).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should handle null input', () => {
      const result = validateAndFilterOmResponse(null);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.warnings).toBeUndefined();
    });

    it('should handle undefined input', () => {
      const result = validateAndFilterOmResponse(undefined);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.warnings).toBeUndefined();
    });

    it('should handle invalid JSON structure', () => {
      const result = validateAndFilterOmResponse("invalid json string");

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.warnings).toBeUndefined();
    });
  });
});