_PROMPT_V1 string by adding these sections:
   
   After the main instructions, add:
   "Data Conflict Resolution: When the OM contains conflicting information (e.g., different unit counts on different pages), use the most recent or detailed figure and note the discrepancy in RecommendedActions."
   
   After the schema definition, add:
   "Partial Data Handling: For arrays like UnitMix, include all unit types found in the OM. If some fields are missing for certain unit types, use empty strings for those specific fields."
   
   Before the function list, add:
   "Function Priority: When multiple functions could enhance the analysis, prioritize in this order: 1) search_market_data for missing market context, 2) calculate_investment_metrics for incomplete financials, 3) visualization functions for presenting findings."
   
   In the RecommendedActions description, add:
   "Base recommendations on gaps in the data. For example, if NOI is provided but not cap rate, suggest 'Search market data for comparable cap rates in [specific submarket]'."

3. Add comprehensive JSDoc comments for each exported constant:
   - Document when to increment version numbers (patch for prompt tweaks, minor for function changes, major for schema changes)
   - Explain how the prompt enforces determin# OM-AI Chat Completions API Implementation Strategy

## Executive Summary

This document outlines a phased approach to upgrade the OM-AI platform's Chat Completions API implementation to meet production-grade standards for analyzing commercial real estate Offering Memorandums (OMs). The strategy leverages existing services, particularly the comprehensive `OpenAIService`, to ensure deterministic JSON outputs following the specified schema while maintaining backward compatibility.

## Key Implementation Notes

### Function Consolidation
All 8 OM analysis functions are defined together in Phase 2.1:
- analyze_om
- search_market_data  
- map_property_vs_comps
- export_to_csv
- generate_comparison_chart
- calculate_investment_metrics
- summarize_entitlement_details
- rank_investments

These are registered once with OpenAIService and automatically included in all calls.

### Prompt Enhancements
The system prompt in Phase 1.1 includes all enhancements integrated directly into the OM_ANALYST_SYSTEM_PROMPT_V1 string:
- Data Conflict Resolution section
- Partial Data Handling section  
- Function Priority section
- Enhanced RecommendedActions guidance

### Error Code Migration
Phase 1.3 requires updating ALL existing apiError calls across the entire codebase, not just new code. Search and replace all instances to ensure consistency.

### Test Directory Creation
Always check if __tests__ directories exist before creating test files. Create them if missing to avoid path errors.

---

## Phase 1: Critical Foundation (Week 1)
*Focus: System prompts and structured output for OM analysis*

### 1.1 Implement Elite OM Analyst System Prompt

**Claude Prompt:**
```
Create /src/lib/prompts/om-analyst.ts with the following elite real-estate analyst prompt system:

1. Copy the exact system prompt and function definitions from the provided specification, which includes:
   - CURRENT_OM_PROMPT_VERSION = 'v1'
   - getOmPrompt(version?: string) helper function
   - OM_ANALYST_SYSTEM_PROMPT_V1 with comprehensive instructions
   - Complete JSON schema with all required fields
   - 8 critical functions for enhanced analysis

2. Add these enhancements to the provided prompt:
   - Include a section on handling conflicting data: "When the OM contains conflicting information (e.g., different unit counts on different pages), use the most recent or detailed figure and note the discrepancy in RecommendedActions"
   - Add guidance for partial data: "For arrays like UnitMix, include all unit types found in the OM. If some fields are missing for certain unit types, use empty strings for those specific fields"
   - Specify function priority: "When multiple functions could enhance the analysis, prioritize in this order: 1) search_market_data for missing market context, 2) calculate_investment_metrics for incomplete financials, 3) visualization functions for presenting findings"
   - Enhance RecommendedActions guidance: "Base recommendations on gaps in the data. For example, if NOI is provided but not cap rate, suggest 'Search market data for comparable cap rates in [specific submarket]'"

3. Add JSDoc comments for each exported constant explaining:
   - Purpose and usage context
   - When to increment version numbers
   - How the prompt enforces deterministic JSON output
   - Integration points with OpenAIService functions

4. Create unit tests in /src/lib/prompts/__tests__/om-analyst.test.ts that verify:
   - getOmPrompt returns correct version
   - Default version matches CURRENT_OM_PROMPT_VERSION
   - Prompt contains all required schema keys
   - Function names match those registered in OpenAIService

Update /src/pages/api/chat.ts to import and use getOmPrompt() for the system message. Ensure document text is passed only in user messages, never concatenated to the system prompt.
```

