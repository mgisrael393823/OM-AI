/**
 * Shared model family detection utilities for OpenAI API routing
 * Updated to handle GPT-5 family correctly
 */

import { detectAPIType } from '@/lib/config/validate-models';

/**
 * Determines if a model should use the Chat Completions API
 * @param model - The OpenAI model name
 * @returns true if model should use Chat Completions API
 */
export const isChatModel = (model: string): boolean => {
  return detectAPIType(model) === 'chat';
}

/**
 * Determines if a model should use the Responses API
 * @param model - The OpenAI model name  
 * @returns true if model should use Responses API
 */
export const isResponsesModel = (model: string): boolean => {
  return detectAPIType(model) === 'responses';
}

/**
 * Gets the API family for a given model
 * @param model - The OpenAI model name
 * @returns 'chat' for Chat Completions API, 'responses' for Responses API
 */
export const getAPIFamily = (model: string): 'chat' | 'responses' => {
  return detectAPIType(model);
}