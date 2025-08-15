/**
 * Generic Web Tools Function Definitions
 * 
 * Defines the OpenAI function calling schemas for web_search and fetch_page tools
 */

export const WEB_TOOLS_FUNCTIONS = {
  web_search: {
    name: 'web_search',
    description: 'Search the web for current information, market data, news, or research. Use this when you need up-to-date information not available in the document context.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find relevant information. Be specific and include key terms.',
          minLength: 3,
          maxLength: 200
        },
        n: {
          type: 'number',
          description: 'Number of search results to return (1-10)',
          minimum: 1,
          maximum: 10,
          default: 5
        }
      },
      required: ['query']
    }
  },

  fetch_page: {
    name: 'fetch_page',
    description: 'Fetch and extract readable content from a specific web page URL. Use this to get detailed information from search results or specific sources.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Complete URL of the web page to fetch content from. Must be http:// or https://',
          format: 'uri',
          pattern: '^https?://.+'
        }
      },
      required: ['url']
    }
  }
} as const

export type WebToolFunction = keyof typeof WEB_TOOLS_FUNCTIONS