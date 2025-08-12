/**
 * Shared model family detection utilities for OpenAI API routing
 * Centralizes model classification to avoid duplication across frontend and backend
 */

/**
 * Determines if a model should use the Chat Completions API
 * @param model - The OpenAI model name
 * @returns true if model should use Chat Completions API
 */
export const isChatModel = (model: string): boolean => {
  return /^gpt-4o/.test(model)
}

/**
 * Determines if a model should use the Responses API
 * @param model - The OpenAI model name  
 * @returns true if model should use Responses API
 */
export const isResponsesModel = (model: string): boolean => {
  return /^(gpt-5|o4|gpt-4\.1)/.test(model)
}

/**
 * Gets the API family for a given model
 * @param model - The OpenAI model name
 * @returns 'chat' for Chat Completions API, 'responses' for Responses API
 */
export const getAPIFamily = (model: string): 'chat' | 'responses' => {
  return isResponsesModel(model) ? 'responses' : 'chat'
}