import { detectIntent, ChatIntent } from '../intent-detection';

describe('Intent Detection', () => {
  describe('Greeting Detection', () => {
    it('should detect basic greetings', () => {
      const greetings = ['hi', 'hello', 'hey', 'Hi!', 'Hello there', 'Good morning'];
      
      greetings.forEach(greeting => {
        const result = detectIntent(greeting);
        expect(result.intent).toBe(ChatIntent.GREETING);
        expect(result.requiresStructuredOutput).toBe(false);
      });
    });
  });

  describe('JSON Request Detection', () => {
    it('should detect explicit JSON requests', () => {
      const jsonRequests = [
        'give me the JSON output',
        'export as json',
        'show me the raw JSON schema',
        'I need the structured data format',
        'return JSON format please'
      ];
      
      jsonRequests.forEach(request => {
        const result = detectIntent(request);
        expect(result.intent).toBe(ChatIntent.JSON_REQUEST);
        expect(result.requiresStructuredOutput).toBe(true);
      });
    });
  });

  describe('Document Analysis Detection', () => {
    it('should detect document analysis requests when document context exists', () => {
      const analysisRequests = [
        'analyze this document',
        'what is the NOI?',
        'show me the cap rate',
        'summarize the key metrics',
        'what are the investment highlights?'
      ];
      
      analysisRequests.forEach(request => {
        const result = detectIntent(request, true); // has document context
        expect(result.intent).toBe(ChatIntent.DOCUMENT_ANALYSIS);
        expect(result.requiresStructuredOutput).toBe(false);
      });
    });

    it('should not detect document analysis without document context', () => {
      const result = detectIntent('what is the NOI?', false);
      expect(result.intent).toBe(ChatIntent.GENERAL_CONVERSATION);
    });
  });

  describe('General Conversation', () => {
    it('should default to general conversation for non-specific messages', () => {
      const generalMessages = [
        'tell me about commercial real estate',
        'the market is looking strong',
        'interesting perspective'
      ];
      
      generalMessages.forEach(message => {
        const result = detectIntent(message);
        expect(result.intent).toBe(ChatIntent.GENERAL_CONVERSATION);
        expect(result.requiresStructuredOutput).toBe(false);
      });
    });
  });

  describe('Help Requests', () => {
    it('should detect help requests', () => {
      const helpMessages = [
        'how does this work?',
        'what features do you have?',
        'can you help me understand real estate metrics?',
        'what can you do?'
      ];
      
      helpMessages.forEach(message => {
        const result = detectIntent(message);
        expect(result.intent).toBe(ChatIntent.HELP_REQUEST);
        expect(result.requiresStructuredOutput).toBe(false);
      });
    });
  });
});