### 1.2 Add OpenAI Structured Outputs with JSON Schema Validation

**Claude Prompt:**
```
Implement OpenAI Structured Outputs for guaranteed JSON compliance:

1. Create /src/lib/validation/om-schema.json with the exact JSON schema:
   - Define complete schema matching the OM structure
   - Include all required fields and constraints
   - Ensure schema is compatible with OpenAI's structured outputs

2. Create /src/lib/validation/om-response.ts with Zod validation:
   - Define Zod schema matching the JSON schema structure
   - DealSnapshot, FinancialSummary, UnitMix, OperatingMetrics, etc.
   - Create validateAndFilterOmResponse() as backup validation
   - Use Zod's .transform() for PII redaction and range checks

3. Update OpenAI service calls to use structured outputs:
   ```typescript
   import omSummarySchema from '../validation/om-schema.json';
   
   const completion = await openai.chat.completions.create({
     model: 'gpt-4o',
     messages,
     functions: OM_ANALYSIS_FUNCTIONS,
     response_format: {
       type: 'json_schema',
       json_schema: {
         name: 'om_analysis',
         schema: omSummarySchema,
         strict: true
       }
     },
     stream: true,
   });
   ```

4. This guarantees 99%+ schema compliance vs. post-validation
5. Keep Zod validation as fallback for edge cases

Integrate in /src/pages/api/chat.ts and /src/lib/services/openai/index.ts.
```

### 1.3 Define Error Codes Enumeration

**Claude Prompt:**
```
Create /src/lib/constants/errors.ts to centralize error codes and update ALL existing error handling:

1. Export an ERROR_CODES enum with values:
   - INVALID_JSON_RESPONSE
   - TOKEN_LIMIT_EXCEEDED
   - CONTENT_POLICY_VIOLATION
   - PROMPT_INJECTION_DETECTED
   - OM_VALIDATION_FAILED
   - DOCUMENT_CONTEXT_ERROR
2. Export error message mappings for each code
3. Include HTTP status code mappings
4. Create typed error response interfaces

Then update ALL apiError calls throughout the entire codebase:
- Search for every instance of apiError() in all files
- Replace inline error strings with ERROR_CODES enum values
- This includes: /src/pages/api/chat.ts, /src/pages/api/documents/*.ts, /src/pages/api/upload.ts, /src/pages/api/settings.ts, and any other API endpoints
- Ensure consistency across the entire project, not just new code

Add a comment at the top of errors.ts explaining that all error codes must be used consistently across the project.
```

### 1.4 Create Database Migration for Prompt Versioning

**Claude Prompt:**
```
Create Supabase migration for prompt versioning and metadata tracking:

1. Create new migration file: /supabase/migrations/[timestamp]_add_prompt_versioning.sql

2. Add prompt_versions table:
   ```sql
   CREATE TABLE prompt_versions (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     prompt_type VARCHAR(50) NOT NULL,
     version VARCHAR(20) NOT NULL,
     content TEXT NOT NULL,
     changelog TEXT,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     created_by UUID REFERENCES auth.users(id),
     is_active BOOLEAN DEFAULT false,
     UNIQUE(prompt_type, version)
   );
   
   CREATE INDEX idx_prompt_versions_type_version ON prompt_versions(prompt_type, version);
   CREATE INDEX idx_prompt_versions_active ON prompt_versions(prompt_type, is_active) WHERE is_active = true;
   ```

3. Add metadata columns to messages table:
   ```sql
   ALTER TABLE messages ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(20);
   ALTER TABLE messages ADD COLUMN IF NOT EXISTS function_calls JSONB;
   ALTER TABLE messages ADD COLUMN IF NOT EXISTS token_usage JSONB;
   
   CREATE INDEX idx_messages_prompt_version ON messages(prompt_version);
   ```

4. Insert initial OM analyst prompt version:
   ```sql
   INSERT INTO prompt_versions (prompt_type, version, content, changelog, is_active)
   VALUES ('om-analyst', 'v1', 'Initial OM analysis prompt', 'Initial version', true);
   ```

This enables prompt A/B testing and performance tracking by version.
```

---

## Phase 2: OpenAI Service Integration (Week 1)
*Focus: Centralized function management and service utilization*

### 2.1 Implement All OM Functions with Centralized Registration

