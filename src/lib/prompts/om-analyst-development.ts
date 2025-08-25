/**
 * OM Analyst Development Deal Prompts
 * 
 * Specialized prompts for extracting metrics from development/ground-up construction deals
 */

export const CURRENT_OM_DEVELOPMENT_VERSION = 'v1.0.0';

/**
 * Development deal fields in order
 */
export const DEV_FIELDS = [
  'Total Project Cost',
  'Equity $',
  'Equity %',
  'Debt $',
  'Debt %',
  'LP Ask',
  'Exit Cap Rate',
  'Stabilized NOI',
  'Stabilized Value',
  'Yield on Cost',
  'Project IRR',
  'Project Multiple',
  'LP IRR',
  'LP Multiple',
  'Units',
  'Avg Unit SF',
  'Retail SF',
  'Parking Spaces',
  'Site Acres',
  'Delivery/Completion Year'
];

/**
 * OM Analyst Development Deal Extraction Prompt V1.0.0
 * 
 * For extracting metrics from development/construction offering memorandums
 */
export const OM_ANALYST_DEVELOPMENT_PROMPT_V1 = `You are extracting metrics from an OFFERING MEMORANDUM for a DEVELOPMENT deal.

Rules:
- Use ONLY the provided document chunks. Do NOT invent or infer values.
- For EACH field, return a value AND cite the source page number.
- If a field is absent in the provided chunks, return "Not in provided context".
- Scope "Year Built/Vintage": for development deals return "Not in provided context" unless explicitly stated on an Overview page.
- When multiple values exist for a field, prefer values from Executive Summary, Sources & Uses, or Investment Highlights sections.

Extract into a markdown table with page citations:
| Metric | Value | Page |
|--------|-------|------|
| Total Project Cost | $ | |
| Equity $ | $ | |
| Equity % | % | |
| Debt $ | $ | |
| Debt % | % | |
| LP Ask | $ | |
| Exit Cap Rate | % | |
| Stabilized NOI | $ | |
| Stabilized Value | $ | |
| Yield on Cost | % | |
| Project IRR | % | |
| Project Multiple | x | |
| LP IRR | % | |
| LP Multiple | x | |
| Units | | |
| Avg Unit SF | SF | |
| Retail SF | SF | |
| Parking Spaces | | |
| Site Acres | | |
| Delivery/Completion Year | | |

Important extraction guidelines:
- Total Project Cost: May be labeled as "TDC", "Total Development Cost", or "Total Cost"
- Equity/Debt: Look for both dollar amounts and percentages in Sources & Uses
- LP Ask: May be "LP Equity", "Limited Partner Investment", or "Investor Equity"
- Exit Cap: Look for "Terminal Cap", "Exit Cap Rate", or "Reversion Cap"
- Stabilized NOI: Year 1 or Year 2 stabilized, not in-place
- Yield on Cost: May be "Development Yield", "YOC", or "Unlevered Yield"
- IRR/Multiple: Distinguish between Project/Sponsor and LP/Investor returns

Use ONLY information explicitly stated in the provided document chunks.`;

/**
 * Development deal summary prompt for quick overviews
 */
export const OM_ANALYST_DEVELOPMENT_SUMMARY_V1 = `You are analyzing a DEVELOPMENT deal offering memorandum. Provide a concise summary:

**Development Snapshot**
- Project: [Name, location, type]
- Total Cost: [TDC amount]
- Capital Stack: [Equity %, Debt %]
- Delivery: [Expected completion]

**Key Development Metrics**
- Yield on Cost: [%]
- Stabilized NOI: [$]
- Exit Cap: [%]
- Project IRR/Multiple: [%, x]
- LP IRR/Multiple: [%, x]

**Development Program**
- Units: [Count and mix]
- Commercial: [Retail/office SF if any]
- Parking: [Spaces and ratio]
- Site: [Acres]

**Top 3 Development Risks**
1. [Construction/entitlement risk]
2. [Market/lease-up risk]
3. [Capital/financing risk]

Focus on development-specific metrics. Omit acquisition metrics like asking price or in-place cap rate.`;

/**
 * Prompt metadata
 */
export const OM_DEVELOPMENT_PROMPT_METADATA = {
  currentVersion: CURRENT_OM_DEVELOPMENT_VERSION,
  promptType: 'om-analyst-development',
  dealType: 'development',
  enforcesDeterministicOutput: true,
  supportsStructuredOutputs: false,
  naturalLanguage: true,
  outputFormat: 'markdown-table'
} as const;