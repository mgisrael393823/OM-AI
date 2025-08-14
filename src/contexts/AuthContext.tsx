import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { logError, logWarning } from '@/lib/error-logger'
import { DEV_AUTH_UTILS } from '@/lib/dev-auth-utils'
import * as Sentry from '@sentry/nextjs'

interface UserProfile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  subscription_tier: 'starter' | 'professional' | 'enterprise'
  subscription_status: 'active' | 'cancelled' | 'past_due'
  subscription_id: string | null
  usage_count: number
  usage_limit: number
  preferences: Record<string, any>
  created_at: string
  updated_at: string
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  session: Session | null
  loading: boolean
  signUp: (email: string, password: string, fullName: string) => Promise<{ user: User | null; error: AuthError | null }>
  signIn: (email: string, password: string) => Promise<{ user: User | null; error: AuthError | null }>
  signOut: () => Promise<{ error: AuthError | null }>
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>
  refreshSession: () => Promise<{ session: Session | null; error: AuthError | null }>
  isTokenExpired: () => boolean
  isTokenExpiringSoon: () => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    // Development: Check for stale tokens and clear if found
    if (process.env.NODE_ENV === 'development' && DEV_AUTH_UTILS.hasStaleTokens()) {
      console.log('🧹 Clearing stale auth tokens in development')
      DEV_AUTH_UTILS.clearAuthStorage()
    }

    // Add overall timeout for initial auth flow
    const authTimeout = setTimeout(() => {
      if (loading) {
        console.warn('⏰ Authentication flow timed out, setting loading to false')
        setLoading(false)
      }
    }, 15000) // 15 second overall timeout

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      console.log('🔍 Initial session check:', session?.user?.email || 'No user')
      
      if (error) {
        console.warn('⚠️ Session check error:', error)
        if (process.env.NODE_ENV === 'development') {
          DEV_AUTH_UTILS.clearAuthStorage()
        }
        clearTimeout(authTimeout)
        setLoading(false)
        return
      }
      
      setSession(session)
      setUser(session?.user ?? null)
      
      if (session?.user) {
        console.log('👤 Fetching user profile for:', session.user.email)
        setProfileLoading(true)
        await fetchUserProfile(session.user.id, session.user)
        setProfileLoading(false)
        console.log('✅ Profile fetch completed')
      } else {
        setProfile(null)
        console.log('🏁 Setting loading to false - no user')
        setLoading(false)
      }
      
      clearTimeout(authTimeout)
      // Don't set loading=false here if we have a user - let the profile effect handle it
    }).catch((err) => {
      console.error('❌ Session check failed:', err)
      clearTimeout(authTimeout)
      setLoading(false)
    })

    return () => clearTimeout(authTimeout)

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔄 Auth state change:', event, session?.user?.email || 'No user')
      
      // Don't show loading for token refresh to prevent flash
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        setLoading(true)
      }
      // TOKEN_REFRESHED events don't trigger loading to prevent flashes
      
      setSession(session)
      setUser(session?.user ?? null)
      
      if (session?.user) {
        console.log('👤 Fetching user profile for:', session.user.email)
        setProfileLoading(true)
        await fetchUserProfile(session.user.id, session.user)
        setProfileLoading(false)
        console.log('✅ Profile fetch completed')
      } else {
        setProfile(null)
        // Clear storage on sign out in development
        if (event === 'SIGNED_OUT' && process.env.NODE_ENV === 'development') {
          DEV_AUTH_UTILS.clearAuthStorage()
        }
      }
      
      // Only set loading to false immediately if no user
      if (!session?.user) {
        console.log('🏁 Setting loading to false - no user')
        setLoading(false)
      }
      // For users with sessions, let the profile useEffect handle loading state
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Silently refresh token at 50% of its lifetime
  useEffect(() => {
    if (!session?.access_token || !session?.expires_at) return

    const now = Date.now()
    const expirationTime = session.expires_at * 1000
    const lifetime = expirationTime - now
    const refreshDelay = Math.max(lifetime / 2, 0)

    const timer = setTimeout(async () => {
      try {
        console.log('🔄 Refreshing session at 50% lifetime...')
        await refreshSession()
      } catch (error) {
        console.error('❌ Silent token refresh failed:', error)
      }
    }, refreshDelay)

    return () => clearTimeout(timer)
  }, [session?.access_token, session?.expires_at])

  // Handle loading state when profile changes - only clear loading when both user and profile ready
  useEffect(() => {
    // Only clear loading when we have both user and profile, and profile is not actively loading
    if (user && profile && !profileLoading) {
      console.log('🏁 Setting loading to false - both user and profile ready')
      setLoading(false)
    }
  }, [user, profile, profileLoading])

  // Timeout fallback to prevent infinite loading if profile fetch stalls
  useEffect(() => {
    if (user && !profile && !profileLoading) {
      const timeout = setTimeout(() => {
        console.warn('⏰ Profile loading timeout - using fallback profile')
        setProfile(createFallbackProfile(user.id, user))
        setLoading(false)
      }, 10000) // 10 second timeout

      return () => clearTimeout(timeout)
    }
  }, [user, profile, profileLoading])

  const fetchUserProfile = async (userId: string, currentUser?: User | null) => {
    try {
      // Add timeout to profile fetch to prevent stalling
      const profilePromise = supabase
        .from('users')
        .select('id, email, full_name, avatar_url, subscription_tier, subscription_status, subscription_id, usage_count, usage_limit, created_at, updated_at')
        .eq('id', userId)
        .single();

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
      );

      const { data: existingProfile, error: fetchError } = await Promise.race([
        profilePromise,
        timeoutPromise
      ]) as any;

      if (fetchError) {
        // Handle timeout errors specifically
        if (fetchError.message === 'Profile fetch timeout') {
          console.warn('⏰ Profile fetch timed out, using fallback profile');
          setProfile(createFallbackProfile(userId, currentUser));
          return;
        }
        
        // PGRST116 = no rows returned (expected for new users)
        if (fetchError.code !== 'PGRST116') {
          console.error('AuthContext: Error fetching user profile', {
            error: fetchError,
            code: fetchError.code,
            message: fetchError.message,
            hint: fetchError.hint,
            details: fetchError.details,
            userId,
            operation: 'fetch_user_profile'
          });
          
          logError(fetchError, {
            userId,
            operation: 'fetch_user_profile',
            errorCode: fetchError.code,
            errorHint: fetchError.hint
          });
        }
        
        // Fall back to default profile on any database error
        setProfile(createFallbackProfile(userId, currentUser));
        return;
      }

      // If user doesn't exist, create new profile
      if (!existingProfile) {
        const newProfile = createDefaultProfile(userId, currentUser);
        
        const { data: createdProfile, error: createError } = await supabase
          .from('users')
          .insert([newProfile])
          .select('id, email, full_name, avatar_url, subscription_tier, subscription_status, subscription_id, usage_count, usage_limit, created_at, updated_at')
          .single();

        if (createError) {
          logError(createError, {
            userId,
            operation: 'create_user_profile',
            profile: newProfile
          });
          
          // Fall back to in-memory profile
          setProfile(createFallbackProfile(userId, currentUser));
          return;
        }

        const profile = {
          ...createdProfile,
          preferences: {}
        } as UserProfile;
        setProfile(profile);
        
        // Set Sentry user context
        Sentry.setUser({
          id: profile.id,
          email: profile.email,
          subscription_tier: profile.subscription_tier,
          preferences_set: Object.keys(profile.preferences || {}).length > 0
        });
        
        return;
      }

      // User exists, use existing profile and add default preferences
      const profile = {
        ...existingProfile,
        preferences: {}
      } as UserProfile;
      setProfile(profile);
      
      // Set Sentry user context
      Sentry.setUser({
        id: profile.id,
        email: profile.email,
        subscription_tier: profile.subscription_tier,
        preferences_set: Object.keys(profile.preferences || {}).length > 0
      });

    } catch (error) {
      // Handle timeout and other errors
      if (error instanceof Error && error.message === 'Profile fetch timeout') {
        console.warn('⏰ Profile fetch timed out in catch, using fallback profile');
      } else {
        logError(error, {
          userId,
          operation: 'fetch_user_profile_catch'
        });
      }
      
      // Always provide a fallback profile
      setProfile(createFallbackProfile(userId, currentUser));
    }
  }

  // Create default profile for new users
  const createDefaultProfile = (userId: string, currentUser?: User | null) => ({
    id: userId,
    email: currentUser?.email || '',
    full_name: currentUser?.user_metadata?.full_name || null,
    avatar_url: currentUser?.user_metadata?.avatar_url || null,
    subscription_tier: 'starter' as const,
    subscription_status: 'active' as const,
    subscription_id: null as string | null,
    usage_count: 0,
    usage_limit: 10,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Create fallback profile when database operations fail
  const createFallbackProfile = (userId: string, currentUser?: User | null): UserProfile => {
    logWarning('Using fallback profile due to database error', { userId });
    
    return {
      id: userId,
      email: currentUser?.email || '',
      full_name: currentUser?.user_metadata?.full_name || null,
      avatar_url: null,
      subscription_tier: 'starter',
      subscription_status: 'active',
      subscription_id: null as string | null,
      usage_count: 0,
      usage_limit: 10,
      preferences: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })

    return { user: data.user, error }
  }

  const signIn = async (email: string, password: string) => {
    // Clear any stale storage before attempting sign in (development only)
    if (process.env.NODE_ENV === 'development') {
      DEV_AUTH_UTILS.clearAuthStorage()
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    return { user: data.user, error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    
    // Clear all auth storage after sign out (development only)
    if (process.env.NODE_ENV === 'development') {
      DEV_AUTH_UTILS.clearAuthStorage()
    }
    
    return { error }
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    return { error }
  }

  // Refresh current session
  const refreshSession = async () => {
    console.log('🔄 Manually refreshing session...')
    const { data, error } = await supabase.auth.refreshSession()
    if (data?.session) {
      console.log('✅ Session refreshed successfully')
    } else if (error) {
      console.error('❌ Failed to refresh session:', error)
    }
    return { session: data?.session || null, error }
  }

  // Check if current token is expired
  const isTokenExpired = () => {
    if (!session?.expires_at) return false
    const expirationTime = session.expires_at * 1000 // Convert to milliseconds
    const now = Date.now()
    return expirationTime <= now
  }

  // Check if token is expiring within 5 minutes
  const isTokenExpiringSoon = () => {
    if (!session?.expires_at) return false
    const expirationTime = session.expires_at * 1000 // Convert to milliseconds
    const now = Date.now()
    const fiveMinutesInMs = 5 * 60 * 1000
    return (expirationTime - now) < fiveMinutesInMs
  }

  const value = {
    user,
    profile,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    refreshSession,
    isTokenExpired,
    isTokenExpiringSoon,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}