**Claude Prompt:**
```
Create /src/lib/services/openai/functions/om-functions.ts with all 8 OM analysis functions:

1. Define all function schemas using OpenAI's function calling format:
   - analyze_om: Takes documentText, returns structured OM data matching the schema
   - search_market_data: Takes submarket string, returns market comps and trends
   - map_property_vs_comps: Takes address and comps array, returns map visualization data
   - export_to_csv: Takes JSON data object, returns CSV file path
   - generate_comparison_chart: Takes array of property data, returns chart configuration
   - calculate_investment_metrics: Takes financial inputs, returns DSCR, IRR, cash-on-cash
   - summarize_entitlement_details: Takes address, returns zoning and permitting info
   - rank_investments: Takes criteria and properties array, returns ranked list

2. Export all functions as an array: export const OM_ANALYSIS_FUNCTIONS = [...]

3. Modify /src/lib/services/openai/index.ts to register these functions:
   - Import OM_ANALYSIS_FUNCTIONS at the top
   - In the constructor or initialization, call registerFunctions(OM_ANALYSIS_FUNCTIONS)
   - This ensures all OpenAI calls automatically include these functions
   - Remove need for chat handlers to manually pass functions

4. Implement stub handlers for each function that:
   - Validate input parameters
   - Return appropriate mock data for testing
   - Log function calls for analytics
   - Can be replaced with real implementations in later phases

Update /src/pages/api/chat.ts to use OpenAIService without passing functions parameter - the service now auto-includes registered functions.
```

### 2.2 Document Context Handling

**Claude Prompt:**
```
Implement proper document context separation in /src/pages/api/chat.ts:

1. Keep the system prompt focused on JSON extraction only
2. Format document chunks in user messages with clear separators:
   - Single document: "DOCUMENT CONTENT:\n{text}"
   - Multiple documents: "DOC_1: {name}\n{text}\n\nDOC_2: {name}\n{text}"
3. Add document metadata (name, type) to help the AI distinguish sources
4. Ensure token budget accounts for document separators
5. Pass comparison instructions in user messages, not system prompt

The system prompt remains constant regardless of single or multi-document analysis.
```

### 2.5 Implement Real Function Logic with Data Integration

**Claude Prompt:**
```
Replace stub handlers in /src/lib/services/openai/functions/om-functions.ts with real implementations:

1. **analyze_om function**:
   ```typescript
   async function analyzeOmHandler(documentText: string) {
     // Parse key OM sections using regex patterns
     const dealSnapshot = extractDealSnapshot(documentText);
     const financials = extractFinancialSummary(documentText);
     const unitMix = extractUnitMixData(documentText);
     
     // Query Supabase for comparable properties
     const comps = await supabase
       .from('market_comparables')
       .select('*')
       .eq('submarket', dealSnapshot.Submarket)
       .limit(5);
     
     return formatOmResponse(dealSnapshot, financials, unitMix, comps);
   }
   ```

2. **search_market_data function**:
   ```typescript
   async function searchMarketDataHandler(submarket: string) {
     // Query internal database first
     const localData = await supabase
       .from('market_data')
       .select('*')
       .ilike('submarket', `%${submarket}%`);
     
     // If insufficient data, call external APIs
     if (localData.length < 3) {
       const externalData = await fetchCostarData(submarket);
       return combineMarketData(localData, externalData);
     }
     
     return formatMarketData(localData);
   }
   ```

3. **calculate_investment_metrics function**:
   ```typescript
   async function calculateInvestmentHandler(financials: any) {
     const noi = parseFloat(financials.NOI.replace(/[^0-9.-]/g, ''));
     const purchasePrice = parseFloat(financials.AskingPrice.replace(/[^0-9.-]/g, ''));
     
     return {
       capRate: ((noi / purchasePrice) * 100).toFixed(2) + '%',
       dscr: calculateDSCR(noi, financials.DebtService),
       cashOnCash: calculateCashOnCash(financials),
       irr: await calculateIRR(financials.cashFlows)
     };
   }
   ```

4. **Add utility functions for data extraction**:
   - extractDealSnapshot(): Parse property name, address, type from text
   - extractFinancialSummary(): Extract NOI, cap rate, asking price patterns
   - extractUnitMixData(): Parse unit count tables and rent rolls
   - formatOmResponse(): Structure data according to schema

5. **Integration with external data sources**:
   - CoStar API for market comps
   - Census API for demographics
   - Google Maps API for location scoring
   - Store API keys in Supabase vault

6. **Error handling for each function**:
   - Return partial data if extraction fails
   - Log missing data patterns for prompt improvement
   - Graceful degradation when external APIs are unavailable

This transforms the OM analysis from basic extraction to comprehensive real estate intelligence.
```

