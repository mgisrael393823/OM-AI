/**
 * User Preferences Management
 * 
 * Centralized configuration for user preference defaults, validation,
 * and type definitions.
 */

import { z } from 'zod';

// Validation schemas
export const AIPreferencesSchema = z.object({
  preferredModel: z.enum(['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo']),
  temperature: z.number().min(0).max(1),
  maxTokens: z.number().min(1000).max(8000)
});

export const DisplayPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  language: z.enum(['en', 'es', 'fr'])
});

export const NotificationPreferencesSchema = z.object({
  email: z.boolean(),
  push: z.boolean()
});

export const UserPreferencesSchema = z.object({
  ai: AIPreferencesSchema,
  display: DisplayPreferencesSchema,
  notifications: NotificationPreferencesSchema
});

// TypeScript types
export type AIPreferences = z.infer<typeof AIPreferencesSchema>;
export type DisplayPreferences = z.infer<typeof DisplayPreferencesSchema>;
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

// Server-side defaults
export const DEFAULT_PREFERENCES: UserPreferences = {
  ai: {
    preferredModel: 'gpt-4-turbo-preview',
    temperature: 0.7,
    maxTokens: 4000
  },
  display: {
    theme: 'system',
    language: 'en'
  },
  notifications: {
    email: true,
    push: false
  }
} as const;

/**
 * Merge user preferences with defaults
 * Deep merges user preferences over defaults, ensuring all required fields exist
 */
export function mergeWithDefaults(userPrefs: Partial<UserPreferences>): UserPreferences {
  return {
    ai: {
      ...DEFAULT_PREFERENCES.ai,
      ...userPrefs.ai
    },
    display: {
      ...DEFAULT_PREFERENCES.display,
      ...userPrefs.display
    },
    notifications: {
      ...DEFAULT_PREFERENCES.notifications,
      ...userPrefs.notifications
    }
  };
}

/**
 * Validate user preferences
 * Returns validated preferences or throws validation error
 */
export function validatePreferences(prefs: unknown): UserPreferences {
  return UserPreferencesSchema.parse(prefs);
}

/**
 * Partial preference validation for updates
 * Allows partial updates while maintaining type safety
 */
export function validatePartialPreferences(prefs: unknown): Partial<UserPreferences> {
  return UserPreferencesSchema.partial().parse(prefs);
}