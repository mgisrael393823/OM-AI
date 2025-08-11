/**
 * Settings API Endpoint
 * 
 * Handles user preference management with feature flag protection,
 * validation, and comprehensive error handling.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { withAuth, apiError, AuthenticatedRequest } from '@/lib/auth-middleware';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { 
  UserPreferences, 
  DEFAULT_PREFERENCES, 
  mergeWithDefaults, 
  validatePreferences,
  validatePartialPreferences 
} from '@/lib/user-preferences';
import { logError, logWarning } from '@/lib/error-logger';

// Rate limiting (simple in-memory store - use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

interface SettingsResponse {
  preferences: UserPreferences;
  defaults: typeof DEFAULT_PREFERENCES;
  lastUpdated: string;
}

async function checkRateLimit(userId: string): Promise<boolean> {
  const now = Date.now();
  const userLimit = rateLimitStore.get(userId);

  if (!userLimit || userLimit.resetTime < now) {
    rateLimitStore.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userLimit.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  userLimit.count++;
  return true;
}

async function settingsHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Check feature flag first
  if (!isFeatureEnabled('SETTINGS_API')) {
    return res.status(404).json({ 
      error: 'Feature not available',
      code: 'FEATURE_DISABLED'
    });
  }
  const { method } = req;
  const { user } = req;

  // Rate limiting
  if (!(await checkRateLimit(user.id))) {
    return apiError(res, 429, 'Too many requests', 'RATE_LIMIT_EXCEEDED');
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    switch (method) {
      case 'GET':
        return await handleGetSettings(supabase, user.id, res);
      case 'PUT':
        return await handleUpdateSettings(supabase, user.id, req.body, res);
      default:
        return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
    }
  } catch (error) {
    logError(error, {
      userId: user.id,
      endpoint: '/api/settings',
      method,
      requestId: req.headers['x-request-id'] as string
    });
    return apiError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

async function handleGetSettings(
  supabase: any,
  userId: string,
  res: NextApiResponse
) {
  // Get user record with preferences
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('preferences, updated_at')
    .eq('id', userId)
    .single();

  if (userError) {
    logError(userError, {
      userId,
      operation: 'get_user_preferences'
    });
    return apiError(res, 500, 'Failed to load user preferences', 'DATABASE_ERROR');
  }

  // Merge user preferences with defaults
  const userPrefs = userData?.preferences || {};
  const mergedPreferences = mergeWithDefaults(userPrefs);

  const response: SettingsResponse = {
    preferences: mergedPreferences,
    defaults: DEFAULT_PREFERENCES,
    lastUpdated: userData?.updated_at || new Date().toISOString()
  };

  return res.status(200).json(response);
}

async function handleUpdateSettings(
  supabase: any,
  userId: string,
  requestBody: unknown,
  res: NextApiResponse
) {
  // Validate request body
  let partialPreferences;
  try {
    partialPreferences = validatePartialPreferences(requestBody);
  } catch (validationError) {
    logWarning('Invalid preferences submitted', {
      userId,
      error: validationError,
      requestBody
    });
    return apiError(res, 400, 'Invalid preferences format', 'VALIDATION_ERROR');
  }

  // Get current user preferences
  const { data: currentUser, error: fetchError } = await supabase
    .from('users')
    .select('preferences')
    .eq('id', userId)
    .single();

  if (fetchError) {
    logError(fetchError, {
      userId,
      operation: 'get_current_preferences'
    });
    return apiError(res, 500, 'Failed to load current preferences', 'DATABASE_ERROR');
  }

  // Merge with existing preferences
  const currentPrefs = currentUser?.preferences || {};
  const updatedPrefs = {
    ...currentPrefs,
    ...partialPreferences,
    // Deep merge nested objects
    ai: {
      ...currentPrefs.ai,
      ...partialPreferences.ai
    },
    display: {
      ...currentPrefs.display,
      ...partialPreferences.display
    },
    notifications: {
      ...currentPrefs.notifications,
      ...partialPreferences.notifications
    }
  };

  // Validate merged preferences
  let validatedPrefs;
  try {
    validatedPrefs = validatePreferences(updatedPrefs);
  } catch (validationError) {
    logError(validationError, {
      userId,
      operation: 'validate_merged_preferences',
      updatedPrefs
    });
    return apiError(res, 400, 'Invalid preference combination', 'VALIDATION_ERROR');
  }

  // Update database with transaction
  const { data, error: updateError } = await supabase
    .from('users')
    .update({
      preferences: validatedPrefs,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId)
    .select('preferences, updated_at')
    .single();

  if (updateError) {
    logError(updateError, {
      userId,
      operation: 'update_preferences',
      preferences: validatedPrefs
    });
    return apiError(res, 500, 'Failed to save preferences', 'DATABASE_ERROR');
  }

  // Return updated preferences
  const response: SettingsResponse = {
    preferences: mergeWithDefaults(data.preferences),
    defaults: DEFAULT_PREFERENCES,
    lastUpdated: data.updated_at
  };

  return res.status(200).json(response);
}

export default withAuth(settingsHandler)