---

## Phase 3: Token Management & Optimization (Week 1-2)
*Focus: Dynamic token budgeting with model awareness*

### 3.1 Dynamic Token Budget Management

**Claude Prompt:**
```
Create /src/lib/utils/token-budget.ts with model-aware budgeting using existing MODEL_CONFIGS:

1. Import MODEL_CONFIGS from OpenAIService:
   ```typescript
   import { MODEL_CONFIGS } from '../services/openai/index';
   import { encoding_for_model } from 'tiktoken';
   ```

2. Create calculateTokenBudget(model: string) that:
   ```typescript
   export function calculateTokenBudget(model: string, maxTokens: number = 2000) {
     const config = MODEL_CONFIGS[model] || MODEL_CONFIGS['gpt-4o'];
     const contextWindow = config.contextWindow; // 128000 for gpt-4o
     const reservedForResponse = maxTokens;
     const reservedForFunctions = 500; // Function definitions overhead
     
     return {
       total: contextWindow,
       available: contextWindow - reservedForResponse - reservedForFunctions,
       reserved: reservedForResponse,
       model: config
     };
   }
   ```

3. Implement accurate token counting:
   ```typescript
   export function countTokens(text: string, model: string): number {
     try {
       const encoding = encoding_for_model(model as any);
       return encoding.encode(text).length;
     } catch {
       // Fallback estimation: ~4 chars per token
       return Math.ceil(text.length / 4);
     }
   }
   ```

4. Create trimConversation(messages, budget) that:
   - Preserves system prompt (never trim)
   - Keeps current user message (never trim)
   - Uses sliding window for conversation history (oldest first)
   - Intelligently chunks document context to fit budget
   - Returns { trimmedMessages, metadata, tokensUsed }

5. Add document separator token estimation:
   - Account for "DOC_1:", "DOC_2:" prefixes
   - Include chunk boundary markers
   - Reserve tokens for JSON response formatting

Integrate in /src/pages/api/chat.ts before all OpenAI calls.
```

### 3.2 Token Usage Analytics

**Claude Prompt:**
```
Enhance token tracking using OpenAIService metrics:

1. In /src/pages/api/chat.ts, after each OpenAI call:
   - Extract usage data from response
   - Calculate cost based on model pricing
   - Store in messages table metadata with prompt version
2. Create /src/lib/utils/token-analytics.ts with:
   - Cost calculation helpers for different models
   - Usage aggregation functions
   - Budget alerting thresholds
3. Update usage_logs table entries to include:
   - action: 'ai_token_usage'
   - Token counts and costs
   - Model and prompt version used
```

---

## Phase 4: Robust Error Handling (Week 2)
*Focus: Resilient system with intelligent retry logic*

### 4.1 Structured Error Responses

**Claude Prompt:**
```
Enhance error handling using the centralized error codes:

1. In /src/pages/api/chat.ts, use ERROR_CODES enum for all errors
2. Map OpenAIService errors to user-friendly messages
3. For streaming, send errors in SSE format:
   - data: {"error": true, "code": "ERROR_CODE", "message": "..."}
4. Include retry hints in error responses where applicable
5. Log errors with full context including prompt version

OpenAIService already handles retries, so focus on graceful error propagation.
```

### 4.2 Intelligent Retry for Validation Failures

**Claude Prompt:**
```
Implement smart retry logic for JSON validation failures:

1. In /src/pages/api/chat.ts, when OM response validation fails:
   - Don't use regex extraction (violates no-speculation rule)
   - Instead, retry analyze_om function with:
     * Reduced document context (50% of original)
     * Explicit instruction to focus on available data
     * Maximum 2 retry attempts
2. If retries fail, return valid schema with empty strings
3. Log validation failures with response content for debugging
4. Track retry attempts in message metadata

This maintains data integrity while maximizing success rate.
```

---

## Phase 5: Security & Input Validation (Week 2-3)
*Focus: Unified validation and sanitization pipeline*

### 5.1 Prompt-Injection Guardrail System

