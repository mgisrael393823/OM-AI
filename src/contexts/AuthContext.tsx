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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Development: Check for stale tokens and clear if found
    if (process.env.NODE_ENV === 'development' && DEV_AUTH_UTILS.hasStaleTokens()) {
      console.log('🧹 Clearing stale auth tokens in development')
      DEV_AUTH_UTILS.clearAuthStorage()
    }

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      console.log('🔍 Initial session check:', session?.user?.email || 'No user')
      
      if (error) {
        console.warn('⚠️ Session check error:', error)
        if (process.env.NODE_ENV === 'development') {
          DEV_AUTH_UTILS.clearAuthStorage()
        }
      }
      
      setSession(session)
      setUser(session?.user ?? null)
      
      if (session?.user) {
        console.log('👤 Fetching user profile for:', session.user.email)
        await fetchUserProfile(session.user.id, session.user)
        console.log('✅ Profile fetch completed')
      } else {
        setProfile(null)
      }
      
      console.log('🏁 Setting loading to false')
      setLoading(false)
    })

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔄 Auth state change:', event, session?.user?.email || 'No user')
      
      // Reset loading state for auth changes
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        setLoading(true)
      }
      
      setSession(session)
      setUser(session?.user ?? null)
      
      if (session?.user) {
        console.log('👤 Fetching user profile for:', session.user.email)
        await fetchUserProfile(session.user.id, session.user)
        console.log('✅ Profile fetch completed')
      } else {
        setProfile(null)
        // Clear storage on sign out in development
        if (event === 'SIGNED_OUT' && process.env.NODE_ENV === 'development') {
          DEV_AUTH_UTILS.clearAuthStorage()
        }
      }
      
      console.log('🏁 Setting loading to false')
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUserProfile = async (userId: string, currentUser?: User | null) => {
    try {
      // Try to fetch existing user profile
      const { data: existingProfile, error: fetchError } = await supabase
        .from('users')
        .select('id, email, full_name, avatar_url, subscription_tier, subscription_status, subscription_id, usage_count, usage_limit, created_at, updated_at')
        .eq('id', userId)
        .single();

      if (fetchError) {
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
      logError(error, {
        userId,
        operation: 'fetch_user_profile_catch'
      });
      
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

  const value = {
    user,
    profile,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
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