/**
 * Intent Detection for Chat Messages
 * 
 * Analyzes user messages to determine the appropriate response format
 * and system prompt to use.
 */

export enum ChatIntent {
  GREETING = 'greeting',
  GENERAL_CONVERSATION = 'general_conversation',
  DOCUMENT_ANALYSIS = 'document_analysis',
  JSON_REQUEST = 'json_request',
  HELP_REQUEST = 'help_request'
}

export interface IntentAnalysis {
  intent: ChatIntent;
  confidence: number;
  hasDocumentContext: boolean;
  requiresStructuredOutput: boolean;
  analysisType?: 'full' | 'summary' | 'specific_metric';
}

/**
 * Analyzes user message to determine intent
 * @param message - User's message
 * @param hasDocumentContext - Whether documents are available in context
 * @param conversationHistory - Previous messages for context
 * @returns Intent analysis result
 */
export function detectIntent(
  message: string,
  hasDocumentContext: boolean = false,
  conversationHistory?: Array<{ role: string; content: string }>
): IntentAnalysis {
  const lowerMessage = message.toLowerCase().trim();
  
  // Check for explicit JSON requests
  if (containsJsonRequest(lowerMessage)) {
    return {
      intent: ChatIntent.JSON_REQUEST,
      confidence: 1.0,
      hasDocumentContext,
      requiresStructuredOutput: true,
      analysisType: 'full'
    };
  }
  
  // Check for greetings
  if (isGreeting(lowerMessage)) {
    return {
      intent: ChatIntent.GREETING,
      confidence: 0.95,
      hasDocumentContext,
      requiresStructuredOutput: false
    };
  }
  
  // Check for help requests
  if (isHelpRequest(lowerMessage)) {
    return {
      intent: ChatIntent.HELP_REQUEST,
      confidence: 0.9,
      hasDocumentContext,
      requiresStructuredOutput: false
    };
  }
  
  // Check for document analysis requests
  if (hasDocumentContext && isDocumentAnalysisRequest(lowerMessage)) {
    return {
      intent: ChatIntent.DOCUMENT_ANALYSIS,
      confidence: 0.85,
      hasDocumentContext,
      requiresStructuredOutput: false,
      analysisType: determineAnalysisType(lowerMessage)
    };
  }
  
  // Default to general conversation
  return {
    intent: ChatIntent.GENERAL_CONVERSATION,
    confidence: 0.7,
    hasDocumentContext,
    requiresStructuredOutput: false
  };
}

/**
 * Checks if message is a greeting
 */
function isGreeting(message: string): boolean {
  const greetingPatterns = [
    /^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening))(\s|!|\.|\?|$)/i,
    /^(what'?s\s+up|how'?s\s+it\s+going|howdy)(\s|!|\.|\?|$)/i,
    /^(bonjour|hola|salut|ciao)(\s|!|\.|\?|$)/i
  ];
  
  return greetingPatterns.some(pattern => pattern.test(message));
}

/**
 * Checks if message is requesting help
 */
function isHelpRequest(message: string): boolean {
  const helpPatterns = [
    /\bhelp\b/i,                              // Simple "help"
    /\bhow\s+does\s+this\s+work\??/i,        // "how does this work" with optional ?
    /\bwhat\s+features\s+do\s+you\s+have\??/i, // "what features do you have"
    /\bwhat\s+can\s+you\s+do\??/i,          // "what can you do" with optional ?
    /\bwhat\s+are\s+your\s+capabilities\??/i, // "what are your capabilities"
    /\bexplain\s+(your\s+)?features\??/i,    // "explain features" or "explain your features"
    /\b(assist|guide|tutorial|instructions|getting\s+started)\b/i // Other help terms
  ];
  
  return helpPatterns.some(pattern => pattern.test(message));
}

/**
 * Checks if message explicitly requests JSON format
 */
