/**
 * Unit Tests for OM Analyst Prompt System
 * 
 * Tests the versioned prompt system, validation, and integration
 * with the chat API to ensure no inline prompts remain.
 */

import {
  getOmPrompt,
  CURRENT_OM_PROMPT_VERSION,
  OM_ANALYST_SYSTEM_PROMPT_V1,
  isValidPromptVersion,
  getAvailablePromptVersions,
  PROMPT_METADATA
} from '../om-analyst';

describe('OM Analyst Prompt System', () => {
  describe('getOmPrompt', () => {
    it('should return the current prompt version by default', () => {
      const prompt = getOmPrompt();
      expect(prompt).toBe(OM_ANALYST_SYSTEM_PROMPT_V1);
      expect(prompt).toContain('You are OM Intel');
      expect(prompt).toContain('REQUIRED JSON SCHEMA');
    });

    it('should return correct version when specified', () => {
      const prompt = getOmPrompt('v1.0.0');
      expect(prompt).toBe(OM_ANALYST_SYSTEM_PROMPT_V1);
    });

    it('should fallback to current version for unknown versions', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const prompt = getOmPrompt('v999.0.0');
      
      expect(prompt).toBe(OM_ANALYST_SYSTEM_PROMPT_V1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown OM prompt version: v999.0.0')
      );
      
      consoleSpy.mockRestore();
    });

    it('should return current version when no version specified', () => {
      const prompt = getOmPrompt(undefined);
      expect(prompt).toBe(OM_ANALYST_SYSTEM_PROMPT_V1);
    });
  });

  describe('Version Management', () => {
    it('should have a valid current version', () => {
      expect(CURRENT_OM_PROMPT_VERSION).toBe('v1.0.0');
      expect(isValidPromptVersion(CURRENT_OM_PROMPT_VERSION)).toBe(true);
    });

    it('should validate semantic versions correctly', () => {
      expect(isValidPromptVersion('v1.0.0')).toBe(true);
      expect(isValidPromptVersion('v2.1.3')).toBe(true);
      expect(isValidPromptVersion('v10.20.30')).toBe(true);
      
      // Invalid versions
      expect(isValidPromptVersion('1.0.0')).toBe(false);
      expect(isValidPromptVersion('v1.0')).toBe(false);
      expect(isValidPromptVersion('v1.0.0.1')).toBe(false);
      expect(isValidPromptVersion('invalid')).toBe(false);
    });

    it('should return available versions', () => {
      const versions = getAvailablePromptVersions();
      expect(versions).toEqual(['v1.0.0']);
      expect(versions).toContain(CURRENT_OM_PROMPT_VERSION);
    });
  });

  describe('Prompt Content Validation', () => {
    it('should contain essential OM Intel branding', () => {
      const prompt = getOmPrompt();
      expect(prompt).toContain('OM Intel');
      expect(prompt).toContain('commercial real estate analyst');
      expect(prompt).toContain('Offering Memorandum');
    });

    it('should enforce JSON-only responses', () => {
      const prompt = getOmPrompt();
      expect(prompt).toContain('respond ONLY with valid JSON');
      expect(prompt).toContain('NO natural language explanations');
      expect(prompt).toContain('NO speculation about missing data');
    });

    it('should include complete JSON schema', () => {
      const prompt = getOmPrompt();
      
      // Check for all required schema sections
      expect(prompt).toContain('REQUIRED JSON SCHEMA');
      expect(prompt).toContain('DealSnapshot');
      expect(prompt).toContain('FinancialSummary');
      expect(prompt).toContain('UnitMix');
      expect(prompt).toContain('OperatingMetrics');
      expect(prompt).toContain('DevelopmentInfo');
      expect(prompt).toContain('LocationHighlights');
      expect(prompt).toContain('RecommendedActions');
    });

    it('should include data conflict resolution guidance', () => {
      const prompt = getOmPrompt();
      expect(prompt).toContain('DATA CONFLICT RESOLUTION');
      expect(prompt).toContain('conflicting information');
      expect(prompt).toContain('most recent or detailed figure');
    });

    it('should include function priority guidance', () => {
      const prompt = getOmPrompt();
      expect(prompt).toContain('FUNCTION PRIORITY');
      expect(prompt).toContain('search_market_data');
      expect(prompt).toContain('calculate_investment_metrics');
    });

    it('should list all 8 available functions', () => {
      const prompt = getOmPrompt();
      expect(prompt).toContain('AVAILABLE FUNCTIONS FOR ENHANCED ANALYSIS');
      
      const expectedFunctions = [
        'analyze_om',
        'search_market_data',
        'map_property_vs_comps',
        'export_to_csv',
        'generate_comparison_chart',
        'calculate_investment_metrics',
        'summarize_entitlement_details',
        'rank_investments'
      ];
      
      expectedFunctions.forEach(func => {
        expect(prompt).toContain(func);
      });
    });

    it('should have deterministic output instructions', () => {
      const prompt = getOmPrompt();
      expect(prompt).toContain('use empty strings for unavailable fields');
      expect(prompt).toContain('preserved as strings exactly as written');
    });
  });

  describe('Prompt Metadata', () => {
    it('should have correct metadata structure', () => {
      expect(PROMPT_METADATA.currentVersion).toBe(CURRENT_OM_PROMPT_VERSION);
      expect(PROMPT_METADATA.promptType).toBe('om-analyst');
      expect(PROMPT_METADATA.enforcesDeterministicOutput).toBe(true);
      expect(PROMPT_METADATA.supportsStructuredOutputs).toBe(true);
      expect(PROMPT_METADATA.functionCount).toBe(8);
    });

    it('should list all schema fields', () => {
      const expectedFields = [
        'DealSnapshot',
        'FinancialSummary', 
        'UnitMix',
        'OperatingMetrics',
        'DevelopmentInfo',
        'LocationHighlights',
        'RecommendedActions'
      ];
      
      expect(PROMPT_METADATA.schemaFields).toEqual(expectedFields);
    });
  });

  describe('Integration with Chat API', () => {
    it('should not contain inline prompts in chat.ts', async () => {
      // This test ensures the chat API uses getOmPrompt() instead of inline prompts
      const fs = require('fs');
      const path = require('path');
      
      const chatFilePath = path.join(__dirname, '../../pages/api/chat.ts');
      
      // Skip test if file doesn't exist (different project structure)
      if (!fs.existsSync(chatFilePath)) {
        return;
      }
      
      const chatFileContent = fs.readFileSync(chatFilePath, 'utf8');
      
      // Should import getOmPrompt
      expect(chatFileContent).toContain('getOmPrompt');
      expect(chatFileContent).toContain('CURRENT_OM_PROMPT_VERSION');
      
      // Should NOT contain inline OM Intel prompts
      expect(chatFileContent).not.toContain('You are OM Intel, an advanced AI assistant');
      expect(chatFileContent).not.toContain('Commercial real estate transactions and valuations');
    });
  });

  describe('Error Handling', () => {
    it('should handle null/undefined versions gracefully', () => {
      const prompt1 = getOmPrompt(null as any);
      const prompt2 = getOmPrompt(undefined);
      
      expect(prompt1).toBe(OM_ANALYST_SYSTEM_PROMPT_V1);
      expect(prompt2).toBe(OM_ANALYST_SYSTEM_PROMPT_V1);
    });

    it('should handle empty string version', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const prompt = getOmPrompt('');
      
      expect(prompt).toBe(OM_ANALYST_SYSTEM_PROMPT_V1);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Performance', () => {
    it('should return prompts quickly', () => {
      const start = Date.now();
      
      for (let i = 0; i < 100; i++) {
        getOmPrompt();
      }
      
      const end = Date.now();
      const duration = end - start;
      
      // Should complete 100 calls in under 50ms (adjusted for CI environments)
      expect(duration).toBeLessThan(50);
    });

    it('should return consistent results', () => {
      const prompt1 = getOmPrompt();
      const prompt2 = getOmPrompt();
      const prompt3 = getOmPrompt('v1.0.0');
      
      expect(prompt1).toBe(prompt2);
      expect(prompt2).toBe(prompt3);
    });
  });
});