**Claude Prompt:**
```
Create /src/lib/security/prompt-injection-detector.ts to scan for malicious patterns:

1. Define suspicious patterns to detect:
   ```typescript
   const INJECTION_PATTERNS = [
     /\{\s*["']role["']\s*:/gi,           // {"role": attempts
     /<\/?script[^>]*>/gi,                // Script tags
     /```\s*(json|javascript|python)/gi,  // Code blocks
     /system\s*:\s*["']/gi,              // System message injection
     /assistant\s*:\s*["']/gi,           // Assistant message injection
     /\\n\\n(system|assistant|user):/gi,    // Escaped newline injections
     /ignore\s+(previous|above|all)/gi,   // Ignore instructions
     /\[\s*INST\s*\]/gi,                 // Instruction markers
     /\{\{.*system.*\}\}/gi,             // Template injection
   ];
   ```

2. Create detection function:
   ```typescript
   export function detectPromptInjection(text: string): {
     isClean: boolean;
     detectedPatterns: string[];
     cleanedText?: string;
   } {
     const detected = [];
     for (const pattern of INJECTION_PATTERNS) {
       if (pattern.test(text)) {
         detected.push(pattern.source);
       }
     }
     
     return {
       isClean: detected.length === 0,
       detectedPatterns: detected,
       cleanedText: detected.length > 0 ? sanitizeText(text) : undefined
     };
   }
   ```

3. Add context-aware scanning:
   - Check document text for embedded instructions
   - Validate user messages for role manipulation
   - Scan for attempts to override system behavior
   - Flag suspicious JSON-like structures in text

4. Integration with OM pipeline:
   - Scan all document chunks before processing
   - Block requests with high-confidence injection attempts
   - Log suspicious patterns for security monitoring
   - Provide sanitized alternatives when possible

Integrate in /src/pages/api/chat.ts as the first validation step.
```

### 5.2 Extended Input Sanitization

**Claude Prompt:**
```
Create /src/lib/security/om-input-sanitizer.ts by extending existing patterns:

1. Import sanitization utilities from PDFParserAgent
2. Extend with OM-specific sanitization:
   - Remove prompt injection patterns: "system:", "assistant:", "```json"
   - Limit message length to 4000 characters
   - Sanitize document separators that could confuse parsing
   - Validate document chunks for injection attempts
3. Export sanitizeOmInput() that applies all rules
4. Add sanitization telemetry using logWarning

Apply in /src/pages/api/chat.ts after normalizeRequest.
```

### 5.2 Unified Validation and Filtering

**Claude Prompt:**
```
Enhance /src/lib/validation/om-response.ts to include output filtering:

1. Extend the Zod schema with .transform() to apply filtering during validation:
   - Check numeric strings are within real estate ranges (e.g., cap rate 0-20%)
   - Validate no PII patterns (SSN, personal emails) in any field
   - Ensure recommended actions are appropriate
   - Redact sensitive location data if needed
2. Use Zod's .refine() for complex validations that need access to multiple fields
3. Create a single validateAndFilterOmResponse() function that does validation and filtering in one pass
4. Log any filtered/transformed content with appropriate context

This combines validation and security in one efficient pass without needing a separate output-filter module.
```

---

## Phase 6: Multi-Document Analysis (Week 3)
*Focus: Comparative analysis with clear document separation*

### 6.1 Multi-Document Context System

**Claude Prompt:**
```
Enhance document handling in /src/pages/api/chat.ts for comparisons:

1. Update document chunk queries to:
   - Efficiently handle multiple document IDs
   - Include document metadata in results
   - Balance chunks across documents
2. Format multi-document context with standardized structure:
   - Use separator format: "--- DOC_1: {property_name} ---"
   - Include property name and type in headers
   - Ensure separators are preserved during chunk splitting
   - Implement in both token-budget.ts and om-input-sanitizer.ts
3. Implement token budget distribution across documents
4. Add metadata tracking which documents contributed to analysis

Keep system prompt unchanged - handle comparison logic in functions.
```

### 6.2 Multi-Document Comparison Logic

**Claude Prompt:**
```
Enhance the existing OM functions in /src/lib/services/openai/functions/om-functions.ts to support multi-document scenarios:

1. Update the already-registered functions to handle multiple documents:
   - analyze_om: Add support for analyzing multiple OMs in sequence
   - rank_investments: Enhance to handle the DOC_N formatted inputs
   - generate_comparison_chart: Ensure it can visualize multiple properties

2. Add implementation logic for multi-document handling:
   - Parse DOC_1, DOC_2 prefixes from input
   - Maintain property identifiers throughout processing
   - Return comparison results that clearly identify each property

3. Update function descriptions in the schema to indicate multi-document support

Note: The compare_properties and rank_investments functions are already registered in Phase 2.1 - this phase focuses on implementing their multi-document logic.
```

---

## Phase 7: Monitoring & Analytics (Week 4)
*Focus: Comprehensive observability and prompt management*

### 7.1 Analytics API with Prompt Tracking

**Claude Prompt:**
```
Create admin endpoints leveraging existing infrastructure:

1. /src/pages/api/admin/metrics.ts:
   - Call OpenAIService.getMetrics() to get base metrics
   - Transform the service's output for admin display (no custom aggregation)
   - Group metrics by prompt version and type
   - Display cache hit rates and retry statistics from the service
   - Calculate cost savings from caching using service data

2. /src/pages/api/admin/om-analytics.ts:
   - Query database for OM-specific metrics only
   - Track validation success by prompt version
   - Analyze which OM fields are most often empty
   - Compare performance across prompt versions

Use existing admin auth middleware for both endpoints. Avoid duplicating any metrics logic that OpenAIService already provides.
```

### 7.2 Prompt Version Management

**Claude Prompt:**
```
Implement comprehensive prompt versioning:

1. Create migration for prompt_versions table:
   - id, prompt_type (om-analyst, etc.), version, content
   - changelog, created_at, created_by, is_active
   - Add index on (prompt_type, version)

2. Create /src/pages/api/admin/prompts.ts:
   - List all versions with usage statistics
   - Create new versions with changelog
   - Activate/deactivate versions
   - Rollback functionality via feature flags

3. Update message metadata to track:
   - prompt_type and prompt_version used
   - Enable analysis of performance by version

Use feature flags to control rollout percentage.
```

### 7.3 Contract Testing

**Claude Prompt:**
```
Add end-to-end contract tests for the OM pipeline:

1. First, ensure test directories exist:
   - Create /src/__tests__/contracts/ if it doesn't exist
   - Create /src/lib/prompts/__tests__/ if it doesn't exist
   - Create /src/lib/services/openai/functions/__tests__/ if it doesn't exist

2. Create /src/__tests__/contracts/om-pipeline.test.ts:
   - Upload mock OM document
   - Call chat API with document context  
   - Verify JSON response matches schema
   - Check data persistence in all tables
   - Validate prompt version tracking

3. Use mocked OpenAI responses for consistency
4. Test single and multi-document scenarios
5. Verify error handling and retry logic
6. Ensure token budgeting works correctly
7. Test all 8 registered functions are available

This ensures all components integrate properly.
```

---

## Implementation Guidelines

### Key Architectural Decisions
- **Centralized function registration** - All OpenAI functions managed by the service
- **Clear document separation** - Use DOC_N prefixes in user messages
- **Single-pass validation** - Combine Zod validation with output filtering  
- **Dynamic token budgeting** - Account for model limits and response needs
- **Versioned prompts** - Track and analyze performance by version

### Success Metrics
- JSON validation success rate > 95%
- Average response time < 3 seconds with caching
- Token cost reduction > 30% through optimization
- Zero prompt injection incidents
- Accurate multi-document comparisons

---

## Appendix: Updated File Structure

### Core Files
- `/src/lib/prompts/om-analyst.ts` - Versioned system prompts
- `/src/lib/constants/errors.ts` - Centralized error codes
- `/src/lib/validation/om-response.ts` - Schema validation and filtering
- `/src/lib/services/openai/functions/om-functions.ts` - OM analysis functions
- `/src/lib/utils/token-budget.ts` - Dynamic token management
- `/src/lib/utils/token-analytics.ts` - Usage tracking and costs
- `/src/lib/security/om-input-sanitizer.ts` - Input security

### API Endpoints
- `/src/pages/api/chat.ts` - Main chat handler (modified)
- `/src/pages/api/admin/metrics.ts` - General metrics
- `/src/pages/api/admin/om-analytics.ts` - OM-specific analytics  
- `/src/pages/api/admin/prompts.ts` - Prompt version management

### Database Migrations
- `prompt_versions` table - Store all prompt versions with metadata
- Updated `messages` metadata - Track prompt type and version
- Enhanced `usage_logs` - Include token analytics

### Test Files
- `/src/__tests__/contracts/om-pipeline.test.ts` - End-to-end testing
- Unit tests for each new module