function containsJsonRequest(message: string): boolean {
  const jsonPatterns = [
    // "export JSON", "give me JSON", etc.
    /\b(export|extract|output|provide|give|return|show)\s+(me\s+)?(the\s+)?(as\s+)?json\b/i,
    // "json format", "json output", "json schema", etc.
    /\bjson\s+(format|output|response|schema)\b/i,
    // "return JSON format please" - reversed order
    /\b(return|provide|give)\s+json\s+(format|output|schema)\b/i,
    // "raw JSON"
    /\braw\s+json\b/i,
    // "structured json output" or "structured data format"
    /\bstructured\s+(json\s+)?(output|format|data\s+format)\b/i,
    // "show me the raw JSON schema"
    /\bshow\s+me\s+(the\s+)?raw\s+json\s+(schema|output|format)\b/i,
    // "please provide JSON"
    /\bplease\s+(provide|give|return)\s+json\b/i,
    // "I need JSON", "I want JSON schema"
    /\bi\s+(need|want|require).*json\b/i
  ];

  return jsonPatterns.some(pattern => pattern.test(message));
}

/**
 * Checks if message is requesting document analysis
 */
function isDocumentAnalysisRequest(message: string): boolean {
  const analysisPatterns = [
    // Key metrics and data requests
    /\b(analyze|analysis|review|examine|assess|evaluate)\b/i,
    /\b(what|tell|show|give|provide).*(about|regarding|for)\s+(this|the)\s+(document|om|offering|property)/i,
    /\b(noi|cap\s*rate|irr|price|rent|vacancy|income|expense|metric|financial)/i,
    /\b(summary|summarize|overview|highlights|key\s+(points|metrics|data))/i,
    /\b(insights|findings|observations|recommendations)/i,
    
    // Specific analysis requests
    /\b(investment|deal|property)\s+(analysis|metrics|summary)/i,
    /\b(strengths?|weaknesses?|risks?|opportunities)/i,
    /\b(comparable|comps|market\s+analysis)/i,
    
    // Document reference
    /\b(this|the|uploaded|attached)\s+(document|file|om|pdf)/i,
    /\bwhat\s+(is|are)\s+the\b/i // "What is the..." usually refers to document data
  ];
  
  return analysisPatterns.some(pattern => pattern.test(message));
}

/**
 * Determines the type of analysis requested
 */
function determineAnalysisType(message: string): 'full' | 'summary' | 'specific_metric' {
  const lowerMessage = message.toLowerCase();
  
  // Check for summary requests
  if (/\b(summary|summarize|overview|highlights?|brief|quick)\b/.test(lowerMessage)) {
    return 'summary';
  }
  
  // Check for specific metric requests
  const specificMetrics = [
    'noi', 'cap rate', 'price', 'rent', 'vacancy', 'irr', 'cash flow',
    'square feet', 'sq ft', 'units', 'year built', 'location'
  ];
  
  const hasSpecificMetric = specificMetrics.some(metric => 
    lowerMessage.includes(metric) && 
    !lowerMessage.includes('all') && 
    !lowerMessage.includes('complete')
  );
  
  if (hasSpecificMetric) {
    return 'specific_metric';
  }
  
  // Default to full analysis
  return 'full';
}

/**
 * Suggests a response format based on intent
 */
export function suggestResponseFormat(intent: IntentAnalysis): {
  useStructuredPrompt: boolean;
  formatType: 'natural' | 'bullets' | 'json';
} {
  switch (intent.intent) {
    case ChatIntent.JSON_REQUEST:
      return {
        useStructuredPrompt: true,
        formatType: 'json'
      };
      
    case ChatIntent.DOCUMENT_ANALYSIS:
      return {
        useStructuredPrompt: true,
        formatType: 'bullets'
      };
      
    case ChatIntent.GREETING:
    case ChatIntent.GENERAL_CONVERSATION:
    case ChatIntent.HELP_REQUEST:
    default:
      return {
        useStructuredPrompt: false,
        formatType: 'natural'
      };
  }
}