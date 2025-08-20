import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAI } from 'openai';
import { getModelConfiguration, validateModel } from '@/lib/config/validate-models';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const config = getModelConfiguration();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  // Test model accessibility
  const results = {
    configured: config,
    accessible: {} as Record<string, boolean>,
    feature_flags: {
      USE_GPT5: process.env.USE_GPT5 === 'true',
      DEBUG_MODELS: process.env.DEBUG_MODELS === 'true'
    },
    validation: {} as Record<string, any>,
    api_calls: {} as Record<string, any>
  };
  
  // Test each configured model
  for (const [key, model] of Object.entries(config)) {
    if (key === 'useGPT5') continue;
    
    try {
      const validation = validateModel(model as string);
      results.validation[model as string] = validation;
      
      // Branch based on API type
      if (validation.apiType === 'responses') {
        // Test Responses API for GPT-5 family
        try {
          await openai.responses.create({
            model: model as string,
            input: 'test',
            max_output_tokens: 16,
            stream: false
          });
          
          results.accessible[model as string] = true;
          results.api_calls[model as string] = {
            endpoint: '/v1/responses',
            param_key: 'max_output_tokens',
            success: true
          };
        } catch (error: any) {
          results.accessible[model as string] = false;
          results.api_calls[model as string] = {
            endpoint: '/v1/responses',
            param_key: 'max_output_tokens',
            error: error.message
          };
        }
      } else {
        // Test Chat Completions API for GPT-4 family
        try {
          await openai.chat.completions.create({
            model: model as string,
            messages: [{ role: 'user', content: 'test' }],
            max_completion_tokens: 1,
            stream: false
          });
          
          results.accessible[model as string] = true;
          results.api_calls[model as string] = {
            endpoint: '/v1/chat/completions',
            param_key: 'max_completion_tokens',
            success: true
          };
        } catch (error: any) {
          results.accessible[model as string] = false;
          results.api_calls[model as string] = {
            endpoint: '/v1/chat/completions',
            param_key: 'max_completion_tokens',
            error: error.message
          };
        }
      }
    } catch (error: any) {
      results.accessible[model as string] = false;
      results.validation[model as string] = { error: error.message };
    }
  }
  
  // Overall health status
  const allAccessible = Object.values(results.accessible).every(v => v === true);
  const status = allAccessible ? 'healthy' : 'degraded';
  
  res.status(allAccessible ? 200 : 503).json({
    status,
    ...results
  });
}